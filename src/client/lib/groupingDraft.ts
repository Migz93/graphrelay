import pluralize from "pluralize";

export type MatchGroup = { name: string; matches: string[]; defaultMatches?: string[]; prefixes?: string[]; matchPlurals?: boolean };
export type GroupDraft = { id: string; name: string; matches: string[]; prefixes: string[]; fallback: boolean; matchPlurals: boolean };

export function matchKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function compactMatches(matches: string[], enabled: boolean) {
  return [...new Set(enabled ? matches.map(item => pluralize.singular(item)) : matches)];
}

export function groupingDraft(groups: MatchGroup[]): GroupDraft[] {
  const assignments = new Map<string, number>();
  groups.forEach((group, index) => group.defaultMatches?.forEach(item => assignments.set(matchKey(item), index)));
  groups.forEach((group, index) => group.matches.forEach(item => assignments.set(matchKey(item), index)));
  return groups.map((group, index) => ({
    id: "group-" + index, name: group.name, fallback: group.name === "Other", matchPlurals: group.matchPlurals ?? false, prefixes: group.prefixes ?? [],
    matches: compactMatches([...assignments].filter(([item, target]) => item && target === index).map(([item]) => item), !!group.matchPlurals),
  }));
}

export function moveMatch(groups: GroupDraft[], item: string, targetId: string) {
  const source = groups.find(group => group.matches.includes(item));
  const target = groups.find(group => group.id === targetId);
  if (!target) return groups;
  const names = source?.matchPlurals && !target.matchPlurals ? [pluralize.singular(item), pluralize.plural(item)] : [item];
  const moved = compactMatches(names, target.matchPlurals);
  return groups.map(group => ({
    ...group,
    matches: group.id === targetId
      ? compactMatches([...group.matches, ...moved], group.matchPlurals)
      : group.matches.filter(value => value !== item && !moved.includes(value)),
  }));
}

export function removeGroup(groups: GroupDraft[], id: string) {
  const removed = groups.find(group => group.id === id);
  if (!removed || removed.fallback) return groups;
  return groups.filter(group => group.id !== id).map(group => group.fallback
    ? { ...group, matches: compactMatches([...group.matches, ...removed.matches.flatMap(item => removed.matchPlurals && !group.matchPlurals ? [pluralize.singular(item), pluralize.plural(item)] : [item])], group.matchPlurals), prefixes: [...new Set([...group.prefixes, ...removed.prefixes])] }
    : group);
}
