import pluralize from "pluralize";

export function singularMatch(name: string) {
  return pluralize.singular(name) || name;
}

export function matchKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Shared by the browser and API: a plural chip must not collapse onto an exact
// singular owned by another group. Exact names take precedence in the matcher.
export function compactMatchGroups<T extends { matches: string[]; matchPlurals?: boolean }>(groups: T[]): T[] {
  const owners = new Map(groups.flatMap((group, index) => group.matches.map(name => [name, index] as const)));
  return groups.map((group, index) => ({
    ...group,
    matches: [...new Set(group.matches.map(name => {
      const singular = singularMatch(name);
      return group.matchPlurals && (!owners.has(singular) || owners.get(singular) === index) ? singular : name;
    }))],
  }));
}


// The editor and request budget must use the same effective aliases and shape.
export function editableMatchGroups<T extends { matches: string[]; defaultMatches?: string[]; prefixes?: string[]; matchPlurals?: boolean }>(groups: T[]) {
  const assignments = new Map<string, number>();
  groups.forEach((group, index) => group.defaultMatches?.forEach(item => assignments.set(matchKey(item), index)));
  groups.forEach((group, index) => group.matches.forEach(item => assignments.set(matchKey(item), index)));
  return compactMatchGroups(groups.map((group, index) => ({
    ...group, prefixes: group.prefixes ?? [], matchPlurals: group.matchPlurals ?? false,
    matches: [...assignments].filter(([item, target]) => item && target === index).map(([item]) => item),
  })));
}
