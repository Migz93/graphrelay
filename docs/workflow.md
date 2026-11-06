# Workflow Reference

## Branches And Checkouts

Use `main` as the default and active development branch during early development. The maintainer and authorized collaborators may commit and push directly to `main`. The `develop` branch is reserved for the later transition. Switch to task branches and PRs targeting `develop` when the maintainer explicitly adopts the sibling apps’ workflow.

For the maintained SSH workflow, check the server and local branches and dirty state, then fast-forward `main` on both checkouts. Edit and run app checks as `node` in the GraphRelay devcontainer. Run authenticated Git commands and production Docker builds on the host. Commit and push from the host, then fast-forward `main` on the client. Keep host-specific instructions in the private runbook or ignored `LOCAL.md`.

## Pull Requests

PRs are optional for maintainer work during early development. If a PR is useful for review or an external contribution, target `main`. Use a semantic title and a body with **Summary**, **Changes**, and **Test Plan**. Call out changes to data, permissions, Graph behaviour, Docker, or release handling. Keep logs and examples sanitized.

## Checks And Deployment

Use [Testing](../TESTING.md) for the automated checks and production candidate procedure. Keep live configuration and disposable test data separate. For implementation changes to the running app, deploy the exact tested candidate after checks pass unless the owner asks to stop at validation. Docs-only and review-only work does not trigger a deployment.

## Release Process

1. When the maintainer asks for a release, prepare the agreed version bump to `package.json` and `package-lock.json`.
2. Check startup, migrations, persistent data, auth and core Microsoft integrations on the intended release commit in `main`.
3. Once the maintainer approves tagging, create the `vX.Y.Z` tag on that commit. Tag builds publish the version and `latest` to GHCR.
4. Review the Release Drafter draft. Summarize user-visible changes, upgrade notes and Docker changes where applicable. Publish the release after confirming the matching image is available.

## Security Findings

Verify whether a finding affects the actual app or workflow. Fix confirmed issues using the current branch workflow. Record the evidence and reason for any dismissal. Use private reporting for vulnerabilities. [Security Policy](../SECURITY.md)

## Implementation Expectations

Write logs that identify the failing operation without including credentials or raw Microsoft responses. Use comments for invariants, recovery paths and provider quirks. Document long-lived behaviour changes in the relevant topic page. Record live deployment details privately.
