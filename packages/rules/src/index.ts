import type { Finding, LineChange, Rule, RuleContext } from '@patchlens/core';
import ts from 'typescript';
const sourcePath = /\.(?:[cm]?[jt]sx?)$/i;
const lineRules: Rule[] = [
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
      (() => {
        const match =
          /(?:password|passwd|secret|api[_-]?key|token|credential)\s*[:=]\s*["']([^"']+)["']/i.exec(
            line,
          );
        const value = match?.[1];
        return Boolean(
          value &&
          value.length >= 16 &&
          !placeholder.test(value) &&
          !/^https?:\/\//i.test(value) &&
          entropy(value) >= 3.2,
        );
      })(),
  },
];

type Detection = { node: ts.Node; message: string; evidence?: string };
type Detector = (
  node: ts.Node,
  source: ts.SourceFile,
  file: RuleContext['files'][number],
) => Detection | undefined;
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/i;
const placeholder =
  /^(?:example|sample|test|fake|fixture|dummy|changeme|your[_ -]|replace[_ -]|<|x{4,})/i;

function changedAt(
  context: RuleContext,
  path: string,
  start: number,
  end: number,
  source: ts.SourceFile,
): boolean {
  const startLine = source.getLineAndCharacterOfPosition(start).line + 1;
  const endLine =
    source.getLineAndCharacterOfPosition(Math.max(start, end - 1)).line + 1;
  return context.lines.some(
    (line) =>
      line.path === path &&
      line.kind !== 'removed' &&
      line.line >= startLine &&
      line.line <= endLine,
  );
}

function makeFinding(
  id: string,
  title: string,
  severity: Rule['defaultSeverity'],
  confidence: Rule['confidence'],
  remediation: string,
  filePath: string,
  node: ts.Node,
  source: ts.SourceFile,
  message: string,
  overrideEvidence?: string,
): Finding {
  const start =
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const end =
    source.getLineAndCharacterOfPosition(
      Math.max(node.getStart(source), node.getEnd() - 1),
    ).line + 1;
  return {
    schemaVersion: '1.0.0',
    ruleId: id,
    title,
    message,
    severity,
    confidence,
    path: filePath,
    range: { startLine: start, endLine: end },
    evidence: (
      overrideEvidence ??
      source.text
        .split(/\r?\n/)
        .slice(start - 1, end)
        .join('\n')
    ).slice(0, 500),
    remediation,
    source: 'patchlens',
  };
}

