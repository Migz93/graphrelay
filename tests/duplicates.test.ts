import { deepEqual } from "node:assert/strict";
import { test } from "node:test";
import { duplicateGroups } from "../src/server/duplicates.js";

test("duplicate preview prefers an open copy and preserves distinct names", () => {
  const tasks = [
    { id: "completed", base: " cheese ", status: "completed", completedDateTime: { dateTime: "2026-11-04T10:00:00" } },
    { id: "open", base: "Cheese", status: "notStarted" },
    { id: "quantity", base: "Cheese x2", status: "notStarted" },
    { id: "different", base: "Cream cheese", status: "notStarted" },
  ];
  deepEqual(duplicateGroups(tasks).map(group => [group.keep.id, ...group.copies.map(task => task.id)]), [["open", "completed"]]);
});

test("duplicate preview keeps the most recently completed copy if all are completed", () => {
  const tasks = [
    { id: "old", base: "Garden   peas", status: "completed", completedDateTime: { dateTime: "2026-11-03T10:00:00" } },
    { id: "new", base: "GARDEN PEAS", status: "completed", completedDateTime: { dateTime: "2026-11-04T10:00:00" } },
  ];
  deepEqual(duplicateGroups(tasks).map(group => [group.keep.id, ...group.copies.map(task => task.id)]), [["new", "old"]]);
});
