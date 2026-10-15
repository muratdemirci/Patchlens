import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type {
  AddedLine,
  ChangeSet,
  ChangedFile,
  FileStatus,
  LineChange,
} from '@patchlens/core';
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}
export function git(args: readonly string[], cwd: string): string {
  const result = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error)
    throw new GitError(`Could not run Git: ${result.error.message}`);
  if (result.status !== 0)
    throw new GitError(
      (
        result.stderr || `Git exited with status ${String(result.status)}`
      ).trim(),
    );
  return result.stdout;
}
export function parseUnifiedDiff(diff: string): AddedLine[] {
  return parseDiff(diff)
    .lines.filter((line) => line.kind !== 'removed')
    .map(({ path, line, content }) => ({ path, line, content }));
}

const MAX_DIFF_BYTES = 32 * 1024 * 1024;
function decodeGitPath(value: string): string {
  const path = value.split('\t')[0] ?? '';
  if (!path.startsWith('"')) return path;
  try {
    return JSON.parse(path) as string;
  } catch {
    throw new GitError('Git returned an invalid quoted filename');
  }
}

function normalizePatchPath(value: string, prefix: 'a/' | 'b/'): string {
  const decoded = decodeGitPath(value);
  return decoded === '/dev/null'
    ? decoded
    : decoded.startsWith(prefix)
      ? decoded.slice(2)
      : decoded;
}

