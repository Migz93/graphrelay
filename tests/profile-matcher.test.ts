import { equal } from "node:assert/strict";
import { test } from "node:test";
import { profileMatcher } from "../src/server/profile-matcher.js";

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
