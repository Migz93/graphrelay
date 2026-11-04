import { groceryAisle } from "./groceries.js";

export const aisles = ["Produce", "Meat", "Frozen", "Dairy", "Bakery", "Pantry", "Other"];
export type Mode = "named" | "number" | "off";

export function itemKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function planTitles<T extends { id: string; title: string }>(tasks: T[], mode: Mode, order: string[], originals: Record<string, { base: string; applied: string }>, corrections: ReadonlyMap<string, string> = new Map()) {
  const items = tasks.map(task => {
    const previous = originals[task.id];
    const prefix = previous?.applied.slice(0, previous.applied.length - previous.base.length);
    const base = prefix && task.title.startsWith(prefix) ? task.title.slice(prefix.length) : task.title;
    const lookup = itemKey(base);
    const aisle = corrections.get(lookup) ?? groceryAisle(lookup);
    return { ...task, base, aisle, rank: order.indexOf(aisle) };
  });
  items.sort((a, b) => a.rank - b.rank || a.base.localeCompare(b.base) || a.id.localeCompare(b.id));
  const width = Math.max(3, String(items.length).length);
  return items.map((item, index) => {
    let next = item.base;
    if (mode === "named") next = String(item.rank + 1).padStart(2, "0") + " " + item.aisle + " · " + item.base;
    if (mode === "number") next = String(index + 1).padStart(width, "0") + " · " + item.base;
    return { ...item, next };
  });
}
