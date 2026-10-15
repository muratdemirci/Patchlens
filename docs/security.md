# Security model

The CLI never runs build scripts, hooks, repository binaries, or source code. Git is invoked directly with bounded output and a fixed argument list. User references are validated and resolved to commit IDs before diff comparison; no shell expands input. Diff text and config are size-limited/validated. Static HTML output escapes all interpolated content. The web API analyzes only supplied diff text, but has no built-in authentication; keep it on a trusted local network or put an authenticated TLS proxy in front of it before remote exposure.
