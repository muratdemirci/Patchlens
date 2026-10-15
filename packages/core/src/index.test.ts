import { describe, expect, it } from 'vitest';
import { analyze, type AddedLine, type Rule } from './index.js';
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
});
