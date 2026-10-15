# Configuration

JSON configuration accepts `rules` (rule ID to `{ "enabled": boolean, "severity": ... }`), `ignorePaths` (glob-like `*` and `**` patterns), `suppressions` (rule ID, path, optional reason), and `riskWeights` (severity to integer). Unknown keys and malformed values are rejected. Config is local JSON; no remote configuration is loaded.
