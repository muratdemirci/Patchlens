import { spawnSync } from 'node:child_process';
import type { AddedLine } from '@patchlens/core';
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}
export function git(args: readonly string[], cwd: string): string {
  const result = spawnSync('git', [...args], {
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
  if (diff.length > 32 * 1024 * 1024)
    throw new Error('Diff exceeds 32 MiB limit');
  const out: AddedLine[] = [];
  let path = '';
  let line = 0;
  let binary = false;
  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      path = '';
      binary = false;
      continue;
    }
    if (raw.startsWith('Binary files ') || raw === 'GIT binary patch') {
      binary = true;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const file = raw.slice(4).split('\t')[0] ?? '';
      path = file === '/dev/null' ? '' : file.replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!path || binary || raw.startsWith('--- ') || raw.startsWith('\\'))
      continue;
    if (raw.startsWith('+')) {
      out.push({ path, line, content: raw.slice(1) });
      line++;
    } else if (raw.startsWith(' ')) line++;
  }
  return out;
}
export function diffRefs(repo: string, base?: string, head?: string): string {
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
      from = git(['merge-base', baseCommit, end], repo).trim();
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
    ['diff', '--no-ext-diff', '--no-renames', '--unified=0', from, end, '--'],
    repo,
  );
}
