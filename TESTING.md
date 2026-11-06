# Testing

## Docker Pull Request Checks

[CI](.github/workflows/ci.yml) runs on PRs and pushes to `develop` and `main`. It installs dependencies, checks TypeScript, runs the test suite, builds the app and starts a production Docker image with disposable `/config` storage. It checks `/api/health` inside the container.

## Commands

Run these as the development user inside the GraphRelay devcontainer or in a compatible Node.js 22 environment.

```bash
npm ci
npm run check
npm test
npm run build
```

For a local run, build the client first and start the development server with a new temporary data directory. Stop the server before deleting that directory.

```bash
DATA_DIR="$(mktemp -d)" npm run dev
```

## Test Suite

The tests use Node’s test runner through `tsx`. They run without a live Microsoft account or an existing GraphRelay server.

| Test file | Coverage |
|---|---|
| [ordering.test.ts](tests/ordering.test.ts) | Named and numeric prefixes, two-digit width at 99 and 100 items, title recovery, grocery matching |
| [profile-matcher.test.ts](tests/profile-matcher.test.ts) | Default aliases, explicit moves, quantities and optional plural rules |
| [grouping-draft.test.ts](tests/grouping-draft.test.ts) | Editor state, built-in matches, fallback group and moving plural matches |
| [grouping-store.test.ts](tests/grouping-store.test.ts) | JSON round trips, filenames, stable IDs and profile portability |
| [duplicates.test.ts](tests/duplicates.test.ts) | Duplicate keys and which copy is kept |
| [duplicate-cleanup.test.ts](tests/duplicate-cleanup.test.ts) | HTTP cleanup, request size limits, protected copies, progress recovery and final totals |
| [calendar-feeds.test.ts](tests/calendar-feeds.test.ts) | iCalendar formatting, old feed migration and Graph calendar pagination paths |

The duplicate cleanup integration test starts a temporary server and SQLite database. Its [Graph fixture](tests/fixtures/graph-server.mjs) replaces Microsoft network calls with controlled responses.

## Adding New Tests

Use small fixtures for matching, serialization and schema changes. Test request boundaries and partial failures where mutations could silently do the wrong thing. Cover user-visible changes with a browser check on a disposable instance. Update this table when automated coverage changes.

## Manual Smoke Test

1. Build a uniquely tagged production image on the Docker host. Record the commit and image ID.
2. Start a uniquely named candidate with disposable, writable `/config` storage. Keep it separate from the running service.
3. Verify HTTP and Docker health. For a browser check, use a port or bridge address reachable from the devcontainer and use mock Graph responses or a disposable account and data. There is no checked-in Playwright suite.
4. Exercise the changed path, including errors and relevant persistence. For UI changes, check desktop and mobile. Remove the disposable container and its temporary data when finished.

Example candidate startup and health check:

```bash
graphrelay_revision="$(git rev-parse HEAD)"
graphrelay_candidate="graphrelay:smoke-${graphrelay_revision}"
docker build --build-arg COMMIT_SHA="$graphrelay_revision" -t "$graphrelay_candidate" .
docker run -d --name graphrelay-smoke --tmpfs /config:uid=1000,gid=1000 "$graphrelay_candidate"
docker inspect --format '{{.State.Health.Status}}' graphrelay-smoke
```

Wait for `healthy` before relying on the result. Choose a different smoke container name if that name is already in use. Remove the candidate container with `docker rm -f graphrelay-smoke` after checking it.

### Live Replacement And Verification

For implementation changes to the running app, deploy the exact tested image when authorized. Inspect the existing mount, port bindings, network, environment and restart policy. Verify health and normal access after replacement, and check that existing configuration and sessions are present. Keep private evidence in the deployment runbook. Documentation-only and review-only work does not trigger replacement.
