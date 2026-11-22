import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { groupingDraft } from "../src/client/lib/groupingDraft.js";
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
  deepEqual(updated.groups[2].matches, ["known"]);
  deepEqual(updated.groups[2].defaultMatches, ["other default", "star fruit"]);
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
  deepEqual(updated.groups[0].defaultMatches, ["widget", "widgets", "widget 2kg"]);
  equal(discoverProfileItems(updated, ["WIDGET", "widgets", "widget 2kg"]), updated);
});


test("discovered plural aliases preserve known default assignments through editor saves", () => {
  for (const [singular, plural] of [["star fruit", "star fruits"], ["mouse", "mice"]]) {
    const profile = {
      id: "sample", name: "Sample", grocery: false, ignoreQuantities: true,
      groups: [
        { name: "Produce", matches: [], defaultMatches: [plural], matchPlurals: false },
        { name: "Other", matches: [], matchPlurals: true },
      ],
    };
    equal(profileMatcher(profile)(plural), "Produce");
    const updated = discoverProfileItems(profile, [singular, singular + " 500g"]);
    equal(profileMatcher(updated)(plural), "Produce");
    equal(profileMatcher(updated)("2 x " + plural + " 500g"), "Produce");
    equal(profileMatcher(updated)(singular), "Other");
    equal(updated.groups[0], profile.groups[0]);
    equal(discoverProfileItems(updated, [singular, plural]), updated);
    const draft = groupingDraft(updated.groups);
    deepEqual(draft[0].matches, [plural]);
    deepEqual(draft[1].matches, [singular]);
    const saved = { ...updated, groups: draft.map(({ name, matches, prefixes, matchPlurals }) => ({ name, matches, prefixes, matchPlurals })) };
    equal(profileMatcher(saved)(plural), "Produce");
    equal(profileMatcher(saved)(singular), "Other");
    equal(discoverProfileItems(saved, [singular, plural]), saved);
  }
});


test("quantity-only discoveries stop changing the profile after the first sync", () => {
  const profile = { id: "sample", name: "Sample", grocery: true, ignoreQuantities: true,
    groups: [{ name: "Other", matches: [] }] };
  const updated = discoverProfileItems(profile, ["500g", "2 x", "500g"]);
  deepEqual(updated.groups[0].defaultMatches, ["500g", "2 x"]);
  equal(discoverProfileItems(updated, ["500g", "2 x"]), updated);
});

test("unknown plurals stay editable without changing an existing exact singular", () => {
  for (const [singular, plural] of [["apple", "apples"], ["mouse", "mice"]]) {
    const profile = { id: "sample", name: "Sample", grocery: false,
      groups: [{ name: "Produce", matches: [singular] }, { name: "Other", matches: [], matchPlurals: true }] };
    const updated = discoverProfileItems(profile, [plural]);
    const draft = groupingDraft(updated.groups);
    deepEqual(draft[0].matches, [singular]);
    deepEqual(draft[1].matches, [plural]);
    const saved = { ...updated, groups: draft.map(({name, matches, matchPlurals}) => ({name, matches, matchPlurals})) };
    equal(profileMatcher(saved)(singular), "Produce");
    equal(profileMatcher(saved)(plural), "Other");
    equal(discoverProfileItems(saved, [singular, plural]), saved);
  }
});


test("empty singular forms retain the original alias across discovery, editor and assignment", () => {
  const profile = { id: "sample", name: "Sample", grocery: false,
    groups: [{ name: "Produce", matches: [], matchPlurals: true }, { name: "Other", matches: [], matchPlurals: true }] };
  const updated = discoverProfileItems(profile, ["s"]);
  deepEqual(updated.groups[1].defaultMatches, ["s"]);
  const draft = groupingDraft(updated.groups);
  deepEqual(draft[1].matches, ["s"]);
  equal(discoverProfileItems(updated, ["s"]), updated);
  const moved = assignProfileItem(updated, "s", "Produce");
  deepEqual(moved.groups[0].matches, ["s"]);
  equal(profileMatcher(moved)("s"), "Produce");
});