export function parseDiff(diff: string): ChangeSet {
  if (Buffer.byteLength(diff, 'utf8') > MAX_DIFF_BYTES)
    throw new GitError('Diff exceeds 32 MiB limit');
  const files: ChangedFile[] = [];
  const lines: LineChange[] = [];
  const sections = diff.split(/^diff --git /m).slice(1);
  for (const section of sections) {
    const rows = section.split(/\r?\n/);
    let oldPath = '';
    let newPath = '';
    const header = rows[0] ?? '';
    const separator = header.indexOf(' b/');
    if (header.startsWith('a/') && separator > 0) {
      oldPath = normalizePatchPath(header.slice(0, separator), 'a/');
      newPath = normalizePatchPath(header.slice(separator + 1), 'b/');
    }
    let renamedFrom: string | undefined;
    let renamedTo: string | undefined;
    let oldMode: string | undefined;
    let newMode: string | undefined;
    let binary = false;
    let contextTooLarge = false;
    let oldLine = 0;
    let newLine = 0;
    let hasHunk = false;
    const additions: AddedLine[] = [];
    const removals: AddedLine[] = [];
    const fileLines: LineChange[] = [];
    const sourceLines = new Map<number, string>();
    let pendingAdds: AddedLine[] = [];
    let pendingRemoves: AddedLine[] = [];
    const flushChangeGroup = (): void => {
      const modified = Math.min(pendingAdds.length, pendingRemoves.length);
      for (let index = 0; index < pendingAdds.length; index++) {
        const added = pendingAdds[index];
        const removed = pendingRemoves[index];
        if (added)
          fileLines.push({
            ...added,
            kind: index < modified ? 'modified' : 'added',
            ...(index < modified && removed
              ? { previousLine: removed.line }
              : {}),
          });
      }
      for (let index = 0; index < pendingRemoves.length; index++) {
        const removed = pendingRemoves[index];
        if (removed) fileLines.push({ ...removed, kind: 'removed' });
      }
      pendingAdds = [];
      pendingRemoves = [];
    };
    for (const row of rows) {
      if (row.startsWith('rename from '))
        renamedFrom = row.slice('rename from '.length);
      else if (row.startsWith('rename to '))
        renamedTo = row.slice('rename to '.length);
      else if (row.startsWith('old mode '))
        oldMode = row.slice('old mode '.length);
      else if (row.startsWith('new mode '))
        newMode = row.slice('new mode '.length);
      else if (row.startsWith('new file mode '))
        newMode = row.slice('new file mode '.length);
      else if (!hasHunk && row.startsWith('--- '))
        oldPath = normalizePatchPath(row.slice(4), 'a/');
      else if (!hasHunk && row.startsWith('+++ '))
        newPath = normalizePatchPath(row.slice(4), 'b/');
      else if (row.startsWith('Binary files ') || row === 'GIT binary patch')
        binary = true;
      else {
        const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(row);
        if (hunk) {
          flushChangeGroup();
          hasHunk = true;
          oldLine = Number(hunk[1]);
          newLine = Number(hunk[3]);
          if (newLine > 200_000) contextTooLarge = true;
        } else if (hasHunk && row.startsWith('+')) {
          const item = { path: '', line: newLine++, content: row.slice(1) };
          additions.push(item);
          if (item.line <= 200_000) sourceLines.set(item.line, item.content);
          else contextTooLarge = true;
          pendingAdds.push(item);
        } else if (hasHunk && row.startsWith('-')) {
          const item = { path: '', line: oldLine++, content: row.slice(1) };
          removals.push(item);
          pendingRemoves.push(item);
        } else if (hasHunk && row.startsWith(' ')) {
          flushChangeGroup();
          if (newLine <= 200_000) sourceLines.set(newLine, row.slice(1));
          else contextTooLarge = true;
          oldLine++;
          newLine++;
        } else if (row.startsWith('\\')) {
          // The marker for a missing final newline does not advance either side.
        } else if (hasHunk && row.length === 0) {
          flushChangeGroup();
        }
      }
    }
    flushChangeGroup();
    if (renamedFrom !== undefined && oldPath === '') oldPath = renamedFrom;
    if (renamedTo !== undefined && newPath === '') newPath = renamedTo;
    const deleted = newPath === '/dev/null';
    const added = oldPath === '/dev/null';
    const path = deleted ? oldPath : newPath || oldPath;
    if (!path || path === '/dev/null') continue;
    const previousPath =
      renamedFrom ??
      (oldPath && oldPath !== '/dev/null' && oldPath !== path
        ? oldPath
        : undefined);
    const status: FileStatus = deleted
      ? 'deleted'
      : added
        ? 'added'
        : previousPath
          ? 'renamed'
          : hasHunk || binary || oldMode !== undefined || newMode !== undefined
            ? 'modified'
            : 'unknown';
    const boundAdditions = additions.map((item) => ({ ...item, path }));
    const boundRemovals = removals.map((item) => ({
      ...item,
      path: previousPath ?? path,
    }));
    let lastContextLine = 0;
    for (const lineNumber of sourceLines.keys())
      lastContextLine = Math.max(lastContextLine, lineNumber);
    const contextContent =
      !binary && !contextTooLarge && lastContextLine > 0
        ? Array.from(
            { length: lastContextLine },
            (_, index) => sourceLines.get(index + 1) ?? '',
          ).join('\n')
        : undefined;
    files.push({
      path,
      ...(previousPath ? { previousPath } : {}),
      status,
      binary,
      ...(oldMode ? { oldMode } : {}),
      ...(newMode ? { newMode } : {}),
      added: boundAdditions,
      removed: boundRemovals,
      ...(contextContent === undefined ? {} : { content: contextContent }),
    });
    lines.push(
      ...fileLines.map((item) => ({
        ...item,
        path: item.kind === 'removed' ? (previousPath ?? path) : path,
      })),
    );
  }
  return { files, lines };
}
export type DiffComparison = 'merge-base' | 'direct';
export function diffRefs(
  repo: string,
  base?: string,
  head?: string,
  comparison: DiffComparison = 'merge-base',
): string {
  if (base !== undefined && !base)
    throw new GitError('Base reference must not be empty');
  if (head !== undefined && !head)
    throw new GitError('Head reference must not be empty');
  const resolveCommit = (ref: string): string => {
    if (!ref || ref.startsWith('-'))
      throw new GitError('Revision must be a non-empty Git reference');
    return git(
      ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
      repo,
    ).trim();
  };
  let end: string;
  try {
    end = resolveCommit(head ?? 'HEAD');
  } catch (error) {
    if (head) throw error;
    git(['rev-parse', '--git-dir'], repo);
    return '';
  }
  let from: string;
  try {
    if (base) {
      const baseCommit = resolveCommit(base);
      from =
        comparison === 'direct'
          ? baseCommit
          : git(['merge-base', baseCommit, end], repo).trim();
    } else from = resolveCommit(`${head ?? 'HEAD'}^`);
  } catch {
    if (base)
      throw new GitError(
        'Could not find a common ancestor; the repository may be shallow or the base is unrelated',
      );
    if (git(['rev-parse', '--is-shallow-repository'], repo).trim() === 'true')
      throw new GitError(
        'Cannot infer a change base from a shallow checkout; provide --base',
      );
    from = git(['hash-object', '-t', 'tree', '--stdin'], repo).trim();
  }
  return git(
    ['diff', '--no-ext-diff', '--find-renames', '--unified=0', from, end, '--'],
    repo,
  );
}

