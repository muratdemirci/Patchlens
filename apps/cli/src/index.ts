#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeChanges,
  compareBaseline,
  parseBaseline,
  parseConfig,
  type AnalyzerConfig,
  type Rule,
  type Severity,
} from '@patchlens/core';
import {
  changesBetweenRefs,
  stagedChanges,
  workingTreeChanges,
} from '@patchlens/git';
import {
  htmlReport,
  jsonReport,
  sarifReport,
  textReport,
} from '@patchlens/reporters';
import { builtInRules, runExternalAdapters } from '@patchlens/rules';
function usage(status = 2): never {
  const print = status === 0 ? console.log : console.error;
  print(
    'Usage: patchlens --repo PATH [--mode working-tree|staged|refs] [--base REF] [--head REF] [--comparison merge-base|direct] [--format text|json|sarif|html] [--config FILE] [--output FILE] [--fail-on info|low|medium|high|critical]',
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
        '--mode',
        '--base',
        '--head',
        '--comparison',
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
  const mode =
    opts.get('--mode') ??
    (opts.has('--base') || opts.has('--head') ? 'refs' : 'working-tree');
  if (!['working-tree', 'staged', 'refs'].includes(mode)) usage();
  if (mode !== 'refs' && (opts.has('--base') || opts.has('--head'))) usage();
  const comparison = opts.get('--comparison') ?? 'merge-base';
  if (
    !['merge-base', 'direct'].includes(comparison) ||
    (mode !== 'refs' && opts.has('--comparison'))
  )
    usage();
  const threshold = opts.get('--fail-on');
  const order: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
  if (threshold && !order.includes(threshold as Severity)) usage();
  const configFile = resolve(repo, opts.get('--config') ?? '.patchlens.yml');
  let config: AnalyzerConfig = {};
  if (existsSync(configFile)) {
    try {
      const text = readFileSync(resolve(configFile), 'utf8');
      config = parseConfig(text);
    } catch (error) {
      throw new Error(
        `Cannot read config: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  } else if (opts.has('--config')) {
    throw new Error('Config file does not exist: ' + configFile);
  }
  const changes =
    mode === 'working-tree'
      ? workingTreeChanges(repo)
      : mode === 'staged'
        ? stagedChanges(repo)
        : changesBetweenRefs(
            repo,
            opts.get('--base'),
            opts.get('--head'),
            comparison as 'merge-base' | 'direct',
          );
  const adapterResult = runExternalAdapters(
    config.externalAdapters,
    repo,
    changes.files.map((file) => file.path),
  );
  for (const failure of adapterResult.failures)
    console.error(
      'Patchlens adapter ' + failure.adapter + ': ' + failure.message,
    );
  const adapterGroups = new Map<string, typeof adapterResult.findings>();
  for (const finding of adapterResult.findings) {
    const group = adapterGroups.get(finding.ruleId) ?? [];
    group.push(finding);
    adapterGroups.set(finding.ruleId, group);
  }
  const adapterRules: Rule[] = [...adapterGroups].map(([id, findings]) => ({
    id,
    title: findings[0]?.title ?? id,
    defaultSeverity: findings[0]?.severity ?? 'info',
    confidence: findings[0]?.confidence ?? 'low',
    remediation:
      findings[0]?.remediation ?? 'Review the external analyzer guidance.',
    analyze: () => findings,
  }));
  let report = analyzeChanges(
    changes,
    [...builtInRules, ...adapterRules],
    config,
  );
  if (config.baseline) {
    const baselinePath = resolve(repo, config.baseline);
    report = compareBaseline(
      report,
      parseBaseline(readFileSync(baselinePath, 'utf8')),
    );
  }
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
  const failOn =
    (threshold as Severity | undefined) ?? config.thresholds?.failOn;
  const confidenceOrder = ['low', 'medium', 'high'];
  const minConfidence = config.thresholds?.minConfidence ?? 'low';
  if (adapterResult.failures.length > 0) process.exitCode = 2;
  else if (
    failOn &&
    report.findings.some(
      (finding) =>
        order.indexOf(finding.severity) >= order.indexOf(failOn) &&
        confidenceOrder.indexOf(finding.confidence) >=
          confidenceOrder.indexOf(minConfidence),
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
