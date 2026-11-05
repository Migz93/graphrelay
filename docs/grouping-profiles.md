# Grouping profile files

GraphRelay stores one JSON file per profile in `/config/todo/groupings`. On the GDLXGS deployment this is `/opt/graphrelay/todo/groupings`. The default profile uses `groceries.json`. New profiles use a filename based on their name. Renaming a profile in the app keeps its filename stable.

Existing profiles migrate automatically. Files are the active source of profile data. Saving in the popup replaces the selected file atomically. External edits are read when opening profiles or syncing a list. Write external edits with an atomic file replacement to avoid a partially written file being read during sync. Invalid files produce an error and are preserved for correction.

Copy the JSON files into the same directory on another instance to reuse them. Keep each profile's `id` stable because enrolled lists refer to it. Each file needs a unique ID and `schemaVersion: 1`. Existing files take precedence during migration.

## Example

```json
{
  "schemaVersion": 1,
  "id": "freezer-items",
  "name": "Freezer items",
  "grocery": false,
  "ignoreQuantities": true,
  "groups": [
    {
      "name": "Frozen",
      "matches": ["garden peas", "ice cream"],
      "prefixes": ["frozen"]
    },
    {
      "name": "Other",
      "matches": []
    }
  ]
}
```

The group order in the file is the display and prefix order. Each profile needs an `Other` group.

- `matches` contains exact item names, ignoring case and repeated spaces.
- `defaultMatches` is an optional list of default aliases. The Groceries file includes its built-in aliases here. The popup combines default aliases and additional matches into editable chips. Saving from the popup stores the full edited item set in `matches` and clears `defaultMatches`, so moved or removed default items stay changed.
- `matchPlurals` is an optional per-group boolean. When enabled, a match covers singular and plural English forms, such as apple/apples and potato/potatoes. Saved matches use one singular form. It defaults to false for existing files.
- `prefixes` optionally matches a storage word followed by a space, such as frozen or tinned.
- `ignoreQuantities` enables aisle matching without a leading count such as 2 x, or a trailing count, weight, volume or pack size. Original item names and duplicate identity keep their quantities.
- `grocery` controls the grocery-specific editor labels and default-group protection.

A list's remembered corrections take precedence, followed by exact matches, prefix rules and default aliases. Unknown items go to Other. Profile files contain shared grouping rules. Per-list settings and remembered corrections remain in the local database.
