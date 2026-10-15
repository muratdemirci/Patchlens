import type { AnalysisReport } from '@patchlens/core';
export function jsonReport(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}
export function textReport(report: AnalysisReport): string {
  const factors = (report.riskFactors ?? []).map(
    (factor) => `  +${factor.points} ${factor.description}`,
  );
  const header =
    report.findings.length === 0
      ? `Patchlens: no findings (${report.filesScanned} files, risk ${report.riskScore}/100)`
      : `Patchlens: ${report.findings.length} finding(s), risk ${report.riskScore}/100`;
  return [
    header,
    ...(factors.length > 0 ? ['Risk factors:', ...factors] : []),
    ...(report.baseline
      ? [
          `Baseline: ${report.baseline.newFindings} new, ${report.baseline.existingFindings} existing`,
        ]
      : []),
    ...report.findings.map(
      (f) =>
        `${f.severity.toUpperCase()} (${f.confidence} confidence) ${f.ruleId} ${f.path}:${f.range.startLine} ${f.title} [${f.source ?? 'patchlens'}]\n  ${f.evidence}\n  ${f.message}\n  Fix: ${f.remediation}`,
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
    info: 'note',
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
          properties: {
            riskScore: report.riskScore,
            riskFactors: report.riskFactors ?? [],
            baseline: report.baseline,
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
              source: f.source ?? 'patchlens',
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
        `<tr><td>${escape(f.severity)} (${escape(f.confidence)})</td><td>${escape(f.source ?? 'patchlens')}</td><td>${escape(f.ruleId)}</td><td>${escape(f.path)}:${f.range.startLine}</td><td>${escape(f.title)}</td><td>${escape(f.message)}</td><td><code>${escape(f.evidence)}</code></td><td>${escape(f.remediation)}</td></tr>`,
    )
    .join('');
  const factors = (report.riskFactors ?? [])
    .map((factor) => `<li>+${factor.points} ${escape(factor.description)}</li>`)
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Patchlens report</title><style>body{font:16px system-ui;margin:2rem;color:#172033}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:.6rem;text-align:left}code{white-space:pre-wrap}</style><h1>Patchlens report</h1><p>${report.findings.length} findings · ${report.filesScanned} files · risk ${report.riskScore}/100</p><h2>Risk factors</h2><ul>${factors || '<li>No risk factors</li>'}</ul>${report.baseline ? `<p>Baseline: ${report.baseline.newFindings} new, ${report.baseline.existingFindings} existing</p>` : ''}<table><thead><tr><th>Severity and confidence</th><th>Source</th><th>Rule</th><th>Location</th><th>Finding</th><th>Why</th><th>Evidence</th><th>Remediation</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}
