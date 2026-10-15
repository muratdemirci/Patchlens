import { describe, expect, it } from 'vitest';
import { analyze } from '@patchlens/core';
import { builtInRules } from './index.js';

describe('built-in rules', () => {
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
  it('flags credential-shaped assignments and not short literals', () => {
    const report = analyze(
      [
        {
          path: 'src/config.ts',
          line: 1,
          content: 'const apiToken = "example-token-123456";',
        },
        { path: 'src/config.ts', line: 2, content: 'const token = "short";' },
      ],
      builtInRules,
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.ruleId).toBe('PL-SEC-001');
  });
});
