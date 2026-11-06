# GraphRelay REST API Reference

These routes support the web UI. Use this reference when changing an endpoint or a client request. See [server routes](../src/server/index.ts), [calendar routes](../src/server/calendar-feeds.ts), and the [API client](../src/client/lib/api.ts) for the implementation.

## Authentication

The browser uses an HTTP-only admin session cookie. Send `X-GraphRelay: 1` on API mutations and use JSON for request bodies. Protected endpoints return 401 when the session ends. The Microsoft callback also requires the originating admin session and matching OAuth state.

| Method and path | Behaviour |
|---|---|
| `GET /api/health` | Process health, independent of sign-in or Microsoft access |
| `GET /api/session` | Setup and sign-in state. Signed-in responses include the username, Microsoft account, password editability and build metadata. |
| `POST /api/setup` | Create the initial local account with `username` and `password` from the app’s browser origin |
| `POST /api/login` | Verify `username` and `password` and create a new session |
| `POST /api/change-password` | Verify `currentPassword`, `newPassword` and `confirmPassword`, then replace the hash and revoke all sessions |
| `POST /api/logout` | Destroy the current admin session |

## Microsoft Connection And Settings

| Method and path | Behaviour |
|---|---|
| `GET /api/dashboard` | Local list counts, enrolled lists, calendar summary and Microsoft reconnect status |
| `GET /api/network` | Public URL, proxy trust and derived redirect URI |
| `PUT /api/network` | Save `publicUrl` and `trustProxy` |
| `GET /api/microsoft` | Account, redirect URI, client ID, secret presence, consent and reconnect status |
| `PUT /api/microsoft` | Save `clientId` and `clientSecret` from the configured browser origin |
| `POST /api/microsoft/connect` | Start delegated OAuth and return the Microsoft sign-in URL |
| `GET /api/microsoft/callback` | Exchange an authorization code and return to Microsoft settings |
| `POST /api/microsoft/test` | Check To Do and granted Calendar access with small Microsoft reads |

Secret presence is a boolean. The API does not return the stored secret. See [Microsoft setup](microsoft.md) for scopes, consent and connection recovery.

## To Do

| Method and path | Behaviour |
|---|---|
| `GET /api/lists` | Enrolled lists with current settings and run status |
| `GET /api/list-directory` | Cached directory of unenrolled lists and discovery status |
| `POST /api/list-directory/refresh` | Queue directory discovery |
| `GET /api/lists/:id` | List identity, settings and run status |
| `POST /api/lists/:id/enroll` | Enroll an available list with automation off |
| `PUT /api/lists/:id` | Save `mode`, `profileId`, `autoCleanup`, `syncMinutes` and optional `capitalizeItems`. Title changes queue a background run. |
| `POST /api/lists/:id/unenroll` | Restore tracked prefixes and remove enrollment and local settings |
| `GET /api/lists/:id/items` | Cached open and completed items with synced titles and timestamp |
| `POST /api/lists/:id/refresh` | Refresh an item snapshot from Microsoft |
| `POST /api/lists/:id/sync` | Run the list now, including configured actions for enrolled lists |
| `GET /api/lists/:id/activity` | Recent activity for the list |
| `GET /api/lists/:id/duplicates` | Cached duplicate candidates, proposed keepers and review flags |
| `POST /api/lists/:id/duplicates/remove` | Revalidate and remove the supplied `proposed` copies. Set `background: true` to return 202 and poll progress. |
| `GET /api/lists/:id/duplicates/progress` | Current or most recent manual run result for this process |
| `GET /api/polling`, `PUT /api/polling` | Read the allowed intervals or save the default `minutes` |
| `GET /api/grouping-profiles` | Profiles, usage counts and revisions |
| `PUT /api/grouping-profiles/:id` | Save or create a profile. Use `new` to create one. |
| `GET /api/lists/:id/items/:taskId/group` | Current match and shared profile revision |
| `PUT /api/lists/:id/items/:taskId/group` | Save a shared match with the returned `name`, `profileId`, `revision` and target `group` |

The general JSON limit is 16 KiB. Duplicate removal accepts up to 512 KiB and returns 413 for an oversized body. Per-list writes can return 409 when a conflicting operation is active. Grouping edits check the submitted revision to catch stale drafts. [To Do](todo.md) · [Sync](sync.md)

## Calendar

| Method and path | Behaviour |
|---|---|
| `GET /api/calendar-feeds` | Local calendars, feeds and refresh status |
| `GET /api/calendar-feeds/settings`, `PUT /api/calendar-feeds/settings` | Read or update refresh and feed date-window defaults |
| `GET /api/calendar-feeds/view?month=YYYY-MM&calendar=ID` | Cached events for the requested month and calendar IDs. Repeat `calendar` for multiple selections. |
| `POST /api/calendar-feeds` | Create a feed from a name and `calendarIds`, with optional interval and date-window overrides |
| `PUT /api/calendar-feeds/:id` | Update a feed |
| `DELETE /api/calendar-feeds/:id` | Revoke and delete a feed |
| `POST /api/calendar-feeds/refresh` | Queue discovery and a feed refresh |
| `POST /api/calendar-feeds/:id/refresh` | Queue a refresh of the saved feed |
| `GET /calendar-feeds/:token.ics` | Read the subscription snapshot using its bearer URL |

Feed URLs are account-scoped and can be used without a session. Unknown or revoked tokens return 404. A known feed waiting for its first valid snapshot returns 503 with `Retry-After`. [Calendar](calendar.md)
