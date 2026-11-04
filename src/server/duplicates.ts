import { itemKey } from "./ordering.js";

type Candidate = {
  id: string;
  base: string;
  status: string;
  createdDateTime?: string;
  completedDateTime?: { dateTime: string };
};

function timestamp(value?: string) {
  if (!value) return 0;
  const utc = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + "Z";
  return Date.parse(utc) || 0;
}

export function duplicateGroups<T extends Candidate>(tasks: T[]) {
  const matches = new Map<string, T[]>();
  for (const task of tasks) {
    const key = itemKey(task.base);
    if (!key) continue;
    const group = matches.get(key) ?? [];
    group.push(task);
    matches.set(key, group);
  }
  return [...matches.entries()].filter(([, group]) => group.length > 1).sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => {
    group.sort((a, b) => {
      const completedA = a.status === "completed";
      const completedB = b.status === "completed";
      const dateA = timestamp(completedA ? a.completedDateTime?.dateTime ?? a.createdDateTime : a.createdDateTime);
      const dateB = timestamp(completedB ? b.completedDateTime?.dateTime ?? b.createdDateTime : b.createdDateTime);
      return Number(completedA) - Number(completedB) || dateB - dateA || a.id.localeCompare(b.id);
    });
    const [keep, ...copies] = group;
    return { key, keep, copies };
  });
}
