# World JSON Schema (importer input)

Consumed by `scripts/import-world.js`:

```
node import-world.js <world.json> [--owner <identity_id>] [--author <label>]
```

The importer validates the file, inserts rows in FK order
(world → rooms → npcs/items → exits → quests), maps array indexes to the
generated UUIDs, then prints the new world id and its public path `/w/:id`.

## Field reference

Top-level object:

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | Non-empty. World display title. |
| `description` | string | no | Defaults to `""`. |
| `image_style` | string | no | One of `Realistic` \| `Cartoonish` \| `Minimalist`. Defaults to `Realistic`. |
| `cover_image_url` | string | no | Cover image URL (`worlds.image_url`). |
| `author_label` | string | no | Author credit (`worlds.author_label`). Overridden by `--author`. |
| `owner_id` | string | no | Anonymous identity id (`worlds.owner_id`). Overridden by `--owner`. |
| `is_public` | boolean | no | Defaults to `true`. Must be a boolean if present. |
| `rooms` | array | **yes** | Must contain **at least one** room. |
| `exits` | array | no | Defaults to `[]`. |
| `npcs` | array | no | Defaults to `[]`. |
| `items` | array | no | Defaults to `[]`. |
| `quests` | array | no | Defaults to `[]`. |

### rooms[]

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | Non-empty. |
| `description` | string | no | Defaults to `""`. |
| `image_url` | string | no | Optional per-room illustration. |
| `is_secret` | boolean | no | Defaults to `false`. Only `true` is treated as secret. |
| `x`, `y` | integer | no | Map canvas coordinates. Defaults to `0`. Non-integers are coerced to `0`. |

Import order within rooms sets `rooms.sort` (0, 1, 2, …).

### exits[]

Each entry connects two rooms by **zero-based index into `rooms[]`**.
Both directions need their own entry.

| Field | Type | Required | Notes |
|---|---|---|---|
| `from` | integer | **yes** | Valid index into `rooms[]`. |
| `to` | integer | **yes** | Valid index into `rooms[]`. |
| `label` | string | no | Defaults to `""`, e.g. `"North"`. |

### npcs[]

| Field | Type | Required | Notes |
|---|---|---|---|
| `room` | integer | no | Index into `rooms[]`; **defaults to `0` (first room) if omitted or null**. |
| `name` | string | **yes** | Non-empty. |
| `role` | string | no | Defaults to `""`. |
| `personality` | string | no | Defaults to `""`. |
| `dialogue_seed` | string | no | Defaults to `""`. |

### items[]

| Field | Type | Required | Notes |
|---|---|---|---|
| `room` | integer | no | Index into `rooms[]`. If omitted or null, the item is **unplaced** (`room_id` NULL) until the API places or hands it out. |
| `name` | string | **yes** | Non-empty. |
| `description` | string | no | Defaults to `""`. |

### quests[]

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | Non-empty. |
| `objective` | string | no | Defaults to `""`. |
| `reward` | string | no | Defaults to `""`. |
| `giver_npc` | integer \| null | no | Index into `npcs[]`; `null`/omitted means no quest giver (`npc_id` NULL). |

Import order within quests sets `quests.sort` (0, 1, 2, …).

## Validation errors

The importer exits non-zero with a message naming the offending field when:

- the file is unreadable or not valid JSON, or the top level is not an object;
- `title` is missing/empty;
- `rooms` is not a non-empty array, or any room lacks a non-empty `name`;
- any exit's `from`/`to` is not a valid index into `rooms[]`;
- any NPC's `room` (when given) is not a valid index into `rooms[]`, or an NPC lacks a non-empty `name`;
- any item's `room` (when given) is not a valid index into `rooms[]`, or an item lacks a non-empty `name`;
- any quest's `giver_npc` (when given) is not a valid index into `npcs[]`, or a quest lacks a non-empty `title`;
- `image_style` is not one of the three allowed values;
- `is_public` is present but not a boolean;
- any insert fails (message includes the Supabase error).

Nothing is rolled back automatically on a partial failure: if an insert
fails midway, re-running the importer will create a duplicate world — delete
the partial world first (children cascade). The API is expected to offer a
single-transaction import path later.

