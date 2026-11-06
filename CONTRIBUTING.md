# Contributing

## Workflow

GraphRelay’s maintainers work directly on `main` during early development. For an external contribution, target `main` if opening a PR. The maintainer will announce when the project switches to `develop` and the sibling apps’ PR workflow. See the [workflow reference](docs/workflow.md).

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
