import { deepEqual } from "node:assert/strict";
import { test } from "node:test";
import { aisles, planTitles } from "../src/server/ordering.js";

test("named prefixes group open items without stacking GraphRelay prefixes", () => {
  const tasks = [{ id: "1", title: "03 Frozen · Peas" }, { id: "2", title: "Pizza" }];
  const originals = { "1": { base: "Peas", applied: "03 Frozen · Peas" } };
  deepEqual(planTitles(tasks, "named", aisles, originals).map(task => task.next), ["03 Frozen · Peas", "03 Frozen · Pizza"]);
  deepEqual(planTitles(tasks, "off", aisles, originals).map(task => task.next), ["Peas", "Pizza"]);
});

test("number-only titles follow aisle order and respect a user edit", () => {
  const tasks = [{ id: "1", title: "Cheese" }, { id: "2", title: "Apples" }, { id: "3", title: "Peas" }];
  const originals = { "1": { base: "Milk", applied: "04 Dairy · Milk" } };
  deepEqual(planTitles(tasks, "number", aisles, originals).map(task => task.next), ["001 · Apples", "002 · Peas", "003 · Cheese"]);
});

test("editing an item in To Do preserves the edit without stacking prefixes", () => {
  const tasks = [{ id: "1", title: "03 Frozen · Pizza" }];
  const originals = { "1": { base: "Peas", applied: "03 Frozen · Peas" } };
  deepEqual(planTitles(tasks, "named", aisles, originals).map(task => task.next), ["03 Frozen · Pizza"]);
  deepEqual(planTitles(tasks, "off", aisles, originals).map(task => task.next), ["Pizza"]);
});

test("list corrections take precedence for renamed tasks and later additions", () => {
  const tasks = [
    { id: "1", title: "03 Frozen · Peas" },
    { id: "2", title: "PEAS " },
    { id: "3", title: "Garden   peas" },
  ];
  const originals = { "1": { base: "Peas", applied: "03 Frozen · Peas" } };
  const corrections = new Map([["peas", "Produce"], ["garden peas", "Produce"]]);
  deepEqual(planTitles(tasks, "named", aisles, originals, corrections).map(task => task.aisle), ["Produce", "Produce", "Produce"]);
  deepEqual(planTitles(tasks, "named", aisles, originals).map(task => task.aisle), ["Frozen", "Frozen", "Frozen"]);
});

test("grocery aliases and pack sizes work without changing the item title or overriding corrections", () => {
  const names = ["garden peas", "Frozen Peas", "cucumber x2", "2 x milk", "pasta 500g", "paprika chicken seasoning", "meatball sauce", "tinned sweetcorn", "fresh tuna", "washing detergent"];
  const tasks = names.map((title, index) => ({ id: String(index), title }));
  const actual = new Map(planTitles(tasks, "off", aisles, {}).map(item => [item.next, item.aisle]));
  deepEqual(names.map(name => actual.get(name)), ["Frozen", "Frozen", "Produce", "Dairy", "Pantry", "Pantry", "Pantry", "Pantry", "Other", "Other"]);
  deepEqual(planTitles([{ id: "1", title: "frozen peas" }], "named", aisles, {}, new Map([["frozen peas", "Produce"]]))[0].aisle, "Produce");
});
