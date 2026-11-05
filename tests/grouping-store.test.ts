import { deepEqual, equal, throws } from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GroupingStore, type Profile } from "../src/server/grouping-store.js";

const profile: Profile = {
  id: "groceries", name: "Groceries", grocery: true, ignoreQuantities: true,
  groups: [
    { name: "Frozen", matches: ["FROZEN BERRIES"], defaultMatches: ["peas"], prefixes: ["frozen"] },
    { name: "Other", matches: [] },
  ],
};

test("profile files preserve rules, stable IDs and filenames across edits", () => {
  const directory = mkdtempSync(join(tmpdir(), "graphrelay-groupings-"));
  try {
    const store = new GroupingStore(directory);
    store.save(profile);
    const saved = JSON.parse(readFileSync(join(directory, "groceries.json"), "utf8"));
    equal(saved.schemaVersion, 1);
    deepEqual(saved.groups[0], { name: "Frozen", matches: ["frozen berries"], defaultMatches: ["peas"], prefixes: ["frozen"], matchPlurals: false });
    store.save({ ...store.read()[0], name: "My groceries", groups: store.read()[0].groups.map(group => ({ ...group, matchPlurals: true })) });
    equal(store.read()[0].groups[0].matchPlurals, true);
    deepEqual(readdirSync(directory), ["groceries.json"]);
    equal(store.read()[0].id, "groceries");
    const changed = { ...saved, name: "Changed on disk" };
    writeFileSync(join(directory, "groceries.json"), JSON.stringify(changed));
    equal(store.read()[0].name, "Changed on disk");
    writeFileSync(join(directory, "groceries.json"), "{invalid");
    throws(() => store.read(), /groceries.json could not be read as JSON/);
    throws(() => store.save(profile), /could not be read as JSON/);
    equal(readFileSync(join(directory, "groceries.json"), "utf8"), "{invalid");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("copying profiles to a new store works and matching names get separate files", () => {
  const directory = mkdtempSync(join(tmpdir(), "graphrelay-groupings-"));
  try {
    const store = new GroupingStore(directory);
    store.save({ ...profile, id: "one", name: "My list" });
    store.save({ ...profile, id: "two", name: "My list" });
    deepEqual(readdirSync(directory).sort(), ["my-list-2.json", "my-list.json"]);
    equal(store.read().length, 2);
    const imported = { schemaVersion: 1, ...profile };
    writeFileSync(join(directory, "imported.json"), JSON.stringify(imported));
    equal(store.read().find(value => value.id === "groceries")?.ignoreQuantities, true);
    writeFileSync(join(directory, "duplicate.json"), JSON.stringify(imported));
    throws(() => store.read(), /unique profile ID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
