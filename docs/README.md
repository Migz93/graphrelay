<!-- shared: structure — based on the Migz93 self-hosted app documentation index -->

# Technical Docs

Use this index for long-term technical and operational reference. Add feature-specific documentation to the same branch or PR as the change.

## Where Information Lives

| Kind of information | Where it goes |
|---|---|
| Setup and feature overview | [README](../README.md) |
| Instructions every contributor or agent needs | [AGENTS.md](../AGENTS.md) |
| Test commands, coverage and smoke checks | [TESTING.md](../TESTING.md) |
| Long-term behaviour and implementation details | The topic pages below |
| Private host details or a deployment record | The local operations runbook |
| A finding specific to one branch or issue | The corresponding PR or issue |

## Shared Docs

| Doc | Read it when |
|---|---|
| [Architecture](architecture.md) | Changing data models, migrations, routes, or session handling |
| [Deployment](deployment.md) | Changing Docker, ports, persistent data, or runtime configuration |
| [Workflow](workflow.md) | Working on branches, preparing a PR, reviewing, or releasing |
| [Maintenance](maintenance.md) | Changing retention, cleanup, recovery, or backup behaviour |
| [Colour scheme](colour-scheme.md) | Changing surfaces, interactive controls, or status colours |

## GraphRelay Docs

| Doc | Read it when |
|---|---|
| [Microsoft setup](microsoft.md) | Registering an Entra app, connecting an account, or fixing OAuth |
| [To Do](todo.md) | Managing enrollment, prefixes, grouping, or duplicates |
| [Grouping profile files](grouping-profiles.md) | Editing or moving portable profiles and changing matching rules |
| [Calendar](calendar.md) | Configuring event views, feed subscriptions, or feed refresh |
| [API](api.md) | Changing routes, client requests or error handling |
| [Jobs and history](jobs-and-history.md) | Checking background work, run status and activity |
| [Mobile review](mobile-review.md) | Checking responsive layout and browser interactions |
| [Sync](sync.md) | Changing job scheduling, background reads, or how data reaches the UI |

## Start Here On A Fresh Checkout

1. Read [AGENTS.md](../AGENTS.md) and [Workflow](workflow.md) for branch, devcontainer and deployment rules.
2. Read [Architecture](architecture.md) for auth and persistent data, then [API](api.md) for the browser/server boundary.
3. Read [Sync](sync.md) and the feature guide for the part you are changing. Use [Testing](../TESTING.md) to pick validation that fits the change.

## Maintenance Rule

Update the relevant page when a change affects architecture, sync, persistence, integrations, cleanup, or runtime behaviour. Add and index a new page when the existing topics do not fit. Keep hostnames, credentials, feed URLs and live data in their appropriate private locations.
