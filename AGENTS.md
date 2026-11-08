<!-- shared: structure — based on the Migz93 self-hosted app guides, with GraphRelay-specific workflow and checks -->

# Agent Guidelines

Read this file before doing any work. Read [README.md](README.md) for the product overview and any ignored `LOCAL.md` for machine-specific instructions. The [technical docs index](docs/README.md) routes you to the right subsystem.

## Project Facts

| | |
|---|---|
| App name | `graphrelay` |
| Port | `9304` |
| Host and container data directories | `/opt/graphrelay` and `/config` |
| Workspace path | `/workspaces/graphrelay` |
| Stack | Node.js 22, TypeScript, Express, SQLite, React, Vite, Tailwind |
| Version files | `package.json` and `package-lock.json` |
| Checks | `npm run check`, `npm test`, `npm run build`, disposable Docker smoke test for runtime changes |
| Integrations to flag in review | Microsoft To Do and Outlook Calendar |
| UI reference | Pacearr and the shared app palette |

## Before You Start — What To Read

| If you’re about to… | Read |
|---|---|
| Check branches, open a PR, review, or release | [Workflow](docs/workflow.md) |
| Add or change tests | [Testing](TESTING.md) |
| Change auth, persistence or schema | [Architecture](docs/architecture.md) and [API](docs/api.md) |
| Change Graph, OAuth or permissions | [Microsoft setup](docs/microsoft.md) |
| Change polling, caching or run state | [Sync](docs/sync.md) and [Jobs and history](docs/jobs-and-history.md) |
| Change Docker, ports or data mounts | [Deployment](docs/deployment.md) |
| Change colours, layout or controls | [Colour scheme](docs/colour-scheme.md) and [Mobile review](docs/mobile-review.md) |
| Add background cleanup or retention | [Maintenance](docs/maintenance.md) |

Put durable project rules here, subsystem details under `docs/`, and task-specific decisions in the task or PR. Keep deployment evidence and machine-specific details in the private runbook or ignored `LOCAL.md`.

## Where You’re Running

Check branch, dirty state and concurrent use on both checkouts. Follow the private SSH runbook for the maintained deployment. Edit source and run dependency installation, checks and tests as `node` inside GraphRelay’s on-demand devcontainer. Run authenticated Git, review and Docker operations on the Docker host.

Start the on-demand container using the launcher recorded in ignored `LOCAL.md`. The development image is defined in `.devcontainer/Dockerfile`. It has no Docker socket or host home mount. GraphRelay has no Playwright dependency; do not copy browser-install commands from sibling apps without adding a deliberate supported browser setup.

On a fresh checkout, copy [the example](.devcontainer/devcontainer.json.example) to the ignored `.devcontainer/devcontainer.json` and open it with a Dev Container client on the Docker host. Keep host launcher details in `LOCAL.md`. The example uses a disposable dependency volume. If a named development container is already running, verify its mount and concurrent use before using or replacing it. Before rebuilding, record retained volumes by exact name, destination and options in `LOCAL.md`, and explicitly reattach them. Preserve unrelated local configuration. [Testing](TESTING.md)

## Live Container Conventions

- Use the app name for the image, container and Compose service.
- Preserve the existing data mount, ports, network, restart policy and overrides during replacement. Keep Compose deployments under Compose.
- Treat the entire config volume as private. Keep secrets, cookies, Microsoft tokens, subscription URLs, raw task or event data and private host details out of Git and public logs.
- Use isolated smoke containers with writable disposable storage and no live integration credentials.

## Rebuilding The Container After Code Changes

Use the [manual smoke procedure](TESTING.md#manual-smoke-test). Build a uniquely tagged candidate on the intended host and verify the exact image with fresh storage. Deploy that image by default for changes to the running app, unless the owner asks to stop at validation. Documentation, review and repository-tooling changes do not trigger a live replacement by themselves.

## GitHub Workflow

### Before Starting Any Work

Verify branches and dirty state on both checkouts before edits. Start a task branch from an up-to-date `develop`. Synchronize through GitHub and use fast-forward updates. Preserve unrelated work and branches.

### Review And Release

Feature, fix, documentation and dependency PRs target `develop`. `main` contains stable releases. Review the current diff, pass the required checks and follow the owner’s requested review gates before merging. Version bumps, release promotion to `main`, tags and releases require the owner’s direction. [Workflow](docs/workflow.md)

### Close Out Work

At PR close or explicit cancellation, check resource ownership and concurrent use before removing task resources. Follow [cleanup](TESTING.md#disposable-test-cleanup). Identify the devcontainer through its launcher or checkout label and verify all mounts. Stop it before removal. Use the launcher teardown only when every anonymous volume is confirmed disposable. Otherwise record retained volumes by exact name, destination and options in ignored `LOCAL.md`, remove the container without `-v`, and remove only the confirmed disposable unused dependency volume. Retain volume records for the next setup and explicitly reattach them. Preserve the checkout, live app and recovery records.

Return a clean available task checkout to `develop` and fast-forward it after merge or explicit cancellation. Delete only task branches verified merged (including squash-tree comparison) or explicitly discarded. A closed unmerged PR does not authorize discarding its branch. Preserve unsynchronized work and unrelated branches; report cleanup pending on disconnected clients. Record deployed revisions and verification privately.

## Technical Docs Are Part Of The Work

Update the relevant `docs/` page when changing architecture, persistence, sync, security, integrations or runtime behaviour. Add new topics to [docs/README.md](docs/README.md). Keep list activity within To Do. Document shared patterns while keeping app-specific commands and behaviour accurate.

## Tests

Use [TESTING.md](TESTING.md) for the suite and manual checks. Automated tests use disposable fixtures. Run browser checks against disposable data or mocked Microsoft responses. Get authorization before connecting real test integrations or using live data. GraphRelay currently has no committed Playwright suite.
