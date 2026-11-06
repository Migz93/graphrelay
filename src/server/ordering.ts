import { groceryAisle } from "./groceries.js";

export const aisles = ["Produce", "Meat", "Frozen", "Dairy", "Bakery", "Pantry", "Other"];
export const modes = ["named", "number", "number-2", "off"] as const;
export type Mode = typeof modes[number];

export function itemKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function capitalizeWords(name: string) {
  return name.replace(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu, word =>
    word.replace(/^\p{L}/u, first => first.toUpperCase()));
}

export function planTitles<T extends { id: string; title: string }>(tasks: T[], mode: Mode, order: string[], originals: Record<string, { base: string; applied: string }>, match = groceryAisle) {
  const items = tasks.map(task => {
    const previous = originals[task.id];
    const prefix = previous?.applied.slice(0, previous.applied.length - previous.base.length);
    const base = prefix && task.title.startsWith(prefix) ? task.title.slice(prefix.length) : task.title;
    const assigned = match(itemKey(base));
    const aisle = order.includes(assigned) ? assigned : "Other";
    return { ...task, base, aisle, rank: order.indexOf(aisle) };
  });
  items.sort((a, b) => a.rank - b.rank || a.base.localeCompare(b.base) || a.id.localeCompare(b.id));
  const width = Math.max(mode === "number-2" ? 2 : 3, String(items.length).length);
  return items.map((item, index) => {
    let next = item.base;
    if (mode === "named") next = String(item.rank + 1).padStart(2, "0") + " " + item.aisle + " · " + item.base;
    if (mode === "number" || mode === "number-2") next = String(index + 1).padStart(width, "0") + " · " + item.base;
    return { ...item, next };
  });
}
