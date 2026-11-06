# GraphRelay

<img src="./public/graphrelay-logo.svg" alt="GraphRelay logo" width="96" />

[![GitHub Activity][commits-shield]][commits]
[![License][license-shield]][license]
[![Project Maintainer][maintainer-shield]][user-profile]
[![Buy me a coffee][coffee-shield]][coffee]

GraphRelay helps you organize Microsoft To Do lists and share Outlook calendars from an app you run yourself. Group a shared shopping list by aisle, clean up duplicate tasks, or follow several Outlook calendars through one subscription link.

## What GraphRelay Does

- **Microsoft To Do**. Put things that belong together next to each other, such as produce, frozen food and pantry items. Choose which lists GraphRelay manages.
- **Outlook Calendar**. See events from several calendars in one view, or combine them into a single link you can add to another calendar app.

## Preview

### Dashboard

See what’s coming up, what’s left on the lists you manage, and whether anything needs attention.

![GraphRelay dashboard with sample events and lists](./docs/assets/dashboard.png)

### To Do

See your list as it appears in Microsoft To Do, or turn on group headings to browse it by aisle.

![A sample GraphRelay shopping list](./docs/assets/todo.png)

### Calendar

Tick the calendars you want to see together, or switch to **Feeds** to manage your subscription links.

![GraphRelay calendar with sample events](./docs/assets/calendar.png)

## Key Features

- Start with the built-in grocery groups or make your own. Choose named labels like `03 Frozen` or number-only labels like `03`.
- Preview duplicate tasks and see which copy will be kept before removing anything. You can also turn on automatic cleanup for selected lists.
- Choose how often GraphRelay checks each list, or select **Sync Now** to update it immediately.
- Decide which calendars go into each subscription, how often GraphRelay refreshes it, and how far back and ahead it includes events.

## How It Works

**For a shared shopping list**, pick the list in GraphRelay and turn on grouping. Everyone can keep adding and checking off items in Microsoft To Do as usual. GraphRelay checks the list in the background and adds labels so things like peas and ice cream sit together when the list is sorted alphabetically. If an item lands in the wrong aisle, change its group in GraphRelay and GraphRelay remembers that choice for lists using the same grouping profile.

**For calendars**, choose the Outlook calendars you want in a feed and copy its subscription link into your calendar app. For example, you can combine your personal and family calendars into one subscription. GraphRelay keeps the feed up to date as events change in Outlook.

## Quick Start

### Requirements

- A computer or server running Docker.
- A Microsoft account with access to the lists and calendars you want to use.
- A Microsoft Entra app registration. GraphRelay walks you through creating it during setup.

### Docker

Build from the checkout while GraphRelay is in early development.

```bash
docker build -t graphrelay:local .
docker run -d \
  --name graphrelay \
  --network bridge \
  -p 127.0.0.1:9304:9304 \
  -v graphrelay-config:/config \
  --restart unless-stopped \
  graphrelay:local
```

Open `http://localhost:9304` on the Docker host or use an SSH tunnel from your browser.

### Docker Compose

The [Compose file](docker-compose.yml) uses the development image from GitHub. If you built the image yourself using the command above, set the service image to `graphrelay:local`.

```bash
sudo install -d -m 0700 -o 1000 -g 1000 /opt/graphrelay
docker compose up -d
```

### Configuration

Keep the `/config` volume when you update GraphRelay so it retains your account setup, lists and feeds. See [Deployment](docs/deployment.md) for changing the port, storage location or browser address.

### First Setup

1. Create a local admin username and password.
2. Choose **Set Up Microsoft** to open the checklist, or choose **Later** and return via **Settings → Microsoft**.
3. Follow the checklist to register the app in Entra and connect your Microsoft account. Microsoft asks for To Do and Calendar access together. [Microsoft setup](docs/microsoft.md)
4. Open **To Do** and enroll a list to set up grouping or automatic cleanup. Open **Calendar → Feeds** to create a subscription.

## Important Limitations

### To Do Sorting

For groups to appear together in Microsoft To Do, set the list to **Alphabetical** on each device. [To Do](docs/todo.md)

### Calendar Subscriptions

Anyone who has the subscription link and can reach GraphRelay can read the events in that feed. Your calendar app decides how often it checks the link for updates. [Calendar](docs/calendar.md)

### Early Development

GraphRelay is in early development. Preserve your configuration volume when updating.

## Contributing

See [Contributing](CONTRIBUTING.md), [Testing](TESTING.md), and the [technical docs index](docs/README.md). Use the [Security Policy](SECURITY.md) for vulnerability reports.

## AI Transparency

GraphRelay was developed with Codex assistance and hands-on direction from its maintainer.

## Credits And Inspiration

GraphRelay shares design and development conventions with [Hubarr](https://github.com/Migz93/hubarr), [ShelfBridge](https://github.com/Migz93/shelfbridge), and [Pacearr](https://github.com/Migz93/pacearr).

[coffee]: https://www.buymeacoffee.com/Migz93
[coffee-shield]: https://img.shields.io/badge/buy%20me%20a%20coffee-donate-yellow.svg?style=for-the-badge
[commits-shield]: https://img.shields.io/github/commit-activity/y/Migz93/graphrelay.svg?style=for-the-badge
[commits]: https://github.com/Migz93/graphrelay/commits/main
[license]: ./LICENSE
[license-shield]: https://img.shields.io/badge/license-GPL--3.0-blue?style=for-the-badge
[maintainer-shield]: https://img.shields.io/badge/maintainer-Migz93-blue.svg?style=for-the-badge
[user-profile]: https://github.com/Migz93
