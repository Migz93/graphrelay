# GraphRelay

GraphRelay is a self-hosted companion for Microsoft To Do and Outlook Calendar. Use Microsoft’s apps day to day, and let GraphRelay organize shared lists and publish calendar subscriptions in the background.

## What GraphRelay Does

- **To Do** groups enrolled lists with sortable title prefixes and can capitalize item names. It previews and removes duplicates on demand or, when enabled, automatically.
- **Calendar** shows events from selected calendars and can publish one or more source calendars as an iCalendar subscription.
- **Dashboard** shows counts for lists and calendars, upcoming events, open items in enrolled lists, and sync issues.

## How It Works

Connect one Microsoft account from GraphRelay’s web UI. Background jobs keep local copies of lists and calendars, so the web UI can show the last available data. The Microsoft To Do app still handles list sharing and checking off items.

## Quick Start

1. Run GraphRelay in Docker with a writable volume mounted at `/config`. The app listens on port `9304`. See [Deployment](docs/deployment.md) for Docker and Compose examples.
2. Open the app and create an admin password. If you use an HTTPS hostname, set **Public URL** in **Settings → General → Network** first.
3. Register an app in Microsoft Entra, save its client ID and secret value in GraphRelay, then select **Connect Microsoft**. See [Microsoft setup](docs/microsoft.md).

## To Do

Open **To Do** and choose a list. You can view it or run a one-time duplicate cleanup before enrolling it. To automate a list, select **Enroll List**, confirm, then choose the actions you want in **List Settings**.

Set Microsoft To Do to **Alphabetical** on each device if you enable grouping. GraphRelay changes title prefixes to control that order. Select an open item in GraphRelay to change its group in the shared profile. [To Do guide](docs/todo.md)

## Calendar

Enable **Calendar Access** in Microsoft Connection settings. Open **Calendar → Events** to browse events or **Calendar → Feeds** to create and copy an iCalendar subscription link. Anyone with the link and network access to GraphRelay can read that feed. [Calendar guide](docs/calendar.md)

## Contributing

Start with [Contributing](CONTRIBUTING.md), [Testing](TESTING.md), or the [technical docs index](docs/README.md). Report vulnerabilities privately as described in the [Security Policy](SECURITY.md).