function astRule(
  id: string,
  title: string,
  severity: Rule['defaultSeverity'],
  confidence: Rule['confidence'],
  remediation: string,
  detect: Detector,
): Rule {
  return {
    id,
    title,
    defaultSeverity: severity,
    confidence,
    remediation,
    analyze(context) {
      const findings: Finding[] = [];
      for (const file of context.files) {
        if (
          (!sourceExtension.test(file.path) &&
            !(id === 'PL-DB-001' && /\.sql$/i.test(file.path))) ||
          file.content === undefined ||
          file.binary
        )
          continue;
        const kind = file.path.endsWith('.tsx')
          ? ts.ScriptKind.TSX
          : file.path.endsWith('.jsx')
            ? ts.ScriptKind.JSX
            : file.path.endsWith('.js') ||
                file.path.endsWith('.mjs') ||
                file.path.endsWith('.cjs')
              ? ts.ScriptKind.JS
              : ts.ScriptKind.TS;
        const source = ts.createSourceFile(
          file.path,
          file.content,
          ts.ScriptTarget.Latest,
          true,
          kind,
        );
        const visit = (node: ts.Node): void => {
          if (
            changedAt(
              context,
              file.path,
              node.getStart(source),
              node.getEnd(),
              source,
            )
          ) {
            const result = detect(node, source, file);
            if (result)
              findings.push(
                makeFinding(
                  id,
                  title,
                  severity,
                  confidence,
                  remediation,
                  file.path,
                  result.node,
                  source,
                  result.message,
                  result.evidence,
                ),
              );
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
      return findings;
    },
  };
}

const directEvalRule = astRule(
  'PL-JS-001',
  'Direct eval call',
  'high',
  'high',
  'Avoid eval; use explicit parsing or a safe dispatch table.',
  (node) =>
    ts.isCallExpression(node) && callName(node) === 'eval'
      ? {
          node,
          message:
            'The changed code passes source text to the direct eval function.',
        }
      : undefined,
);
const htmlSinkRule = astRule(
  'PL-JS-002',
  'HTML injection sink assignment',
  'high',
  'medium',
  'Avoid assigning untrusted values to innerHTML; use textContent or a vetted sanitizer.',
  (node) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    node.left.name.text === 'innerHTML'
      ? {
          node,
          message:
            'The changed code assigns a value into an HTML parsing sink.',
        }
      : undefined,
);
for (const [id, contextual] of [
  ['PL-JS-001', directEvalRule],
  ['PL-JS-002', htmlSinkRule],
] as const) {
  const index = lineRules.findIndex((rule) => rule.id === id);
  const existing = lineRules[index];
  if (index >= 0 && existing && contextual.analyze)
    lineRules[index] = { ...existing, analyze: contextual.analyze };
}

function propertyName(
  node: ts.PropertyName | ts.BindingName | undefined,
): string {
  if (!node) return '';
  return ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node)
    ? node.text
    : '';
}
function literalValue(node: ts.Expression | undefined): string | undefined {
  if (
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  )
    return node.text;
  return undefined;
}
function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}
function isDynamic(node: ts.Expression): boolean {
  if (ts.isTemplateExpression(node)) return true;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return true;
  return (
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  );
}
function callName(node: ts.CallExpression | ts.NewExpression): string {
  const expression = node.expression;
  return ts.isIdentifier(expression)
    ? expression.text
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : '';
}
function callReceiver(node: ts.CallExpression): string {
  return ts.isPropertyAccessExpression(node.expression)
    ? node.expression.expression.getText()
    : '';
}
function isTrue(node: ts.Expression | undefined): boolean {
  return node?.kind === ts.SyntaxKind.TrueKeyword;
}

const astRules: Rule[] = [
  astRule(
    'PL-SEC-002',
    'Possible hard-coded secret',
    'high',
    'medium',
    'Move credentials to a secret manager or environment variable and rotate exposed values.',
    (node) => {
      if (!ts.isVariableDeclaration(node) && !ts.isPropertyAssignment(node))
        return undefined;
      const name = propertyName(node.name);
      const value = literalValue(node.initializer);
      if (
        !/(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i.test(
          name,
        ) ||
        !value ||
        value.length < 16 ||
        placeholder.test(value) ||
        /process\.env|import\.meta\.env/i.test(value)
      )
        return undefined;
      if (entropy(value) < 3.2 && !/(?:password|passwd)/i.test(name))
        return undefined;
      return {
        node,
        message:
          'A credential-named field contains a non-placeholder literal. This is a review signal; verify whether the value is live.',
      };
    },
  ),
  astRule(
    'PL-JS-003',
    'Function constructor code execution',
    'high',
    'high',
    'Avoid Function constructors; use explicit parsing or a fixed dispatch table.',
    (node) => {
      if (ts.isCallExpression(node) && callName(node) === 'Function')
        return {
          node,
          message:
            'The changed code evaluates source text as executable JavaScript.',
        };
      if (ts.isNewExpression(node) && callName(node) === 'Function')
        return {
          node,
          message:
            'The changed code constructs executable JavaScript from a string.',
        };
      return undefined;
    },
  ),
  astRule(
    'PL-JS-004',
    'Shell command built dynamically',
    'high',
    'medium',
    'Pass a fixed executable and argument array to execFile/spawn with shell disabled; validate arguments.',
    (node) => {
      if (
        !ts.isCallExpression(node) ||
        ![
          'exec',
          'execSync',
          'execFile',
          'execFileSync',
          'spawn',
          'spawnSync',
        ].includes(callName(node))
      )
        return undefined;
      const first = node.arguments[0];
      const shellEnabled = node.arguments.some(
        (arg) =>
          ts.isObjectLiteralExpression(arg) &&
          arg.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              propertyName(property.name) === 'shell' &&
              isTrue(property.initializer),
          ),
      );
      if (!first || (!isDynamic(first) && !shellEnabled)) return undefined;
      return {
        node,
        message:
          'A process command or shell option is assembled dynamically; untrusted input can change the executed command.',
      };
    },
  ),
  astRule(
    'PL-JS-005',
    'SQL query assembled dynamically',
    'high',
    'medium',
    'Use parameterized queries or prepared statements; avoid interpolating data into SQL text.',
    (node) => {
      if (
        !ts.isCallExpression(node) ||
        !['query', 'execute', '$queryRawUnsafe', 'queryRawUnsafe'].includes(
          callName(node),
        )
      )
        return undefined;
      const first = node.arguments[0];
      if (!first || !isDynamic(first)) return undefined;
      return {
        node,
        message:
          'The query text is dynamically assembled. Confirm values use driver-supported parameters rather than string interpolation.',
      };
    },
  ),
  astRule(
    'PL-JS-006',
    'Potential path traversal input',
    'medium',
    'low',
    'Resolve user-controlled paths beneath an explicit trusted root and verify the normalized result remains inside it.',
    (node) => {
      if (
        !ts.isCallExpression(node) ||
        !['join', 'resolve'].includes(callName(node)) ||
        !/(?:^|\.)path$/.test(callReceiver(node))
      )
        return undefined;
      const candidate = node.arguments.find((argument) =>
        /(?:req|request|input|param|query|filename|userPath|fileName)/i.test(
          argument.getText(),
        ),
      );
      return candidate
        ? {
            node,
            message:
              'Path construction uses a value with a request or input-like name. Verify it cannot escape the intended directory.',
          }
        : undefined;
    },
  ),
  astRule(
    'PL-JS-007',
    'Unsafe deserialization API',
    'medium',
    'low',
    'Use a format parser that does not instantiate arbitrary objects and validate the resulting data shape.',
    (node) => {
      if (!ts.isCallExpression(node)) return undefined;
      const name = callName(node);
      const receiver = callReceiver(node);
      if (
        !['unserialize', 'deserialize', 'load'].includes(name) ||
        (name === 'load' && !/yaml/i.test(receiver))
      )
        return undefined;
      return {
        node,
        message:
          'This deserialization API can be unsafe for untrusted input depending on the library and configuration.',
      };
    },
  ),
  astRule(
    'PL-SEC-003',
    'TLS certificate verification disabled',
    'high',
    'high',
    'Keep certificate validation enabled and install the correct trust chain instead of disabling verification.',
    (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name) === 'rejectUnauthorized' &&
        node.initializer.kind === ts.SyntaxKind.FalseKeyword
      )
        return {
          node,
          message: 'TLS peer certificate validation is explicitly disabled.',
        };
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.left.getText().includes('NODE_TLS_REJECT_UNAUTHORIZED') &&
        literalValue(node.right) === '0'
      )
        return {
          node,
          message: 'Node.js TLS certificate verification is globally disabled.',
        };
      return undefined;
    },
  ),
  astRule(
    'PL-JS-008',
    'Debug or sensitive data logging',
    'low',
    'medium',
    'Remove temporary debug output and redact credentials, tokens, and personal data before logging.',
    (node) => {
      if (ts.isDebuggerStatement(node))
        return {
          node,
          message: 'A debugger statement remains in changed code.',
        };
      if (
        !ts.isCallExpression(node) ||
        !['log', 'debug', 'info'].includes(callName(node))
      )
        return undefined;
      const receiver = callReceiver(node);
      if (!/(?:console|logger|log)$/i.test(receiver)) return undefined;
      const sensitive = node.arguments.some((argument) =>
        /(?:password|secret|token|authorization|credential)/i.test(
          argument.getText(),
        ),
      );
      return {
        node,
        message: sensitive
          ? 'A sensitive-looking value is passed to a logging call.'
          : 'A debug or informational logging call was added; confirm it is intentional and does not expose sensitive data.',
      };
    },
  ),
  astRule(
    'PL-SEC-004',
    'Broad exception may be swallowed',
    'medium',
    'medium',
    'Handle expected error types explicitly, preserve useful diagnostics, and rethrow failures that cannot be recovered.',
    (node) => {
      if (!ts.isCatchClause(node) || !node.block) return undefined;
      const statements = node.block.statements;
      if (statements.length === 0)
        return { node, message: 'The catch block ignores every caught error.' };
      const onlyDiscard = statements.every(
        (statement) =>
          ts.isReturnStatement(statement) &&
          (!statement.expression ||
            statement.expression.kind === ts.SyntaxKind.NullKeyword ||
            statement.expression.kind === ts.SyntaxKind.FalseKeyword),
      );
      return onlyDiscard
        ? {
            node,
            message:
              'The catch block discards the failure by returning an empty or false-like result.',
          }
        : undefined;
    },
  ),
  astRule(
    'PL-JS-009',
    'Promise rejection may be unhandled',
    'low',
    'low',
    'Await the promise or attach a rejection handler so failures are observed.',
    (node) => {
      if (
        !ts.isExpressionStatement(node) ||
        !ts.isCallExpression(node.expression) ||
        callName(node.expression) !== 'then'
      )
        return undefined;
      const parent = node.expression.parent;
      const hasCatch =
        ts.isPropertyAccessExpression(node.expression.expression) &&
        ts.isCallExpression(node.expression.expression.expression) &&
        callName(node.expression.expression.expression) === 'catch';
      return hasCatch || ts.isCallExpression(parent)
        ? undefined
        : {
            node,
            message:
              'The promise chain has no visible rejection handler at this statement.',
          };
    },
  ),
  astRule(
    'PL-SEC-005',
    'Overly broad filesystem permissions',
    'medium',
    'medium',
    'Use the least permissive file mode needed, such as 0600 for private files or 0644 for public files.',
    (node) => {
      if (
        !ts.isCallExpression(node) ||
        ![
          'chmod',
          'chmodSync',
          'writeFile',
          'writeFileSync',
          'open',
          'openSync',
        ].includes(callName(node))
      )
        return undefined;
      const mode = node.arguments.find((argument) =>
        ts.isNumericLiteral(argument),
      );
      if (!mode) return undefined;
      const value = Number(mode.text);
      return value === 511 || value === 777
        ? {
            node,
            message:
              'The requested permission mode grants write access to all users.',
          }
        : undefined;
    },
  ),
  astRule(
    'PL-DB-001',
    'Potentially destructive database migration',
    'high',
    'medium',
    'Use a reviewed migration strategy, preserve data where required, and document rollback or backup steps.',
    (node, source, file) => {
      if (
        !/(?:^|\/)(?:migrations?|schema)(?:\/|$)/i.test(file.path) &&
        !/\.sql$/i.test(file.path)
      )
        return undefined;
      const text = node.getText(source);
      if (
        !/\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE)|TRUNCATE\s+TABLE)\b/i.test(text)
      )
        return undefined;
      return {
        node,
        message:
          'A changed migration contains a destructive schema or data operation; verify the intended data loss and rollback plan.',
      };
    },
  ),
];

