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
| Calendar Events | Requested month and visible calendars, with the global Calendar interval as the freshness threshold | Browse the calendar view |

## To Do Polling

The default is 1 minute. Supported choices are 1, 2, 5, 10, 30 and 60 minutes. The scheduler works from the connected account’s cached directory plus enrolled list IDs. It skips lists already busy or pending unenrollment. On startup and Microsoft reconnect, polling can repopulate local snapshots.

An enrolled run plans prefixes and capitalization for open tasks, checks a task’s current title and status before updating it, optionally runs automatic duplicate cleanup, then saves the latest items and duplicate preview. It records errors and backs off until the next scheduled attempt. Before a title write, GraphRelay records the proposed title so a later run can recover tracking if Microsoft accepted the change and the process stopped before recording success.

An unenrolled run fetches a snapshot. Manual duplicate removal is available separately with explicit confirmation.

## Calendar Refresh

Discovery reads accessible calendars and calendar groups. Feed refreshes request the configured window from each source, assemble iCalendar and publish the resulting snapshot in one database update. Account and feed revision checks keep an older refresh from publishing over newer settings. Requests for a feed already refreshing are coalesced.

Events use snapshots keyed by account, calendar and month. A snapshot includes adjacent months for navigation. Missing or stale snapshots queue a refresh. The response can show the last good events while a refresh runs or after an error. The iCalendar route serves its stored content without a Microsoft request from the subscribing client.

## UI Freshness

To Do list pages refresh their local item snapshots periodically. The Calendar view queues and checks background refreshes as you navigate or change visible calendars. The dashboard reads the cached lists and calendar summaries. A button’s green confirmation describes the action that succeeded. Background sync errors stay visible separately.
