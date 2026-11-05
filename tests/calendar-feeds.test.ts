import assert from "node:assert/strict";
import test from "node:test";
import { renderCalendarFeed } from "../src/server/calendar-feeds.js";

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
