import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { Router } from "express";
import ical from "ical-generator";
import { findIana } from "windows-iana";
import { createCalendarView, type ViewEvent } from "./calendar-view.js";

type Calendar = { id: string; name: string; groupId?: string | null };
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
  sources: string;
  name: string;
  token: string;
  synced_at: string | null;
  error: string | null;
  interval_minutes: number | null;
  past_days: number | null;
  future_days: number | null;
  revision: number;
};
type CalendarDefaults = { intervalMinutes: number; pastDays: number; futureDays: number };

const day = 86_400_000;
const minute = 60_000;
const intervals = [15, 30, 60, 120, 180, 360];
const maxDays = 3650;
const validDays = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maxDays;

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

function eventTimes(event: CalendarEvent) {
  const start = eventDate(event.start);
  const end = eventDate(event.end);
  return {
    start: event.isAllDay ? allDayDate(start, event.originalStartTimeZone) : start,
    end: event.isAllDay ? allDayDate(end, event.originalEndTimeZone ?? event.originalStartTimeZone) : end,
  };
}

export function renderCalendarFeed(name: string, events: CalendarEvent[]) {
  const calendar = ical({ name, prodId: "//GraphRelay//Calendar Feeds//EN" });
  const seen = new Set<string>();
  for (const event of events) {
    if (event.isCancelled || seen.has(event.id)) continue;
    calendar.createEvent({
      id: createHash("sha256").update(event.id).digest("hex") + "@graphrelay",
      ...eventTimes(event),
      allDay: event.isAllDay,
      summary: event.subject || "Untitled Event",
      description: event.bodyPreview,
      location: event.location?.displayName,
    });
    seen.add(event.id);
  }
  return calendar.toString();
}

export function isCalendarGraphRead(url: URL, method: string) {
  // Graph pagination can address calendars using OData keys: calendars('id').
  return method === "GET" && url.origin === "https://graph.microsoft.com"
    && /^\/v1\.0\/me\/(?:calendars|calendarGroups)(?:\((?:'|%27)[^/]+(?:'|%27)\))?(?:\/|$)/.test(url.pathname);
}

function calendarPath(id: string, groupId?: string | null) {
  const parent = groupId ? "me/calendarGroups/" + encodeURIComponent(groupId) + "/calendars/" : "me/calendars/";
  return parent + encodeURIComponent(id);
}

