import { describe, expect, it } from 'vitest';
import {
  analyze,
  analyzeChanges,
  compareBaseline,
  parseConfig,
  type AddedLine,
  type Finding,
  type Rule,
} from './index.js';
const rule: Rule = {
  id: 'PL-TEST-001',
  title: 'test',
  defaultSeverity: 'high',
  confidence: 'high',
  remediation: 'fix it',
  test: (line) => line.includes('bad'),
};
const lines: AddedLine[] = [{ path: 'src/a.ts', line: 4, content: 'bad();' }];
describe('analyze', () => {
  it('emits versioned evidence and calculates risk', () => {
    expect(analyze(lines, [rule])).toMatchObject({
      schemaVersion: '1.0.0',
      riskScore: 7,
      filesScanned: 1,
      findings: [
        { ruleId: rule.id, range: { startLine: 4 }, evidence: 'bad();' },
      ],
    });
  });
  it('validates config, applies disable, ignore and suppression', () => {
    expect(
      analyze(lines, [rule], { rules: { [rule.id]: { enabled: false } } })
        .findings,
    ).toHaveLength(0);
    expect(
      analyze(lines, [rule], { ignorePaths: ['src/**'] }).filesScanned,
    ).toBe(0);
    expect(
      analyze(lines, [rule], {
        suppressions: [
          { ruleId: rule.id, path: 'src/*.ts', reason: 'reviewed' },
        ],
      }).findings,
    ).toHaveLength(0);
    expect(() => analyze(lines, [rule], { surprise: true })).toThrow(
      'Unknown config key',
    );
  });

  it('parses validated YAML and rejects malformed or unsafe suppression entries', () => {
    expect(
      parseConfig(
        'rules:\n  PL-TEST-001:\n    enabled: false\nexclude:\n  - generated/**\nthresholds:\n  failOn: high',
      ),
    ).toMatchObject({
      rules: { 'PL-TEST-001': { enabled: false } },
      exclude: ['generated/**'],
      thresholds: { failOn: 'high' },
    });
    expect(() => parseConfig('rules: [')).toThrow('Invalid YAML');
    expect(() =>
      parseConfig(
        'suppressions:\n  - ruleId: "*"\n    path: "**"\n    reason: "ignore everything"',
      ),
    ).toThrow('suppression');
  });

  it('runs contextual rules, records reasoned inline suppressions, and reports risk factors', () => {
    const contextualRule: Rule = {
      id: 'PL-TEST-002',
      title: 'context rule',
      defaultSeverity: 'high',
      confidence: 'high',
      remediation: 'fix it',
      analyze: (context) =>
        context.lines
          .filter((line) => line.content.includes('bad'))
          .map((line) => ({
            schemaVersion: '1.0.0',
            ruleId: 'PL-TEST-002',
            title: 'context rule',
            message: 'context match',
            severity: 'high',
            confidence: 'high',
            path: line.path,
            range: { startLine: line.line, endLine: line.line },
            evidence: line.content,
            remediation: 'fix it',
          })),
    };
    const content =
      '// patchlens-disable-next-line PL-TEST-002 -- reviewed test exception\nbad();\n';
    const report = analyzeChanges(
      {
        files: [
          {
            path: 'src/a.ts',
            status: 'modified',
            binary: false,
            added: [{ path: 'src/a.ts', line: 2, content: 'bad();' }],
            removed: [],
            content,
          },
        ],
        lines: [
          { path: 'src/a.ts', line: 2, content: 'bad();', kind: 'added' },
        ],
      },
      [contextualRule],
    );
    expect(report.findings).toHaveLength(0);
    expect(report.suppressions).toEqual([
      {
        ruleId: 'PL-TEST-002',
        path: 'src/a.ts',
        line: 2,
        reason: 'reviewed test exception',
      },
    ]);
    expect(report.riskFactors).toEqual([]);
  });

  it('rejects malicious paths and distinguishes baseline findings', () => {
    expect(() =>
      analyzeChanges(
        {
          files: [
            {
              path: '../outside.ts',
              status: 'modified',
              binary: false,
              added: [],
              removed: [],
            },
          ],
          lines: [],
        },
        [rule],
      ),
    ).toThrow('Invalid changed-file path');
    const report = analyze(lines, [rule]);
    const finding = report.findings[0] as Finding;
    expect(compareBaseline(report, [finding]).baseline).toEqual({
      newFindings: 0,
      existingFindings: 1,
    });
    expect(compareBaseline(report, []).findings[0]?.lifecycle).toBe('new');
    const repeated = analyze(
      [
        { path: 'src/a.ts', line: 4, content: 'bad();' },
        { path: 'src/a.ts', line: 9, content: 'bad();' },
      ],
      [rule],
    );
    expect(compareBaseline(repeated, [finding]).baseline).toEqual({
      newFindings: 1,
      existingFindings: 1,
    });
  });
});
