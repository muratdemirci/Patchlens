# Architecture

Dependency direction is `cli -> reporters, git, rules -> core`. Core has no Git, web framework, database, or network dependency. Git commands use `spawnSync` with argument arrays, never a shell. The engine accepts an in-memory patch and rule set so it can run offline and be embedded by other tools. Findings carry schema version, stable rule ID, severity, confidence, source range, evidence, and remediation.

The web app sends pasted patches to the local API, which returns the same report model as the CLI. The API accepts only unified diff text and never reads repository paths or executes code.
