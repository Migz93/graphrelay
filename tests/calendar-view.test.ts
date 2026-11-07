import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { createCalendarFeeds } from "../src/server/calendar-feeds.js";
import { createCalendarView } from "../src/server/calendar-view.js";

test("calendar events refresh on the timer without opening a page, including after a failed calendar", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-07T12:00:00Z") });
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE calendar_settings (id INTEGER PRIMARY KEY, interval_minutes INTEGER, past_days INTEGER, future_days INTEGER);
    INSERT INTO calendar_settings VALUES (1, 15, 30, 365);
  `);
  let account: string | undefined = "fixture";
  t.after(() => { account = undefined; });
  const attempts: string[] = [];
  let failPersonal = false;
  let addWork = false;
  let version = 1;
  createCalendarFeeds(db, {
    account: () => account,
    async collection<T>(path: string): Promise<T[]> {
      if (path.startsWith("me/calendars?")) {
        const calendars = [{ id: "personal", name: "Personal" }, { id: "family", name: "Family" }];
        if (addWork) calendars.push({ id: "work", name: "Work" });
        return calendars as T[];
      }
      if (path.startsWith("me/calendarGroups?")) return [];
      assert.ok(path.includes("/calendarView?"), path);
      const id = path.split("/calendars/")[1].split("/")[0];
      attempts.push(id);
      if (id === "personal" && failPersonal) throw new Error("Fixture outage");
      return [{
        id, subject: "Version " + version, isAllDay: false,
        start: { dateTime: "2026-11-07T12:00:00", timeZone: "UTC" },
        end: { dateTime: "2026-11-07T13:00:00", timeZone: "UTC" },
      }] as T[];
    },
  });
  const drain = async () => {
    for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
  };
  t.mock.timers.tick(0);
  await drain();
  const rows = () => db.prepare("SELECT calendar_id, month, events, error FROM calendar_view_snapshots ORDER BY calendar_id, month")
    .all() as { calendar_id: string; month: string; events: string; error: number }[];
  assert.equal(attempts.length, 6);
  assert.deepEqual(rows().map(row => row.month), ["2026-10", "2026-11", "2026-12", "2026-10", "2026-11", "2026-12"]);

  version = 2;
  failPersonal = true;
  t.mock.timers.tick(14 * 60_000);
  await drain();
  assert.equal(attempts.length, 6);
  t.mock.timers.tick(60_000);
  await drain();
  assert.equal(attempts.length, 12);
  for (const row of rows()) {
    assert.equal(row.error, row.calendar_id === "personal" ? 1 : 0);
    assert.equal(JSON.parse(row.events)[0].title, row.calendar_id === "personal" ? "Version 1" : "Version 2");
  }
  failPersonal = false;
  t.mock.timers.tick(15 * 60_000);
  await drain();
  assert.equal(attempts.length, 18);
  assert.ok(rows().every(row => row.error === 0 && JSON.parse(row.events)[0].title === "Version 2"));

  db.prepare("UPDATE calendar_settings SET interval_minutes = 30").run();
  addWork = true;
  t.mock.timers.tick(15 * 60_000);
  await drain();
  assert.equal(attempts.length, 18, "A longer configured interval must postpone the next refresh");
  t.mock.timers.tick(15 * 60_000);
  await drain();
  assert.equal(attempts.length, 27);
  assert.equal(rows().filter(row => row.calendar_id === "work").length, 3, "Newly discovered calendars must be warmed automatically");
});

test("cached calendar reads make no provider calls, and visited months join scheduled refreshes", async t => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-07T12:00:00Z") });
  let calls = 0;
  const view = createCalendarView(db, {
    account: () => "fixture",
    calendars: () => [{ id: "personal", name: "Personal" }],
    intervalMinutes: () => 15,
    events: async () => {
      calls++;
      return [{ id: "event", title: "Cached event", start: "2026-11-07T12:00:00Z", end: "2026-11-07T13:00:00Z", allDay: false }];
    },
  });
  await Promise.all([view.refresh(), view.refresh()]);
  assert.equal(calls, 3, "Concurrent scheduled refreshes must share their work");
  const app = express();
  app.use("/view", view.router);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = "http://127.0.0.1:" + address.port + "/view?calendar=personal&month=";
  const month = new Date().toISOString().slice(0, 7);
  db.prepare("UPDATE calendar_view_snapshots SET attempted_at = 0").run();
  const response = await fetch(url + month);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.events[0].title, "Cached event");
  assert.equal(body.refreshing, false);
  assert.equal(calls, 3, "Opening a stale cached month must leave refresh to the timer");

  const unseen = await fetch(url + "2030-01").then(response => response.json());
  assert.equal(unseen.refreshing, true);
  await view.refresh();
  assert.equal(calls, 7, "The requested month and three due months must refresh");
  db.prepare("UPDATE calendar_view_snapshots SET attempted_at = 0").run();
  await view.refresh();
  assert.equal(calls, 11, "Recently visited months must stay in background refreshes");
  assert.equal((await fetch(url + "2030-01").then(response => response.json())).events[0].title, "Cached event");

  for (const date of ["2030-02", "2030-03", "2030-04", "2030-05"]) {
    await fetch(url + date);
    await view.refresh();
  }
  const kept = db.prepare("SELECT month FROM calendar_view_snapshots").all() as { month: string }[];
  assert.equal(kept.length, 6);
  assert.ok(kept.some(row => row.month === month), "Browsing distant months must retain the current month");
});

test("calendar refreshes cannot publish results after the Microsoft account changes", async () => {
  const db = new Database(":memory:");
  let account = "first";
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const view = createCalendarView(db, {
    account: () => account,
    calendars: () => [{ id: "personal", name: "Personal" }],
    intervalMinutes: () => 15,
    events: async () => {
      await gate;
      return [];
    },
  });
  const running = view.refresh();
  await new Promise(resolve => setImmediate(resolve));
  account = "second";
  release();
  await running;
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM calendar_view_snapshots").get() as { count: number }).count, 0);
  db.close();
});
