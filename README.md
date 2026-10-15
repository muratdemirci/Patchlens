# Patchlens

Patchlens is a self-hostable, deterministic Git change auditor. It analyzes changed JavaScript and TypeScript code with local rules; it does not use AI or require network services, and it never executes repository code by default. It requires Node.js 24 LTS and pnpm 11.

## Quick start

```sh
pnpm install
pnpm build
node apps/cli/dist/index.js --repo .
```

The default mode audits staged, unstaged, and non-ignored untracked files. Use `--mode staged` for only the Git index, or `--mode refs --base origin/main --head HEAD` to compare commits. Output formats include `--format json|sarif|html|text`; `--fail-on info|low|medium|high|critical` sets the CI threshold. Configure rules and adapters in `.patchlens.yml`; see [docs/configuration.md](docs/configuration.md).

## Packages

- `packages/core`: versioned finding/config contracts, analysis engine, suppressions, baseline comparison, explainable risk summary.
- `packages/git`: safe Git subprocess wrapper, worktree/index/ref discovery, and diff change model.
- `packages/rules`: deterministic TypeScript/JavaScript AST and line rules, plus opt-in ESLint and Semgrep adapters.
- `packages/reporters`: text, JSON, HTML, SARIF 2.1.0 serializers.
- `apps/cli`: local command line auditor.
- `apps/web`: optional Next.js dashboard and bounded diff-analysis API.
- `tests/fixtures`: safe and vulnerable example patches.

## Configuration

Patchlens reads `.patchlens.yml` by default; pass `--config PATH` to select another YAML or JSON file. Findings use schema version `1.0.0` and stable rule IDs documented in [docs/rules.md](docs/rules.md).

## Self-hosting

Run `docker compose up --build` and open `http://localhost:3000`. The web API accepts a unified diff as JSON (`{"diff":"..."}`) and caps request bodies at 1 MiB. It does not access repository files. The Compose port is bound to localhost by default; add authentication and TLS at your reverse proxy before exposing it to a wider network.

## Limitations

Rules inspect changed ranges and bounded syntax context, not full program semantics or data flow. They can miss issues and produce false positives; confidence is separate from severity. Deleted lines are tracked for API change signals but source code findings focus on added and modified ranges. Binary files are skipped. Merge commits use their first parent unless a base is supplied; shallow clones are never fetched or deepened. Optional external adapters run only when explicitly enabled. HTML output escapes content and is a static report.

## Community

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

MIT; see [LICENSE](LICENSE).