export function createCalendarFeeds(db: Database.Database, options: {
  account: () => string | undefined;
  collection: <T>(path: string) => Promise<T[]>;
}) {
  const feedSchema = `
    CREATE TABLE IF NOT EXISTS calendar_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, sources TEXT NOT NULL, name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE, ics TEXT, synced_at TEXT, error TEXT, interval_minutes INTEGER,
      past_days INTEGER, future_days INTEGER, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS calendar_feeds_account ON calendar_feeds(account);
  `;
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_directory (account TEXT PRIMARY KEY, calendars TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS calendar_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), interval_minutes INTEGER NOT NULL, past_days INTEGER NOT NULL, future_days INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO calendar_settings VALUES (1, 120, 30, 365);
    `);
    const columns = db.pragma("table_info(calendar_feeds)") as { name: string }[];
    const legacy = columns.some(column => column.name === "calendar_id");
    if (legacy) db.exec("ALTER TABLE calendar_feeds RENAME TO calendar_feeds_legacy");
    db.exec(feedSchema);
    if (legacy) db.exec(`
      INSERT INTO calendar_feeds (id, account, sources, name, token, ics, synced_at, error)
      SELECT id, account, json_array(json_object('id', calendar_id, 'name', name, 'groupId', group_id)), name, token, ics, synced_at, error
      FROM calendar_feeds_legacy;
      DROP TABLE calendar_feeds_legacy;
    `);
  })();
  const admin = Router();
  const subscription = Router();
  const feedFields = "id, account, sources, name, token, synced_at, error, interval_minutes, past_days, future_days, revision";
  const feedList = db.prepare("SELECT " + feedFields + " FROM calendar_feeds WHERE account = ? ORDER BY name");
  const feedById = db.prepare("SELECT " + feedFields + " FROM calendar_feeds WHERE id = ? AND account = ?");
  const directory = db.prepare("SELECT calendars FROM calendar_directory WHERE account = ?");
  const readDefaults = db.prepare("SELECT interval_minutes AS intervalMinutes, past_days AS pastDays, future_days AS futureDays FROM calendar_settings WHERE id = 1");
  const defaults = () => readDefaults.get() as CalendarDefaults;
  const directoryErrors = new Map<string, string>();
  const refreshes = new Map<string, Promise<void>>();
  const refreshingFeeds = new Set<string>();
  const directoryAttempts = new Map<string, number>();
  const feedAttempts = new Map<string, { at: number; revision: number }>();
  let timer: NodeJS.Timeout | undefined;

  const localCalendars = (account: string) => JSON.parse((directory.get(account) as { calendars: string } | undefined)?.calendars ?? "[]") as Calendar[];
  const feeds = (account: string) => feedList.all(account) as Feed[];
  const sources = (feed: Feed) => JSON.parse(feed.sources) as Calendar[];
  const settings = () => ({ ...defaults(), intervals, maxDays });

  function calendarEvents(calendar: Calendar, start: Date, end: Date) {
    const query = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      "$select": "id,subject,start,end,isAllDay,isCancelled,bodyPreview,location,originalStartTimeZone,originalEndTimeZone",
    });
    return options.collection<CalendarEvent>(calendarPath(calendar.id, calendar.groupId) + "/calendarView?" + query);
  }

  admin.use("/view", createCalendarView(db, {
    account: options.account,
    calendars: localCalendars,
    intervalMinutes: () => defaults().intervalMinutes,
    async events(calendar, start, end) {
      const result: ViewEvent[] = [];
      for (const event of await calendarEvents(calendar, start, end)) {
        if (event.isCancelled) continue;
        const times = eventTimes(event);
        if (!Number.isFinite(+times.start) || !Number.isFinite(+times.end)) continue;
        const format = (date: Date) => event.isAllDay ? date.toISOString().slice(0, 10) : date.toISOString();
        result.push({ id: event.id, title: event.subject || "Untitled Event", start: format(times.start),
          end: format(times.end), allDay: !!event.isAllDay, location: event.location?.displayName });
      }
      return result;
    },
  }));

  async function discover(account: string) {
    try {
      const calendars = await options.collection<Calendar>("me/calendars?$select=id,name");
      const unique = new Map(calendars.map(({ id, name }) => [id, { id, name } as Calendar]));
      try {
        const groups = await options.collection<{ id: string }>("me/calendarGroups?$select=id");
        for (const group of groups) {
          try {
            const calendars = await options.collection<Calendar>("me/calendarGroups/" + encodeURIComponent(group.id) + "/calendars?$select=id,name");
            for (const { id, name } of calendars) if (!unique.has(id)) unique.set(id, { id, name, groupId: group.id });
          } catch (error) {
            if (!inaccessibleGroup(error)) throw error;
          }
        }
      } catch (error) {
        if (!inaccessibleGroup(error)) throw error;
      }
      if (options.account() !== account) return;
      db.prepare("INSERT OR REPLACE INTO calendar_directory VALUES (?, ?)").run(account, JSON.stringify([...unique.values()]));
      directoryErrors.delete(account);
    } catch {
      directoryErrors.set(account, "Calendars could not be refreshed. Check the Microsoft connection and try again.");
    } finally {
      directoryAttempts.set(account, Date.now());
    }
  }

  function inaccessibleGroup(error: unknown) {
    return error instanceof Error && /^Microsoft Graph returned (403|404)\.$/.test(error.message);
  }

  async function refreshFeed(feed: Feed, current: CalendarDefaults, known: Map<string, Calendar>) {
    if (refreshingFeeds.has(feed.token)) return;
    refreshingFeeds.add(feed.token);
    try {
      if (options.account() !== feed.account) return;
      const today = Math.floor(Date.now() / day) * day;
      const start = new Date(today - (feed.past_days ?? current.pastDays) * day);
      const end = new Date(today + ((feed.future_days ?? current.futureDays) + 1) * day);
      const events: CalendarEvent[] = [];
      for (const source of sources(feed)) {
        if (options.account() !== feed.account) return;
        const calendar = known.get(source.id) ?? source;
        events.push(...await calendarEvents(calendar, start, end));
      }
      if (options.account() !== feed.account) return;
      db.prepare("UPDATE calendar_feeds SET ics = ?, synced_at = ?, error = NULL WHERE token = ? AND revision = ?")
        .run(renderCalendarFeed(feed.name, events), new Date().toISOString(), feed.token, feed.revision);
    } catch (error) {
      const message = error instanceof Error && /^Microsoft Graph returned [45][0-9]{2}\.$/.test(error.message)
        ? "Feed refresh failed. " + error.message
        : error instanceof Error && error.message === "Invalid Graph URL."
          ? "Feed refresh failed. Microsoft returned a calendar link GraphRelay could not follow."
          : "Feed refresh failed. Try refreshing again.";
      db.prepare("UPDATE calendar_feeds SET error = ? WHERE token = ? AND revision = ?")
        .run(message, feed.token, feed.revision);
    } finally {
      refreshingFeeds.delete(feed.token);
      if (feedById.get(feed.id, feed.account)) feedAttempts.set(feed.token, { at: Date.now(), revision: feed.revision });
    }
  }

  function feedDue(feed: Feed, current: CalendarDefaults) {
    const attempt = feedAttempts.get(feed.token);
    const last = attempt?.revision === feed.revision ? attempt.at : Date.parse(feed.synced_at ?? "") || 0;
    return last + (feed.interval_minutes ?? current.intervalMinutes) * minute;
  }

  function directoryDue(account: string, current: CalendarDefaults) {
    return (directoryAttempts.get(account) ?? 0) + current.intervalMinutes * minute;
  }

  function schedule() {
    clearTimeout(timer);
    const account = options.account();
    if (!account || refreshes.has(account)) return;
    const current = defaults();
    const due = feeds(account).filter(feed => !refreshingFeeds.has(feed.token))
      .reduce((earliest, feed) => Math.min(earliest, feedDue(feed, current)), directoryDue(account, current));
    timer = setTimeout(() => void refresh(false), Math.max(0, due - Date.now())).unref();
  }

  function refresh(force = true) {
    const account = options.account();
    if (!account) return Promise.resolve();
    const current = refreshes.get(account);
    if (current) return current;
    const pending = (async () => {
      if (force || directoryDue(account, defaults()) <= Date.now()) await discover(account);
      if (options.account() !== account) return;
      const known = new Map(localCalendars(account).map(calendar => [calendar.id, calendar]));
      for (const { id } of feeds(account)) {
        const feed = feedById.get(id, account) as Feed | undefined;
        const current = defaults();
        if (feed && (force || feedDue(feed, current) <= Date.now())) await refreshFeed(feed, current, known);
      }
    })().finally(() => {
      refreshes.delete(account);
      schedule();
    });
    refreshes.set(account, pending);
    return pending;
  }

  admin.get("/settings", (_req, res) => { res.json(settings()); });
  admin.put("/settings", (req, res) => {
    const current = defaults();
    const { intervalMinutes = current.intervalMinutes, pastDays = current.pastDays, futureDays = current.futureDays } = req.body ?? {};
    if (!intervals.includes(intervalMinutes) || !validDays(pastDays) || !validDays(futureDays)) {
      res.status(400).json({ error: "Choose a refresh interval and enter whole day counts from 0 to " + maxDays + "." });
      return;
    }
    db.transaction(() => {
      db.prepare("UPDATE calendar_settings SET interval_minutes = ?, past_days = ?, future_days = ? WHERE id = 1").run(intervalMinutes, pastDays, futureDays);
      db.prepare(`
        UPDATE calendar_feeds SET ics = NULL, synced_at = NULL, error = NULL, revision = revision + 1
        WHERE (? AND past_days IS NULL) OR (? AND future_days IS NULL)
      `).run(Number(pastDays !== current.pastDays), Number(futureDays !== current.futureDays));
    })();
    schedule();
    res.json(settings());
  });

  admin.get("/", (_req, res) => {
    const account = options.account();
    res.json({
      connected: !!account,
      refreshing: !!account && refreshes.has(account),
      error: account ? directoryErrors.get(account) : undefined,
      settings: settings(),
      calendars: account ? localCalendars(account) : [],
      feeds: account ? feeds(account).map(feed => ({
        id: feed.id, sources: sources(feed), name: feed.name, path: "/calendar-feeds/" + feed.token + ".ics",
        syncedAt: feed.synced_at, error: feed.error, refreshing: refreshingFeeds.has(feed.token),
        intervalMinutes: feed.interval_minutes, pastDays: feed.past_days, futureDays: feed.future_days,
      })) : [],
    });
  });
  admin.post("/refresh", (_req, res) => {
    if (!options.account()) { res.status(409).json({ error: "Enable Calendar Access in Microsoft settings first." }); return; }
    void refresh();
    res.status(202).json({ refreshing: true });
  });

  admin.post("/:id/refresh", (req, res) => {
    const account = options.account();
    if (!account) { res.status(409).json({ error: "Enable Calendar Access in Microsoft settings first." }); return; }
    const feed = feedById.get(req.params.id, account) as Feed | undefined;
    if (!feed) { res.sendStatus(404); return; }
    if (!refreshingFeeds.has(feed.token)) {
      const known = new Map(localCalendars(account).map(calendar => [calendar.id, calendar]));
      void refreshFeed(feed, defaults(), known).finally(schedule).catch(() => undefined);
    }
    res.status(202).json({ refreshing: true });
  });

  function draft(body: { name?: unknown; calendarIds?: unknown; intervalMinutes?: unknown; pastDays?: unknown; futureDays?: unknown }, account: string, existing?: Feed) {
    const { name, calendarIds, intervalMinutes = null, pastDays = null, futureDays = null } = body;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 100 || !Array.isArray(calendarIds)
      || !calendarIds.length || calendarIds.some(id => typeof id !== "string")
      || (intervalMinutes !== null && (typeof intervalMinutes !== "number" || !intervals.includes(intervalMinutes)))
      || (pastDays !== null && !validDays(pastDays)) || (futureDays !== null && !validDays(futureDays))) return;
    const known = new Map([...(existing ? sources(existing) : []), ...localCalendars(account)].map(calendar => [calendar.id, calendar]));
    const selected = [...new Set(calendarIds)].map(id => known.get(id));
    if (selected.some(calendar => !calendar)) return;
    return { name: name.trim(), selected: selected as Calendar[], intervalMinutes, pastDays, futureDays };
  }

  const draftError = "Enter a feed name, select at least one calendar, and use valid refresh and day settings.";
  admin.post("/", (req, res) => {
    const account = options.account();
    if (!account) { res.status(409).json({ error: "Enable Calendar Access in Microsoft settings first." }); return; }
    // Accept the original one-calendar create request as well as a named feed.
    const legacy = req.body?.calendarId && localCalendars(account).find(calendar => calendar.id === req.body.calendarId);
    const input = draft(legacy ? { name: legacy.name, calendarIds: [legacy.id] } : req.body ?? {}, account);
    if (!input) { res.status(400).json({ error: draftError }); return; }
    if (legacy && feeds(account).some(feed => sources(feed).length === 1 && sources(feed)[0].id === legacy.id)) {
      res.sendStatus(204);
      return;
    }
    db.prepare(`
      INSERT INTO calendar_feeds (account, sources, name, token, interval_minutes, past_days, future_days) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(account, JSON.stringify(input.selected), input.name, randomBytes(32).toString("hex"), input.intervalMinutes, input.pastDays, input.futureDays);
    schedule();
    res.sendStatus(204);
  });
  admin.put("/:id", (req, res) => {
    const account = options.account();
    const feed = account ? feedById.get(req.params.id, account) as Feed | undefined : undefined;
    if (!account || !feed) { res.sendStatus(404); return; }
    const input = draft(req.body ?? {}, account, feed);
    if (!input) { res.status(400).json({ error: draftError }); return; }
    const current = defaults();
    const oldIds = new Set(sources(feed).map(calendar => calendar.id));
    const sourcesChanged = oldIds.size !== input.selected.length || input.selected.some(calendar => !oldIds.has(calendar.id));
    const windowChanged = (feed.past_days ?? current.pastDays) !== (input.pastDays ?? current.pastDays)
      || (feed.future_days ?? current.futureDays) !== (input.futureDays ?? current.futureDays);
    const invalidate = sourcesChanged || windowChanged;
    const rebuild = invalidate || feed.name !== input.name;
    db.prepare(`
      UPDATE calendar_feeds SET name = ?, sources = ?, interval_minutes = ?, past_days = ?, future_days = ?,
        ics = CASE WHEN ? THEN NULL ELSE ics END,
        synced_at = CASE WHEN ? THEN NULL ELSE synced_at END,
        error = CASE WHEN ? THEN NULL ELSE error END, revision = revision + ?
      WHERE id = ? AND account = ?
    `).run(input.name, JSON.stringify(input.selected), input.intervalMinutes, input.pastDays, input.futureDays,
      Number(invalidate), Number(rebuild), Number(rebuild), Number(rebuild), feed.id, account);
    schedule();
    res.sendStatus(204);
  });
  admin.delete("/:id", (req, res) => {
    const account = options.account();
    const feed = account ? feedById.get(req.params.id, account) as Feed | undefined : undefined;
    if (feed) {
      db.prepare("DELETE FROM calendar_feeds WHERE id = ?").run(feed.id);
      feedAttempts.delete(feed.token);
      schedule();
    }
    res.sendStatus(204);
  });
  subscription.get("/:token.ics", (req, res) => {
    const account = options.account();
    const token = req.params.token;
    const feed = account && /^[a-f0-9]{64}$/.test(token)
      ? db.prepare("SELECT ics FROM calendar_feeds WHERE token = ? AND account = ?").get(token, account) as { ics: string | null } | undefined
      : undefined;
    res.set("Cache-Control", "no-store");
    if (!feed) { res.sendStatus(404); return; }
    if (feed.ics === null) { res.set("Retry-After", "60").status(503).send("Waiting for a calendar sync."); return; }
    res.type("text/calendar; charset=utf-8").send(feed.ics);
  });

  function dashboard() {
    const account = options.account();
    return {
      connected: !!account,
      calendars: account ? localCalendars(account) : [],
      error: account ? directoryErrors.get(account) : undefined,
      failedFeeds: account ? feeds(account).filter(feed => feed.error).map(feed => ({ id: feed.id, name: feed.name })) : [],
    };
  }

  schedule();
  return { admin, subscription, refresh, dashboard };
}
