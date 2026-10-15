#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze, type Severity } from '@patchlens/core';
import { diffRefs, parseUnifiedDiff } from '@patchlens/git';
import {
  htmlReport,
  jsonReport,
  sarifReport,
  textReport,
} from '@patchlens/reporters';
import { builtInRules } from '@patchlens/rules';
function usage(status = 2): never {
  const print = status === 0 ? console.log : console.error;
  print(
    'Usage: patchlens --repo PATH [--base REF] [--head REF] [--format text|json|sarif|html] [--config FILE] [--output FILE] [--fail-on low|medium|high|critical]',
  );
  process.exit(status);
}
function main(args: readonly string[]): void {
  const opts = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key?.startsWith('--') || key === '--help') {
      if (key === '--help') {
        console.log('Patchlens deterministic Git change auditor\n');
        usage(0);
      }
      usage();
    }
    const value = args[++i];
    if (!value || value.startsWith('--') || opts.has(key)) usage();
    opts.set(key, value);
  }
  for (const key of opts.keys())
    if (
      ![
        '--repo',
        '--base',
        '--head',
        '--format',
        '--config',
        '--output',
        '--fail-on',
      ].includes(key)
    )
      usage();
  const repo = resolve(opts.get('--repo') ?? process.cwd());
  const format = opts.get('--format') ?? 'text';
  if (!['text', 'json', 'sarif', 'html'].includes(format)) usage();
  const threshold = opts.get('--fail-on');
  const order: Severity[] = ['low', 'medium', 'high', 'critical'];
  if (threshold && !order.includes(threshold as Severity)) usage();
  const configFile = opts.get('--config');
  let config: unknown = {};
  if (configFile) {
    try {
      const text = readFileSync(resolve(configFile), 'utf8');
      if (text.length > 1024 * 1024) throw new Error('Config exceeds 1 MiB');
      config = JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(
        `Cannot read config: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  const diff = diffRefs(repo, opts.get('--base'), opts.get('--head'));
  const report = analyze(parseUnifiedDiff(diff), builtInRules, config);
  const rendered =
    format === 'json'
      ? jsonReport(report)
      : format === 'sarif'
        ? sarifReport(report)
        : format === 'html'
          ? htmlReport(report)
          : textReport(report);
  const output = opts.get('--output');
  if (output) writeFileSync(resolve(output), rendered, 'utf8');
  else console.log(rendered);
  if (
    threshold &&
    report.findings.some(
      (f) => order.indexOf(f.severity) >= order.indexOf(threshold as Severity),
    )
  )
    process.exitCode = 1;
}
try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(
    `Patchlens: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
}
