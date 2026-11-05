export type MatchGroup = { name: string; matches: string[]; defaultMatches?: string[]; prefixes?: string[] };
export type GroupDraft = { id: string; name: string; matches: string[]; prefixes: string[]; fallback: boolean };

export function matchKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function groupingDraft(groups: MatchGroup[]): GroupDraft[] {
  const assignments = new Map<string, number>();
  groups.forEach((group, index) => group.defaultMatches?.forEach(item => assignments.set(matchKey(item), index)));
  groups.forEach((group, index) => group.matches.forEach(item => assignments.set(matchKey(item), index)));
  return groups.map((group, index) => ({
    id: "group-" + index, name: group.name, fallback: group.name === "Other", prefixes: group.prefixes ?? [],
    matches: [...assignments].filter(([item, target]) => item && target === index).map(([item]) => item),
  }));
}

export function moveMatch(groups: GroupDraft[], item: string, targetId: string) {
  return groups.map(group => ({
    ...group,
    matches: group.id === targetId ? [...new Set([...group.matches, item])] : group.matches.filter(value => value !== item),
  }));
}

export function removeGroup(groups: GroupDraft[], id: string) {
  const removed = groups.find(group => group.id === id);
  if (!removed || removed.fallback) return groups;
  return groups.filter(group => group.id !== id).map(group => group.fallback
    ? { ...group, matches: [...new Set([...group.matches, ...removed.matches])], prefixes: [...new Set([...group.prefixes, ...removed.prefixes])] }
    : group);
}
