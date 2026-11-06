# GraphRelay

A self-hosted Microsoft account companion. The first prototype organizes shared Microsoft To Do lists in the Microsoft To Do app.

## Microsoft setup

Create a Microsoft Entra app registration that supports personal Microsoft accounts. Add delegated Microsoft Graph **Tasks.ReadWrite** and create a client secret. The default **Web** redirect URI is `http://localhost:9304/api/microsoft/callback`.

Keep the instance private until first-run setup is complete. Open GraphRelay and choose an administrator password. In Settings, enter the Application (client) ID and client secret value, save them, then connect Microsoft using the shared list owner's account.

For a reverse proxy, open **Settings → General → Network**, set **Public URL** to the HTTPS address you use in your browser, and enable **Trust Proxy** for a single trusted proxy. The proxy should replace forwarded headers and send `X-Forwarded-Proto: https`. Save, then add the displayed **Microsoft Redirect URI** as a **Web** redirect URI in Entra. Start Microsoft sign-in from the configured address. The saved settings take effect immediately and override the `PUBLIC_URL` and `TRUST_PROXY` environment defaults.

GraphRelay encrypts the Microsoft configuration and token cache with a key stored under /config and stores a salted hash of the administrator password. Preserve the whole /config volume across restarts and keep it private. The volume must be writable by UID 1000. Existing environment-configured instances can still use their original settings.

## Test the prototype

Create a disposable list in Microsoft To Do and share it with the other shopper. Its contents are cached automatically. Open the list from **To Do**, select **Enroll List**, then select **Are You Sure?** to configure ongoing actions. New enrollments start with grouping and automatic duplicate cleanup off.

Open **List settings** for an enrolled list to choose a grouping profile and prefix style, enable automatic duplicate cleanup, or override the sync interval. To use grouping in Microsoft To Do, set the list to Alphabetical on each phone. Use **Settings → To Do → Groupings** to edit shared grouping profiles and **Settings → To Do → General** to set the default sync interval. Use the **Enrollment** tab to unenroll a list. Optionally restore GraphRelay-prefixed names on open and completed items first. If restoration fails, background runs pause until you retry unenrollment. The list's local settings and corrections are removed after unenrollment succeeds.

In **List Settings → Formatting**, enable **Capitalize Each Word** to capitalize open item names when the list syncs. This works with any grouping setting.

Completed items appear in a collapsed section below the open items. The built-in **Groceries** profile recognizes common aliases, storage labels and pack sizes. Profiles are stored as JSON under `/config/todo/groupings`, with the default profile in `groceries.json`. You can copy these files to another GraphRelay instance or edit them directly. See [grouping profile files](docs/grouping-profiles.md) for the format. Custom profiles match the item names you enter. Corrections made beside an item apply to that list.

**Sync Now** runs the selected list immediately with its saved settings. **View activity** shows the changes. The dashboard reads enrolled lists, open items and duplicate previews from local storage. Background sync caches every available list at the default sync interval, including unenrolled lists. Enrolled lists use their configured interval and actions; unenrolled lists are read-only.

**Duplicates** shows which copies would be kept or removed. Confirm **Remove Proposed Duplicates** to remove eligible copies. Lists can be opened and cleaned once without enrollment. Unenrolled lists show their scheduled local snapshot immediately; **Sync Now** refreshes it on demand. **Duplicates** opens a review popup. Both manual and automatic cleanup prefer an open copy and skip copies with notes, attachments or checklist steps.

## Calendar feeds

Calendar feeds bring the subscription workflow from [ms-ical](https://github.com/Migz93/ms-ical) into GraphRelay. Add the delegated Microsoft Graph **Calendars.Read** permission to your GraphRelay app registration, then select **Enable Calendar Access** under **Settings → Microsoft Connection**. Use the origin configured for your Microsoft redirect when granting access. You can keep using the same Microsoft account and app registration.

Open **Calendar → Events** for month, week, day, or agenda views. Tick the calendars to display. GraphRelay remembers your selection in that browser and loads events into a local snapshot as you browse.

Open **Calendar → Feeds** to create a named subscription from one or more Microsoft calendars, including calendars in groups. **Settings → Calendar → General** controls calendar discovery and the default feed refresh interval (2 hours). **Settings → Calendar → Feeds** sets the default date range (30 days back and 365 days ahead). Each feed can override the interval and either day count in its **Settings**. **Refresh Calendars** requests an immediate refresh. Subscription URLs serve the last successful snapshot for the current source selection and date range and can be read by anyone who has the link and network access to GraphRelay. **Revoke Link** disables a subscription URL.

Existing ms-ical URLs and settings are managed by the standalone app. To switch a subscriber to GraphRelay, create a feed and use its new URL.

## Development

Use the dedicated devcontainer and follow [the workflow](docs/workflow.md). Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For a local-style server inside the devcontainer, build the client first and use `npm run dev` with DATA_DIR set to a disposable writable directory. The app's health endpoint is `/api/health`.