function safeRepositoryFile(repo: string, path: string): string | undefined {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '..' || part === '.')
  )
    return undefined;
  const root = resolve(repo);
  const filePath = resolve(root, path);
  const rel = relative(root, filePath);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || rel.includes('\0'))
    return undefined;
  try {
    const info = lstatSync(filePath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024)
      return undefined;
    const real = realpathSync(filePath);
    const realRel = relative(root, real);
    if (realRel === '..' || realRel.startsWith('..' + sep)) return undefined;
    return filePath;
  } catch {
    return undefined;
  }
}

function withWorkingContent(repo: string, changes: ChangeSet): ChangeSet {
  const files: ChangedFile[] = changes.files.map((file) => {
    const filePath = safeRepositoryFile(repo, file.path);
    if (!filePath) return file;
    const content = readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8');
    if (content.includes('\0')) return { ...file, binary: true };
    return { ...file, content };
  });
  return { ...changes, files };
}

/** Include index and working-tree changes plus non-ignored untracked text files. Does not write to the repository. */
export function workingTreeChanges(repo: string): ChangeSet {
  let diff = '';
  try {
    git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], repo);
    diff = git(
      ['diff', '--no-ext-diff', '--find-renames', '--unified=0', 'HEAD', '--'],
      repo,
    );
  } catch {
    try {
      diff += git(
        [
          'diff',
          '--cached',
          '--no-ext-diff',
          '--find-renames',
          '--unified=0',
          '--',
        ],
        repo,
      );
    } catch {
      /* empty index */
    }
    try {
      diff += git(
        ['diff', '--no-ext-diff', '--find-renames', '--unified=0', '--'],
        repo,
      );
    } catch {
      /* empty working tree */
    }
  }
  const parsed = parseDiff(diff);
  const files = [...parsed.files];
  const lines = [...parsed.lines];
  const untracked = git(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    repo,
  )
    .split('\0')
    .filter(Boolean);
  for (const path of untracked) {
    const filePath = safeRepositoryFile(repo, path);
    if (!filePath) continue;
    const content = readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8');
    const binary = content.includes('\0');
    const textLines = content.split(/\r?\n/);
    if (content.endsWith('\n') || content.endsWith('\r')) textLines.pop();
    const added =
      binary || content.length === 0
        ? []
        : textLines.map((text, index) => ({
            path,
            line: index + 1,
            content: text,
          }));
    files.push({
      path,
      status: 'added',
      binary,
      added,
      removed: [],
      ...(binary ? {} : { content }),
    });
    lines.push(...added.map((line) => ({ ...line, kind: 'added' as const })));
  }
  return withWorkingContent(repo, { files, lines });
}

/** Analyze only the index snapshot. Unstaged and untracked files are excluded. */
export function stagedChanges(repo: string): ChangeSet {
  const diff = git(
    [
      'diff',
      '--cached',
      '--no-ext-diff',
      '--find-renames',
      '--unified=0',
      '--',
    ],
    repo,
  );
  const parsed = parseDiff(diff);
  return {
    ...parsed,
    files: parsed.files.map((file) => {
      if (file.status === 'deleted' || file.binary) return file;
      try {
        const content = git(['show', ':' + file.path], repo);
        if (Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024) return file;
        return content.includes('\0')
          ? { ...file, binary: true }
          : { ...file, content };
      } catch {
        return file;
      }
    }),
  };
}

/** Load file contents from the requested commit so contextual rules can parse a complete source file. */
export function changesBetweenRefs(
  repo: string,
  base?: string,
  head?: string,
  comparison: DiffComparison = 'merge-base',
): ChangeSet {
  const changes = parseDiff(diffRefs(repo, base, head, comparison));
  const end = git(
    [
      'rev-parse',
      '--verify',
      '--end-of-options',
      (head ?? 'HEAD') + '^{commit}',
    ],
    repo,
  ).trim();
  const files = changes.files.map((file) => {
    if (file.status === 'deleted' || file.binary) return file;
    try {
      const content = git(['show', end + ':' + file.path], repo);
      if (Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024) return file;
      return content.includes('\0')
        ? { ...file, binary: true }
        : { ...file, content };
    } catch {
      return file;
    }
  });
  return { ...changes, files };
}
