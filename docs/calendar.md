# Calendar

Open **Calendar → Enable Calendar Access** and consent with the [connected Microsoft account](microsoft.md) before using events or subscription feeds.

## Events View

Open **Calendar → Events** to browse Month, Week, Day or Agenda views. Tick the calendars you want to see. The selection is remembered in that browser and is also used for upcoming events on the dashboard. The Events view reads a local snapshot and queues a background refresh when needed. [Sync](sync.md)

## Subscription Feeds

1. Open **Calendar → Feeds → Create Feed**.
2. Name the feed and choose one or more Microsoft calendars. Calendars in discovered calendar groups can be included.
3. Copy the subscription link and add it to the calendar client that should subscribe.

Open **Settings** on a feed to see its full URL, change sources or overrides, select **Refresh Now**, or revoke the link. **Refresh Calendars** requests a refresh of the directory and all feeds. The calendar client controls how often it polls the link, independently of GraphRelay’s own refresh interval.

| Setting | Default | Where to change it |
|---|---|---|
| Calendar discovery and default feed refresh | 2 hours | **Settings → Calendar → General** |
| Previous days included | 30 | **Settings → Calendar → Feeds** |
| Days ahead included | 365 | **Settings → Calendar → Feeds** |

Refresh options are 15, 30, 60, 120, 180 and 360 minutes. Date ranges accept whole numbers from 0 through 3650. Each feed can override its interval and either day count independently.

## Feed Availability

A subscription URL is a bearer link. Anyone who has it and can reach GraphRelay can read its events without a GraphRelay sign-in. Revoking the link removes the feed. Create a new feed if you need a replacement link.

A refresh error preserves the last successful feed for its current sources and date range. Changing the sources or date range clears the old content while the replacement is built. A feed waiting for its first valid snapshot returns HTTP 503 with `Retry-After`. A revoked or unknown link returns 404.

## Moving From ms-ical

Existing ms-ical subscriptions and settings stay with that app. Create equivalent feeds in GraphRelay, then update each subscriber with its new link.
