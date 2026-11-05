import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createCalendarFeeds, renderCalendarFeed } from "../src/server/calendar-feeds.js";

test("calendar feeds preserve all-day dates, stable event IDs and escaped text", () => {
  const allDay = {
    id: "all-day",
    subject: "Summer, plans",
    isAllDay: true,
    originalStartTimeZone: "GMT Standard Time",
    start: { dateTime: "2026-07-10T23:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-07-11T23:00:00.0000000", timeZone: "UTC" },
  };
  const timed = {
    id: "timed",
    subject: "Timed event",
    bodyPreview: "First line\nSecond line; extra",
    start: { dateTime: "2026-07-11T17:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-07-11T18:00:00.0000000", timeZone: "UTC" },
  };
  const feed = renderCalendarFeed("Fixture", [allDay, timed, timed, { ...timed, id: "cancelled", isCancelled: true }]);
  assert.equal(feed.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.match(feed, /DTSTART;VALUE=DATE:20260711/);
  assert.match(feed, /DTEND;VALUE=DATE:20260712/);
  assert.match(feed, /DTSTART:20260711T170000Z/);
  assert.match(feed, /SUMMARY:Summer\\, plans/);
  assert.match(feed, /DESCRIPTION:First line\\nSecond line\\; extra/);
  const updated = renderCalendarFeed("Fixture", [{ ...timed, subject: "Updated" }]);
  assert.ok(feed.includes(updated.match(/UID:[^\r\n]+/)![0]));
});

test("legacy calendar feeds keep their subscription token and cached calendar on migration", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`
      CREATE TABLE calendar_feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, calendar_id TEXT NOT NULL, group_id TEXT,
        name TEXT NOT NULL, token TEXT NOT NULL UNIQUE, ics TEXT, synced_at TEXT, error TEXT, UNIQUE(account, calendar_id)
      );
      INSERT INTO calendar_feeds VALUES (5, 'account', 'family', 'shared', 'Family', 'token', 'cached ICS', '2026-11-05T12:00:00.000Z', NULL);
    `);
    const options = { account: () => undefined, collection: async () => [] };
    createCalendarFeeds(db, options);
    createCalendarFeeds(db, options);
    assert.deepEqual(db.prepare("SELECT * FROM calendar_feeds").get(), {
      id: 5, account: "account", sources: JSON.stringify([{ id: "family", name: "Family", groupId: "shared" }]),
      name: "Family", token: "token", ics: "cached ICS", synced_at: "2026-11-05T12:00:00.000Z", error: null,
      interval_minutes: null, past_days: null, future_days: null, revision: 0,
    });
    assert.deepEqual(db.prepare("SELECT interval_minutes, past_days, future_days FROM calendar_settings").get(),
      { interval_minutes: 120, past_days: 30, future_days: 365 });
  } finally {
    db.close();
  }
});