const securityFileRule: Rule = {
  id: 'PL-SEC-006',
  title: 'Sensitive security code changed',
  defaultSeverity: 'info',
  confidence: 'low',
  remediation:
    'Review this authentication, authorization, or cryptography change with focused tests and security expertise.',
  analyze(context) {
    const results: Finding[] = [];
    for (const file of context.files) {
      if (
        !/(?:auth|session|crypto|crypt|security|permission|access-control)/i.test(
          file.path,
        )
      )
        continue;
      const line = context.lines.find(
        (entry) => entry.path === file.path && entry.kind !== 'removed',
      );
      if (!line) continue;
      results.push({
        schemaVersion: '1.0.0',
        ruleId: this.id,
        title: this.title,
        message:
          'The changed path suggests security-sensitive behavior; this is a review prompt, not a vulnerability finding.',
        severity: this.defaultSeverity,
        confidence: this.confidence,
        path: file.path,
        range: { startLine: line.line, endLine: line.line },
        evidence: line.content.slice(0, 500),
        remediation: this.remediation,
        source: 'patchlens',
      });
    }
    return results;
  },
};

function dependencyManifestAdditions(context: RuleContext): LineChange[] {
  const additions: LineChange[] = [];
  for (const file of context.files) {
    if (!/(?:^|\/)package\.json$/.test(file.path) || file.content === undefined)
      continue;
    try {
      const manifest: unknown = JSON.parse(file.content);
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
        continue;
      const root = manifest as Record<string, unknown>;
      const dependencies = new Set<string>();
      for (const key of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ]) {
        const values = root[key];
        if (values && typeof values === 'object' && !Array.isArray(values))
          for (const name of Object.keys(values)) dependencies.add(name);
      }
      for (const line of context.lines.filter(
        (item) => item.path === file.path && item.kind !== 'removed',
      )) {
        const match = /^\s*"([^"\n]+)"\s*:\s*"[^"\n]+"\s*,?\s*$/.exec(
          line.content,
        );
        if (match?.[1] && dependencies.has(match[1])) additions.push(line);
      }
    } catch {
      // Invalid manifests are not interpreted as dependency changes.
    }
  }
  return additions;
}

