<!-- shared: structure — adapted from the Migz93 self-hosted app workflow -->

# Workflow Reference

## Branches And Checkouts

Use `main` as the default and active development branch during early development. The maintainer and authorized collaborators may commit and push directly to `main`. The `develop` branch is reserved for the later transition. Adopt the sibling apps’ PR workflow when the maintainer explicitly switches GraphRelay to it.

For the maintained SSH workflow, check the server and local branches and dirty state, then fast-forward `main` on both checkouts. Edit and run app checks as `node` in the GraphRelay devcontainer. Run authenticated Git commands and Docker builds on the host. Commit and push from the host, then fast-forward `main` on the client. Keep machine-specific commands in the private runbook or ignored `LOCAL.md`.

## GitHub CLI Usage

Check the target branch and repository before running commands. Use `gh pr view`, `gh pr checks` and `gh run view` to inspect work. When a PR is requested, target `main` during early development. Write multiline GitHub bodies in a file and pass `--body-file`.

## AI Sign-Off For GitHub Text

Identify the agent when it drafts PR descriptions, issue bodies or comments. Keep private evidence and credentials out of GitHub text.

## Pull Request Conventions

Use a semantic title and a structured description with **Summary**, **Changes**, and **Test Plan**. Call out changes to persistence, permissions, Microsoft behaviour, Docker or releases. Review the exact branch revision under discussion.

## Docker Pull Request Checks

CI runs type checks, tests and a production build. PRs compile the production image for AMD64 and ARM64 and exercise native startup with disposable storage. Pushes to `main` and `develop` run the native startup check. See [Testing](../TESTING.md) for the matching local procedure.

## CodeRabbit Review Process

[CodeRabbit configuration](../.coderabbit.yaml) follows the sibling repos and targets both `main` and `develop`. Review tooling relies on the GitHub app having repository access. For a requested review, inspect findings against the current revision and confirm proposed fixes against GraphRelay’s auth, data and integration boundaries.

## Dependabot

[Dependabot](../.github/dependabot.yml) checks npm, GitHub Actions and Docker daily. npm minor and patch updates are grouped. Actions updates are grouped. Docker tracks updates within the chosen Node major. Version updates target the repository default branch. Review dependency changes and their CI results before merging.

## Release Process

1. Prepare the agreed version bump to `package.json` and `package-lock.json` when the maintainer requests a release.
2. Check startup, migrations, persistent data, auth and Microsoft integrations on the intended release commit.
3. Once the maintainer approves tagging, tag the intended commit in `main` as `vX.Y.Z`. The workflow publishes the versioned AMD64 and ARM64 images. Stable tags also update `latest`.
4. Review the Release Drafter draft and publish the release after confirming the expected images.

## Release Notes

Summarize user-visible changes, upgrade steps, fixes, security or maintenance, and Docker tags where applicable. Use the draft as a starting point and account for changes that landed directly on `main`.

## Security Findings

Verify whether a finding affects the actual app or workflow. Record the evidence and reason for a dismissal. See [Security Policy](../SECURITY.md) for scanners, availability and private vulnerability reporting.

## Implementation Expectations

- Run the checks in [Testing](../TESTING.md) and document any validation gaps.
- Log the failed operation without credentials or raw Microsoft responses.
- Use code comments for invariants, recovery paths and provider quirks.
- Document durable behaviour in the relevant topic page. Record live deployment details privately.
- Deploy only runtime-affecting changes under the candidate process. Repository tooling and documentation changes can be validated independently.
