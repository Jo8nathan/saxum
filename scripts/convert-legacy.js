#!/usr/bin/env node
/**
 * convert-legacy.js — convert legacy GitHub Spark world exports into the
 * documented importer input format (supabase/WORLD_JSON_SCHEMA.md).
 *
 * Usage:
 *   node convert-legacy.js [input.json] [outdir]
 *
 * Defaults:
 *   input.json -> ../worlds-legacy/legacy-worlds.json
 *   outdir     -> ../worlds-legacy/
 *
 * For each legacy world it writes <slug>.json (e.g. undersea-dome.json,
 * forgotten-temple.json) containing {title, description, image_style,
 * cover_image_url, author_label, owner_id, is_public, rooms, exits, npcs,
 * items, quests} with exits/npcs/items/quests referencing rooms by integer
 * index, ready for scripts/import-world.js.
 *
 * Exit destinations and quest giver names are resolved to indexes by room /
 * NPC name (trimmed, case-insensitive). Any unresolvable reference prints a
 * WARNING to stderr and the entry is skipped (quests fall back to
 * giver_npc: null); the script never crashes on bad references.
 *
 * Node builtins only (fs/path).
 */

const fs = require('fs');
const path = require('path');

const LEGACY_PREFIX = '(Legacy import from the original Saxum) ';
const GRID_COLUMNS = 4;

function warn(msg) {
  console.error(`convert-legacy: WARNING: ${msg}`);
}

function norm(s) {
  return String(s === undefined || s === null ? '' : s).trim().toLowerCase();
}

