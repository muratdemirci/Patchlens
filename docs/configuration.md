# Configuration

Patchlens reads YAML from `.patchlens.yml` in the repository root by default. Pass `--config PATH` to select another file. JSON is valid YAML, so existing JSON config files continue to work. Configuration is limited to 1 MiB, duplicate YAML keys are rejected, aliases are disabled, unknown keys and invalid values fail closed, and configuration is never fetched over the network.

```yaml
rules:
  PL-JS-004:
    enabled: true
    severity: high
  PL-SEC-006:
    enabled: false

exclude:
  - '**/generated/**'
ignorePaths:
  - '**/*.min.js'

suppressions:
  - ruleId: PL-JS-004
    path: src/legacy-runner.ts
    reason: Reviewed legacy invocation until the runner migration lands

baseline: .patchlens-baseline.json

thresholds:
  failOn: high
  minConfidence: medium

externalAdapters:
  semgrep:
    enabled: true
    command: semgrep
    args:
      - --config
      - ./semgrep-rules.yml
      - --json
    timeoutMs: 30000
  eslint:
    enabled: false
    command: eslint
    args:
      - --format
      - json
    timeoutMs: 30000

riskWeights:
  info: 0
  low: 1
  medium: 3
  high: 7
  critical: 10
```

## Settings

- `rules` enables/disables individual stable rule IDs and overrides severity. Confidence is independent of severity.
- `exclude` and `ignorePaths` both accept repository-relative glob-like patterns. `*` matches within one path segment; `**` can match directory separators.
- `suppressions` requires exactly one rule ID, a path pattern, and a reason of at least 8 characters. Wildcard rule IDs are rejected. Matching suppressions are listed in the JSON report with their reason and location.
- Inline suppressions are line scoped and require the same auditable rule ID and reason:
  `// patchlens-disable-next-line PL-JS-004 -- reviewed fixed command arguments`.
  A suppression cannot disable all rules.
- `baseline` points to a local JSON finding array or previous Patchlens report. Baseline comparison matches rule, path, and evidence, and labels current findings as `new` or `existing`; it does not hide findings.
- `thresholds.failOn` sets the default CLI failure severity. `thresholds.minConfidence` sets the minimum confidence for that exit threshold. CLI `--fail-on` overrides the configured severity.
- `riskWeights` controls the severity points used in the explainable risk summary. The score also includes bounded change-size and changed-file factors. It is a review aid, not a probability.
- `externalAdapters` are opt-in subprocesses. Commands and arguments are passed without a shell, have a timeout and output cap, and failures are printed as errors. Semgrep requires a local `--config` path and `--json` output; remote and automatic rule configurations are rejected. ESLint must request JSON output. Enabling an adapter runs that configured tool, which may load its own local configuration. Patchlens itself never invokes adapters unless enabled.

## CLI modes

- `patchlens --repo .` audits staged and unstaged tracked changes plus non-ignored untracked text files.
- `patchlens --repo . --mode staged` audits only the Git index.
- `patchlens --repo . --mode refs --base origin/main --head HEAD` compares commits using their merge base.
- Add `--comparison direct` to compare the base commit directly to head without merge-base selection.

Patchlens does not fetch missing refs, deepen shallow clones, write to the worktree, or execute repository code. Large Git diffs are limited to 32 MiB, and individual working-tree files loaded for context are limited to 8 MiB.
