export const aisles = ["Produce", "Meat", "Frozen", "Dairy", "Bakery", "Pantry", "Other"];
export type Mode = "named" | "number" | "off";

const groceries: Record<string, string> = {
  apples: "Produce", bananas: "Produce", carrots: "Produce", onions: "Produce",
  chicken: "Meat", beef: "Meat", bacon: "Meat", mince: "Meat",
  peas: "Frozen", pizza: "Frozen", "ice cream": "Frozen", "frozen chips": "Frozen",
  cheese: "Dairy", milk: "Dairy", butter: "Dairy", yoghurt: "Dairy",
  bread: "Bakery", rolls: "Bakery", pasta: "Pantry", rice: "Pantry",
};

export function planTitles(tasks: { id: string; title: string }[], mode: Mode, order: string[], originals: Record<string, { base: string; applied: string }>) {
  const items = tasks.map(task => {
    const previous = originals[task.id];
    const base = previous?.applied === task.title ? previous.base : task.title;
    const lookup = base.trim().toLowerCase();
    const aisle = Object.hasOwn(groceries, lookup) ? groceries[lookup] : "Other";
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
