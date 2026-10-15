import { describe, expect, it } from 'vitest';
import { htmlReport, sarifReport, textReport } from './index.js';
import type { AnalysisReport } from '@patchlens/core';
const report: AnalysisReport = {
  schemaVersion: '1.0.0',
  riskScore: 7,
  filesScanned: 1,
  findings: [
    {
      schemaVersion: '1.0.0',
      ruleId: 'PL-TEST-001',
      title: '<img>',
      message: 'test',
      severity: 'high',
      confidence: 'medium',
      path: 'src/<x>.ts',
      range: { startLine: 2, endLine: 2 },
      evidence: '<script>alert(1)</script>',
      remediation: 'escape < this',
    },
  ],
};
describe('reporters', () => {
  it('escapes untrusted HTML content', () => {
    const html = htmlReport(report);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
  });
  it('serializes stable SARIF and readable text', () => {
    expect(
      JSON.parse(sarifReport(report)) as { version: string },
    ).toMatchObject({ version: '2.1.0' });
    expect(textReport(report)).toContain('PL-TEST-001 src/<x>.ts:2');
  });
});
