# Contributing to Patchlens

Thanks for helping improve Patchlens. Contributions of code, documentation, tests, issue reports, and thoughtful reviews are welcome. This guide describes how to propose and review changes in a way that keeps the project safe, reproducible, and easy to maintain.

## Before you start

- Check existing issues and pull requests to avoid duplicating work.
- For a substantial change, open or comment on an issue first so the scope can be discussed before implementation. Small fixes and documentation corrections can go straight to a pull request.
- You do not need to ask for an issue to be assigned before contributing. If you plan to work on an issue, leave a short comment so contributors know it is being handled.
- Be respectful and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Report a bug or propose a feature

Use the GitHub issue forms and include enough detail for someone else to reproduce or evaluate the proposal.

For bugs, include the Patchlens version or commit, operating system, Node.js and pnpm versions, exact command or API request, expected behavior, actual behavior, and a minimal sanitized example where possible. Remove secrets, private source, and personal data before posting logs or diffs.

For feature proposals, explain the problem, intended users, expected behavior, and any compatibility or security implications. Rule proposals should include examples that should and should not match, along with known limitations. Issues are a place to discuss work; they do not guarantee that a proposal will be accepted or implemented.

Do not report vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md) for private reporting instructions.

## Set up the project

Patchlens currently requires Node.js 24 or newer and pnpm 11, as declared in the root `package.json` and README.

```sh
git clone https://github.com/muratdemirci/Patchlens.git
cd Patchlens
pnpm install --frozen-lockfile
pnpm build
```

Create a branch from the repository's default branch (`dio` at the time this guide was written):

```sh
git switch -c <short-description>
```

Use a descriptive branch name such as `fix/html-report-escaping` or `docs/rule-authoring`. Do not develop directly on the default branch.

## Make a change

- Keep each change focused and reviewable. Prefer a series of small commits that each make one coherent change; do not split changes artificially just to increase commit count.
- Preserve package boundaries: `core` owns analyzer contracts and orchestration, `git` owns Git and diff handling, `rules` owns deterministic checks, `reporters` owns output formats, and the CLI/web apps consume those packages.
- Avoid adding dependencies when a small, maintainable implementation using existing platform APIs will do. Explain a new runtime dependency in the pull request.
- Never add AI/LLM services, embeddings, cloud inference, paid APIs, or mandatory network access. Core analysis must remain local and deterministic.
- Never execute repository code as part of analysis. Do not interpolate untrusted repository input into shell commands; use the existing safe process APIs.
- Validate data at trust boundaries and consider malicious diffs, paths, configuration, and report content.
- Keep stable rule IDs and the versioned finding schema compatible. If a compatibility change is needed, explain the migration and update all affected interfaces and documentation.
- Do not claim a rule detects a class of issue unless its implementation and tests demonstrate it. Describe heuristic signals and their limitations accurately.
- Do not commit credentials, tokens, private data, generated build output, or unrelated formatting changes.

### Adding or changing a rule

Every rule needs a stable ID, clear description, severity rationale, confidence, evidence, remediation guidance, and documented scope and limitations. Add focused positive and negative tests, including nearby safe patterns and false-positive cases. Update the rule catalog and fixtures when relevant. Rules must be deterministic, offline, and must not execute project code.

## Verify your change

Run the checks relevant to your change before opening a pull request. For code changes, run the complete CI set:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Add or update tests for behavior changes and bug fixes. A rule change should have tests that demonstrate both matching and non-matching cases. Documentation-only changes do not need code tests, but must be checked for accurate commands, links, and formatting. Do not report checks as passing unless you ran them; list any unavailable checks and why.

## Open a pull request

Push your branch and open a pull request against the default branch. A pull request should:

- explain the problem and the chosen solution in plain language;
- link the related issue using `Closes #<number>` when it fully resolves it, or `Refs #<number>` when it is related but should remain open;
- summarize behavior, compatibility, security, and documentation changes;
- list the checks you ran and their results;
- include screenshots only when a visual web change benefits from them;
- call out limitations and follow-up work instead of implying unfinished work is complete.

Keep a pull request focused on one issue or closely related change. If a change grows beyond the agreed scope, discuss splitting it into separate pull requests. Maintainers may request revisions, ask for a smaller scope, or close a proposal that does not fit the project's direction.

Do not merge your own pull request unless the maintainers have explicitly established that process. A pull request is considered ready when discussion is resolved, required checks pass, and a maintainer approves it. When merged, `Closes #<number>` lets GitHub close the linked issue automatically. If the work was pushed directly to the default branch and no pull request exists, do not create a retrospective PR just to link already completed work; reference the commit in the issue and close it with a clear explanation instead.

## Commit messages

Use short, descriptive messages that explain the change, for example:

```text
fix(git): handle deleted files in diff metadata
test(rules): cover quoted dynamic imports
docs: clarify local setup requirements
```

The examples are guidance, not a required commit-message standard. Keep commits coherent and avoid bundling unrelated changes. Do not rewrite published history on shared branches.

## Review and maintenance

Reviewers should focus on correctness, security, test evidence, compatibility, and whether the implementation matches the issue's scope. Keep review comments specific and constructive. Contributors should respond to feedback or explain why a suggestion does not fit; unresolved design questions should be discussed before merging.

Maintainers triage issues and pull requests as time allows. Labels, milestones, and assignment indicate project organization, not a promise or service-level commitment. Inactive proposals may be closed with an explanation and can be reopened if new information changes the decision.

## License

By submitting a contribution, you agree that it may be distributed under the project's [MIT License](LICENSE). You retain the copyright to your contribution. Do not submit work that you do not have the right to contribute.
