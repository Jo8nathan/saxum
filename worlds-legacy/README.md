# Legacy worlds

Everything in this directory that makes the old GitHub Spark worlds
importable into the new Supabase-backed Saxum.

## Source

`legacy-worlds.json` — read-only extraction from the retired GitHub Spark app
(source: `https://saxum-ai-text-advent--jo8n.github.app/`, extracted
2026-10-03). Top-level shape:

```json
{ "exported_at": ..., "extraction_notes": "...", "source": "...", "worlds": [...] }
```

Each world has `title`, `metadata` (description, image_style, author),
`rooms[]` (name, description, `image_url` as inline SVG data URI, `npcs[]`,
`items[]`, `exits[]` where `destination` is a **room name**), `quests[]`
(giver, location, needs, reward, status), and map edge pairs observed from
the canvas map.

- **Undersea Dome** — 10 fully detailed rooms, 3 quests, 12 `map_edges`.
- **Forgotten Temple** — room 0 (`Temple Gate`) fully detailed; rooms 1–9
  (flagged `unvisited_note`) have names + descriptions only, 3 quests,
  8 `map_edges_observed`.

Room images are inline SVG data URIs (procedural gradients with the room
name rendered as text), captured verbatim from the extraction.

## Conversion

`../scripts/convert-legacy.js` (Node builtins only) converts
`legacy-worlds.json` into the documented importer input format
(`../supabase/WORLD_JSON_SCHEMA.md`):

```bash
cd scripts && node convert-legacy.js [input.json] [outdir]
# defaults: ../worlds-legacy/legacy-worlds.json -> ../worlds-legacy/
```

It writes `undersea-dome.json` and `forgotten-temple.json`. Exit
destinations and quest giver names are resolved to integer indexes by room /
NPC name (trimmed, case-insensitive); any unresolvable reference prints a
WARNING to stderr and the entry is skipped (quests fall back to
`giver_npc: null`) — the script never crashes on bad references. Rooms get
`x`/`y` map coordinates on a 4-column grid, since the legacy data has none.

Mapping decisions:

- `title` as-is; `description` = `"(Legacy import from the original Saxum) "`
  + the legacy description; `image_style` from `metadata.image_style`;
  `cover_image_url` = first room's data URI; `author_label` = `"Jo8nathan"`;
  `owner_id` = `"legacy-import"` (keeps them out of any user's "My Worlds";
  they show up in public Explore); `is_public` = `true`.
- `is_secret` is `false` for all rooms (the legacy data contains no secret
  flag; the converter would honor one if present).
- Room `image_url` data URIs are kept unchanged — they render fine as
  `<img>` src values.
- NPC `dialogue_seed` = `[Quest Giver] ` prefix when the legacy
  `quest_badge` is set (the legacy value is boolean `true`, so a generic
  marker is used rather than `[true]`), followed by the dialogue lines joined
  with newlines. `personality` is empty (legacy data has none).
- Item `description` = `[<badge>] ` prefix when the legacy `badge` is set
  (e.g. `[Quest Item] `), plus the description; legacy `null` descriptions
  become `""`.
- **Undersea Dome exits**: each room's `exits[]` is primary; then
  `map_edges` pairs are added with label `"Continue"` only for directed
  (from → to) pairs not already covered. (All 12 observed pairs were already
  covered by room exits, so the supplement added none — the exits keep their
  original labels such as "Climb ladder".)
- **Forgotten Temple**: room 0 (`Temple Gate`) keeps its own `exits[]`;
  rooms 1–9 are stubs (names + descriptions only — no NPCs, items, or exits),
  and the observed map edges are intentionally **not** added.
- Quests: `title` = `needs` (fallback `"Request from {giver}"`);
  `objective` = `"{giver} at {location} needs: {needs}."` (+ ` [status]`
  when status isn't `Active`); `reward` as-is; `giver_npc` = NPC index by
  name, or `null` with a warning when the giver isn't an NPC in the data.

Conversion result:

- **Undersea Dome** — rooms: 10, npcs: 3, items: 23, exits: 21, quests: 3,
  warnings: 0.
- **Forgotten Temple** — rooms: 10, npcs: 1, items: 2, exits: 3, quests: 3,
  warnings: 2 (`"Curious Explorer"` and `"Temple Priest"` quest givers have
  no matching NPC in the legacy data, so their quests import with
  `giver_npc: null` and are world-level objectives).

Both outputs were validated by running the real importer against them with
dummy Supabase credentials: validation passed and the importer only failed
at the insert step (`insert into worlds failed: TypeError: fetch failed`,
i.e. no connection), proving they are valid import input.

## Import

```bash
cd scripts && npm install && node import-world.js ../worlds-legacy/undersea-dome.json --owner legacy-import --author "Jo8nathan"
cd scripts && npm install && node import-world.js ../worlds-legacy/forgotten-temple.json --owner legacy-import --author "Jo8nathan"
```

## Caveats

- **Forgotten Temple stub rooms have no exits, so navigation into them is
  one-way**: only `Temple Gate` has exits (to `Grand Hall`, `Dark Passage`,
  `Winding Path`). Rooms 4–9 (`Mystery Room`, `Chasm`, `Clearing`,
  `Hidden Loft`, `Chasm Floor`, `Hidden Platform`) are not reachable at all
  from the exit graph — the legacy extraction never visited them, so their
  connections are unknown. The 8 `map_edges_observed` pairs were deliberately
  left out (they were read visually from a pannable canvas, and per the
  extraction spec the unvisited rooms are stubs). If fuller connectivity is
  wanted later, those edges could be hand-reviewed and added with the label
  "Continue".
- Legacy NPC dialogue is a flat list of lines (not conditional dialogue);
  all lines are preserved in `dialogue_seed`.
- Quest items whose descriptions were intentionally not opened during
  extraction (per the extraction notes) import with description `""` /
  `[Quest Item]`-style badge prefixes only.
