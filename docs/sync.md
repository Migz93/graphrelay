# Sync Architecture

## Job Model

GraphRelay polls Microsoft Graph. To Do and Calendar have independent schedules. Web pages read persisted snapshots and show their freshness or errors.

| Job | Schedule | Manual entry point |
|---|---|---|
| To Do directory | Global To Do interval | Directory refresh |
| Enrolled list | Per-list interval or global default | **Sync Now** |
| Unenrolled list | Global To Do interval | **Sync Now** |
| Calendar directory | Global Calendar interval | **Refresh Calendars** |
| Calendar feed | Per-feed interval or global default | **Refresh Now** or **Refresh Calendars** |
| Calendar Events | Global Calendar interval, for all discovered calendars | **Refresh Calendars**, with initial fetches for uncached months |

## To Do Polling

The default is 1 minute. Supported choices are 1, 2, 5, 10, 30 and 60 minutes. The scheduler works from the connected account’s cached directory plus enrolled list IDs. It skips lists already busy or pending unenrollment. On startup and Microsoft reconnect, polling can repopulate local snapshots.

An enrolled run plans prefixes and capitalization for open tasks, checks a task’s current title and status before updating it, optionally runs automatic duplicate cleanup, then saves the latest items and duplicate preview. It records errors and backs off until the next scheduled attempt. Before a title write, GraphRelay records the proposed title so a later run can recover tracking if Microsoft accepted the change and the process stopped before recording success.

Saving list settings persists them immediately. Changes to grouping or capitalization queue a title update, which waits for active list work and uses the latest saved settings. The queue survives a restart. A run triggered only by a settings save leaves the normal duplicate cleanup schedule in place.

An unenrolled run fetches a snapshot. Manual duplicate removal is available separately with explicit confirmation.

## Calendar Refresh

Discovery reads accessible calendars and calendar groups. Feed refreshes request the configured window from each source, assemble iCalendar and publish the resulting snapshot in one database update. Account and feed revision checks keep an older refresh from publishing over newer settings. Requests for a feed already refreshing are coalesced.

Events use snapshots keyed by account, calendar and month. The background scheduler refreshes every discovered calendar, including calendars hidden in the browser or unused by a feed. It warms the current UTC month and the previous and next months at startup and follows the global Calendar interval, including retries after failures. Up to three other recently viewed months join the same schedule. Each snapshot includes adjacent months for navigation, and retention protects the three nearby months within a six-month limit per calendar. Cached page reads use SQLite even when a snapshot is stale. Browsing a never-cached month queues its initial fetch. The response can show the last good events while a refresh runs or after an error. The iCalendar route serves its stored content without a Microsoft request from the subscribing client.

## UI Freshness

To Do list pages refresh their local item snapshots periodically. The Calendar view checks local snapshots while the independent scheduler keeps them fresh. Navigating to a never-cached month queues its first fetch. The dashboard reads the cached lists and calendar summaries. A button’s green confirmation describes the action that succeeded. Background sync errors stay visible separately.
