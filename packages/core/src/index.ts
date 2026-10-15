export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';
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
}
export interface AddedLine {
  path: string;
  line: number;
  content: string;
}
export interface Rule {
  id: string;
  title: string;
  defaultSeverity: Severity;
  confidence: Confidence;
  remediation: string;
  test(line: string, path: string): boolean;
}
export interface Suppression {
  ruleId: string;
  path: string;
  reason?: string;
}
export interface AnalyzerConfig {
  rules?: Record<string, { enabled?: boolean; severity?: Severity }>;
  ignorePaths?: string[];
  suppressions?: Suppression[];
  riskWeights?: Partial<Record<Severity, number>>;
}
export interface AnalysisReport {
  schemaVersion: '1.0.0';
  findings: Finding[];
  riskScore: number;
  filesScanned: number;
}
const severities: readonly Severity[] = ['low', 'medium', 'high', 'critical'];
function validateConfig(value: unknown): AnalyzerConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Configuration must be an object');
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    'rules',
    'ignorePaths',
    'suppressions',
    'riskWeights',
  ]);
  for (const key of Object.keys(input))
    if (!allowed.has(key)) throw new Error(`Unknown config key: ${key}`);
  if (
    input.ignorePaths !== undefined &&
    (!Array.isArray(input.ignorePaths) ||
      input.ignorePaths.some((v) => typeof v !== 'string'))
  )
    throw new Error('ignorePaths must be a string array');
  if (
    input.suppressions !== undefined &&
    (!Array.isArray(input.suppressions) ||
      input.suppressions.some(
        (v) =>
          typeof v !== 'object' ||
          v === null ||
          Array.isArray(v) ||
          typeof (v as Record<string, unknown>).ruleId !== 'string' ||
          typeof (v as Record<string, unknown>).path !== 'string',
      ))
  )
    throw new Error('suppressions must contain ruleId and path strings');
  const rules = input.rules;
  if (rules !== undefined) {
    if (typeof rules !== 'object' || rules === null || Array.isArray(rules))
      throw new Error('rules must be an object');
    for (const [id, setting] of Object.entries(rules)) {
      if (
        !/^[A-Z0-9-]+$/.test(id) ||
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
      if (entry.reason !== undefined && typeof entry.reason !== 'string')
        throw new Error('suppression reason must be a string');
    }
  return value as AnalyzerConfig;
}
function pathMatches(path: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{GLOBSTAR}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{GLOBSTAR\}/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}
export function analyze(
  lines: readonly AddedLine[],
  rules: readonly Rule[],
  rawConfig: unknown = {},
): AnalysisReport {
  const config = validateConfig(rawConfig);
  const findings: Finding[] = [];
  const paths = new Set<string>();
  for (const item of lines) {
    if (
      item.path.startsWith('/') ||
      item.path.includes('\\') ||
      item.path.includes('\0') ||
      item.path.split('/').includes('..') ||
      !Number.isInteger(item.line) ||
      item.line < 1
    )
      throw new Error('Invalid added-line location');
    if (
      (config.ignorePaths ?? []).some((pattern) =>
        pathMatches(item.path, pattern),
      )
    )
      continue;
    paths.add(item.path);
    for (const rule of rules) {
      const setting = config.rules?.[rule.id];
      if (setting?.enabled === false || !rule.test(item.content, item.path))
        continue;
      if (
        (config.suppressions ?? []).some(
          (s) => s.ruleId === rule.id && pathMatches(item.path, s.path),
        )
      )
        continue;
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
      });
    }
  }
  const defaults: Record<Severity, number> = {
    low: 1,
    medium: 3,
    high: 7,
    critical: 10,
  };
  const riskScore = Math.min(
    100,
    findings.reduce(
      (sum, f) =>
        sum + (config.riskWeights?.[f.severity] ?? defaults[f.severity]),
      0,
    ),
  );
  return {
    schemaVersion: '1.0.0',
    findings,
    riskScore,
    filesScanned: paths.size,
  };
}
