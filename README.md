# GraphRelay

A self-hosted Microsoft account companion. The first prototype organizes shared Microsoft To Do lists in the Microsoft To Do app.

## Microsoft setup

Create a Microsoft Entra app registration that supports personal Microsoft accounts. Add a **Web** redirect URI of `<PUBLIC_URL>/api/microsoft/callback`, add delegated Microsoft Graph **Tasks.ReadWrite**, and create a client secret. Use an HTTPS origin for remote access, or `http://localhost:9304` for a loopback test. Set TRUST_PROXY=1 only when serving through one trusted reverse proxy.

Keep the instance private until first-run setup is complete. Open GraphRelay and choose an administrator password. In Settings, enter the Application (client) ID and client secret value, save them, then connect Microsoft using the shared list owner's account.

GraphRelay encrypts the Microsoft configuration and token cache with a key stored under /config and stores a salted hash of the administrator password. Preserve the whole /config volume across restarts and keep it private. The volume must be writable by UID 1000. Existing environment-configured instances can still use their original settings.

## Test the prototype

Create a disposable list in Microsoft To Do and share it with the other shopper. Enroll it from **To Do** to start reading its contents into GraphRelay. New enrollments start with grouping and automatic duplicate cleanup off.

Open **List settings** for an enrolled list to choose a grouping profile and prefix style, enable automatic duplicate cleanup, or override the sync interval. To use grouping in Microsoft To Do, set the list to Alphabetical on each phone. Use **Settings → To Do → Groupings** to edit shared grouping profiles and **Settings → To Do → General** to set the default sync interval. The **To Do settings** link on the overview opens that page. Use the **Enrollment** tab to unenroll a list. Optionally restore GraphRelay-prefixed names on open and completed items first. If restoration fails, background runs pause until you retry unenrollment. The list's local settings and corrections are removed after unenrollment succeeds.

Completed items appear in a collapsed section below the open items. The built-in **Groceries** profile recognizes common aliases, storage labels and pack sizes. Profiles are stored as JSON under `/config/todo/groupings`, with the default profile in `groceries.json`. You can copy these files to another GraphRelay instance or edit them directly. See [grouping profile files](docs/grouping-profiles.md) for the format. Custom profiles match the item names you enter. Corrections made beside an item apply to that list.

**Sync Now** runs the selected list immediately with its saved settings. **View activity** shows the changes. The dashboard reads enrolled lists, open items and duplicate previews from local storage. Background sync refreshes those snapshots.

**Preview duplicates** shows which copies would be kept or removed. Confirm **Remove proposed duplicates** to remove eligible copies. Both manual and automatic cleanup prefer an open copy and skip copies with notes, attachments or checklist steps. The ms-ical port is future work.

## Development

Use the dedicated devcontainer and follow [the workflow](docs/workflow.md). Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For a local-style server inside the devcontainer, build the client first and use `npm run dev` with DATA_DIR set to a disposable writable directory. The app's health endpoint is `/api/health`.
