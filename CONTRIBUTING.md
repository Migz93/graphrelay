<!-- shared: structure — adapted from the Migz93 self-hosted app guides -->

# Contributing

## Workflow

Start a task branch from `develop` and target `develop` for contributions. `main` contains stable releases. See the [workflow reference](docs/workflow.md) before opening a PR or tagging a release.

## Pull Requests

- Use semantic PR titles such as `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, or `ci:`.
- Explain what changed, why, and what reviewers should verify.
- Call out release, Docker, authentication, Microsoft integration, or schema impact when relevant.

## Local Development

Use Node.js 22 and npm. The [devcontainer example](.devcontainer/devcontainer.json.example) is the starting point for a fresh development checkout.

```bash
npm ci
npm run check
npm test
npm run build
```

See [Testing](TESTING.md) for an isolated local run and [Deployment](docs/deployment.md) for Docker.

## Testing

See [TESTING.md](TESTING.md) for automated tests and disposable browser checks.

## Technical Docs

See [docs/README.md](docs/README.md) for the technical reference area. Update the relevant topic in the same branch or PR as a durable behaviour change.

## Coding Notes

- Keep changes scoped to the task.
- Keep Microsoft Graph calls and credentials on the server.
- Preserve cached reads and account boundaries. Handle overlapping jobs and partial writes.
- Keep generated output and local-only files out of commits.

## Reporting Bugs And Requesting Features

Open an issue with the app version or revision, reproduction steps, expected behaviour and sanitized evidence. Use private reporting for vulnerabilities. [Security Policy](SECURITY.md)
