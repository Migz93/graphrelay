import type Database from "better-sqlite3";
import { Router } from "express";

export type ViewCalendar = { id: string; name: string; groupId?: string | null };
export type ViewEvent = { id: string; title: string; start: string; end: string; allDay: boolean; location?: string };
type Snapshot = { events: string | null; attempted_at: number; error: number };

export function createCalendarView(db: Database.Database, options: {
  account: () => string | undefined;
  calendars: (account: string) => ViewCalendar[];
  intervalMinutes: () => number;
  events: (calendar: ViewCalendar, start: Date, end: Date) => Promise<ViewEvent[]>;
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_view_snapshots (
      account TEXT NOT NULL, calendar_id TEXT NOT NULL, month TEXT NOT NULL, events TEXT,
      attempted_at INTEGER NOT NULL, error INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (account, calendar_id, month)
    );
  `);
  const router = Router();
  const snapshot = db.prepare("SELECT events, attempted_at, error FROM calendar_view_snapshots WHERE account = ? AND calendar_id = ? AND month = ?");
  const recent = db.prepare("SELECT month FROM calendar_view_snapshots WHERE account = ? AND calendar_id = ? ORDER BY attempted_at DESC, month DESC");
  const save = db.prepare(`
    INSERT INTO calendar_view_snapshots (account, calendar_id, month, events, attempted_at, error)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (account, calendar_id, month) DO UPDATE SET
      events = COALESCE(excluded.events, calendar_view_snapshots.events), attempted_at = excluded.attempted_at, error = excluded.error
  `);
  const prune = db.prepare(`
    DELETE FROM calendar_view_snapshots WHERE account = ? AND calendar_id = ? AND month NOT IN (
      SELECT month FROM calendar_view_snapshots WHERE account = ? AND calendar_id = ?
      ORDER BY month IN (?, ?, ?) DESC, attempted_at DESC, month DESC LIMIT 6
    )
  `);
  const pending = new Map<string, Promise<void>>();
  let queue = Promise.resolve();

  function nearbyMonths() {
    const now = new Date();
    return [-1, 0, 1].map(offset => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      return date.toISOString().slice(0, 7);
    });
  }

  function monthsToRefresh(account: string, calendar: ViewCalendar) {
    const nearby = nearbyMonths();
    const visited = (recent.all(account, calendar.id) as { month: string }[])
      .map(row => row.month).filter(month => !nearby.includes(month)).slice(0, 3);
    return [...nearby, ...visited];
  }

  function refreshMonth(account: string, calendar: ViewCalendar, month: string) {
    const key = JSON.stringify([account, calendar.id, month]);
    const current = pending.get(key);
    if (current) return current;
    const [year, number] = month.split("-").map(Number);
    // Include adjacent months for the days shown at the edges of month and week views.
    const start = new Date(Date.UTC(year, number - 2, 1));
    const end = new Date(Date.UTC(year, number + 1, 1));
    const work = queue.then(async () => {
      if (options.account() !== account) return;
      let events: ViewEvent[] | undefined;
      try {
        events = await options.events(calendar, start, end);
      } catch {
        // Keep the last good snapshot and retry on the regular schedule.
      }
      if (options.account() !== account) return;
      save.run(account, calendar.id, month, events ? JSON.stringify(events) : null, Date.now(), events ? 0 : 1);
      prune.run(account, calendar.id, account, calendar.id, ...nearbyMonths());
    }).catch(() => undefined).finally(() => { pending.delete(key); });
    pending.set(key, work);
    queue = work;
    return work;
  }

  function nextDue(account: string) {
    let due = Infinity;
    for (const calendar of options.calendars(account)) {
      for (const month of monthsToRefresh(account, calendar)) {
        if (pending.has(JSON.stringify([account, calendar.id, month]))) continue;
        const row = snapshot.get(account, calendar.id, month) as Snapshot | undefined;
        due = Math.min(due, row ? row.attempted_at + options.intervalMinutes() * 60_000 : 0);
      }
    }
    return due;
  }

  async function refresh(force = false) {
    const account = options.account();
    if (!account) return;
    const cutoff = Date.now() - options.intervalMinutes() * 60_000;
    const work: Promise<void>[] = [];
    for (const calendar of options.calendars(account)) {
      for (const month of monthsToRefresh(account, calendar)) {
        const row = snapshot.get(account, calendar.id, month) as Snapshot | undefined;
        if (force || !row || row.attempted_at <= cutoff) work.push(refreshMonth(account, calendar, month));
      }
    }
    await Promise.all(work);
  }

  router.get("/", (req, res) => {
    const account = options.account();
    if (!account) { res.status(409).json({ error: "Connect Microsoft in Settings to grant Calendar access." }); return; }
    const month = req.query.month;
    if (typeof month !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
      res.status(400).json({ error: "Choose a valid calendar month." });
      return;
    }
    const ids = new Set(typeof req.query.calendar === "string" ? [req.query.calendar] : Array.isArray(req.query.calendar) ? req.query.calendar : []);
    const events: (ViewEvent & { calendarId: string })[] = [];
    const failed: string[] = [];
    let refreshing = false;
    for (const calendar of options.calendars(account)) {
      if (!ids.has(calendar.id)) continue;
      const row = snapshot.get(account, calendar.id, month) as Snapshot | undefined;
      const key = JSON.stringify([account, calendar.id, month]);
      // Scheduled refreshes keep cached months fresh. Only a never-cached month needs an initial fetch.
      if (!row) void refreshMonth(account, calendar, month);
      if (row?.events) {
        for (const event of JSON.parse(row.events) as ViewEvent[]) events.push({ ...event, calendarId: calendar.id });
      }
      if (pending.has(key)) refreshing = true;
      else if (row?.error) failed.push(calendar.name);
    }
    res.json({ events, refreshing, failed });
  });
  return { router, refresh, nextDue };
}
