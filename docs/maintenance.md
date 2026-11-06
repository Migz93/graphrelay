# Maintenance

## Current Housekeeping Responsibilities

| Area | Behaviour |
|---|---|
| Admin sessions | Expired rows are pruned at startup and when sessions are saved. Logout deletes the current row. |
| To Do activity | The server keeps the latest 200 records per list and returns up to 100 in the activity view. |
| Checklist checks | Duplicate previews can reuse successful checks for up to ten minutes if the task’s modification time is unchanged. Cleanup checks candidates again before deleting. |
| Duplicate progress | The current and most recent manual run are kept in memory per list. The browser can reconnect to progress during that server run. |
| Calendar view snapshots | Keep the six most recently attempted month windows per account and calendar. |
| Subscription feeds | A successful refresh replaces the cached feed. Revoking the link removes the feed row and its cached content. |

## Backup And Restore

Keep a consistent backup of the entire config volume, including SQLite, profile JSON and key material. Stop GraphRelay before making an ordinary file copy or use a SQLite-aware backup for the running database. Protect the backup the same way as the live volume.

Restore with GraphRelay stopped and keep the original key source. Verify ownership and the config mount before starting. Check health, sign-in, existing enrollments and any subscriptions after recovery. Restoring older data may bring back earlier configuration or revoked links from the backup.

## Cleanup And Recovery

Manual duplicate cleanup runs on the server after confirmation. Closing the dialog does not cancel it. A restart stops unfinished work and clears progress. Deletions already accepted by Microsoft remain applied. Refresh the preview before retrying.

To recover an interrupted unenrollment, reopen **List Settings → Enrollment** and retry. GraphRelay pauses automation on that list while restoration is pending.

To reset a disposable installation, stop its container before clearing its data volume. This discards setup, sessions, enrollments, profiles and feed links. Reset a live instance only at the owner’s request.

## Adding New Maintenance Work

Keep background cleanup scoped and safe to retry. Document what expires, when it is removed and which data must be preserved. Validate retention and recovery with disposable data.
