import { singularMatch } from "./grouping-normalization.js";
import { groceryProductName } from "./groceries.js";
import { itemKey } from "./ordering.js";
import type { Profile } from "./grouping-store.js";

function resolveProfileMatch(profile: Profile) {
  const matches = new Map(profile.groups.flatMap(group => group.matches.map(match => [match, group.name] as const)));
  const defaults = new Map(profile.groups.flatMap(group => (group.defaultMatches ?? []).map(match => [match, group.name] as const)));
  const pluralMatches = new Map(profile.groups.filter(group => group.matchPlurals).flatMap(group => group.matches.map(match => [singularMatch(match), group.name] as const)));
  const pluralDefaults = new Map(profile.groups.filter(group => group.matchPlurals).flatMap(group => (group.defaultMatches ?? []).map(match => [singularMatch(match), group.name] as const)));
  return (name: string) => {
    const product = (profile.ignoreQuantities && groceryProductName(name)) || name;
    const exact = matches.get(name) ?? matches.get(product) ?? pluralMatches.get(singularMatch(product));
    if (exact) return exact;
    const prefix = profile.groups.find(group => group.prefixes?.some(prefix => product.startsWith(prefix + " ")));
    return prefix?.name ?? defaults.get(product) ?? pluralDefaults.get(singularMatch(product));
  };
}

export function profileMatcher(profile: Profile) {
  const match = resolveProfileMatch(profile);
  return (name: string) => match(name) ?? "Other";
}

// Keep known Other rules distinct from the fallback so discovery never overrides a match.
export function discoverProfileItems(profile: Profile, names: string[]): Profile {
  const other = profile.groups.find(group => group.name === "Other");
  if (!other) throw new Error("The Other group is missing.");
  const match = resolveProfileMatch(profile);
  const discovered = new Set<string>();
  for (const value of names) {
    const name = itemKey(value);
    if (!name || match(name) !== undefined) continue;
    const product = (profile.ignoreQuantities && groceryProductName(name)) || name;
    const key = other.matchPlurals ? singularMatch(product) : product;
    discovered.add(match(key) === undefined ? key : product);
  }
  if (!discovered.size) return profile;
  return {
    ...profile,
    // Discovery must stay below existing exact/default aliases in matching priority.
    // The editor shows these aliases as chips and promotes them when explicitly saved.
    groups: profile.groups.map(group => group === other
      ? { ...group, defaultMatches: [...(group.defaultMatches ?? []), ...discovered] } : group),
  };
}

export function assignProfileItem(profile: Profile, name: string, destination: string): Profile {
  const target = profile.groups.find(group => group.name === destination);
  if (!target) throw new Error("The destination group is missing.");
  const product = (profile.ignoreQuantities && groceryProductName(name)) || name;
  const match = target.matchPlurals ? singularMatch(product) : product;
  const keep = (value: string) => value !== name && value !== product
    && (!target.matchPlurals || singularMatch(value) !== match);
  return {
    ...profile,
    groups: profile.groups.map(group => ({
      ...group,
      matches: [...group.matches.filter(keep), ...(group === target ? [match] : [])],
      defaultMatches: group.defaultMatches?.filter(keep),
    })),
  };
}
