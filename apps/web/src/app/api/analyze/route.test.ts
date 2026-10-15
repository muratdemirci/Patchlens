import { describe, expect, it } from 'vitest';
import { POST } from './route.js';

describe('POST /api/analyze', () => {
  it('rejects unsupported content types and malformed shapes', async () => {
    const typeResponse = await POST(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'text/plain' },
      }),
    );
    expect(typeResponse.status).toBe(415);
    const bodyResponse = await POST(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ diff: '', extra: true }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(bodyResponse.status).toBe(400);
  });
  it('returns findings for a bounded unified diff', async () => {
    const diff =
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1 @@\n+eval(input);';
    const response = await POST(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ diff }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      findings: [{ ruleId: 'PL-JS-001' }],
    });
  });
  it('runs syntax-context rules when a pasted diff includes changed source', async () => {
    const diff = [
      'diff --git a/src/tls.ts b/src/tls.ts',
      '--- /dev/null',
      '+++ b/src/tls.ts',
      '@@ -0,0 +1 @@',
      '+const agent = { rejectUnauthorized: false };',
    ].join('\n');
    const response = await POST(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ diff }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      findings: [{ ruleId: 'PL-SEC-003', range: { startLine: 1 } }],
    });
  });
  it('rejects payloads above the request-size cap', async () => {
    const response = await POST(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ diff: 'x'.repeat(1024 * 1024) }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(413);
  });
});
