import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { groupingDraft, moveMatch, removeGroup } from "../src/client/lib/groupingDraft.js";

test("the editor shows effective defaults once and retains a moved default item", () => {
  const groups = groupingDraft([
    { name: "Produce", matches: ["Peas"], defaultMatches: ["apples"] },
    { name: "Frozen", matches: ["berries"], defaultMatches: ["peas", "garden peas"], prefixes: ["frozen"] },
    { name: "Other", matches: [] },
  ]);
  deepEqual(groups[0].matches, ["apples", "peas"]);
  deepEqual(groups[1].matches, ["garden peas", "berries"]);
  const moved = moveMatch(groups, "garden peas", groups[0].id);
  equal(moved[1].matches.includes("garden peas"), false);
  equal(moved[0].matches.includes("garden peas"), true);
  deepEqual(moved[1].prefixes, ["frozen"]);
});

test("removing a group preserves its rules in Other and the fallback stays required", () => {
  const groups = groupingDraft([
    { name: "Frozen", matches: ["peas"], prefixes: ["frozen"] },
    { name: "Other", matches: ["unknown"] },
  ]);
  const next = removeGroup(groups, groups[0].id);
  equal(next.length, 1);
  deepEqual(next[0].matches, ["unknown", "peas"]);
  deepEqual(next[0].prefixes, ["frozen"]);
  deepEqual(removeGroup(next, next[0].id), next);
});

test("enabled groups collapse pairs and moving to an exact group keeps both forms", () => {
  const groups = groupingDraft([
    { name: "Produce", matches: ["apple", "apples", "potatoes"], matchPlurals: true },
    { name: "Other", matches: [] },
  ]);
  deepEqual(groups[0].matches, ["apple", "potato"]);
  const moved = moveMatch(groups, "apple", groups[1].id);
  deepEqual(moved[0].matches, ["potato"]);
  deepEqual(moved[1].matches, ["apple", "apples"]);
  const removed = removeGroup(groups, groups[0].id);
  deepEqual(removed[0].matches, ["apple", "apples", "potato", "potatoes"]);
});
