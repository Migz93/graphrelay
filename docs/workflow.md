# Workflow Reference

## Branches And Checkouts

Use `develop` as the integration branch and `main` as the stable release branch. Create a focused `feat/`, `fix/`, `docs/` or similar task branch from `develop` for new work. Keep related follow-ups on their existing task branch. Use PRs for changes to either base branch.

For the maintained SSH workflow, check the server and local branches and dirty state, then fast-forward the intended branch. Edit and run app checks as `node` in the GraphRelay devcontainer. Run authenticated Git commands and production Docker builds on the host. Commit and push the task branch from the host, then fast-forward the same branch on the client. Keep host-specific instructions in the private runbook or ignored `LOCAL.md`.

## Pull Requests

Open work PRs against `develop`. Use a semantic title and start in draft while work or review is pending. Use a structured body with **Summary**, **Changes**, and **Test Plan**. Call out changes to data, permissions, Graph behaviour, Docker, or release handling. Keep logs and examples sanitized.

Follow the maintainer’s cross-AI and CodeRabbit review sequence before requesting a PR into `develop`. Review the current commit, address actionable findings on the work branch and recheck changes that affect correctness. Keep GitHub review text attributable to its author.

## Checks And Deployment

Use [Testing](../TESTING.md) for the automated checks and production candidate procedure. Keep live configuration and disposable test data separate. For implementation changes to the running app, deploy the exact tested candidate after checks pass unless the owner asks to stop at validation. Docs-only and review-only work does not trigger a deployment.

## Release Process

1. Prepare the agreed version bump to `package.json` and `package-lock.json` through the normal `develop` PR flow.
2. Open a release PR from `develop` into `main`. Check startup, migrations, persistent data, auth and core Microsoft integrations.
3. Once the release PR has merged and the maintainer approves tagging, create the `vX.Y.Z` tag on the release commit in `main`. Tag builds publish the version and `latest` to GHCR.
4. Review the Release Drafter draft. Summarize user-visible changes, upgrade notes and Docker changes where applicable. Publish the release after confirming the matching image is available.

## Security Findings

Verify whether a finding affects the actual app or workflow. Fix confirmed issues on a work branch. Record the evidence and reason for any dismissal. Use private reporting for vulnerabilities. [Security Policy](../SECURITY.md)

## Implementation Expectations

Write logs that identify the failing operation without including credentials or raw Microsoft responses. Use comments for invariants, recovery paths and provider quirks. Document long-lived behaviour changes in the relevant topic page. Record live deployment details privately.
