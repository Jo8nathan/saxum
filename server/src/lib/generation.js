'use strict';

/**
 * Async world-generation pipeline. Called fire-and-forget from the
 * POST /api/worlds/generate handler; it drives the generation_jobs row
 * through stages and inserts the finished world.
 *
 * Stages / progress:
 *   outline   0 → 40  (Groq JSON outline)
 *   rooms    40 → 60  (insert world + rooms)
 *   images   60 → 75  (cover + per-room Pollinations URLs)
 *   populate 75 → 95  (npcs, items, exits, quests)
 *   finalize 95 → 100 (room_count, status done)
 */

const { chat } = require('./groq');
const { coverUrl, roomUrl } = require('./images');

async function setJob(supabase, jobId, patch) {
  await supabase.from('generation_jobs').update(patch).eq('id', jobId);
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function buildOutlinePrompt({ title, theme, room_count, image_style }) {
  return `You are a game designer creating a text adventure game world for the platform "Saxum".

World title: ${title}
Theme / premise: ${theme}
Target number of rooms: ${room_count}
Art style: ${image_style}

Design a cohesive world with exactly ${room_count} rooms laid out on a simple 2D map (x/y integer coordinates). Include at least one secret room (is_secret true) hidden behind an ordinary exit.

Return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "description": "2-3 sentence evocative world description",
  "rooms": [
    { "name": "Room Name", "description": "2-3 vivid sentences", "x": 0, "y": 0, "is_secret": false, "image_prompt": "short visual description for an illustrator" }
  ],
  "exits": [ { "from": 0, "to": 1, "label": "North" } ],
  "npcs": [ { "room": 0, "name": "Name", "role": "Role", "personality": "1 sentence", "dialogue_seed": "2-3 sentences of persona/background the AI actor will use" } ],
  "items": [ { "room": 0, "name": "Item Name", "description": "1-2 sentences" } ],
  "quests": [ { "title": "Quest Title", "objective": "What the player must do", "reward": "Reward name", "giver_npc": 0, "required_item": "Item Name" } ]
}

Rules:
- "exits" use zero-based indexes into "rooms". Every room must be reachable from room 0 via exits. Labels are short directions or feature names (e.g. "North", "Through the archway").
- 3-6 NPCs total, each in a valid room index.
- 4-8 items total, each in a valid room index. Exactly ONE secret room minimum.
- 2-4 quests. "giver_npc" is a zero-based index into "npcs", or null if no giver.
- At least one quest should be a FETCH quest: the player finds a specific item in the world and hands it to an NPC. For fetch quests set "required_item" to the EXACT name of an item from "items" and make the objective say who wants it. Other quests use "required_item": null.
- Keep every string under 400 characters. No profanity. Keep it family-friendly.`;
}

/** Sanitize a Groq-parsed outline into safe, bounded structures. */
function normalizeOutline(raw, roomCount) {
  if (!raw || typeof raw !== 'object') throw new Error('Model returned an invalid outline');
  const description = String(raw.description || '').slice(0, 1200);

  const roomsSrc = Array.isArray(raw.rooms) ? raw.rooms.slice(0, roomCount) : [];
  if (roomsSrc.length < 3) throw new Error('Model returned too few rooms');
  const rooms = roomsSrc.map((r, i) => ({
    name: String(r?.name || `Room ${i + 1}`).slice(0, 120),
    description: String(r?.description || '').slice(0, 2000),
    x: clampInt(r?.x, -50, 50, i),
    y: clampInt(r?.y, -50, 50, 0),
    is_secret: r?.is_secret === true,
    image_prompt: String(r?.image_prompt || r?.name || 'fantasy scene').slice(0, 300),
    sort: i,
  }));

  const n = rooms.length;
  const validIdx = (v) => Number.isInteger(v) && v >= 0 && v < n;
  const exits = (Array.isArray(raw.exits) ? raw.exits : [])
    .filter((e) => validIdx(e?.from) && validIdx(e?.to) && e.from !== e.to)
    .slice(0, n * 4)
    .map((e) => ({ from: e.from, to: e.to, label: String(e?.label || 'Onward').slice(0, 120) }));

  const npcs = (Array.isArray(raw.npcs) ? raw.npcs : [])
    .filter((x) => validIdx(x?.room))
    .slice(0, 8)
    .map((x) => ({
      room: x.room,
      name: String(x?.name || 'Stranger').slice(0, 120),
      role: String(x?.role || '').slice(0, 200),
      personality: String(x?.personality || '').slice(0, 500),
      dialogue_seed: String(x?.dialogue_seed || '').slice(0, 1000),
    }));

  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((x) => validIdx(x?.room))
    .slice(0, 12)
    .map((x) => ({
      room: x.room,
      name: String(x?.name || 'Trinket').slice(0, 120),
      description: String(x?.description || '').slice(0, 1000),
    }));

  const quests = (Array.isArray(raw.quests) ? raw.quests : [])
    .slice(0, 6)
    .map((q, i) => ({
      title: String(q?.title || `Quest ${i + 1}`).slice(0, 160),
      objective: String(q?.objective || '').slice(0, 1000),
      reward: String(q?.reward || '').slice(0, 300),
      giver_npc: validIdx(q?.giver_npc) ? q.giver_npc : null,
      required_item:
        typeof q?.required_item === 'string' && q.required_item.trim()
          ? q.required_item.trim().slice(0, 120)
          : null,
      sort: i,
    }));

  return { description, rooms, exits, npcs, items, quests };
}

async function insertWorldFromOutline(supabase, jobId, params, outline) {
  const { randomUUID } = require('crypto');
  const worldId = randomUUID();

  await setJob(supabase, jobId, { stage: 'rooms', progress: 40 });

  const { error: worldErr } = await supabase.from('worlds').insert({
    id: worldId,
    title: params.title,
    description: outline.description || params.theme,
    image_style: params.image_style,
    image_url: null, // set in the images stage
    room_count: outline.rooms.length,
    author_label: params.author_label,
    owner_id: params.owner_id,
    is_public: true,
    play_count: 0,
  });
  if (worldErr) throw worldErr;
  await setJob(supabase, jobId, { world_id: worldId, progress: 45 });

  const roomIds = outline.rooms.map(() => randomUUID());
  const roomRows = outline.rooms.map((r, i) => ({
    id: roomIds[i],
    world_id: worldId,
    name: r.name,
    description: r.description,
    image_url: null,
    is_secret: r.is_secret,
    x: r.x,
    y: r.y,
    sort: r.sort,
  }));
  const { error: roomsErr } = await supabase.from('rooms').insert(roomRows);
  if (roomsErr) throw roomsErr;
  await setJob(supabase, jobId, { progress: 60 });

  // Images stage: cover + per-room Pollinations URLs (or uploaded cover).
  await setJob(supabase, jobId, { stage: 'images', progress: 62 });
  const cover = params.cover_image_data
    ? params.cover_image_data
    : coverUrl(params.image_style, params.title, outline.description || params.theme);
  for (let i = 0; i < outline.rooms.length; i++) {
    const url = roomUrl(params.image_style, outline.rooms[i].name, outline.rooms[i].image_prompt);
    await supabase.from('rooms').update({ image_url: url }).eq('id', roomIds[i]);
    await setJob(supabase, jobId, {
      progress: 62 + Math.round(((i + 1) / outline.rooms.length) * 11),
    });
  }
  await supabase.from('worlds').update({ image_url: cover }).eq('id', worldId);
  await setJob(supabase, jobId, { stage: 'populate', progress: 75 });

  // NPCs
  const npcIds = outline.npcs.map(() => randomUUID());
  if (outline.npcs.length > 0) {
    const { error } = await supabase.from('npcs').insert(
      outline.npcs.map((x, i) => ({
        id: npcIds[i],
        world_id: worldId,
        room_id: roomIds[x.room],
        name: x.name,
        role: x.role,
        personality: x.personality,
        dialogue_seed: x.dialogue_seed,
      }))
    );
    if (error) throw error;
  }
  await setJob(supabase, jobId, { progress: 80 });

  // Items (capture id+name so quest required_item names can resolve)
  let itemIdByName = new Map();
  if (outline.items.length > 0) {
    const { data: insertedItems, error } = await supabase
      .from('items')
      .insert(
        outline.items.map((x) => ({
          id: randomUUID(),
          world_id: worldId,
          room_id: roomIds[x.room],
          name: x.name,
          description: x.description,
          taken_by: null,
        }))
      )
      .select('id,name');
    if (error) throw error;
    itemIdByName = new Map((insertedItems || []).map((it) => [it.name.toLowerCase(), it.id]));
  }
  await setJob(supabase, jobId, { progress: 85 });

  // Exits
  if (outline.exits.length > 0) {
    const { error } = await supabase.from('exits').insert(
      outline.exits.map((e) => ({
        id: randomUUID(),
        world_id: worldId,
        from_room_id: roomIds[e.from],
        to_room_id: roomIds[e.to],
        label: e.label,
      }))
    );
    if (error) throw error;
  }
  await setJob(supabase, jobId, { progress: 90 });

  // Quests
  if (outline.quests.length > 0) {
    const { error } = await supabase.from('quests').insert(
      outline.quests.map((q) => ({
        id: randomUUID(),
        world_id: worldId,
        npc_id: q.giver_npc === null ? null : npcIds[q.giver_npc],
        required_item_id:
          q.required_item && itemIdByName.get(q.required_item.toLowerCase())
            ? itemIdByName.get(q.required_item.toLowerCase())
            : null,
        title: q.title,
        objective: q.objective,
        reward: q.reward,
        sort: q.sort,
      }))
    );
    if (error) throw error;
  }

  // Finalize
  await setJob(supabase, jobId, { stage: 'finalize', progress: 95 });
  await supabase
    .from('worlds')
    .update({ room_count: outline.rooms.length, updated_at: new Date().toISOString() })
    .eq('id', worldId);
  await setJob(supabase, jobId, { stage: 'finalize', progress: 100, status: 'done' });

  return worldId;
}

/**
 * Run the full generation for a job. Never throws to the request path —
 * failures are recorded on the job row as status 'error'.
 */
async function runGeneration(supabase, jobId) {
  try {
    const { data: job, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (error || !job) throw new Error('Generation job not found');
    const params = job.params || {};

    await setJob(supabase, jobId, { stage: 'outline', progress: 5 });

    const content = await chat({
      messages: [
        {
          role: 'system',
          content: 'You are a game designer for text adventure games. Always respond with valid JSON only.',
        },
        { role: 'user', content: buildOutlinePrompt(params) },
      ],
      maxTokens: 6000,
      temperature: 0.9,
      jsonMode: true,
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Model returned malformed JSON');
      parsed = JSON.parse(match[0]);
    }

    await setJob(supabase, jobId, { progress: 35 });
    const outline = normalizeOutline(parsed, params.room_count);
    await insertWorldFromOutline(supabase, jobId, params, outline);
  } catch (err) {
    await setJob(supabase, jobId, {
      status: 'error',
      stage: 'error',
      error: String(err?.message || err).slice(0, 1000),
    });
  }
}

module.exports = { runGeneration, normalizeOutline, buildOutlinePrompt };
