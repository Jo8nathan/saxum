#!/usr/bin/env node
/**
 * import-world.js — import one world from a JSON file into Supabase.
 *
 * Usage:
 *   node import-world.js <world.json> [--owner <identity_id>] [--author <label>]
 *
 * Env (scripts/.env or process env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Reads the JSON described in supabase/WORLD_JSON_SCHEMA.md, validates it,
 * inserts rows in FK order (world -> rooms -> npcs/items -> exits -> quests),
 * maps JSON array indexes to the generated UUIDs, then prints the new world
 * id and its public path (/w/:id). Exits non-zero with a clear message on
 * validation or insert errors. No interactive prompts.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const IMAGE_STYLES = ['Realistic', 'Cartoonish', 'Minimalist'];

function fail(msg) {
  console.error(`import-world: error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { file: null, owner: null, author: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--owner') {
      args.owner = rest[++i];
      if (!args.owner) fail('--owner requires a value');
    } else if (a === '--author') {
      args.author = rest[++i];
      if (!args.author) fail('--author requires a value');
    } else if (a.startsWith('--')) {
      fail(`unknown option ${a}`);
    } else if (!args.file) {
      args.file = a;
    } else {
      fail(`unexpected argument ${a}`);
    }
  }
  if (!args.file) fail('usage: node import-world.js <world.json> [--owner <identity_id>] [--author <label>]');
  return args;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function asArray(v, name) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`"${name}" must be an array`);
  return v;
}

function checkIndex(value, len, field, arrName) {
  if (!Number.isInteger(value) || value < 0 || value >= len) {
    fail(`"${arrName}" entry has invalid ${field}: ${JSON.stringify(value)} (must be an integer index into ${len} entries)`);
  }
}

function validate(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail('top-level JSON must be an object');
  }
  if (!isNonEmptyString(data.title)) fail('"title" is required and must be a non-empty string');

  const rooms = asArray(data.rooms, 'rooms');
  const exits = asArray(data.exits, 'exits');
  const npcs = asArray(data.npcs, 'npcs');
  const items = asArray(data.items, 'items');
  const quests = asArray(data.quests, 'quests');

  if (rooms.length === 0) fail('"rooms" must contain at least one room');
  rooms.forEach((r, i) => {
    if (typeof r !== 'object' || r === null) fail(`rooms[${i}] must be an object`);
    if (!isNonEmptyString(r.name)) fail(`rooms[${i}].name is required and must be a non-empty string`);
  });

  exits.forEach((e, i) => {
    if (typeof e !== 'object' || e === null) fail(`exits[${i}] must be an object`);
    checkIndex(e.from, rooms.length, '"from"', `exits[${i}]`);
    checkIndex(e.to, rooms.length, '"to"', `exits[${i}]`);
  });

  npcs.forEach((n, i) => {
    if (typeof n !== 'object' || n === null) fail(`npcs[${i}] must be an object`);
    if (!isNonEmptyString(n.name)) fail(`npcs[${i}].name is required and must be a non-empty string`);
    if (n.room !== undefined && n.room !== null) checkIndex(n.room, rooms.length, '"room"', `npcs[${i}]`);
  });

  items.forEach((it, i) => {
    if (typeof it !== 'object' || it === null) fail(`items[${i}] must be an object`);
    if (!isNonEmptyString(it.name)) fail(`items[${i}].name is required and must be a non-empty string`);
    if (it.room !== undefined && it.room !== null) checkIndex(it.room, rooms.length, '"room"', `items[${i}]`);
  });

  quests.forEach((q, i) => {
    if (typeof q !== 'object' || q === null) fail(`quests[${i}] must be an object`);
    if (!isNonEmptyString(q.title)) fail(`quests[${i}].title is required and must be a non-empty string`);
    if (q.giver_npc !== undefined && q.giver_npc !== null) checkIndex(q.giver_npc, npcs.length, '"giver_npc"', `quests[${i}]`);
    if (q.required_item !== undefined && q.required_item !== null && !isNonEmptyString(q.required_item)) {
      fail(`quests[${i}].required_item must be a non-empty string matching an item name`);
    }
  });

  if (data.image_style !== undefined && data.image_style !== null && !IMAGE_STYLES.includes(data.image_style)) {
    fail(`"image_style" must be one of ${IMAGE_STYLES.join('|')} (got ${JSON.stringify(data.image_style)})`);
  }
  if (data.is_public !== undefined && typeof data.is_public !== 'boolean') {
    fail('"is_public" must be a boolean');
  }

  return { rooms, exits, npcs, items, quests };
}

async function insertAll(supabase, table, rows) {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from(table).insert(rows).select('id');
  if (error) fail(`insert into ${table} failed: ${error.message}`);
  if (!data || data.length !== rows.length) {
    fail(`insert into ${table} returned ${data ? data.length : 0} rows, expected ${rows.length}`);
  }
  return data.map((r) => r.id);
}

function str(v, def = '') {
  return v === undefined || v === null ? def : String(v);
}

async function main() {
  const args = parseArgs(process.argv);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('SUPABASE_URL is not set (scripts/.env or environment)');
  if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set (scripts/.env or environment)');

  let raw;
  try {
    raw = fs.readFileSync(args.file, 'utf8');
  } catch (e) {
    fail(`cannot read ${args.file}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`invalid JSON in ${args.file}: ${e.message}`);
  }

  const { rooms, exits, npcs, items, quests } = validate(data);

  const supabase = createClient(url, key);

  // 1. world
  const worldRow = {
    title: data.title.trim(),
    description: str(data.description),
    image_style: data.image_style || 'Realistic',
    image_url: data.cover_image_url || null,
    room_count: rooms.length,
    author_label: args.author !== null ? args.author : str(data.author_label),
    owner_id: args.owner !== null ? args.owner : (data.owner_id || null),
    is_public: data.is_public === undefined ? true : data.is_public,
  };
  const [worldId] = await insertAll(supabase, 'worlds', [worldRow]);

  // 2. rooms -> map index to UUID
  const roomIds = await insertAll(
    supabase,
    'rooms',
    rooms.map((r, i) => ({
      world_id: worldId,
      name: r.name.trim(),
      description: str(r.description),
      image_url: r.image_url || null,
      is_secret: r.is_secret === true,
      x: Number.isInteger(r.x) ? r.x : 0,
      y: Number.isInteger(r.y) ? r.y : 0,
      sort: i,
    }))
  );

  // 3a. npcs (need room ids)
  const npcIds = await insertAll(
    supabase,
    'npcs',
    npcs.map((n) => ({
      world_id: worldId,
      room_id: n.room === undefined || n.room === null ? roomIds[0] : roomIds[n.room],
      name: n.name.trim(),
      role: str(n.role),
      personality: str(n.personality),
      dialogue_seed: str(n.dialogue_seed),
    }))
  );

  // 3b. items (need room ids; room omitted/null => unplaced, room_id NULL)
  const itemIds = await insertAll(
    supabase,
    'items',
    items.map((it) => ({
      world_id: worldId,
      room_id: it.room === undefined || it.room === null ? null : roomIds[it.room],
      name: it.name.trim(),
      description: str(it.description),
    }))
  );
  const itemIdByName = new Map(items.map((it, i) => [it.name.trim().toLowerCase(), itemIds[i]]));

  // 4. exits (need room ids)
  await insertAll(
    supabase,
    'exits',
    exits.map((e) => ({
      world_id: worldId,
      from_room_id: roomIds[e.from],
      to_room_id: roomIds[e.to],
      label: str(e.label),
    }))
  );

  // 5. quests (need npc ids; required_item names resolve to item ids)
  await insertAll(
    supabase,
    'quests',
    quests.map((q, i) => {
      let required_item_id = null;
      if (q.required_item !== undefined && q.required_item !== null) {
        required_item_id = itemIdByName.get(String(q.required_item).trim().toLowerCase()) || null;
        if (!required_item_id) fail(`quests[${i}].required_item "${q.required_item}" matches no item in this world`);
      }
      return {
        world_id: worldId,
        npc_id: q.giver_npc === undefined || q.giver_npc === null ? null : npcIds[q.giver_npc],
        required_item_id,
        title: q.title.trim(),
        objective: str(q.objective),
        reward: str(q.reward),
        sort: i,
      };
    })
  );

  console.log(`Imported world "${data.title.trim()}"`);
  console.log(`  world id: ${worldId}`);
  console.log(`  rooms: ${rooms.length}, exits: ${exits.length}, npcs: ${npcs.length}, items: ${items.length}, quests: ${quests.length}`);
  console.log(`  public path: /w/${worldId}`);
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
