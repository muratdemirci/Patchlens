import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffRefs, parseUnifiedDiff } from './index.js';
describe('parseUnifiedDiff', () => {
  it('tracks added-line locations and ignores deletions and binary files', () => {
    const diff =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n keep\ndiff --git a/img b/img\nBinary files a/img and b/img differ';
    expect(parseUnifiedDiff(diff)).toEqual([
      { path: 'a.ts', line: 1, content: 'new' },
    ]);
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
});
