import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyze,
  analyzeChanges,
  type ChangedFile,
  type LineChange,
} from '@patchlens/core';
import {
  builtInRules,
  createRuleRegistry,
  typescriptJavaScriptAdapter,
} from './index.js';

describe('built-in rules', () => {
  const highEntropySample = ['zX8qL1mP7vN3', 'aB6cR9tY'].join('');

  it('reports only supported sinks on added JavaScript or TypeScript lines', () => {
    const report = analyze(
      [
        { path: 'src/a.ts', line: 3, content: 'const x = eval(input);' },
        { path: 'src/a.ts', line: 4, content: 'el.innerHTML = input;' },
        { path: 'README.md', line: 1, content: 'eval(input)' },
        {
          path: 'src/safe.ts',
          line: 2,
          content: 'const x = parseInt(input, 10);',
        },
      ],
      builtInRules,
    );
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      'PL-JS-001',
      'PL-JS-002',
    ]);
    expect(report.findings[0]?.range.startLine).toBe(3);
  });
  it('flags a high-entropy credential candidate and ignores short or placeholder strings', () => {
    const report = analyze(
      [
        {
          path: 'src/config.ts',
          line: 1,
          content: 'const apiToken = "' + highEntropySample + '";',
        },
        {
          path: 'src/config.ts',
          line: 2,
          content: 'const token = "example-token-123456";',
        },
        { path: 'src/config.ts', line: 3, content: 'const token = "short";' },
      ],
      builtInRules,
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.ruleId).toBe('PL-SEC-001');
  });

  it('uses TypeScript AST rules for dangerous sinks and avoids safe parameterized forms', () => {
    const content = [
      'import { exec } from "node:child_process";',
      'import { query } from "./db";',
      'const command = "echo " + request.query.cmd;',
      'exec(command);',
      'query("SELECT * FROM users WHERE id = ?", [userId]);',
      'query(`SELECT * FROM users WHERE id = ${userId}`);',
      'const generated = new Function(source);',
      '// eval(input);',
      'const example = "element.innerHTML = input";',
    ].join('\n');
    const lines: LineChange[] = content.split('\n').map((text, index) => ({
      path: 'src/handler.ts',
      line: index + 1,
      content: text,
      kind: 'added',
    }));
    const file: ChangedFile = {
      path: 'src/handler.ts',
      status: 'added',
      binary: false,
      added: lines,
      removed: [],
      content,
    };
    const report = analyzeChanges({ files: [file], lines }, builtInRules);
    expect(report.findings.map((finding) => finding.ruleId)).toContain(
      'PL-JS-004',
    );
    expect(report.findings.map((finding) => finding.ruleId)).toContain(
      'PL-JS-005',
    );
    expect(report.findings.map((finding) => finding.ruleId)).toContain(
      'PL-JS-003',
    );
    expect(report.findings.map((finding) => finding.ruleId)).not.toContain(
      'PL-JS-001',
    );
    expect(report.findings.map((finding) => finding.ruleId)).not.toContain(
      'PL-JS-002',
    );
    expect(
      report.findings.filter((finding) => finding.ruleId === 'PL-JS-005'),
    ).toHaveLength(1);
    expect(
      report.findings.find((finding) => finding.ruleId === 'PL-JS-005')?.range
        .startLine,
    ).toBe(6);
  });

  it('covers TLS, dangerous deserialization, swallowed errors, migration changes, and log redaction prompts', () => {
    const content = [
      'const agent = { rejectUnauthorized: false };',
      'yaml.load(untrusted);',
      'try { work(); } catch (error) { return null; }',
      'console.info(password);',
      'await something().then(done);',
      'debugger;',
    ].join('\n');
    const lines: LineChange[] = content.split('\n').map((text, index) => ({
      path: 'src/auth-service.ts',
      line: index + 1,
      content: text,
      kind: 'added',
    }));
    const file: ChangedFile = {
      path: 'src/auth-service.ts',
      status: 'modified',
      binary: false,
      added: lines,
      removed: [],
      content,
    };
    const migration = 'DROP TABLE sessions;';
    const migrationLine: LineChange = {
      path: 'db/migrations/001.sql',
      line: 1,
      content: migration,
      kind: 'added',
    };
    const migrationFile: ChangedFile = {
      path: migrationLine.path,
      status: 'added',
      binary: false,
      added: [migrationLine],
      removed: [],
      content: migration,
    };
    const report = analyzeChanges(
      { files: [file, migrationFile], lines: [...lines, migrationLine] },
      builtInRules,
    );
    const ids = report.findings.map((finding) => finding.ruleId);
    expect(ids).toContain('PL-SEC-003');
    expect(ids).toContain('PL-JS-007');
    expect(ids).toContain('PL-SEC-004');
    expect(ids).toContain('PL-JS-008');
    expect(ids).toContain('PL-DB-001');
    expect(ids).toContain('PL-SEC-006');
    expect(
      report.findings.find((finding) => finding.ruleId === 'PL-DB-001')?.range
        .startLine,
    ).toBe(1);
  });

  it('flags a conservative high-entropy secret candidate but ignores placeholders and URL literals', () => {
    const content = [
      'const apiToken = "' + highEntropySample + '";',
      'const password = "example-password-not-real";',
      'const endpoint = "https://service.example.invalid/token";',
    ].join('\n');
    const lines: LineChange[] = content.split('\n').map((text, index) => ({
      path: 'src/config.ts',
      line: index + 1,
      content: text,
      kind: 'added',
    }));
    const file: ChangedFile = {
      path: 'src/config.ts',
      status: 'added',
      binary: false,
      added: lines,
      removed: [],
      content,
    };
    const report = analyzeChanges({ files: [file], lines }, builtInRules);
    expect(
      report.findings.filter((finding) => finding.ruleId === 'PL-SEC-002'),
    ).toHaveLength(1);
    expect(
      report.findings.find((finding) => finding.ruleId === 'PL-SEC-002')?.range
        .startLine,
    ).toBe(1);
  });

  it('detects traversal, unsafe deserialization, broad permissions, and visible unhandled promises', () => {
    const content = [
      'path.join("/srv/data", req.query.filename);',
      'serializer.deserialize(payload);',
      'fs.chmodSync(file, 0o777);',
      'loadData().then(render);',
      'path.join("/srv/data", "report.csv");',
      'execFile("git", ["status"]);',
    ].join('\n');
    const lines: LineChange[] = content.split('\n').map((text, index) => ({
      path: 'src/files.ts',
      line: index + 1,
      content: text,
      kind: 'added',
    }));
    const file: ChangedFile = {
      path: 'src/files.ts',
      status: 'added',
      binary: false,
      added: lines,
      removed: [],
      content,
    };
    const report = analyzeChanges({ files: [file], lines }, builtInRules);
    const findings = report.findings.filter((finding) =>
      ['PL-JS-006', 'PL-JS-007', 'PL-SEC-005', 'PL-JS-009'].includes(
        finding.ruleId,
      ),
    );
    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        'PL-JS-006',
        'PL-JS-007',
        'PL-SEC-005',
        'PL-JS-009',
      ]),
    );
    expect(
      findings.some(
        (finding) =>
          finding.range.startLine === 5 && finding.ruleId === 'PL-JS-006',
      ),
    ).toBe(false);
  });

  it('keeps rule IDs unique and registry output stable', () => {
    expect(
      createRuleRegistry([typescriptJavaScriptAdapter]).map((rule) => rule.id),
    ).toEqual(
      createRuleRegistry([typescriptJavaScriptAdapter]).map((rule) => rule.id),
    );
    expect(() =>
      createRuleRegistry([
        typescriptJavaScriptAdapter,
        typescriptJavaScriptAdapter,
      ]),
    ).toThrow('Duplicate rule ID');
  });

  it('reports executable-mode changes from Git metadata', () => {
    const report = analyzeChanges(
      {
        files: [
          {
            path: 'scripts/release.sh',
            status: 'modified',
            binary: false,
            oldMode: '100644',
            newMode: '100755',
            added: [],
            removed: [],
          },
        ],
        lines: [],
      },
      builtInRules,
    );
    expect(report.findings).toMatchObject([
      {
        ruleId: 'PL-SEC-007',
        path: 'scripts/release.sh',
        evidence: 'mode 100644 -> 100755',
      },
    ]);
  });

  it('audits repository fixtures deterministically and reports manifest or API changes', () => {
    const fixtureRoot = resolve(process.cwd(), 'tests/fixtures');
    const source = readFileSync(
      resolve(fixtureRoot, 'vulnerable/src/unsafe.ts'),
      'utf8',
    );
    const sourceLines: LineChange[] = source
      .split(/\r?\n/)
      .filter(Boolean)
      .map((text, index) => ({
        path: 'src/unsafe.ts',
        line: index + 1,
        content: text,
        kind: 'added',
      }));
    const packageContent =
      '{\n  "dependencies": {\n    "new-package": "^1.0.0"\n  }\n}';
    const dependencyLine: LineChange = {
      path: 'package.json',
      line: 3,
      content: '    "new-package": "^1.0.0"',
      kind: 'added',
    };
    const apiRemoval: LineChange = {
      path: 'src/public.ts',
      line: 8,
      content: 'export function oldApi(): void {}',
      kind: 'removed',
    };
    const files: ChangedFile[] = [
      {
        path: 'src/unsafe.ts',
        status: 'added',
        binary: false,
        added: sourceLines,
        removed: [],
        content: source,
      },
      {
        path: 'package.json',
        status: 'modified',
        binary: false,
        added: [dependencyLine],
        removed: [],
        content: packageContent,
      },
      {
        path: 'src/public.ts',
        status: 'modified',
        binary: false,
        added: [],
        removed: [apiRemoval],
      },
    ];
    const changes = {
      files,
      lines: [...sourceLines, dependencyLine, apiRemoval],
    };
    const first = analyzeChanges(changes, builtInRules);
    const second = analyzeChanges(changes, builtInRules);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        'PL-JS-001',
        'PL-JS-002',
        'PL-DEPS-001',
        'PL-DEPS-002',
        'PL-API-001',
      ]),
    );

    const scriptOnly = '{\n  "scripts": {\n    "build": "tsc"\n  }\n}';
    const scriptLine: LineChange = {
      path: 'package.json',
      line: 3,
      content: '    "build": "tsc"',
      kind: 'added',
    };
    const safe = analyzeChanges(
      {
        files: [
          {
            path: 'package.json',
            status: 'modified',
            binary: false,
            added: [scriptLine],
            removed: [],
            content: scriptOnly,
          },
        ],
        lines: [scriptLine],
      },
      builtInRules,
    );
    expect(safe.findings.map((finding) => finding.ruleId)).not.toContain(
      'PL-DEPS-001',
    );
    expect(
      readFileSync(resolve(fixtureRoot, 'safe/src/safe.ts'), 'utf8'),
    ).toContain('textContent');
  });
});
