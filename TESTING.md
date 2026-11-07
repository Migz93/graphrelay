<!-- shared: structure — adapted from the Migz93 self-hosted app guides -->

# Testing

## Docker Pull Request Checks

[CI](.github/workflows/ci.yml) runs type checks, tests and the production build. Pushes to `main` or `develop` also build and start an AMD64 image. PRs and manual runs additionally compile the ARM64 image. Docker checks use disposable data and publish no image. The startup check verifies HTTP health, SQLite and config write access under the non-root runtime user.

## Commands

Run application checks as `node` inside GraphRelay’s devcontainer on the Docker host.

```bash
npm ci
npm run check
npm test
npm run build
```

For a local development run, build the client first and use a new data directory. Stop the server before removing it.

```bash
DATA_DIR="$(mktemp -d)" npm run dev
```

## Server Tests

The suite uses Node’s test runner through `tsx`. It runs without a live Microsoft account or a separate GraphRelay server. The duplicate cleanup test starts an isolated app process with a temporary SQLite database and replaces Microsoft calls with [a fixture](tests/fixtures/graph-server.mjs).

## Browser Checks

Run manual browser checks with a clean browser profile or a disposable Playwright context. GraphRelay has no checked-in Playwright suite. Use mock Graph responses or disposable data. Obtain the owner’s authorization before using live data or real integrations.

### Reaching The App From A Devcontainer

Use the disposable container’s bridge address and port when reachable from the test runner. For a browser outside Docker, publish a separate loopback port and reach it through an SSH tunnel if the Docker host is remote. Use a fresh browser context because cookies can be shared across ports on the same hostname. Set a matching Public URL before exercising OAuth.

## Test Suite

| Test file | Coverage |
|---|---|
| [ordering.test.ts](tests/ordering.test.ts) | Shared numeric and named prefixes, custom order, title recovery and grocery matching |
| [profile-matcher.test.ts](tests/profile-matcher.test.ts) | Default aliases, explicit matches, quantities and plural rules |
| [grouping-draft.test.ts](tests/grouping-draft.test.ts) | Editor state, fallback group and moving plural matches |
| [grouping-store.test.ts](tests/grouping-store.test.ts) | JSON round trips, profile portability, stable IDs and filenames |
| [duplicates.test.ts](tests/duplicates.test.ts) | Duplicate keys and keeper selection |
| [duplicate-cleanup.test.ts](tests/duplicate-cleanup.test.ts) | HTTP cleanup, request sizes, protected copies, progress recovery and totals |
| [calendar-view.test.ts](tests/calendar-view.test.ts) | Scheduled event refresh without page requests, interval changes, new calendars, failure recovery, local reads, retention and account isolation |
| [calendar-feeds.test.ts](tests/calendar-feeds.test.ts) | iCalendar serialization, feed migration and Graph pagination paths |

## Adding New Tests

Use small fixtures for matching, serialization and schema changes. Test destructive actions for partial failures and stale input. Cover visible changes with an isolated browser check. Update the coverage table when a test is added.

## Manual Smoke Test

1. Run the development checks. On the Docker host, record the commit, build tag and exact smoke container name in the ignored local runbook. Verify the build context and exclude private files.
2. Build a uniquely tagged production image and record its ID. Start that exact image with fresh writable `/config` storage and no live integration credentials.
3. Wait for Docker health, check HTTP and verify that the app runs as `node`. Exercise the changed path, including errors and relevant persistence. Use [mobile review](docs/mobile-review.md) for layout changes.

Example startup and HTTP check:

```bash
revision="$(git rev-parse HEAD)"
candidate="graphrelay:smoke-${revision}"
smoke="zdev-graphrelay-smoke-$(git rev-parse --short HEAD)"
docker build --build-arg COMMIT_SHA="$revision" -t "$candidate" .
image="$(docker image inspect "$candidate" --format '{{.Id}}')"
docker run -d --name "$smoke" --tmpfs /config:uid=1000,gid=1000 "$image"
docker inspect --format '{{.State.Health.Status}}' "$smoke"
docker exec "$smoke" node -e 'fetch("http://127.0.0.1:9304/api/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
```

Use a unique name if a smoke container with the same name is already in use. Wait for `healthy` before relying on the result.

### Disposable Test Cleanup

Remove the task’s disposable container and any named test volume after validation, including after failure. Close only the tunnel created for that task. Check names, image IDs and concurrent use before removing anything. Keep candidate and rollback images that are still needed.

### Live Replacement And Verification

Before replacing the running app, record the live and candidate image IDs and the settings required to recreate the service. Preserve the config mount, port bindings, network, restart policy and environment overrides. Keep a known rollback image and check data compatibility before using it.

Deploy the exact tested candidate for implementation changes that affect the running app, unless the owner stops at validation. Confirm Docker health, HTTP and relevant configured behaviour. Keep private evidence in the operations runbook. Documentation, review and repository-tooling changes by themselves do not trigger replacement.
