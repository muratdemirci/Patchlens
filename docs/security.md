# Security model

The analyzer never runs build scripts, hooks, repository binaries, or source code by default. Git is invoked directly with argument arrays, bounded output and timeouts; no shell expands input. Revisions are resolved as commits before comparison. Changed paths are checked before reading, symlinks and files outside the repository are skipped, and working-tree context reads are size limited. Diff text and YAML config are size limited and validated. Static HTML output escapes interpolated content.

External ESLint or Semgrep adapters run only when explicitly enabled. Their configured command executes as a subprocess without shell interpolation, with a timeout and output cap. Enabling ESLint can cause the tool to load repository ESLint configuration, so only enable it for repositories and commands you trust. Semgrep requires an explicit local rule configuration; remote and automatic rulesets are rejected. Adapter failures are surfaced rather than silently treated as successful analysis.

The web API analyzes only supplied diff text and does not read repository paths. It has no built-in authentication; keep it on a trusted local network or put an authenticated TLS proxy in front of it before remote exposure.
