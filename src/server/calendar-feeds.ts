import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { Router } from "express";
import ical from "ical-generator";
import { findIana } from "windows-iana";

type Calendar = { id: string; name: string; groupId?: string };
type DateTime = { dateTime: string; timeZone: string };
type CalendarEvent = {
  id: string;
  subject?: string;
  start: DateTime;
  end: DateTime;
  isAllDay?: boolean;
  originalStartTimeZone?: string;
  originalEndTimeZone?: string;
  isCancelled?: boolean;
  bodyPreview?: string;
  location?: { displayName?: string };
};
type Feed = {
  id: number;
  account: string;
  calendar_id: string;
  group_id: string | null;
  name: string;
  token: string;
  ics: string | null;
  synced_at: string | null;
  error: string | null;
};

const day = 86_400_000;
const refreshInterval = 15 * 60_000;

function eventDate(value: DateTime) {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value.dateTime) ? value.dateTime : value.dateTime + "Z");
}

function allDayDate(date: Date, originalZone?: string) {
  // Some calendars return all-day boundaries as UTC midnight. Otherwise recover the date in the event's original zone.
  if (!originalZone || date.toISOString().slice(11, 19) === "00:00:00") return new Date(date.toISOString().slice(0, 10));
  const timeZone = findIana(originalZone)[0] ?? originalZone;
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    return new Date(part("year") + "-" + part("month") + "-" + part("day"));
  } catch {
    return new Date(date.toISOString().slice(0, 10));
  }
}

export function renderCalendarFeed(name: string, events: CalendarEvent[]) {
  const calendar = ical({ name, prodId: "//GraphRelay//Calendar Feeds//EN" });
  const seen = new Set<string>();
  for (const event of events) {
    if (event.isCancelled || seen.has(event.id)) continue;
    const start = eventDate(event.start);
    const end = eventDate(event.end);
    calendar.createEvent({
      id: createHash("sha256").update(event.id).digest("hex") + "@graphrelay",
      start: event.isAllDay ? allDayDate(start, event.originalStartTimeZone) : start,
      end: event.isAllDay ? allDayDate(end, event.originalEndTimeZone ?? event.originalStartTimeZone) : end,
      allDay: event.isAllDay,
      summary: event.subject || "Untitled Event",
      description: event.bodyPreview,
      location: event.location?.displayName,
    });
    seen.add(event.id);
  }
  return calendar.toString();
}

function calendarPath(id: string, groupId?: string | null) {
  const parent = groupId ? "me/calendarGroups/" + encodeURIComponent(groupId) + "/calendars/" : "me/calendars/";
  return parent + encodeURIComponent(id);
}

