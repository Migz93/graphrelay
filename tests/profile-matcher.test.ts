import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { assignProfileItem, discoverProfileItems, profileMatcher } from "../src/server/profile-matcher.js";

test("moving all default names into editable matches preserves pack sizes and removals", () => {
  const match = profileMatcher({
    id: "groceries", name: "Groceries", grocery: true, ignoreQuantities: true,
    groups: [
      { name: "Produce", matches: ["peas", "frozen berries"] },
      { name: "Dairy", matches: ["milk"] },
      { name: "Frozen", matches: [], defaultMatches: [], prefixes: ["frozen"] },
      { name: "Other", matches: [] },
    ],
  });
  equal(match("milk 2l"), "Dairy");
  equal(match("2 x peas"), "Produce");
  equal(match("frozen chicken"), "Frozen");
  equal(match("frozen berries 500g"), "Produce");
  equal(match("garden peas"), "Other");
});

test("plural matching is per group and respects explicit assignments and quantities", () => {
  const match = profileMatcher({
    id: "groceries", name: "Groceries", grocery: true, ignoreQuantities: true,
    groups: [
      { name: "Produce", matches: ["apple", "potato", "berry", "spring onion"], matchPlurals: true },
      { name: "Pantry", matches: ["glass", "pear"], matchPlurals: false },
      { name: "Frozen", matches: [], defaultMatches: ["pea"], matchPlurals: true },
      { name: "Other", matches: ["green apples"] },
    ],
  });
  equal(match("apples"), "Produce");
  equal(match("2 x apples"), "Produce");
  equal(match("potatoes"), "Produce");
  equal(match("berries 500g"), "Produce");
  equal(match("spring onions"), "Produce");
  equal(match("peas"), "Frozen");
  equal(match("glass"), "Pantry");
  equal(match("glasses"), "Other");
  equal(match("pears"), "Other");
  equal(match("green apples"), "Other");
});

test("moving a grocery item saves a shared match that beats defaults and storage prefixes", () => {
  const updated = assignProfileItem({
    id: "groceries", name: "Groceries", grocery: true, ignoreQuantities: true,
    groups: [
      { name: "Produce", matches: [], matchPlurals: true },
      { name: "Frozen", matches: ["frozen peas 500g"], defaultMatches: ["frozen peas", "ice cream"], prefixes: ["frozen"] },
      { name: "Other", matches: [] },
    ],
  }, "frozen peas 500g", "Produce");
  const match = profileMatcher(updated);
  equal(match("frozen peas 500g"), "Produce");
  equal(match("2 x frozen peas"), "Produce");
  equal(match("frozen pea"), "Produce");
  equal(match("frozen berries"), "Frozen");
  equal(match("ice cream"), "Frozen");
  equal(updated.groups[1].matches.length, 0);
});


test("discovery normalizes unknown items and preserves exact, default, prefix and Other rules", () => {
  const profile = {
    id: "sample", name: "Sample", grocery: true, ignoreQuantities: true,
    groups: [
      { name: "Produce", matches: ["apple"], defaultMatches: ["pear"], matchPlurals: true },
      { name: "Frozen", matches: [], prefixes: ["frozen"] },
      { name: "Other", matches: ["known"], defaultMatches: ["other default"], prefixes: ["misc"], matchPlurals: true },
    ],
  };
  const updated = discoverProfileItems(profile, ["  Star   Fruits 500g ", "2 x star fruit", "apples", "pears", "frozen peas", "known", "other default", "misc item", " "]);
  deepEqual(updated.groups[2].matches, ["known", "star fruit"]);
  equal(updated.groups[0], profile.groups[0]);
  equal(updated.groups[1], profile.groups[1]);
  deepEqual(profile.groups[2].matches, ["known"]);
  equal(discoverProfileItems(updated, ["star fruits", "star fruit 1kg", "apples"]), updated);
  const moved = assignProfileItem(updated, "star fruits 500g", "Produce");
  equal(profileMatcher(moved)("star fruits 1kg"), "Produce");
  equal(discoverProfileItems(moved, ["star fruits 500g"]), moved);
});

test("discovery retains meaningful quantities and distinct plurals when those options are disabled", () => {
  const profile = { id: "sample", name: "Sample", grocery: false, groups: [{ name: "Other", matches: [] }] };
  const updated = discoverProfileItems(profile, ["Widget", " widget ", "widgets", "widget 2kg"]);
  deepEqual(updated.groups[0].matches, ["widget", "widgets", "widget 2kg"]);
  equal(discoverProfileItems(updated, ["WIDGET", "widgets", "widget 2kg"]), updated);
});
