import pluralize from "pluralize";

// Shared by the browser and API: a plural chip must not collapse onto an exact
// singular owned by another group. Exact names take precedence in the matcher.
export function compactMatchGroups<T extends { matches: string[]; matchPlurals?: boolean }>(groups: T[]): T[] {
  const owners = new Map(groups.flatMap((group, index) => group.matches.map(name => [name, index] as const)));
  return groups.map((group, index) => ({
    ...group,
    matches: [...new Set(group.matches.map(name => {
      const singular = pluralize.singular(name);
      return group.matchPlurals && (!owners.has(singular) || owners.get(singular) === index) ? singular : name;
    }))],
  }));
}
