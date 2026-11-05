import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { itemKey } from "./ordering.js";

export type ProfileGroup = { name: string; matches: string[]; defaultMatches?: string[]; prefixes?: string[] };
export type Profile = { id: string; name: string; groups: ProfileGroup[]; grocery: boolean; ignoreQuantities?: boolean };

function validNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(name => typeof name === "string" && !!name.trim());
}

function parseProfile(value: unknown, file: string): Profile {
  const profile = value as Partial<Profile> & { schemaVersion?: number } | null;
  const groups = profile?.groups;
  if (!profile || profile.schemaVersion !== 1
    || typeof profile.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(profile.id) || profile.id === "new"
    || typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 80
    || typeof profile.grocery !== "boolean" || (profile.ignoreQuantities !== undefined && typeof profile.ignoreQuantities !== "boolean")
    || !Array.isArray(groups) || groups.length < 1 || groups.length > 30
    || !groups.every(group => group && typeof group.name === "string" && !!group.name.trim() && group.name.length <= 40
      && validNames(group.matches) && (group.defaultMatches === undefined || validNames(group.defaultMatches))
      && (group.prefixes === undefined || validNames(group.prefixes)))) {
    throw new Error("Grouping profiles: " + file + " has an unsupported or invalid profile format.");
  }
  const names = groups.map(group => itemKey(group.name));
  const matches = groups.flatMap(group => group.matches.map(itemKey));
  if (!groups.some(group => group.name === "Other") || new Set(names).size !== names.length || new Set(matches).size !== matches.length) {
    throw new Error("Grouping profiles: " + file + " needs unique group names, unique item matches and an Other group.");
  }
  return {
    id: profile.id, name: profile.name.trim(), grocery: profile.grocery,
    ignoreQuantities: profile.ignoreQuantities ?? false,
    groups: groups.map(group => ({
      name: group.name.trim(), matches: group.matches.map(itemKey),
      defaultMatches: group.defaultMatches?.map(itemKey), prefixes: group.prefixes?.map(itemKey),
    })),
  };
}

export class GroupingStore {
  constructor(private directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  private entries() {
    const entries = readdirSync(this.directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => {
        let value: unknown;
        try {
          value = JSON.parse(readFileSync(join(this.directory, entry.name), "utf8"));
        } catch {
          throw new Error("Grouping profiles: " + entry.name + " could not be read as JSON.");
        }
        return { file: entry.name, profile: parseProfile(value, entry.name) };
      });
    if (new Set(entries.map(entry => entry.profile.id)).size !== entries.length) {
      throw new Error("Grouping profiles: each JSON file must have a unique profile ID.");
    }
    return entries;
  }

  read() {
    return this.entries().map(entry => entry.profile);
  }

  save(profile: Profile) {
    const validated = parseProfile({ schemaVersion: 1, ...profile }, profile.name);
    const entries = this.entries();
    let file = entries.find(entry => entry.profile.id === profile.id)?.file;
    if (!file) {
      const slug = profile.id === "groceries" ? "groceries" : profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "profile";
      file = slug + ".json";
      let suffix = 2;
      while (entries.some(entry => entry.file === file)) file = slug + "-" + suffix++ + ".json";
    }
    const target = join(this.directory, file);
    const temporary = join(this.directory, "." + randomBytes(12).toString("hex") + ".tmp");
    try {
      writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, ...validated }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      renameSync(temporary, target);
    } finally {
      try { unlinkSync(temporary); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
