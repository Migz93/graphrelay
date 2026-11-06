# Mobile Review

Use a disposable browser profile with fixture data for UI checks. See [Testing](../TESTING.md) for the smoke procedure and [Colour Scheme](colour-scheme.md) for shared tokens and control styles.

## Viewports

| Width | What to check |
|---|---|
| 1440 px | Desktop sidebar, dense list and calendar views, settings tabs |
| 820 px | Page headers and action groups wrap cleanly |
| 768 and 767 px | Desktop sidebar and settings tabs switch to the mobile drawer and section selector |
| 390 and 375 px | Dialogs, forms, long names, feed URLs and grouped list rows stay within the viewport |

## Review Checklist

- Sign in and verify labels, keyboard order, error placement and focused notices.
- Open the sidebar drawer and check focus trapping, Escape, backdrop dismissal and navigation. Check that closed navigation is absent from the keyboard tab order.
- Open List Settings, Duplicates and the item group editor. Verify scrolling, focus restoration, responsive action rows and completion feedback.
- Check Settings tabs and the grouping editor. On mobile, confirm the group selector and the alternate move and reorder controls are available.
- Check Calendar visibility controls, view navigation and feed settings with long URLs. Keep sample data in screenshots and bug reports.
