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
  const save = db.prepare(`
    INSERT INTO calendar_view_snapshots (account, calendar_id, month, events, attempted_at, error)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (account, calendar_id, month) DO UPDATE SET
      events = COALESCE(excluded.events, calendar_view_snapshots.events), attempted_at = excluded.attempted_at, error = excluded.error
  `);
  const prune = db.prepare(`
    DELETE FROM calendar_view_snapshots WHERE account = ? AND calendar_id = ? AND month NOT IN (
      SELECT month FROM calendar_view_snapshots WHERE account = ? AND calendar_id = ? ORDER BY attempted_at DESC LIMIT 6
    )
  `);
  const pending = new Set<string>();
  let queue = Promise.resolve();

  function refresh(account: string, calendar: ViewCalendar, month: string, start: Date, end: Date, key: string) {
    if (pending.has(key)) return;
    pending.add(key);
    queue = queue.then(async () => {
      if (options.account() !== account) return;
      let events: ViewEvent[] | undefined;
      try {
        events = await options.events(calendar, start, end);
      } catch {
        // Keep the last good snapshot for this calendar and window.
      }
      if (options.account() !== account) return;
      save.run(account, calendar.id, month, events ? JSON.stringify(events) : null, Date.now(), events ? 0 : 1);
      prune.run(account, calendar.id, account, calendar.id);
    }).catch(() => undefined).finally(() => { pending.delete(key); });
  }

  router.get("/", (req, res) => {
    const account = options.account();
    if (!account) { res.status(409).json({ error: "Enable Calendar Access in Microsoft settings first." }); return; }
    const month = req.query.month;
    if (typeof month !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
      res.status(400).json({ error: "Choose a valid calendar month." });
      return;
    }
    const ids = new Set(typeof req.query.calendar === "string" ? [req.query.calendar] : Array.isArray(req.query.calendar) ? req.query.calendar : []);
    const [year, number] = month.split("-").map(Number);
    // Include the adjacent months so navigation within this month reuses one snapshot.
    const start = new Date(Date.UTC(year, number - 2, 1));
    const end = new Date(Date.UTC(year, number + 1, 1));
    const events: (ViewEvent & { calendarId: string })[] = [];
    const failed: string[] = [];
    let refreshing = false;
    const cutoff = Date.now() - options.intervalMinutes() * 60_000;
    for (const calendar of options.calendars(account)) {
      if (!ids.has(calendar.id)) continue;
      const row = snapshot.get(account, calendar.id, month) as Snapshot | undefined;
      const key = JSON.stringify([account, calendar.id, month]);
      if (!row || row.attempted_at <= cutoff) refresh(account, calendar, month, start, end, key);
      if (row?.events) {
        for (const event of JSON.parse(row.events) as ViewEvent[]) events.push({ ...event, calendarId: calendar.id });
      }
      if (pending.has(key)) refreshing = true;
      else if (row?.error) failed.push(calendar.name);
    }
    res.json({ events, refreshing, failed });
  });
  return router;
}