const changeRules: readonly Rule[] = [
  {
    id: 'PL-SEC-007',
    title: 'Executable file mode added',
    defaultSeverity: 'info',
    confidence: 'medium',
    remediation:
      'Confirm the executable bit is required and that the file cannot be replaced with untrusted content.',
    analyze(context) {
      return context.files.flatMap((file) => {
        if (file.newMode !== '100755' || file.oldMode === '100755') return [];
        const line = context.lines.find(
          (entry) => entry.path === file.path && entry.kind !== 'removed',
        );
        return [
          {
            schemaVersion: '1.0.0' as const,
            ruleId: this.id,
            title: this.title,
            message: 'Git records this path as executable after the change.',
            severity: this.defaultSeverity,
            confidence: this.confidence,
            path: file.path,
            range: { startLine: line?.line ?? 1, endLine: line?.line ?? 1 },
            evidence:
              line?.content ??
              'mode ' + (file.oldMode ?? 'absent') + ' -> ' + file.newMode,
            remediation: this.remediation,
            source: 'patchlens' as const,
          },
        ];
      });
    },
  },
  {
    id: 'PL-API-001',
    title: 'Public API contract changed',
    defaultSeverity: 'info',
    confidence: 'medium',
    remediation:
      'Confirm the API change is intentional and document migration or compatibility impact.',
    analyze(context) {
      return context.lines
        .filter(
          (line) =>
            line.kind === 'removed' &&
            /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\b/.test(
              line.content,
            ),
        )
        .map((line) => ({
          schemaVersion: '1.0.0' as const,
          ruleId: this.id,
          title: this.title,
          message:
            'An exported declaration was removed or changed in this diff.',
          severity: this.defaultSeverity,
          confidence: this.confidence,
          path: line.path,
          range: { startLine: line.line, endLine: line.line },
          evidence: line.content.slice(0, 500),
          remediation: this.remediation,
          source: 'patchlens' as const,
        }));
    },
  },
  {
    id: 'PL-ENV-001',
    title: 'Environment configuration changed',
    defaultSeverity: 'info',
    confidence: 'medium',
    remediation:
      'Document new variables, safe defaults, and required deployment configuration without committing secrets.',
    analyze(context) {
      const paths = new Set(
        context.lines
          .filter(
            (line) =>
              line.kind !== 'removed' &&
              /(?:^|\/)(?:\.env(?:\..*)?|.*config.*)$/i.test(line.path),
          )
          .map((line) => line.path),
      );
      return context.lines
        .filter(
          (line) =>
            line.kind !== 'removed' &&
            paths.has(line.path) &&
            /(?:process\.env|import\.meta\.env|^[A-Z][A-Z0-9_]+=)/.test(
              line.content,
            ),
        )
        .map((line) => ({
          schemaVersion: '1.0.0' as const,
          ruleId: this.id,
          title: this.title,
          message:
            'Environment-related configuration changed and may require documentation or deployment updates.',
          severity: this.defaultSeverity,
          confidence: this.confidence,
          path: line.path,
          range: { startLine: line.line, endLine: line.line },
          evidence: line.content.slice(0, 500),
          remediation: this.remediation,
          source: 'patchlens' as const,
        }));
    },
  },
  {
    id: 'PL-DEPS-001',
    title: 'Dependency manifest changed',
    defaultSeverity: 'info',
    confidence: 'high',
    remediation:
      'Review the new dependency, its license, maintenance, transitive dependencies, and lockfile changes.',
    analyze(context) {
      return dependencyManifestAdditions(context).map((line) => ({
        schemaVersion: '1.0.0' as const,
        ruleId: this.id,
        title: this.title,
        message:
          'A dependency manifest or lockfile entry changed; inspect it for intended package and version changes.',
        severity: this.defaultSeverity,
        confidence: this.confidence,
        path: line.path,
        range: { startLine: line.line, endLine: line.line },
        evidence: line.content.slice(0, 500),
        remediation: this.remediation,
        source: 'patchlens' as const,
      }));
    },
  },
  {
    id: 'PL-DEPS-002',
    title: 'Dependency lockfile may be inconsistent',
    defaultSeverity: 'medium',
    confidence: 'low',
    remediation:
      'Regenerate and commit the lockfile using the repository package manager after changing dependency manifests.',
    analyze(context) {
      const paths = new Set(context.files.map((file) => file.path));
      const dependencyChanges = dependencyManifestAdditions(context);
      const lockfilePresent = [...paths].some((path) =>
        /(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(path),
      );
      if (dependencyChanges.length === 0 || lockfilePresent) return [];
      const line = dependencyChanges[0];
      if (!line) return [];
      return [
        {
          schemaVersion: '1.0.0',
          ruleId: this.id,
          title: this.title,
          message:
            'The dependency manifest changed without a lockfile change in this patch.',
          severity: this.defaultSeverity,
          confidence: this.confidence,
          path: line.path,
          range: { startLine: line.line, endLine: line.line },
          evidence: line.content.slice(0, 500),
          remediation: this.remediation,
          source: 'patchlens',
        },
      ];
    },
  },
];

export interface LanguageAdapter {
  readonly id: string;
  supports(path: string): boolean;
  rules: readonly Rule[];
}
export const typescriptJavaScriptAdapter: LanguageAdapter = {
  id: 'typescript-javascript',
  supports: (path) => sourceExtension.test(path),
  rules: [...lineRules, ...astRules, securityFileRule, ...changeRules],
};
export function createRuleRegistry(
  adapters: readonly LanguageAdapter[] = [typescriptJavaScriptAdapter],
): readonly Rule[] {
  const ids = new Set<string>();
  const rules: Rule[] = [];
  for (const adapter of adapters) {
    for (const rule of adapter.rules) {
      if (ids.has(rule.id)) throw new Error('Duplicate rule ID: ' + rule.id);
      ids.add(rule.id);
      rules.push(rule);
    }
  }
  return rules;
}
export const builtInRules: readonly Rule[] = createRuleRegistry();
export { runExternalAdapters } from './external.js';
export type { AdapterFailure, AdapterResult } from './external.js';
