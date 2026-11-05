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
