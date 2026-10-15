# Architecture

Dependency direction is `cli -> reporters, git, rules -> core`. Core has no Git, web framework, database, process, or network dependency; it accepts an in-memory `ChangeSet` and rules. Its only runtime dependency parses local YAML configuration. The Git package invokes Git directly with argument arrays, never a shell, and does not write to the repository. The rules package exposes a language-adapter and stable-ID rule registry. Its TypeScript/JavaScript adapter uses the TypeScript parser; optional ESLint and Semgrep subprocess adapters run only when explicitly enabled in local configuration. Adapter findings retain `source: adapter`; built-in findings use `source: patchlens`.

Git change models retain per-file status, rename source path, binary flag, added and removed lines, and (when safely available) full source text for bounded syntax context. Baseline comparison labels findings without removing them. Risk summaries enumerate severity/confidence, changed-file, and change-size factors; the score is an ordering aid, not a probability.

The web app sends pasted patches to the local API, which returns the same finding/report model as the CLI. The API accepts only unified diff text and never reads repository paths or executes code.
