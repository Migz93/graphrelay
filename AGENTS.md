# Agent Guidelines

Read this file and [README.md](README.md) before working on GraphRelay. Read an ignored `LOCAL.md` if one exists.

## Project Facts

| | |
|---|---|
| App | GraphRelay |
| Stack | Node.js 22, TypeScript, Express, SQLite, React, Vite, Tailwind |
| Container port and data | `9304`, `/config` |
| Devcontainer workspace | `/workspaces/graphrelay` |
| Version files | `package.json`, `package-lock.json` |
| Checks for runtime changes | `npm run check`, `npm test`, `npm run build`, disposable Docker smoke test |
| Core integrations | Microsoft To Do and Outlook Calendar via Microsoft Graph |
| UI reference | Pacearr and the shared app palette |

## Before You Start

| Work | Read |
|---|---|
| Branches, PRs, review or releases | [Workflow](docs/workflow.md) |
| Schema, persistence or auth | [Architecture](docs/architecture.md) |
| Test changes or candidate validation | [Testing](TESTING.md) |
| Docker or runtime settings | [Deployment](docs/deployment.md) |
| Polling and background jobs | [Sync](docs/sync.md) |
| Cleanup, retention or recovery | [Maintenance](docs/maintenance.md) |
| UI colours or feedback | [Colour scheme](docs/colour-scheme.md) |

Use the [technical docs index](docs/README.md) to find feature details. Update the matching reference when behaviour changes. Keep list activity within To Do.

## Development and Deployment

Check both checkouts for branch and dirty state. Use the private workspace runbook for direct SSH development. Edit the server checkout and install dependencies and run checks as `node` in the dedicated GraphRelay devcontainer. Run authenticated Git and Docker operations on the host. Work directly on `main` and synchronize it through GitHub during early development. The maintainer will explicitly switch GraphRelay to the `develop` and PR workflow when ready.

Keep credentials, token caches, session details, private host details, subscription URLs and live list contents out of Git and logs. Use disposable data for tests. For changes to the running app, replace the existing test container with the exact smoke-tested candidate as authorized by the owner, preserve its config and verify health. Documentation-only and review-only work does not trigger deployment.
