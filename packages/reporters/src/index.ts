import type { AnalysisReport } from '@patchlens/core';
export function jsonReport(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}
export function textReport(report: AnalysisReport): string {
  if (report.findings.length === 0)
    return `Patchlens: no findings (${report.filesScanned} files, risk ${report.riskScore}/100)`;
  return [
    `Patchlens: ${report.findings.length} finding(s), risk ${report.riskScore}/100`,
    ...report.findings.map(
      (f) =>
        `${f.severity.toUpperCase()} ${f.ruleId} ${f.path}:${f.range.startLine} ${f.title}\n  ${f.evidence}\n  Fix: ${f.remediation}`,
    ),
  ].join('\n');
}
export function sarifReport(report: AnalysisReport): string {
  const rules = [
    ...new Map(
      report.findings.map((f) => [
        f.ruleId,
        {
          id: f.ruleId,
          shortDescription: { text: f.title },
          help: { text: f.remediation },
        },
      ]),
    ).values(),
  ];
  const level = {
    low: 'note',
    medium: 'warning',
    high: 'error',
    critical: 'error',
  } as const;
  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: { name: 'Patchlens', semanticVersion: '0.1.0', rules },
          },
          results: report.findings.map((f) => ({
            ruleId: f.ruleId,
            level: level[f.severity],
            message: { text: `${f.title}: ${f.evidence}` },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: f.path },
                  region: {
                    startLine: f.range.startLine,
                    endLine: f.range.endLine,
                  },
                },
              },
            ],
            properties: {
              confidence: f.confidence,
              remediation: f.remediation,
            },
          })),
        },
      ],
    },
    null,
    2,
  );
}
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
}
export function htmlReport(report: AnalysisReport): string {
  const rows = report.findings
    .map(
      (f) =>
        `<tr><td>${escape(f.severity)}</td><td>${escape(f.ruleId)}</td><td>${escape(f.path)}:${f.range.startLine}</td><td>${escape(f.title)}</td><td><code>${escape(f.evidence)}</code></td><td>${escape(f.remediation)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Patchlens report</title><style>body{font:16px system-ui;margin:2rem;color:#172033}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:.6rem;text-align:left}code{white-space:pre-wrap}</style><h1>Patchlens report</h1><p>${report.findings.length} findings · ${report.filesScanned} files · risk ${report.riskScore}/100</p><table><thead><tr><th>Severity</th><th>Rule</th><th>Location</th><th>Finding</th><th>Evidence</th><th>Remediation</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}
