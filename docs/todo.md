# Microsoft To Do

## List Views And Enrollment

**To Do** shows enrolled and unenrolled lists. All available lists are cached on a schedule. Open a list to view its synced titles in alphabetical order, including any GraphRelay prefixes. Completed items stay in a collapsed section. An unenrolled list can be viewed, refreshed on demand and cleaned up once through **Duplicates**.

Select **Enroll List** from the list and confirm. Enrollment starts with grouping, title capitalization and automatic cleanup off. Use **List Settings → General** for capitalization, automatic cleanup, the sync override and unenrollment. Use **Grouping** for the profile and prefix style. **Save List Settings** stores the settings and keeps the dialog open. Title changes are applied in the background. Set the default polling interval in **Settings → To Do → General**. Enrolled lists can override it. [Sync](sync.md)

## Grouping And Formatting

1. In **List Settings → Grouping**, choose a shared profile and select named or numeric prefixes.
2. Set the list to **Alphabetical** in Microsoft To Do on each device. Named prefixes look like `03 Frozen · Peas`. Number-only prefixes can start at two digits (`14 · Peas`) or three digits (`014 · Peas`). The prefix widens when needed so alphabetical order still works.
3. In GraphRelay, select an open item to change its group. The saved match lives in the shared profile under **Settings → To Do → Groupings**. Every list using it picks up the rule on its next sync. **Sync Now** runs the current list immediately.

The **Groceries** profile is included. You can create other profiles, reorder groups, change matches and enable singular/plural matching per group. Export profiles by copying their JSON files. [Grouping profile files](grouping-profiles.md)

**List Settings → General → Capitalize Each Word** applies to open item names and works with grouping off. **View Activity** shows title changes and duplicate removals. Older per-list group corrections are ignored.

## Duplicate Cleanup

1. Open **Duplicates** to preview groups, the kept copy and the copies proposed for removal.
2. Confirm **Remove Proposed Duplicates**. You can close and reopen the dialog to see progress or final totals during the current server run.
3. For continuous cleanup, enroll the list and enable **Automatic Duplicate Cleanup** in General. It takes effect on the next regular sync or when you select **Sync Now**.

Grouping prefixes added by GraphRelay are excluded from the duplicate key. Matching ignores case and repeated spaces. Names with different quantities or other meaningful text remain distinct. Cleanup prefers an open copy. When all copies are completed it keeps the most recent one. Copies with notes, attachments, checklist steps or an unreadable checklist are skipped. GraphRelay rechecks candidates before deleting and reports removed, skipped and failed counts. [Maintenance](maintenance.md)

## Unenrollment

In **List Settings → General**, select **Unenroll List** and confirm. GraphRelay removes its tracked prefixes from open and completed items before ending automation. If restoration fails partway, list automation pauses until you retry. Successful unenrollment removes the list’s local settings and title tracking. The shared profile stays available to other lists.
