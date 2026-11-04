# GraphRelay

A self-hosted Microsoft account companion. The first prototype organizes shared Microsoft To Do lists in the Microsoft To Do app.

## Microsoft setup

Create a Microsoft Entra app registration that supports personal Microsoft accounts. Add a **Web** redirect URI of `<PUBLIC_URL>/api/microsoft/callback`, add delegated Microsoft Graph **Tasks.ReadWrite**, and create a client secret. Use an HTTPS origin for remote access, or `http://localhost:9304` for a loopback test. Set TRUST_PROXY=1 only when serving through one trusted reverse proxy.

Keep the instance private until first-run setup is complete. Open GraphRelay and choose an administrator password. In Settings, enter the Application (client) ID and client secret value, save them, then connect Microsoft using the shared list owner's account.

GraphRelay encrypts the Microsoft configuration and token cache with a key stored under /config and stores a salted hash of the administrator password. Preserve the whole /config volume across restarts and keep it private. The volume must be writable by UID 1000. Existing environment-configured instances can still use their original settings.

## Test the prototype

Create a disposable list in Microsoft To Do, share it with the other shopper, and set it to Alphabetical on each phone. Enroll that list in GraphRelay and select named or number-only prefixes. Try adding Peas from both phones. GraphRelay checks enrolled lists every 90 seconds and shows title changes under View activity.

The grocery dictionary is small. Unrecognized items fall into Other. Open an enrolled list from **To Do** to see its open items grouped by aisle. Pick an aisle next to an item to correct it. Use **List settings** to change prefix style and aisle order. GraphRelay remembers the choice for matching names on that list, ignoring case and extra spaces. Only open items are renamed. Turning prefixes off restores open titles that still carry the prefix applied by GraphRelay. Use **Preview duplicates** on an enrolled list to review open and completed copies. The preview prefers an open copy and flags copies with notes, attachments or checklist steps. After reviewing the preview, confirm **Remove proposed duplicates** to remove eligible copies. GraphRelay rechecks the proposed copies and skips flagged or changed items. To opt in to automatic removal during background runs, turn on **Automatic duplicate cleanup** in the list settings and save. It is off by default and uses the same review checks. The ms-ical port is future work.

## Development

Use the dedicated devcontainer and follow [the workflow](docs/workflow.md). Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For a local-style server inside the devcontainer, build the client first and use `npm run dev` with DATA_DIR set to a disposable writable directory. The app's health endpoint is `/api/health`.
