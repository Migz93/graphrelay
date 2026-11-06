import { equal } from "node:assert/strict";
import { test } from "node:test";
import { assignProfileItem, profileMatcher } from "../src/server/profile-matcher.js";

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
