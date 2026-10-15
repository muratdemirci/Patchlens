import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changesBetweenRefs,
  diffRefs,
  parseDiff,
  parseUnifiedDiff,
  stagedChanges,
  workingTreeChanges,
} from './index.js';
describe('parseUnifiedDiff', () => {
  it('tracks added-line locations and ignores deletions and binary files', () => {
    const diff =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n keep\ndiff --git a/img b/img\nBinary files a/img and b/img differ';
    expect(parseUnifiedDiff(diff)).toEqual([
      { path: 'a.ts', line: 1, content: 'new' },
    ]);
  });
  it('does not confuse added or removed source lines with diff file headers', () => {
    const changes = parseDiff(
      [
        'diff --git a/src/text.ts b/src/text.ts',
        '--- a/src/text.ts',
        '+++ b/src/text.ts',
        '@@ -1,2 +1,2 @@',
        '--- removed content',
        '+++ added content',
      ].join('\n'),
    );
    expect(
      changes.lines.map((line) => [line.kind, line.line, line.content]),
    ).toEqual([
      ['modified', 1, '++ added content'],
      ['removed', 1, '-- removed content'],
    ]);
  });
  it('reconstructs bounded changed source context for syntax rules and rejects oversized patches', () => {
    const diff = [
      'diff --git a/src/context.ts b/src/context.ts',
      '--- a/src/context.ts',
      '+++ b/src/context.ts',
      '@@ -1,3 +1,3 @@',
      ' export function run(): void {',
      '-  const safe = true;',
      '+  const value = eval(input);',
      ' }',
    ].join('\n');
    const changes = parseDiff(diff);
    expect(changes.files[0]?.content).toBe(
      'export function run(): void {\n  const value = eval(input);\n}',
    );
    expect(changes.lines.map((line) => line.kind)).toEqual([
      'modified',
      'removed',
    ]);
    expect(() => parseDiff('x'.repeat(32 * 1024 * 1024 + 1))).toThrow('32 MiB');
  });
  it('tracks renamed file target paths and multiple hunks', () => {
    expect(
      parseUnifiedDiff(
        'diff --git a/x.ts b/y.ts\n--- a/x.ts\n+++ b/y.ts\n@@ -1 +1 @@\n-a\n+b\n@@ -8,0 +9 @@\n+c',
      ),
    ).toEqual([
      { path: 'y.ts', line: 1, content: 'b' },
      { path: 'y.ts', line: 9, content: 'c' },
    ]);
  });
  it('tracks modified, deleted, renamed, and binary file metadata', () => {
    const changes = parseDiff(
      [
        'diff --git a/src/old.ts b/src/new.ts',
        'similarity index 80%',
        'rename from src/old.ts',
        'rename to src/new.ts',
        '--- a/src/old.ts',
        '+++ b/src/new.ts',
        '@@ -2 +2 @@',
        '-const before = true;',
        '+const after = true;',
        'diff --git a/src/gone.ts b/src/gone.ts',
        'deleted file mode 100644',
        '--- a/src/gone.ts',
        '+++ /dev/null',
        '@@ -4 +0,0 @@',
        '-export function gone() {}',
        'diff --git a/image.bin b/image.bin',
        'Binary files a/image.bin and b/image.bin differ',
        'diff --git a/tools/run.sh b/tools/run.sh',
        'old mode 100644',
        'new mode 100755',
      ].join('\n'),
    );
    expect(
      changes.files.map((file) => [
        file.path,
        file.status,
        file.binary,
        file.previousPath,
      ]),
    ).toEqual([
      ['src/new.ts', 'renamed', false, 'src/old.ts'],
      ['src/gone.ts', 'deleted', false, undefined],
      ['image.bin', 'modified', true, undefined],
      ['tools/run.sh', 'modified', false, undefined],
    ]);
    expect(changes.files[3]).toMatchObject({
      oldMode: '100644',
      newMode: '100755',
    });
    expect(
      changes.lines.map((line) => [
        line.path,
        line.line,
        line.kind,
        line.previousLine,
      ]),
    ).toEqual([
      ['src/new.ts', 2, 'modified', 2],
      ['src/old.ts', 2, 'removed', undefined],
      ['src/gone.ts', 4, 'removed', undefined],
    ]);
  });
  it('compares real commits and handles the root commit', () => {
    const repo = mkdtempSync(join(tmpdir(), 'patchlens-git-'));
    const run = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    };
    try {
      run('init', '-q');
      expect(diffRefs(repo)).toBe('');
      mkdirSync(join(repo, 'src'));
      run('config', 'user.email', 'patchlens@example.invalid');
      run('config', 'user.name', 'Patchlens test');
      writeFileSync(join(repo, 'src', 'a.ts'), 'const safe = true;\n');
      run('add', '.');
      run('commit', '-qm', 'base');
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(repo, 'src', 'a.ts'),
        'const safe = true;\neval(input);\n',
      );
      run('add', '.');
      run('commit', '-qm', 'change');
      expect(parseUnifiedDiff(diffRefs(repo, base))).toEqual([
        { path: 'src/a.ts', line: 2, content: 'eval(input);' },
      ]);
      expect(parseUnifiedDiff(diffRefs(repo, undefined, base))).toEqual([
        { path: 'src/a.ts', line: 1, content: 'const safe = true;' },
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('discovers staged, working-tree, and untracked changes without modifying the repository', () => {
    const repo = mkdtempSync(join(tmpdir(), 'patchlens-worktree-'));
    const run = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    };
    try {
      run('init', '-q');
      run('config', 'user.email', 'patchlens@example.invalid');
      run('config', 'user.name', 'Patchlens test');
      writeFileSync(join(repo, 'tracked.ts'), 'const old = true;\n');
      run('add', '.');
      run('commit', '-qm', 'base');
      writeFileSync(join(repo, 'tracked.ts'), 'const staged = true;\n');
      run('add', 'tracked.ts');
      writeFileSync(join(repo, 'tracked.ts'), 'const working = true;\n');
      writeFileSync(join(repo, 'new.ts'), 'const newFile = true;');
      expect(
        stagedChanges(repo).files.find((file) => file.path === 'tracked.ts')
          ?.content,
      ).toBe('const staged = true;\n');
      const before = execFileSync('git', ['status', '--porcelain'], {
        cwd: repo,
        encoding: 'utf8',
      });
      const changes = workingTreeChanges(repo);
      const after = execFileSync('git', ['status', '--porcelain'], {
        cwd: repo,
        encoding: 'utf8',
      });
      expect(after).toBe(before);
      expect(changes.files.map((file) => file.path)).toContain('new.ts');
      expect(
        changes.files.find((file) => file.path === 'new.ts')?.content,
      ).toBe('const newFile = true;');
      expect(
        changes.lines.some(
          (line) =>
            line.path === 'tracked.ts' &&
            line.content === 'const working = true;',
        ),
      ).toBe(true);
      expect(
        changes.files.find((file) => file.path === 'tracked.ts')?.content,
      ).toBe('const working = true;\n');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('loads commit contents for AST rules and supports direct base/head diffs', () => {
    const repo = mkdtempSync(join(tmpdir(), 'patchlens-refs-'));
    const run = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    };
    try {
      run('init', '-q');
      run('config', 'user.email', 'patchlens@example.invalid');
      run('config', 'user.name', 'Patchlens test');
      writeFileSync(join(repo, 'source.ts'), 'const first = true;\n');
      run('add', '.');
      run('commit', '-qm', 'base');
      const base = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(repo, 'source.ts'),
        'const first = true;\nconst next = eval(input);\n',
      );
      run('add', '.');
      run('commit', '-qm', 'head');
      const changes = changesBetweenRefs(repo, base, 'HEAD', 'direct');
      expect(changes.files[0]?.content).toContain('eval(input)');
      expect(
        parseUnifiedDiff(diffRefs(repo, base, 'HEAD', 'direct'))[0]?.line,
      ).toBe(2);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('reports unavailable history in a shallow clone without fetching', () => {
    const root = mkdtempSync(join(tmpdir(), 'patchlens-shallow-'));
    const source = join(root, 'source');
    const shallow = join(root, 'shallow');
    mkdirSync(source);
    const run = (cwd: string, ...args: string[]): void => {
      execFileSync('git', args, { cwd, stdio: 'ignore' });
    };
    try {
      run(source, 'init', '-q', '-b', 'main');
      run(source, 'config', 'user.email', 'patchlens@example.invalid');
      run(source, 'config', 'user.name', 'Patchlens test');
      writeFileSync(join(source, 'source.ts'), 'const base = true;\n');
      run(source, 'add', '.');
      run(source, 'commit', '-qm', 'base');
      const unavailableBase = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: source,
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        join(source, 'source.ts'),
        'const base = true;\nconst head = true;\n',
      );
      run(source, 'add', '.');
      run(source, 'commit', '-qm', 'head');
      const sourceUrl = 'file://' + source.replaceAll('\\', '/');
      execFileSync('git', ['clone', '--depth=1', sourceUrl, shallow], {
        stdio: 'ignore',
      });
      expect(() => diffRefs(shallow, unavailableBase, 'HEAD')).toThrow(
        /common ancestor|shallow/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
