import pluralize from "pluralize";
import { groceryProductName } from "./groceries.js";
import type { Profile } from "./grouping-store.js";

export function profileMatcher(profile: Profile) {
  const matches = new Map(profile.groups.flatMap(group => group.matches.map(match => [match, group.name] as const)));
  const defaults = new Map(profile.groups.flatMap(group => (group.defaultMatches ?? []).map(match => [match, group.name] as const)));
  const pluralMatches = new Map(profile.groups.filter(group => group.matchPlurals).flatMap(group => group.matches.map(match => [pluralize.singular(match), group.name] as const)));
  const pluralDefaults = new Map(profile.groups.filter(group => group.matchPlurals).flatMap(group => (group.defaultMatches ?? []).map(match => [pluralize.singular(match), group.name] as const)));
  return (name: string) => {
    const product = profile.ignoreQuantities ? groceryProductName(name) : name;
    const exact = matches.get(name) ?? matches.get(product) ?? pluralMatches.get(pluralize.singular(product));
    if (exact) return exact;
    const prefix = profile.groups.find(group => group.prefixes?.some(prefix => product.startsWith(prefix + " ")));
    return prefix?.name ?? defaults.get(product) ?? pluralDefaults.get(pluralize.singular(product)) ?? "Other";
  };
}

export function assignProfileItem(profile: Profile, name: string, destination: string): Profile {
  const target = profile.groups.find(group => group.name === destination);
  if (!target) throw new Error("The destination group is missing.");
  const product = (profile.ignoreQuantities && groceryProductName(name)) || name;
  const match = target.matchPlurals ? pluralize.singular(product) : product;
  const keep = (value: string) => value !== name && value !== product
    && (!target.matchPlurals || pluralize.singular(value) !== match);
  return {
    ...profile,
    groups: profile.groups.map(group => ({
      ...group,
      matches: [...group.matches.filter(keep), ...(group === target ? [match] : [])],
      defaultMatches: group.defaultMatches?.filter(keep),
    })),
  };
}
