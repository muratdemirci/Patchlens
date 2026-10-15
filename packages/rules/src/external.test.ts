import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExternalAdapters } from './external.js';

describe('optional static-analysis adapters', () => {
  const repo = process.cwd();

  it('normalizes ESLint JSON diagnostics as adapter findings', () => {
    const temp = mkdtempSync(join(tmpdir(), 'patchlens-eslint-'));
    const script = join(temp, 'mock-eslint.cjs');
    const output = JSON.stringify([
      {
        filePath: repo + '/src/example.ts',
        messages: [
          {
            ruleId: 'no-eval',
            severity: 2,
            line: 4,
            endLine: 4,
            message: 'Unexpected eval.',
          },
        ],
      },
    ]);
    writeFileSync(
      script,
      'process.stdout.write(' + JSON.stringify(output) + ')',
    );
    try {
      const result = runExternalAdapters(
        {
          eslint: {
            enabled: true,
            command: process.execPath,
            args: [script, '--format', 'json'],
          },
        },
        repo,
        ['src/example.ts'],
      );
      expect(result.failures).toEqual([]);
      expect(result.findings).toMatchObject([
        {
          ruleId: 'eslint:no-eval',
          source: 'adapter',
          path: 'src/example.ts',
          range: { startLine: 4 },
          severity: 'medium',
        },
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('normalizes local Semgrep JSON without contacting a remote rule registry', () => {
    const temp = mkdtempSync(join(tmpdir(), 'patchlens-semgrep-'));
    const script = join(temp, 'mock-semgrep.cjs');
    const output = JSON.stringify({
      results: [
        {
          check_id: 'local.rule',
          path: 'src/example.ts',
          start: { line: 6 },
          end: { line: 6 },
          extra: {
            message: 'Review this local rule result.',
            severity: 'WARNING',
            lines: 'dangerousCall();',
            metadata: { confidence: 'HIGH', fix: 'Use safeCall().' },
          },
        },
      ],
    });
    writeFileSync(
      script,
      'process.stdout.write(' + JSON.stringify(output) + ')',
    );
    try {
      const result = runExternalAdapters(
        {
          semgrep: {
            enabled: true,
            command: process.execPath,
            args: [script, '--config', 'local-rules.yml', '--json'],
          },
        },
        repo,
        ['src/example.ts'],
      );
      expect(result.failures).toEqual([]);
      expect(result.findings).toMatchObject([
        {
          ruleId: 'semgrep:local.rule',
          source: 'adapter',
          range: { startLine: 6 },
          confidence: 'high',
          severity: 'medium',
        },
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('requires local Semgrep configuration and reports adapter failures and timeouts', () => {
    const remote = runExternalAdapters(
      {
        semgrep: {
          enabled: true,
          command: 'semgrep',
          args: ['--config', 'auto'],
        },
      },
      repo,
      [],
    );
    expect(remote.failures[0]?.message).toContain('local --config');

    const temp = mkdtempSync(join(tmpdir(), 'patchlens-adapter-'));
    const exitScript = join(temp, 'exit.cjs');
    const timeoutScript = join(temp, 'timeout.cjs');
    writeFileSync(exitScript, 'process.exit(2)');
    writeFileSync(timeoutScript, 'setTimeout(() => {}, 2000)');
    try {
      const failure = runExternalAdapters(
        {
          eslint: {
            enabled: true,
            command: process.execPath,
            args: [exitScript, '--format', 'json'],
          },
        },
        repo,
        [],
      );
      expect(failure.failures[0]?.adapter).toBe('eslint');
      const timeout = runExternalAdapters(
        {
          eslint: {
            enabled: true,
            command: process.execPath,
            args: [timeoutScript, '--format', 'json'],
            timeoutMs: 100,
          },
        },
        repo,
        [],
      );
      expect(timeout.failures[0]?.message).toMatch(/timed out|ETIMEDOUT/i);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('does not invoke adapters unless explicitly enabled', () => {
    expect(
      runExternalAdapters(
        { eslint: { enabled: false, command: 'missing', args: [] } },
        repo,
        [],
      ),
    ).toEqual({ findings: [], failures: [] });
  });
});
