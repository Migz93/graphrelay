# Contributing

## Workflow

Start work on a task branch based on `develop`. Target `develop` for changes and reserve `main` for releases. Read the [workflow reference](docs/workflow.md) before opening a PR or tagging a release.

## Pull Requests

Use a semantic title such as `feat:`, `fix:` or `docs:`. Describe the reason for the change, the checks you ran, and anything reviewers should verify about Microsoft integrations, auth, storage, Docker, or migration behaviour.

## Local Development

Use Node.js 22 and npm. The included [devcontainer configuration](.devcontainer/devcontainer.json) installs dependencies at creation. See [Testing](TESTING.md) for commands and an isolated local run.

## Testing

Test runtime changes with disposable data. The automated suite does not need live Microsoft credentials. [Testing](TESTING.md)

## Technical Docs

Start at the [technical docs index](docs/README.md). Update the relevant reference in the same branch as changes to durable behaviour.

## Coding Notes

- Keep Microsoft Graph calls and credentials on the server.
- Preserve cached reads and handle retries, overlaps and partial writes when changing background jobs.
- Keep generated output, local settings and private data out of commits.

## Reporting Bugs And Requesting Features

Open an issue with the app version or revision, steps to reproduce, expected behaviour and sanitized evidence. Use the private reporting process for vulnerabilities. [Security Policy](SECURITY.md)
