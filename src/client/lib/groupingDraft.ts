import pluralize from "pluralize";
import { compactMatchGroups } from "../../server/grouping-normalization.js";
export { compactMatchGroups } from "../../server/grouping-normalization.js";

export type MatchGroup = { name: string; matches: string[]; defaultMatches?: string[]; prefixes?: string[]; matchPlurals?: boolean };
export type GroupDraft = { id: string; name: string; matches: string[]; prefixes: string[]; fallback: boolean; matchPlurals: boolean };

export function matchKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function groupingDraft(groups: MatchGroup[]): GroupDraft[] {
  const assignments = new Map<string, number>();
  groups.forEach((group, index) => group.defaultMatches?.forEach(item => assignments.set(matchKey(item), index)));
  groups.forEach((group, index) => group.matches.forEach(item => assignments.set(matchKey(item), index)));
  return compactMatchGroups(groups.map((group, index) => ({
    id: "group-" + index, name: group.name, fallback: group.name === "Other", matchPlurals: group.matchPlurals ?? false, prefixes: group.prefixes ?? [],
    matches: [...assignments].filter(([item, target]) => item && target === index).map(([item]) => item),
  })));
}

export function moveMatch(groups: GroupDraft[], item: string, targetId: string) {
  const source = groups.find(group => group.matches.includes(item));
  const target = groups.find(group => group.id === targetId);
  if (!target) return groups;
  const names = source?.matchPlurals && !target.matchPlurals ? [pluralize.singular(item), pluralize.plural(item)] : [item];
  const moved = [...new Set(names.filter(name => name === item || !groups.some(group => group !== source && group.matches.includes(name))))];
  return compactMatchGroups(groups.map(group => ({
    ...group,
    matches: group.id === targetId
      ? [...group.matches, ...moved]
      : group.matches.filter(value => value !== item && !moved.includes(value)),
  })));
}

export function removeGroup(groups: GroupDraft[], id: string) {
  const removed = groups.find(group => group.id === id);
  if (!removed || removed.fallback) return groups;
  return compactMatchGroups(groups.filter(group => group.id !== id).map(group => group.fallback
    ? { ...group, matches: [...group.matches, ...removed.matches.flatMap(item => {
      const names = removed.matchPlurals && !group.matchPlurals ? [pluralize.singular(item), pluralize.plural(item)] : [item];
      return names.filter(name => name === item || !groups.some(owner => owner !== removed && owner !== group && owner.matches.includes(name)));
    })], prefixes: [...new Set([...group.prefixes, ...removed.prefixes])] }
    : group));
}