## Full example

```json
{
  "title": "The Sunken Lighthouse",
  "description": "A haunted lighthouse rises from a drowned harbor. Find the keeper's lantern and light the way home.",
  "image_style": "Realistic",
  "cover_image_url": "https://example.com/covers/sunken-lighthouse.jpg",
  "author_label": "Mara Voss",
  "owner_id": "anon_01HZX7QK9M4T",
  "is_public": true,
  "rooms": [
    {
      "name": "Harbor Steps",
      "description": "Slick stone steps descend into black water. Gulls wheel overhead, screaming at nothing.",
      "x": 0,
      "y": 2
    },
    {
      "name": "Lighthouse Door",
      "description": "A salt-swollen oak door, its brass handle green with verdigris. Something knocks from the other side — three times, then silence.",
      "x": 1,
      "y": 2
    },
    {
      "name": "Spiral Stair",
      "description": "Narrow steps corkscrew upward into darkness. Each tread is worn into a shallow bowl by a century of boots.",
      "image_url": "https://example.com/rooms/spiral-stair.jpg",
      "x": 2,
      "y": 2
    },
    {
      "name": "Lamp Room",
      "description": "The great lens sits dark and cold, its prisms filmed with salt. The keeper's lantern is gone from its cradle.",
      "x": 3,
      "y": 2
    },
    {
      "name": "Keeper's Quarters",
      "description": "A bunk, a cold stove, a desk covered in logbooks. One drawer hangs open, as if someone left in a hurry.",
      "is_secret": true,
      "x": 2,
      "y": 1
    }
  ],
  "exits": [
    { "from": 0, "to": 1, "label": "East" },
    { "from": 1, "to": 0, "label": "West" },
    { "from": 1, "to": 2, "label": "Up" },
    { "from": 2, "to": 1, "label": "Down" },
    { "from": 2, "to": 3, "label": "Up" },
    { "from": 3, "to": 2, "label": "Down" },
    { "from": 2, "to": 4, "label": "Hidden door" },
    { "from": 4, "to": 2, "label": "Stairs" }
  ],
  "npcs": [
    {
      "room": 1,
      "name": "Old Tam",
      "role": "retired ferryman",
      "personality": "Gruff but kind; speaks in short sentences; afraid of the lighthouse.",
      "dialogue_seed": "You shouldn't be here after dark. The light's been out ten years, and things walk the stair that ain't the keeper."
    },
    {
      "room": 4,
      "name": "The Keeper",
      "role": "ghost of the lighthouse keeper",
      "personality": "Melancholic and formal; repeats himself; bound to the lamp room.",
      "dialogue_seed": "The lantern... I set it down somewhere. The log will tell you where. Light it, and I can rest."
    }
  ],
  "items": [
    {
      "room": 4,
      "name": "Keeper's logbook",
      "description": "Water-stained pages. The last entry: 'Hid the lantern where the gulls can't steal it — beneath the third tread from the top.'"
    },
    {
      "room": 2,
      "name": "Brass key",
      "description": "Heavy and cold, stamped with a wave crest."
    },
    {
      "name": "Keeper's lantern",
      "description": "An oil lantern that burns with a pale blue flame. It feels warm, impossibly warm."
    }
  ],
  "quests": [
    {
      "title": "Light the Lamp",
      "objective": "Find the keeper's lantern and place it in the lamp room's cradle.",
      "reward": "The harbor lights return; the Keeper rests.",
      "giver_npc": 1
    },
    {
      "title": "Read the Log",
      "objective": "Find the keeper's logbook and learn where the lantern is hidden.",
      "reward": "A clue to the lantern's location.",
      "giver_npc": null
    }
  ]
}
```

Notes on the example:

- The lantern has no `room`, so it imports unplaced (`room_id` NULL) — the
  game logic can reveal or grant it later (e.g. via the "third tread" clue).
- `Keeper's Quarters` is secret (`is_secret: true`) and only reachable via
  the "Hidden door" exit; the API should hide it until `secrets_found`
  includes it.
- The second quest has no giver (`giver_npc: null`); the API can surface it
  as a world-level objective.