function slugify(title) {
  return (
    norm(title)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'world'
  );
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

/** Room is a "stub" when it was never visited in the legacy extraction:
 *  it only carries a name + description (flagged by unvisited_note), so it
 *  contributes no NPCs, items, or exits. */
function isStubRoom(room) {
  return Boolean(room && room.unvisited_note);
}

/** Legacy data marks secrets with a secret-ish flag if at all; default false. */
function isSecretRoom(room) {
  if (!room || typeof room !== 'object') return false;
  for (const key of Object.keys(room)) {
    if (key.toLowerCase().includes('secret')) {
      const v = room[key];
      if (v === true || v === 'true' || v === 1) return true;
    }
  }
  return false;
}

function convertWorld(world) {
  const warnings = [];
  const w = (msg) => {
    warnings.push(msg);
    warn(`[${world.title}] ${msg}`);
  };

  const metadata = world.metadata || {};
  const legacyRooms = Array.isArray(world.rooms) ? world.rooms : [];

  // --- rooms ---
  const roomIndexByName = new Map();
  const rooms = legacyRooms.map((r, i) => {
    const name = str(r.name).trim();
    const key = norm(name);
    if (roomIndexByName.has(key)) {
      w(`duplicate room name "${name}" (room ${i}); keeping first occurrence`);
    } else {
      roomIndexByName.set(key, i);
    }
    return {
      name,
      description: str(r.description),
      image_url: r.image_url === undefined || r.image_url === null ? '' : String(r.image_url),
      is_secret: isSecretRoom(r),
      x: i % GRID_COLUMNS,
      y: Math.floor(i / GRID_COLUMNS),
    };
  });

  const resolveRoom = (name, ctx) => {
    const idx = roomIndexByName.get(norm(name));
    if (idx === undefined) {
      w(`${ctx}: room "${str(name)}" not found; entry skipped`);
      return null;
    }
    return idx;
  };

  // --- npcs & items (skipping stub rooms) ---
  const npcs = [];
  const items = [];
  legacyRooms.forEach((r, roomIdx) => {
    if (isStubRoom(r)) return;
    for (const n of r.npcs || []) {
      if (!str(n.name).trim()) {
        w(`room "${rooms[roomIdx].name}": NPC with empty name skipped`);
        continue;
      }
      npcs.push({
        room: roomIdx,
        name: str(n.name).trim(),
        role: str(n.role),
        personality: '',
        dialogue_seed:
          (n.quest_badge ? '[Quest Giver] ' : '') +
          (Array.isArray(n.dialogue) ? n.dialogue.map(str).join('\n') : ''),
      });
    }
    for (const it of r.items || []) {
      if (!str(it.name).trim()) {
        w(`room "${rooms[roomIdx].name}": item with empty name skipped`);
        continue;
      }
      items.push({
        room: roomIdx,
        name: str(it.name).trim(),
        description: (it.badge ? `[${str(it.badge)}] ` : '') + str(it.description),
      });
    }
  });

  const npcIndexByName = new Map();
  npcs.forEach((n, i) => {
    const key = norm(n.name);
    if (!npcIndexByName.has(key)) npcIndexByName.set(key, i);
  });

  // --- exits ---
  const exits = [];
  const coveredPairs = new Set(); // "fromIdx>toIdx" directed pairs already emitted
  const addExit = (from, to, label) => {
    exits.push({ from, to, label: str(label) });
    coveredPairs.add(`${from}>${to}`);
  };

  legacyRooms.forEach((r, roomIdx) => {
    if (isStubRoom(r)) return; // stub rooms keep no exits
    for (const e of r.exits || []) {
      const to = resolveRoom(e.destination, `exit "${str(e.label)}" from "${rooms[roomIdx].name}"`);
      if (to === null) continue;
      addExit(roomIdx, to, e.label);
    }
  });

  // Supplement with observed map edges for any directed pair not already covered.
  // (Stub-room worlds don't use these: per spec the Forgotten Temple keeps
  // only room 0's own exits.)
  const stubWorld = legacyRooms.length > 0 && legacyRooms.every((r, i) => i === 0 || isStubRoom(r));
  if (!stubWorld) {
    const edges = world.map_edges || world.map_edges_observed || [];
    for (const [fromName, toName] of edges) {
      const from = roomIndexByName.get(norm(fromName));
      const to = roomIndexByName.get(norm(toName));
      if (from === undefined || to === undefined) {
        w(`map edge "${str(fromName)}" -> "${str(toName)}": room not found; skipped`);
        continue;
      }
      if (!coveredPairs.has(`${from}>${to}`)) {
        addExit(from, to, 'Continue');
      }
    }
  }

  // --- quests ---
  const quests = [];
  for (const q of world.quests || []) {
    const giver = str(q.giver).trim();
    const location = str(q.location).trim();
    const needs = str(q.needs).trim();
    const title = needs || (giver ? `Request from ${giver}` : 'Untitled request');

    let objective = '';
    if (giver || location || needs) {
      objective = `${giver}${location ? ` at ${location}` : ''}${needs ? ` needs: ${needs}.` : '.'}`;
    }
    const status = str(q.status).trim();
    if (status && status !== 'Active') objective += ` [${status}]`;

    let giver_npc = null;
    if (giver) {
      const idx = npcIndexByName.get(norm(giver));
      if (idx === undefined) {
        w(`quest "${title}": giver NPC "${giver}" not found; giver_npc set to null`);
      } else {
        giver_npc = idx;
      }
    }

    quests.push({
      title,
      objective,
      reward: str(q.reward),
      giver_npc,
    });
  }

  const description = LEGACY_PREFIX + str(metadata.description);

  const out = {
    title: str(world.title),
    description,
    image_style: metadata.image_style || 'Realistic',
    cover_image_url:
      legacyRooms.length > 0 && legacyRooms[0].image_url
        ? String(legacyRooms[0].image_url)
        : '',
    author_label: 'Jo8nathan',
    owner_id: 'legacy-import',
    is_public: true,
    rooms,
    exits,
    npcs,
    items,
    quests,
  };

  return { out, warnings, counts: { rooms: rooms.length, npcs: npcs.length, items: items.length, exits: exits.length, quests: quests.length } };
}

function main() {
  const scriptDir = __dirname;
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(scriptDir, '..', 'worlds-legacy', 'legacy-worlds.json');
  const outDir = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(scriptDir, '..', 'worlds-legacy');

  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (e) {
    console.error(`convert-legacy: error: cannot read ${inputPath}: ${e.message}`);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`convert-legacy: error: invalid JSON in ${inputPath}: ${e.message}`);
    process.exit(1);
  }
  const worlds = Array.isArray(data.worlds) ? data.worlds : [];
  if (worlds.length === 0) {
    console.error('convert-legacy: error: no worlds found in input (expected {worlds: [...]})');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const world of worlds) {
    const { out, warnings, counts } = convertWorld(world);
    const slug = slugify(out.title);
    const dest = path.join(outDir, `${slug}.json`);
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`"${out.title}" -> ${dest}`);
    console.log(
      `  rooms: ${counts.rooms}, npcs: ${counts.npcs}, items: ${counts.items}, ` +
      `exits: ${counts.exits}, quests: ${counts.quests}, warnings: ${warnings.length}`
    );
  }
}

main();
