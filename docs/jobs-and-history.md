# Jobs And History

This page explains what operators can see while GraphRelay works. See [Sync](sync.md) for scheduler internals.

## Background Jobs

| Job | Trigger | Where to check |
|---|---|---|
| To Do list discovery | Default To Do interval | **To Do → Unenrolled Lists** |
| List snapshot and enrolled actions | Default or per-list interval, **Sync Now**, or queued title changes | List detail and **View Activity** |
| Manual duplicate removal | Confirm removal from **Duplicates** | Progress and totals in the duplicate dialog |
| Calendar discovery | Global interval or **Refresh Calendars** | **Calendar → Feeds** |
| Feed snapshot | Global or per-feed interval, or a manual refresh | Feed row and feed settings |
| Calendar event snapshot | Browsing a stale or missing calendar month | **Calendar → Events** |

## Run Status

**Saved** means local settings were persisted. A list title change can still be queued. **Synced** means the manual list sync returned successfully. List items and calendar pages show local snapshots while background work runs.

List activity includes title changes and duplicate removals, along with run errors. Duplicate removal progress remains available if you close and reopen the dialog. The progress record is per list and in memory. A server restart loses that progress, while removals already accepted by Microsoft remain applied.

## Dashboard Attention

The red Microsoft alert indicates that GraphRelay detected an authorization problem that can require reconnecting. Temporary service failures and individual list or feed errors use the existing sync notices. Follow the alert to **Settings → Microsoft** to test or reconnect. [Microsoft setup](microsoft.md)

## Retention And Recovery

See [Maintenance](maintenance.md) for activity retention, cache expiry, interrupted cleanup and unenrollment recovery.
