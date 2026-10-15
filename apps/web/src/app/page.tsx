'use client';
import { useState } from 'react';
import type { AnalysisReport } from '@patchlens/core';
const sample =
  'diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,0 +1,2 @@\n+const output = eval(userInput);\n+const apiToken = "example-token-123456";';
export default function Home() {
  const [diff, setDiff] = useState('');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function audit() {
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ diff }),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body === 'object' && body !== null && 'error' in body
            ? String(body.error)
            : 'Analysis failed',
        );
      setReport(body as AnalysisReport);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <div className="brand">
          <span className="mark">P</span>
          <span>Patchlens</span>
        </div>
        <span className="local">LOCAL · DETERMINISTIC</span>
      </header>
      <section className="intro">
        <p className="eyebrow">CHANGE REVIEW, WITH RECEIPTS</p>
        <h1>See the risk in every patch.</h1>
        <p>
          Paste a unified Git diff. Patchlens checks added lines with explicit,
          inspectable rules. Your source stays on this server.
        </p>
      </section>
      <section className="workspace">
        <div className="panel-heading">
          <div>
            <h2>Patch input</h2>
            <p>Unified diff · up to 1 MiB</p>
          </div>
          <button className="sample" onClick={() => setDiff(sample)}>
            Load example
          </button>
        </div>
        <textarea
          aria-label="Unified Git diff"
          spellCheck={false}
          value={diff}
          onChange={(event) => setDiff(event.target.value)}
          placeholder={'Paste a diff here…\n\n$ git diff --unified=0 main'}
        />
        <div className="actions">
          <span>Scans added lines only · never runs repository code</span>
          <button
            className="run"
            disabled={busy || diff.length === 0}
            onClick={audit}
          >
            {busy ? 'Auditing…' : 'Audit patch'} <span>→</span>
          </button>
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <section className="results" aria-live="polite">
          <div className="summary">
            <div>
              <p className="eyebrow">AUDIT REPORT</p>
              <h2>
                {report.findings.length
                  ? `${report.findings.length} finding${report.findings.length === 1 ? '' : 's'} to review`
                  : 'No findings detected'}
              </h2>
              <p>
                {report.filesScanned} files scanned · deterministic built-in
                rules
              </p>
            </div>
            <div className="score">
              <strong>{report.riskScore}</strong>
              <span>/ 100 risk</span>
            </div>
          </div>
          {report.findings.map((finding, index) => (
            <article
              className="finding"
              key={`${finding.ruleId}-${finding.path}-${finding.range.startLine}-${index}`}
            >
              <div className="finding-top">
                <span className={`severity ${finding.severity}`}>
                  {finding.severity}
                </span>
                <code>{finding.ruleId}</code>
                <span className="location">
                  {finding.path}:{finding.range.startLine}
                </span>
              </div>
              <h3>{finding.title}</h3>
              <pre>{finding.evidence}</pre>
              <p>{finding.remediation}</p>
              <small>Confidence: {finding.confidence}</small>
            </article>
          ))}
        </section>
      )}
      <footer>
        Patchlens is a heuristic static analyzer. Findings need human review; a
        clean report is not proof of safety.
      </footer>
    </main>
  );
}
