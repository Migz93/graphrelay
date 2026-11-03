# GraphRelay

A self-hosted Microsoft account companion. The first prototype organizes shared Microsoft To Do lists in the Microsoft To Do app.

## Microsoft setup

Create a Microsoft Entra app registration that supports personal Microsoft accounts. Add a **Web** redirect URI of `<PUBLIC_URL>/api/microsoft/callback`, add delegated Microsoft Graph **Tasks.ReadWrite**, and create a client secret. Use an HTTPS origin for remote access, or `http://localhost:9304` for a loopback test. Set TRUST_PROXY=1 only when serving through one trusted reverse proxy.

Use .env.example as a reference. Set an administrator password and a long random APP_SECRET. Keep APP_SECRET stable across restarts because it encrypts the persisted Microsoft token cache. Ensure the persistent /config mount is writable by UID 1000. Sign in to GraphRelay as administrator, then connect Microsoft in Settings using the shared list owner's account.

## Test the prototype

Create a disposable list in Microsoft To Do, share it with the other shopper, and set it to Alphabetical on each phone. Enroll that list in GraphRelay and select named or number-only prefixes. Try adding Peas from both phones. GraphRelay checks enrolled lists every 90 seconds and shows title changes under View activity.

The grocery dictionary is small. Unrecognized items fall into Other. Only open items are renamed. Turning prefixes off restores open titles that still match a title applied by GraphRelay. Duplicate deletion and the ms-ical port are future work.

## Development

Use the dedicated devcontainer and follow [the workflow](docs/workflow.md). Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For a local-style server inside the devcontainer, build the client first and use `npm run dev` with DATA_DIR set to a disposable writable directory. The app's health endpoint is `/api/health`.
