import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type {
  AnalyzerConfig,
  Confidence,
  Finding,
  Severity,
} from '@patchlens/core';

export interface AdapterFailure {
  adapter: string;
  message: string;
}

export interface AdapterResult {
  findings: Finding[];
  failures: AdapterFailure[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeLocation(repo: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const root = resolve(repo);
  const target = isAbsolute(value) ? resolve(value) : resolve(root, value);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep)) return undefined;
  return rel.split(sep).join('/');
}

function confidence(value: unknown): Confidence {
  if (typeof value === 'string' && /high/i.test(value)) return 'high';
  if (typeof value === 'string' && /low/i.test(value)) return 'low';
  return 'medium';
}

function severity(value: unknown): Severity {
  if (typeof value === 'string' && /critical/i.test(value)) return 'critical';
  if (typeof value === 'string' && /error|high/i.test(value)) return 'high';
  if (typeof value === 'string' && /warning|medium/i.test(value))
    return 'medium';
  if (typeof value === 'string' && /low/i.test(value)) return 'low';
  return 'info';
}

function finding(
  ruleId: string,
  title: string,
  message: string,
  path: string,
  startLine: number,
  endLine: number,
  evidence: string,
  remediation: string,
  level: Severity,
  certainty: Confidence,
): Finding {
  return {
    schemaVersion: '1.0.0',
    ruleId,
    title,
    message,
    path,
    range: { startLine, endLine },
    evidence: evidence.slice(0, 500),
    remediation,
    severity: level,
    confidence: certainty,
    source: 'adapter',
  };
}

function parseSemgrep(repo: string, text: string): Finding[] {
  const payload: unknown = JSON.parse(text);
  if (!isRecord(payload) || !Array.isArray(payload.results))
    throw new Error('Semgrep returned an invalid JSON result');
  const findings: Finding[] = [];
  for (const result of payload.results) {
    if (!isRecord(result) || !isRecord(result.start) || !isRecord(result.extra))
      continue;
    const path = safeLocation(repo, result.path);
    const line = result.start.line;
    if (!path || !Number.isInteger(line) || Number(line) < 1) continue;
    const extra = result.extra;
    const endLine =
      isRecord(result.end) && Number.isInteger(result.end.line)
        ? Number(result.end.line)
        : Number(line);
    const metadata = isRecord(extra.metadata) ? extra.metadata : {};
    const id =
      typeof result.check_id === 'string' ? result.check_id : 'unknown';
    findings.push(
      finding(
        'semgrep:' + id,
        typeof metadata.name === 'string' ? metadata.name : id,
        typeof extra.message === 'string'
          ? extra.message
          : 'Semgrep reported a match.',
        path,
        Number(line),
        Math.max(Number(line), endLine),
        typeof extra.lines === 'string' ? extra.lines : '',
        typeof metadata.fix === 'string'
          ? metadata.fix
          : 'Review the Semgrep rule and follow its remediation guidance.',
        severity(extra.severity),
        confidence(metadata.confidence),
      ),
    );
  }
  return findings;
}

function parseEslint(repo: string, text: string): Finding[] {
  const payload: unknown = JSON.parse(text);
  if (!Array.isArray(payload))
    throw new Error('ESLint returned an invalid JSON result');
  const findings: Finding[] = [];
  for (const file of payload) {
    if (!isRecord(file) || !Array.isArray(file.messages)) continue;
    const path = safeLocation(repo, file.filePath);
    if (!path) continue;
    for (const message of file.messages) {
      if (
        !isRecord(message) ||
        !Number.isInteger(message.line) ||
        Number(message.line) < 1 ||
        typeof message.message !== 'string'
      )
        continue;
      const id = typeof message.ruleId === 'string' ? message.ruleId : 'eslint';
      const line = Number(message.line);
      findings.push(
        finding(
          'eslint:' + id,
          id,
          message.message,
          path,
          line,
          Number.isInteger(message.endLine)
            ? Math.max(line, Number(message.endLine))
            : line,
          '',
          'Resolve the configured ESLint diagnostic or document a rule-specific suppression with a reason.',
          message.severity === 2 ? 'medium' : 'low',
          'medium',
        ),
      );
    }
  }
  return findings;
}

/** Runs only explicitly enabled local adapters. Arguments are passed directly; no shell is involved. */
export function runExternalAdapters(
  config: AnalyzerConfig['externalAdapters'],
  repo: string,
  changedPaths: readonly string[],
): AdapterResult {
  const result: AdapterResult = { findings: [], failures: [] };
  if (!config) return result;
  const paths: string[] = [];
  for (const path of new Set(changedPaths)) {
    const safe = safeLocation(repo, path);
    if (!safe) {
      result.failures.push({
        adapter: 'configuration',
        message: 'A changed path is outside the repository or unsafe.',
      });
      continue;
    }
    paths.push(resolve(repo, safe));
  }
  for (const [name, adapter] of Object.entries(config)) {
    if (!adapter.enabled) continue;
    if (!['semgrep', 'eslint'].includes(name)) {
      result.failures.push({
        adapter: name,
        message:
          'Unsupported adapter name; supported adapters are semgrep and eslint.',
      });
      continue;
    }
    if (name === 'semgrep') {
      const configIndex = adapter.args.findIndex(
        (arg) => arg === '--config' || arg === '-c',
      );
      const configValue =
        configIndex >= 0 ? adapter.args[configIndex + 1] : undefined;
      if (
        !configValue ||
        /^(?:auto|r\/|p\/|https?:\/\/)/i.test(configValue) ||
        !adapter.args.includes('--json')
      ) {
        result.failures.push({
          adapter: name,
          message:
            'Semgrep requires an explicit local --config path and --json output; remote and auto configurations are rejected.',
        });
        continue;
      }
    } else if (
      !adapter.args.includes('--format') &&
      !adapter.args.includes('-f')
    ) {
      result.failures.push({
        adapter: name,
        message:
          'ESLint adapter args must request JSON output with --format json.',
      });
      continue;
    }
    const args = [...adapter.args, '--', ...paths];
    const execution = spawnSync(adapter.command, args, {
      cwd: repo,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: adapter.timeoutMs ?? 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (execution.error) {
      result.failures.push({ adapter: name, message: execution.error.message });
      continue;
    }
    if (execution.status !== 0 && execution.status !== 1) {
      result.failures.push({
        adapter: name,
        message: (
          execution.stderr ||
          'Adapter exited with status ' + String(execution.status)
        ).trim(),
      });
      continue;
    }
    try {
      const parsed =
        name === 'semgrep'
          ? parseSemgrep(repo, execution.stdout)
          : parseEslint(repo, execution.stdout);
      result.findings.push(...parsed);
    } catch (error) {
      result.failures.push({
        adapter: name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
