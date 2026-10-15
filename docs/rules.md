# Built-in rule catalog

Every built-in rule is deterministic and local. TypeScript and JavaScript checks use the TypeScript compiler parser for syntax trees where context is useful; simple changed-line checks remain line based. Findings are emitted only when their source range intersects an added or modified line, except change metadata checks that intentionally inspect removals. A finding is a review signal, not proof of exploitability.

The `source` field is `patchlens` for built-in findings and `adapter` for findings returned by explicitly enabled ESLint or Semgrep adapters.

| ID          | Default severity | Check                                                                                     | Confidence and limits                                                                                                  |
| ----------- | ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| PL-JS-001   | high             | Direct `eval(...)` call                                                                   | High confidence for direct calls; aliases and indirect evaluation are not resolved.                                    |
| PL-JS-002   | high             | `innerHTML` assignment                                                                    | Medium confidence; sanitization performed elsewhere is not understood.                                                 |
| PL-SEC-001  | critical         | Secret-keyword assignment with a long, high-entropy literal                               | Conservative heuristic; encoded secrets and nonstandard names are missed. Example and placeholder values are excluded. |
| PL-SEC-002  | high             | AST-detected credential-named property or variable with a long, high-entropy literal      | Medium confidence; data flow and secret validity are not known.                                                        |
| PL-JS-003   | high             | Function constructor call or construction                                                 | High confidence for syntax matches; risk depends on the input source. Direct eval is covered by PL-JS-001.             |
| PL-JS-004   | high             | Dynamic command text passed to common process APIs, or explicit `shell: true`             | Medium confidence; does not perform taint analysis and may miss wrappers.                                              |
| PL-JS-005   | high             | Dynamic query text passed to common query APIs                                            | Medium confidence; parameterized queries are not flagged when the query string is a literal.                           |
| PL-JS-006   | medium           | Path join/resolve argument with a request/input-like identifier                           | Low confidence heuristic; does not prove the argument is attacker controlled.                                          |
| PL-JS-007   | medium           | Common generic deserialization APIs and YAML `load` calls                                 | Low confidence; library behavior and options vary.                                                                     |
| PL-SEC-003  | high             | TLS certificate validation explicitly disabled                                            | High confidence for the matched option or Node setting.                                                                |
| PL-JS-008   | low              | Debugger statements, debug logs, or sensitive-looking log arguments                       | Medium confidence for debug output; no data-flow redaction analysis.                                                   |
| PL-SEC-004  | medium           | Empty catch blocks or catch blocks that return an empty/false value                       | Medium confidence; intentional fallback behavior may be valid.                                                         |
| PL-JS-009   | low              | A visible `.then(...)` expression without a visible rejection handler                     | Low confidence; handlers in callers and wrappers are not resolved.                                                     |
| PL-SEC-005  | medium           | Common file APIs using world-writable numeric mode values                                 | Medium confidence; symbolic modes and platform-specific APIs are not covered.                                          |
| PL-DB-001   | high             | Destructive SQL or migration text containing DROP TABLE/COLUMN/DATABASE or TRUNCATE TABLE | Medium confidence; intent and rollback strategy are not inferred.                                                      |
| PL-SEC-006  | info             | Change under authentication, session, crypto, permission, or access-control-like paths    | Low-confidence review prompt only; path names can be misleading.                                                       |
| PL-SEC-007  | info             | Git executable bit added to a file                                                        | Medium confidence for the mode change; whether it is unsafe depends on the file and workflow.                          |
| PL-API-001  | info             | Removed exported declaration lines                                                        | Medium confidence; compatibility impact depends on package/version policy.                                             |
| PL-ENV-001  | info             | Changed environment/configuration lines                                                   | Medium confidence; deployment impact is not inferred.                                                                  |
| PL-DEPS-001 | info             | Added dependency declaration in a package manifest                                        | High confidence that a dependency entry changed; it does not assess package safety.                                    |
| PL-DEPS-002 | medium           | Dependency manifest changed without a lockfile change                                     | Low confidence; only compares changed paths in the patch.                                                              |

## Deliberate limits

Patchlens does not currently claim to detect missing authorization checks. A sound finding requires framework-specific route and middleware relationships that the current implementation cannot prove. It also does not measure test coverage or infer missing input validation. These should be added only with bounded context, explicit framework/version scope, and positive and negative fixtures.

The AST adapter interface is extensible, but TypeScript and JavaScript are the only built-in language adapter today. External ESLint and Semgrep findings are attributed as adapter results and require explicit local configuration; their rules are not duplicated in the built-in catalog.
