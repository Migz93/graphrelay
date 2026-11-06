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

test("grocery aliases and pack sizes work without changing the item title", () => {
  const names = ["garden peas", "Frozen Peas", "cucumber x2", "2 x milk", "pasta 500g", "paprika chicken seasoning", "meatball sauce", "tinned sweetcorn", "fresh tuna", "washing detergent"];
  const tasks = names.map((title, index) => ({ id: String(index), title }));
  const actual = new Map(planTitles(tasks, "off", aisles, {}).map(item => [item.next, item.aisle]));
  deepEqual(names.map(name => actual.get(name)), ["Frozen", "Frozen", "Produce", "Dairy", "Pantry", "Pantry", "Pantry", "Pantry", "Other", "Other"]);
});

test("two-digit numbering replaces tracked prefixes and widens at 100 open items", () => {
  const tasks = [{ id: "peas", title: "001 · Peas" }];
  const originals = { peas: { base: "Peas", applied: "001 · Peas" } };
  deepEqual(planTitles(tasks, "number-2", aisles, originals).map(task => task.next), ["01 · Peas"]);
  const many = Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: "Task " + String(i).padStart(3, "0") }));
  deepEqual(planTitles(many.slice(0, 99), "number-2", aisles, {}).map(task => task.next).slice(-1), ["99 · Task 098"]);
  const numbered = planTitles(many, "number-2", aisles, {}).map(task => task.next);
  deepEqual([numbered[0], numbered[99]], ["001 · Task 000", "100 · Task 099"]);
  deepEqual(numbered, [...numbered].sort());
});
