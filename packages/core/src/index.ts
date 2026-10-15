import { parseDocument } from 'yaml';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';
export type ChangeKind = 'added' | 'removed' | 'modified';
export type FileStatus =
  'added' | 'modified' | 'renamed' | 'deleted' | 'copied' | 'unknown';
export interface SourceRange {
  startLine: number;
  endLine: number;
}
export interface Finding {
  schemaVersion: '1.0.0';
  ruleId: string;
  title: string;
  message: string;
  severity: Severity;
  confidence: Confidence;
  path: string;
  range: SourceRange;
  evidence: string;
  remediation: string;
  references?: string[];
  source?: 'patchlens' | 'adapter';
  lifecycle?: 'new' | 'existing';
}
export interface AddedLine {
  path: string;
  line: number;
  content: string;
}
export interface LineChange extends AddedLine {
  kind: ChangeKind;
  previousLine?: number;
}
export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  binary: boolean;
  oldMode?: string;
  newMode?: string;
  added: readonly AddedLine[];
  removed: readonly AddedLine[];
  content?: string;
}
export interface ChangeSet {
  files: readonly ChangedFile[];
  lines: readonly LineChange[];
}
export interface RuleContext {
  files: readonly ChangedFile[];
  lines: readonly LineChange[];
}
export interface RiskFactor {
  id: string;
  description: string;
  points: number;
}
export interface SuppressionRecord {
  ruleId: string;
  path: string;
  line: number;
  reason: string;
}
export interface Rule {
  id: string;
  title: string;
  defaultSeverity: Severity;
  confidence: Confidence;
  remediation: string;
  references?: readonly string[];
  test?(line: string, path: string): boolean;
  analyze?(context: RuleContext): readonly Finding[];
}
export interface Suppression {
  ruleId: string;
  path: string;
  reason: string;
}
export interface AnalyzerConfig {
  rules?: Record<string, { enabled?: boolean; severity?: Severity }>;
  ignorePaths?: string[];
  suppressions?: Suppression[];
  riskWeights?: Partial<Record<Severity, number>>;
  exclude?: string[];
  baseline?: string;
  thresholds?: { failOn?: Severity; minConfidence?: Confidence };
  externalAdapters?: Record<
    string,
    { enabled: boolean; command: string; args: string[]; timeoutMs?: number }
  >;
}
export interface AnalysisReport {
  schemaVersion: '1.0.0';
  findings: Finding[];
  riskScore: number;
  filesScanned: number;
  riskFactors?: RiskFactor[];
  changedFiles?: number;
  addedLines?: number;
  removedLines?: number;
  suppressions?: SuppressionRecord[];
  baseline?: { newFindings: number; existingFindings: number };
}
const severities: readonly Severity[] = [
  'info',
  'low',
  'medium',
  'high',
  'critical',
];
const validRuleId = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value) && !value.includes('*');
function validateConfig(value: unknown): AnalyzerConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Configuration must be an object');
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    'rules',
    'ignorePaths',
    'exclude',
    'suppressions',
    'riskWeights',
    'baseline',
    'thresholds',
    'externalAdapters',
  ]);
  for (const key of Object.keys(input))
    if (!allowed.has(key)) throw new Error(`Unknown config key: ${key}`);
  for (const key of ['ignorePaths', 'exclude']) {
    const patterns = input[key];
    if (
      patterns !== undefined &&
      (!Array.isArray(patterns) ||
        patterns.some((v) => typeof v !== 'string' || v.length === 0))
    )
      throw new Error(key + ' must be a non-empty string array');
  }
  if (
    input.baseline !== undefined &&
    (typeof input.baseline !== 'string' || input.baseline.length === 0)
  )
    throw new Error('baseline must be a non-empty path string');
  if (
    input.suppressions !== undefined &&
    (!Array.isArray(input.suppressions) ||
      input.suppressions.some(
        (v) =>
          typeof v !== 'object' ||
          v === null ||
          Array.isArray(v) ||
          typeof (v as Record<string, unknown>).ruleId !== 'string' ||
          !validRuleId(String((v as Record<string, unknown>).ruleId)) ||
          typeof (v as Record<string, unknown>).path !== 'string' ||
          typeof (v as Record<string, unknown>).reason !== 'string' ||
          String((v as Record<string, unknown>).reason).trim().length < 8 ||
          String((v as Record<string, unknown>).path).includes('..'),
      ))
  )
    throw new Error('suppressions must contain ruleId and path strings');
  const rules = input.rules;
  if (rules !== undefined) {
    if (typeof rules !== 'object' || rules === null || Array.isArray(rules))
      throw new Error('rules must be an object');
    for (const [id, setting] of Object.entries(rules)) {
      if (
        !validRuleId(id) ||
        typeof setting !== 'object' ||
        setting === null ||
        Array.isArray(setting)
      )
        throw new Error(`Invalid rule setting: ${id}`);
      const obj = setting as Record<string, unknown>;
      for (const key of Object.keys(obj))
        if (key !== 'enabled' && key !== 'severity')
          throw new Error(`Unknown ${id} setting: ${key}`);
      if (obj.enabled !== undefined && typeof obj.enabled !== 'boolean')
        throw new Error(`${id}.enabled must be boolean`);
      if (
        obj.severity !== undefined &&
        !severities.includes(obj.severity as Severity)
      )
        throw new Error(`${id}.severity is invalid`);
    }
  }
  const weights = input.riskWeights;
  if (weights !== undefined) {
    if (
      typeof weights !== 'object' ||
      weights === null ||
      Array.isArray(weights)
    )
      throw new Error('riskWeights must be an object');
    for (const [key, n] of Object.entries(weights))
      if (
        !severities.includes(key as Severity) ||
        !Number.isInteger(n) ||
        (n as number) < 0 ||
        (n as number) > 100
      )
        throw new Error('riskWeights values must be integers from 0 to 100');
  }
  if (Array.isArray(input.suppressions))
    for (const entryValue of input.suppressions) {
      const entry = entryValue as Record<string, unknown>;
      for (const key of Object.keys(entry))
        if (!['ruleId', 'path', 'reason'].includes(key))
          throw new Error(`Unknown suppression key: ${key}`);
      if (typeof entry.reason !== 'string' || entry.reason.trim().length < 8)
        throw new Error('suppression reason must have at least 8 characters');
    }
  if (input.thresholds !== undefined) {
    const thresholds = input.thresholds;
    if (
      typeof thresholds !== 'object' ||
      thresholds === null ||
      Array.isArray(thresholds)
    )
      throw new Error('thresholds must be an object');
    const record = thresholds as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => !['failOn', 'minConfidence'].includes(key),
      )
    )
      throw new Error('Unknown threshold setting');
    if (
      record.failOn !== undefined &&
      !severities.includes(record.failOn as Severity)
    )
      throw new Error('thresholds.failOn is invalid');
    if (
      record.minConfidence !== undefined &&
      !['low', 'medium', 'high'].includes(String(record.minConfidence))
    )
      throw new Error('thresholds.minConfidence is invalid');
  }
  if (input.externalAdapters !== undefined) {
    const adapters = input.externalAdapters;
    if (
      typeof adapters !== 'object' ||
      adapters === null ||
      Array.isArray(adapters)
    )
      throw new Error('externalAdapters must be an object');
    for (const [name, value] of Object.entries(adapters)) {
      if (
        !/^[a-z][a-z0-9-]{0,31}$/.test(name) ||
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
      )
        throw new Error(`Invalid external adapter: ${name}`);
      const adapter = value as Record<string, unknown>;
      if (
        Object.keys(adapter).some(
          (key) => !['enabled', 'command', 'args', 'timeoutMs'].includes(key),
        ) ||
        typeof adapter.enabled !== 'boolean' ||
        typeof adapter.command !== 'string' ||
        !Array.isArray(adapter.args) ||
        adapter.args.some((arg) => typeof arg !== 'string') ||
        (adapter.timeoutMs !== undefined &&
          (!Number.isInteger(adapter.timeoutMs) ||
            Number(adapter.timeoutMs) < 100 ||
            Number(adapter.timeoutMs) > 300_000))
      )
        throw new Error(`Invalid external adapter settings: ${name}`);
    }
  }
  return value as AnalyzerConfig;
}
export function parseConfig(text: string): AnalyzerConfig {
  if (text.length > 1024 * 1024) throw new Error('Configuration exceeds 1 MiB');
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0)
    throw new Error(
      `Invalid YAML configuration: ${document.errors[0]?.message ?? 'parse error'}`,
    );
  return validateConfig(document.toJS({ maxAliasCount: 0 }));
}
export function parseBaseline(text: string): Finding[] {
  if (text.length > 16 * 1024 * 1024)
    throw new Error('Baseline exceeds 16 MiB');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      'Invalid baseline JSON: ' +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
  const findings = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && 'findings' in value
      ? value.findings
      : undefined;
  if (!Array.isArray(findings))
    throw new Error('Baseline must be an array or an analysis report');
  for (const item of findings) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('schemaVersion' in item) ||
      item.schemaVersion !== '1.0.0' ||
      !('ruleId' in item) ||
      typeof item.ruleId !== 'string' ||
      !validRuleId(item.ruleId) ||
      !('title' in item) ||
      typeof item.title !== 'string' ||
      !('message' in item) ||
      typeof item.message !== 'string' ||
      !('severity' in item) ||
      !severities.includes(item.severity as Severity) ||
      !('confidence' in item) ||
      !['low', 'medium', 'high'].includes(String(item.confidence)) ||
      !('path' in item) ||
      typeof item.path !== 'string' ||
      item.path.startsWith('/') ||
      item.path.includes('..') ||
      item.path.includes('\\') ||
      !('range' in item) ||
      typeof item.range !== 'object' ||
      item.range === null ||
      !('startLine' in item.range) ||
      !Number.isInteger(item.range.startLine) ||
      Number(item.range.startLine) < 1 ||
      !('endLine' in item.range) ||
      !Number.isInteger(item.range.endLine) ||
      Number(item.range.endLine) < Number(item.range.startLine) ||
      !('evidence' in item) ||
      typeof item.evidence !== 'string' ||
      !('remediation' in item) ||
      typeof item.remediation !== 'string'
    ) {
      throw new Error('Baseline contains an invalid finding');
    }
  }
  return findings as Finding[];
}
function pathMatches(path: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{GLOBSTAR}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{GLOBSTAR\}/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}
function inlineSuppression(
  file: ChangedFile | undefined,
  line: number,
): { ruleId: string; reason: string } | undefined {
  if (!file?.content) return undefined;
  const source = file.content.split(/\r?\n/);
  const candidates = [source[line - 1], source[line - 2]];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index] ?? '';
    const match =
      /\/\/\s*patchlens-disable-(next-line|line)\s+([A-Za-z0-9][A-Za-z0-9._:/-]{0,127})\s+--\s+(.{8,})\s*$/.exec(
        candidate,
      );
    if (!match) {
      if (/patchlens-disable/.test(candidate))
        throw new Error(
          'Inline suppression must name one rule and a reason of at least 8 characters',
        );
      continue;
    }
    if (
      (match[1] === 'line' && index === 0) ||
      (match[1] === 'next-line' && index === 1)
    )
      return { ruleId: match[2] ?? '', reason: match[3] ?? '' };
  }
  return undefined;
}
export function analyze(
  lines: readonly AddedLine[],
  rules: readonly Rule[],
  rawConfig: unknown = {},
): AnalysisReport {
  const files = [...new Set(lines.map((line) => line.path))].map((path) => ({
    path,
    status: 'modified' as const,
    binary: false,
    added: lines.filter((line) => line.path === path),
    removed: [],
  }));
  return analyzeChanges(
    { files, lines: lines.map((line) => ({ ...line, kind: 'added' })) },
    rules,
    rawConfig,
  );
}

