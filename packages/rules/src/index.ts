import type { Rule } from '@patchlens/core';
const sourcePath = /\.(?:[cm]?[jt]sx?)$/i;
export const builtInRules: readonly Rule[] = [
  {
    id: 'PL-JS-001',
    title: 'Direct eval call',
    defaultSeverity: 'high',
    confidence: 'high',
    remediation: 'Avoid eval; use explicit parsing or a safe dispatch table.',
    test: (line, path) => sourcePath.test(path) && /\beval\s*\(/.test(line),
  },
  {
    id: 'PL-JS-002',
    title: 'HTML injection sink assignment',
    defaultSeverity: 'high',
    confidence: 'medium',
    remediation:
      'Avoid assigning untrusted values to innerHTML; use textContent or a vetted sanitizer.',
    test: (line, path) => sourcePath.test(path) && /\.innerHTML\s*=/.test(line),
  },
  {
    id: 'PL-SEC-001',
    title: 'Possible hard-coded credential',
    defaultSeverity: 'critical',
    confidence: 'medium',
    remediation:
      'Load credentials from a secret manager or environment and rotate exposed values.',
    test: (line, path) =>
      sourcePath.test(path) &&
      /(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{8,}["']/i.test(
        line,
      ),
  },
];
