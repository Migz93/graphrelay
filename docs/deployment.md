# Deployment

## Image And Container

GraphRelay uses Node.js 22 and runs as UID 1000 in the production image. The default internal port is `9304`, and `GET /api/health` checks process readiness. It does not exercise the Microsoft connection. The runtime starts Node directly and excludes npm, npx, Corepack and Yarn; dependency installation and compilation remain in the build stage.

A push to `develop` publishes `ghcr.io/migz93/graphrelay:develop` and a short commit tag. A `v*` tag publishes the matching version, and a stable tag also updates `latest`. Both workflows build AMD64 and ARM64 images. Pin a published version or an image digest when you want reproducible upgrades. You can also build from the current checkout.

## Running It

The checked-in [Compose file](../docker-compose.yml) uses the latest stable image, a loopback port mapping and a bind mount at `/opt/graphrelay`. It reads an optional `.env` file.

```bash
sudo install -d -m 0700 -o 1000 -g 1000 /opt/graphrelay
docker compose up -d
```

Use that directory creation command for a new install. For an existing install, preserve the current mount and verify the running user can write to it. For a local build with a named volume:

```bash
docker build -t graphrelay:local .
docker run -d --name graphrelay --restart unless-stopped \
  -p 127.0.0.1:9304:9304 -v graphrelay-config:/config graphrelay:local
```

Open `http://localhost:9304` on the Docker host, or reach that address through an SSH tunnel from your browser. Keep a fresh instance private until you create the local admin account.

## Persistent Data

| Path | Contents |
|---|---|
| `/config/graphrelay.db` and its SQLite sidecars | Account settings, sessions, To Do snapshots, feed settings and cached events |
| `/config/setup.key` | Encryption and session-signing key material when `APP_SECRET` is unset |
| `/config/todo/groupings/` | Portable JSON grouping profiles |

Back up the full volume and retain its encryption key or the same `APP_SECRET`. See [Maintenance](maintenance.md) for backup and restore. Do not mount the live data directory into a disposable test container.

## Container User

The production image runs directly as `node`. Create new bind mounts with ownership and permissions that let UID 1000 write to them. Use a writable Docker-managed named volume or UID 1000 tmpfs for a disposable instance.

## Runtime Config

| Setting | Default | Purpose |
|---|---|---|
| `PORT` | `9304` | HTTP listener inside the container |
| `DATA_DIR` | `/config` | Persistent data directory |
| `PUBLIC_URL` | `http://localhost:9304` | Initial browser origin and Microsoft callback base |
| `TRUST_PROXY` | `0` | Set to `1` for one trusted proxy hop |
| `APP_SECRET` | Generated key on disk | Optional stable key source. Keep an existing value unchanged when replacing the container. |
| `ADMIN_PASSWORD`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Unset | Legacy environment-based setup, used together with `APP_SECRET`. New installs use the web UI. |

## Reverse Proxy

Saved **Public URL** and **Trust Proxy** settings override the environment defaults immediately. Public URL in the UI accepts an HTTPS origin or HTTP localhost. For a reverse proxy, set the browser-facing origin and enable trust only for one trusted hop. Configure that proxy to overwrite forwarded headers and send `X-Forwarded-Proto: https`. Register the callback displayed in **Settings → Microsoft**. [Microsoft setup](microsoft.md)

## Updates

Use the candidate and recovery procedure in [Testing](../TESTING.md#live-replacement-and-verification). An explicit live image replacement request authorizes the restart and existing startup and scheduled work without another job confirmation or idle window. Running jobs may be interrupted. Repository-tooling and documentation changes alone do not trigger deployment.

Preserve the data mount, port mappings, network, restart policy and runtime overrides when replacing a container. Keep Compose deployments under Compose. Check health and the browser after updating. [Live replacement and verification](../TESTING.md#live-replacement-and-verification)