export function analyzeChanges(
  changes: ChangeSet,
  rules: readonly Rule[],
  rawConfig: unknown = {},
): AnalysisReport {
  const config = validateConfig(rawConfig);
  const findings: Finding[] = [];
  const suppressionRecords: SuppressionRecord[] = [];
  const files = changes.files.filter((file) => {
    if (
      !file.path ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      /[\r\n\t]/.test(file.path) ||
      file.path.includes('\0') ||
      /^[A-Za-z]:/.test(file.path) ||
      file.path.split('/').some((part) => part === '..' || part === '.')
    )
      throw new Error('Invalid changed-file path');
    if (
      file.previousPath &&
      (file.previousPath.startsWith('/') ||
        file.previousPath.includes('..') ||
        file.previousPath.includes('\\') ||
        /[\r\n\t]/.test(file.previousPath))
    )
      throw new Error('Invalid previous file path');
    return (
      !file.binary &&
      !(config.ignorePaths ?? [])
        .concat(config.exclude ?? [])
        .some((pattern) => pathMatches(file.path, pattern))
    );
  });
  const paths = new Set(
    files.flatMap((file) => [
      file.path,
      ...(file.previousPath ? [file.previousPath] : []),
    ]),
  );
  const lines = changes.lines.filter((item) => {
    if (
      !item.path ||
      item.path.startsWith('/') ||
      item.path.includes('\\') ||
      item.path.includes('\0') ||
      /[\r\n\t]/.test(item.path) ||
      /^[A-Za-z]:/.test(item.path) ||
      item.path.split('/').some((part) => part === '..' || part === '.') ||
      !Number.isInteger(item.line) ||
      item.line < 1
    )
      throw new Error('Invalid added-line location');
    return paths.has(item.path);
  });
  const context: RuleContext = { files, lines };
  for (const rule of rules) {
    const setting = config.rules?.[rule.id];
    if (setting?.enabled === false) continue;
    if (rule.analyze) {
      for (const finding of rule.analyze(context)) {
        if (
          !paths.has(finding.path) ||
          !Number.isInteger(finding.range.startLine) ||
          finding.range.startLine < 1 ||
          finding.range.endLine < finding.range.startLine
        )
          throw new Error(
            'Rule ' + rule.id + ' returned an invalid finding location',
          );
        findings.push({
          ...finding,
          severity: setting?.severity ?? finding.severity,
          source: finding.source ?? 'patchlens',
        });
      }
    }
    if (!rule.test) continue;
    for (const item of lines) {
      if (
        rule.analyze &&
        files.find((file) => file.path === item.path)?.content !== undefined
      )
        continue;
      if (item.kind === 'removed' || !rule.test(item.content, item.path))
        continue;
      const suppression = (config.suppressions ?? []).find(
        (entry) =>
          entry.ruleId === rule.id && pathMatches(item.path, entry.path),
      );
      if (suppression) {
        suppressionRecords.push({
          ruleId: rule.id,
          path: item.path,
          line: item.line,
          reason: suppression.reason,
        });
        continue;
      }
      findings.push({
        schemaVersion: '1.0.0',
        ruleId: rule.id,
        title: rule.title,
        message: rule.title,
        severity: setting?.severity ?? rule.defaultSeverity,
        confidence: rule.confidence,
        path: item.path,
        range: { startLine: item.line, endLine: item.line },
        evidence: item.content.slice(0, 500),
        remediation: rule.remediation,
        source: 'patchlens',
        ...(rule.references ? { references: [...rule.references] } : {}),
      });
    }
  }
  const defaults: Record<Severity, number> = {
    info: 0,
    low: 1,
    medium: 3,
    high: 7,
    critical: 10,
  };
  const uniqueFindings = [
    ...new Map(
      findings.map((finding) => [
        [
          finding.ruleId,
          finding.path,
          finding.range.startLine,
          finding.evidence,
        ].join('\0'),
        finding,
      ]),
    ).values(),
  ];
  const visibleFindings = uniqueFindings.filter((finding) => {
    const file = files.find(
      (entry) =>
        entry.path === finding.path || entry.previousPath === finding.path,
    );
    const inline = inlineSuppression(file, finding.range.startLine);
    const configured = (config.suppressions ?? []).find(
      (entry) =>
        entry.ruleId === finding.ruleId &&
        pathMatches(finding.path, entry.path),
    );
    const suppression = inline?.ruleId === finding.ruleId ? inline : configured;
    if (!suppression) return true;
    suppressionRecords.push({
      ruleId: finding.ruleId,
      path: finding.path,
      line: finding.range.startLine,
      reason: suppression.reason,
    });
    return false;
  });
  const addedLines = new Set(
    lines
      .filter((line) => line.kind !== 'removed')
      .map((line) => line.path + '\0' + line.line),
  ).size;
  const removedLines = lines.filter((line) => line.kind === 'removed').length;
  const riskByLocation = new Map<string, RiskFactor>();
  for (const finding of visibleFindings) {
    const factor: RiskFactor = {
      id:
        'finding:' +
        finding.ruleId +
        ':' +
        finding.path +
        ':' +
        finding.range.startLine,
      description:
        finding.severity +
        ' severity, ' +
        finding.confidence +
        ' confidence: ' +
        finding.title,
      points:
        Math.round(
          (config.riskWeights?.[finding.severity] ??
            defaults[finding.severity]) *
            { low: 0.5, medium: 0.75, high: 1 }[finding.confidence] *
            10,
        ) / 10,
    };
    const key = finding.path + '\0' + finding.range.startLine;
    const existing = riskByLocation.get(key);
    if (!existing || factor.points > existing.points)
      riskByLocation.set(key, factor);
  }
  const riskFactors = [...riskByLocation.values()].filter(
    (factor) => factor.points > 0,
  );
  const changeSize = addedLines + removedLines;
  if (files.length > 10)
    riskFactors.push({
      id: 'change:files',
      description: files.length + ' changed files',
      points: Math.min(10, Math.floor((files.length - 10) / 5) + 1),
    });
  if (changeSize > 100)
    riskFactors.push({
      id: 'change:size',
      description: changeSize + ' changed lines',
      points: Math.min(10, Math.floor((changeSize - 100) / 100) + 1),
    });
  const deduplicatedSuppressions = [
    ...new Map(
      suppressionRecords.map((entry) => [
        entry.ruleId + '\0' + entry.path + '\0' + entry.line,
        entry,
      ]),
    ).values(),
  ];
  return {
    schemaVersion: '1.0.0',
    findings: visibleFindings.sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.range.startLine - b.range.startLine,
    ),
    riskScore: Math.min(
      100,
      Math.round(riskFactors.reduce((sum, factor) => sum + factor.points, 0)),
    ),
    filesScanned: files.length,
    riskFactors,
    changedFiles: files.length,
    addedLines,
    removedLines,
    suppressions: deduplicatedSuppressions,
  };
}

export function compareBaseline(
  report: AnalysisReport,
  baseline: readonly Finding[],
): AnalysisReport {
  const identity = (finding: Finding): string =>
    [finding.ruleId, finding.path, finding.evidence.trim()].join('\0');
  const existing = new Map<string, number>();
  for (const finding of baseline) {
    const key = identity(finding);
    existing.set(key, (existing.get(key) ?? 0) + 1);
  }
  const findings = report.findings.map((finding) => {
    const key = identity(finding);
    const remaining = existing.get(key) ?? 0;
    if (remaining > 0) {
      existing.set(key, remaining - 1);
      return { ...finding, lifecycle: 'existing' as const };
    }
    return { ...finding, lifecycle: 'new' as const };
  });
  const newFindings = findings.filter(
    (finding) => finding.lifecycle === 'new',
  ).length;
  return {
    ...report,
    findings,
    baseline: { newFindings, existingFindings: findings.length - newFindings },
  };
}
