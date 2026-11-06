import { deepEqual } from "node:assert/strict";
import { test } from "node:test";
import { aisles, planTitles } from "../src/server/ordering.js";

test("named prefixes group open items without stacking GraphRelay prefixes", () => {
  const tasks = [{ id: "1", title: "03 Frozen · Peas" }, { id: "2", title: "Pizza" }];
  const originals = { "1": { base: "Peas", applied: "03 Frozen · Peas" } };
  deepEqual(planTitles(tasks, "named", aisles, originals).map(task => task.next), ["03 Frozen · Peas", "03 Frozen · Pizza"]);
  deepEqual(planTitles(tasks, "off", aisles, originals).map(task => task.next), ["Peas", "Pizza"]);
});

test("both number-only styles share a prefix per aisle and replace tracked sequential prefixes", () => {
  const tasks = [
    { id: "1", title: "003 · Cheese" },
    { id: "2", title: "Apples" },
    { id: "3", title: "002 · Garden Peas" },
    { id: "4", title: "Pizza" },
  ];
  const originals = {
    "1": { base: "Cheese", applied: "003 · Cheese" },
    "3": { base: "Peas", applied: "002 · Peas" },
  };
  deepEqual(planTitles(tasks, "number", aisles, originals).map(task => task.next), [
    "001 · Apples", "003 · Garden Peas", "003 · Pizza", "004 · Cheese",
  ]);
  deepEqual(planTitles(tasks, "number-2", aisles, originals).map(task => task.next), [
    "01 · Apples", "03 · Garden Peas", "03 · Pizza", "04 · Cheese",
  ]);
});

test("editing an item in To Do preserves the edit without stacking prefixes", () => {
  const tasks = [{ id: "1", title: "03 Frozen · Pizza" }];
  const originals = { "1": { base: "Peas", applied: "03 Frozen · Peas" } };
  deepEqual(planTitles(tasks, "named", aisles, originals).map(task => task.next), ["03 Frozen · Pizza"]);
  deepEqual(planTitles(tasks, "off", aisles, originals).map(task => task.next), ["Pizza"]);
});

test("grocery aliases and pack sizes work without changing the item title", () => {
  const names = ["garden peas", "Frozen Peas", "cucumber x2", "2 x milk", "pasta 500g", "paprika chicken seasoning", "meatball sauce", "tinned sweetcorn", "fresh tuna", "washing detergent"];
  const tasks = names.map((title, index) => ({ id: String(index), title }));
  const actual = new Map(planTitles(tasks, "off", aisles, {}).map(item => [item.next, item.aisle]));
  deepEqual(names.map(name => actual.get(name)), ["Frozen", "Frozen", "Produce", "Dairy", "Pantry", "Pantry", "Pantry", "Pantry", "Other", "Other"]);
});

test("numbering stays two digits for large lists and follows custom group order", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: "Task " + String(i).padStart(3, "0") }));
  const numbered = planTitles(many, "number-2", ["Other", "Frozen"], {}).map(item => item.next);
  deepEqual([numbered[0], numbered[99]], ["01 · Task 000", "01 · Task 099"]);
  const tasks = [{ id: "peas", title: "Peas" }, ...many];
  const reordered = planTitles(tasks, "number-2", ["Other", "Frozen"], {}).map(item => item.next);
  deepEqual(reordered.slice(-2), ["01 · Task 099", "02 · Peas"]);
});