export function createCalendarFeeds(db: Database.Database, options: {
  account: () => string | undefined;
  collection: <T>(path: string) => Promise<T[]>;
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_directory (account TEXT PRIMARY KEY, calendars TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS calendar_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, calendar_id TEXT NOT NULL, group_id TEXT, name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE, ics TEXT, synced_at TEXT, error TEXT, UNIQUE(account, calendar_id)
    );
  `);
  const admin = Router();
  const subscription = Router();
  const feedList = db.prepare("SELECT * FROM calendar_feeds WHERE account = ? ORDER BY name");
  const directory = db.prepare("SELECT calendars FROM calendar_directory WHERE account = ?");
  const directoryErrors = new Map<string, string>();
  const refreshes = new Map<string, Promise<void>>();
  const feedRefreshes = new Map<string, Promise<void>>();
  const localCalendars = (account: string) => JSON.parse((directory.get(account) as { calendars: string } | undefined)?.calendars ?? "[]") as Calendar[];
  const feeds = (account: string) => feedList.all(account) as Feed[];

  async function discover(account: string) {
    try {
      const calendars = await options.collection<Calendar>("me/calendars?$select=id,name");
      const unique = new Map(calendars.map(({ id, name }) => [id, { id, name } as Calendar]));
      // Outlook can list additional calendars under groups, including shared family calendars.
      try {
        const groups = await options.collection<{ id: string }>("me/calendarGroups?$select=id");
        for (const group of groups) {
          const calendars = await options.collection<Calendar>("me/calendarGroups/" + encodeURIComponent(group.id) + "/calendars?$select=id,name");
          for (const { id, name } of calendars) if (!unique.has(id)) unique.set(id, { id, name, groupId: group.id });
        }
      } catch (error) {
        if (!(error instanceof Error) || !/^Microsoft Graph returned (403|404)\.$/.test(error.message)) throw error;
      }
      if (options.account() !== account) return;
      db.prepare("INSERT OR REPLACE INTO calendar_directory VALUES (?, ?)").run(account, JSON.stringify([...unique.values()]));
      directoryErrors.delete(account);
    } catch {
      directoryErrors.set(account, "Calendars could not be refreshed. Check the Microsoft connection and try again.");
    }
  }

  function refreshFeed(feed: Feed) {
    const current = feedRefreshes.get(feed.token);
    if (current) return current;
    const pending = (async () => {
      try {
        if (options.account() !== feed.account) return;
        const now = Date.now();
        const query = new URLSearchParams({
          startDateTime: new Date(now - 30 * day).toISOString(),
          endDateTime: new Date(now + 365 * day).toISOString(),
          "$select": "id,subject,start,end,isAllDay,isCancelled,bodyPreview,location,originalStartTimeZone,originalEndTimeZone",
        });
        const events = await options.collection<CalendarEvent>(calendarPath(feed.calendar_id, feed.group_id) + "/calendarView?" + query);
        if (options.account() !== feed.account) return;
        db.prepare("UPDATE calendar_feeds SET ics = ?, synced_at = ?, error = NULL WHERE token = ?")
          .run(renderCalendarFeed(feed.name, events), new Date().toISOString(), feed.token);
      } catch {
        db.prepare("UPDATE calendar_feeds SET error = ? WHERE token = ?")
          .run("Feed refresh failed. The last successful version is kept.", feed.token);
      }
    })().finally(() => { feedRefreshes.delete(feed.token); });
    feedRefreshes.set(feed.token, pending);
    return pending;
  }

  function refresh() {
    const account = options.account();
    if (!account) return Promise.resolve();
    const current = refreshes.get(account);
    if (current) return current;
    const pending = (async () => {
      await discover(account);
      if (options.account() !== account) return;
      for (const feed of feeds(account)) await refreshFeed(feed);
    })().finally(() => { refreshes.delete(account); });
    refreshes.set(account, pending);
    return pending;
  }

  admin.get("/", (_req, res) => {
    const account = options.account();
    res.json({
      connected: !!account,
      refreshing: !!account && refreshes.has(account),
      error: account ? directoryErrors.get(account) : undefined,
      calendars: account ? localCalendars(account) : [],
      feeds: account ? feeds(account).map(feed => ({
        id: feed.id, calendarId: feed.calendar_id, name: feed.name, path: "/calendar-feeds/" + feed.token + ".ics",
        syncedAt: feed.synced_at, error: feed.error, refreshing: feedRefreshes.has(feed.token),
      })) : [],
    });
  });
  admin.post("/refresh", (_req, res) => {
    if (!options.account()) { res.status(409).json({ error: "Enable Calendar Access in Microsoft settings first." }); return; }
    void refresh();
    res.status(202).json({ refreshing: true });
  });
  admin.post("/", (req, res) => {
    const account = options.account();
    if (!account) { res.status(409).json({ error: "Enable Calendar Access in Microsoft settings first." }); return; }
    const calendar = localCalendars(account).find(calendar => calendar.id === req.body?.calendarId);
    if (!calendar) { res.status(404).json({ error: "Refresh calendars before creating this feed." }); return; }
    const token = randomBytes(32).toString("hex");
    const result = db.prepare("INSERT OR IGNORE INTO calendar_feeds (account, calendar_id, group_id, name, token) VALUES (?, ?, ?, ?, ?)")
      .run(account, calendar.id, calendar.groupId ?? null, calendar.name, token);
    if (result.changes) {
      const feed = db.prepare("SELECT * FROM calendar_feeds WHERE token = ?").get(token) as Feed;
      void refreshFeed(feed);
    }
    res.sendStatus(204);
  });
  admin.delete("/:id", (req, res) => {
    const account = options.account();
    if (account) db.prepare("DELETE FROM calendar_feeds WHERE id = ? AND account = ?").run(req.params.id, account);
    res.sendStatus(204);
  });
  subscription.get("/:token.ics", (req, res) => {
    const account = options.account();
    const token = req.params.token;
    const feed = account && /^[a-f0-9]{64}$/.test(token)
      ? db.prepare("SELECT ics FROM calendar_feeds WHERE token = ? AND account = ?").get(token, account) as Pick<Feed, "ics"> | undefined
      : undefined;
    res.set("Cache-Control", "no-store");
    if (!feed) { res.sendStatus(404); return; }
    if (feed.ics === null) { res.set("Retry-After", "60").status(503).send("Waiting for the first calendar sync."); return; }
    res.type("text/calendar; charset=utf-8").send(feed.ics);
  });

  setTimeout(() => void refresh(), 0).unref();
  setInterval(() => void refresh(), refreshInterval).unref();
  return { admin, subscription, refresh };
}
