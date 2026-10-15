# Patchlens

Patchlens is a self-hostable, deterministic Git change auditor. It scans added lines in a diff using local rules; it does not use AI, network services, or execute repository code. It requires Node.js 24 LTS and pnpm 11.

## Quick start

```sh
pnpm install
pnpm build
node apps/cli/dist/index.js --repo . --base main
```

Use `--format json|sarif|html|text`, `--head REF`, and `--fail-on low|medium|high|critical`. The CLI defaults to comparing `HEAD` against its first parent (or the empty tree for a root commit). A nonzero exit status means findings met the configured threshold.

## Packages

- `packages/core`: versioned finding/config contracts, engine, suppressions, risk score.
- `packages/git`: safe Git subprocess wrapper and unified diff parsing.
- `packages/rules`: deterministic built-in TypeScript/JavaScript rules.
- `packages/reporters`: text, JSON, HTML, SARIF 2.1.0 serializers.
- `apps/cli`: local command line auditor.
- `apps/web`: optional Next.js dashboard and bounded diff-analysis API.
- `tests/fixtures`: safe and vulnerable example patches.

## Configuration

Pass `--config patchlens.json`. See [docs/configuration.md](docs/configuration.md). Findings use schema version `1.0.0` and stable rule IDs documented in [docs/rules.md](docs/rules.md).

## Self-hosting

Run `docker compose up --build` and open `http://localhost:3000`. The web API accepts a unified diff as JSON (`{"diff":"..."}`) and caps request bodies at 1 MiB. It does not access repository files. The Compose port is bound to localhost by default; add authentication and TLS at your reverse proxy before exposing it to a wider network.

## Limitations

Rules inspect added diff lines, not full program semantics. They can miss issues and produce false positives. Renames and deletions are represented in Git metadata; deleted content is not scanned. Binary files are skipped. Merge commits compare against the first parent. Shallow history errors are reported as Git errors without fetching. HTML output escapes content and is a static report.

## Community

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

MIT; see [LICENSE](LICENSE).
