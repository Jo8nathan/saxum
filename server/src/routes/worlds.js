'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const { getSupabase } = require('../lib/supabase');
const { checkAndUnlock, unlockAchievement } = require('../lib/achievements');
const { ensureIdentity } = require('../lib/identities');
const { chat } = require('../lib/groq');
const { runGeneration } = require('../lib/generation');
const {
  str,
  optionalStr,
  intInRange,
  oneOf,
  uuid,
  dataUrl,
  queryInt,
} = require('../lib/validation');

const router = express.Router();

const IMAGE_STYLES = ['Realistic', 'Cartoonish', 'Minimalist'];
const TEN_MB = 10 * 1024 * 1024;

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Generation rate limit exceeded (5 per hour). Try again later.' },
});

const talkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Talk rate limit exceeded (30 per minute). Slow down.' },
});

const card = (arr) => (Array.isArray(arr) ? arr.length : 0);

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

async function getWorldOr404(supabase, worldId, res) {
  const { data, error } = await supabase.from('worlds').select('*').eq('id', worldId).single();
  if (error || !data) {
    res.status(404).json({ error: 'World not found' });
    return null;
  }
  return data;
}

async function upsertProgressRow(supabase, worldId, identityId) {
  const { data: existing } = await supabase
    .from('progress')
    .select('*')
    .eq('world_id', worldId)
    .eq('identity_id', identityId)
    .maybeSingle();
  if (existing) return existing;
  const row = {
    id: randomUUID(),
    world_id: worldId,
    identity_id: identityId,
    rooms_visited: [],
    quests_completed: [],
    items_collected: [],
    secrets_found: [],
    conversations: 0,
  };
  const { data, error } = await supabase.from('progress').insert(row).select().single();
  if (error) {
    // Race: another request created it.
    const { data: retry } = await supabase
      .from('progress')
      .select('*')
      .eq('world_id', worldId)
      .eq('identity_id', identityId)
      .single();
    return retry;
  }
  return data;
}

async function progressPayload(supabase, worldId, progressRow) {
  const { count } = await supabase
    .from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('world_id', worldId);
  const visited = card(progressRow.rooms_visited);
  const total = count || 0;
  return {
    rooms_visited: progressRow.rooms_visited || [],
    quests_completed: progressRow.quests_completed || [],
    items_collected: progressRow.items_collected || [],
    secrets_found: progressRow.secrets_found || [],
    conversations: progressRow.conversations || 0,
    progress_pct: total > 0 ? Math.round((visited / total) * 100) : 0,
  };
}

function addUnique(arr, value) {
  const out = Array.isArray(arr) ? [...arr] : [];
  if (!out.includes(value)) out.push(value);
  return out;
}

/* ------------------------------------------------------------------ */
/* POST /api/worlds/generate                                           */
/* ------------------------------------------------------------------ */

router.post('/generate', generateLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = str(body.title, 'title', { min: 1, max: 120 });
    const theme = str(body.theme, 'theme', { min: 1, max: 2000 });
    const image_style = oneOf(body.image_style, 'image_style', IMAGE_STYLES);
    const room_count = intInRange(body.room_count, 'room_count', 3, 20);
    const owner_id = str(body.owner_id, 'owner_id', { min: 1, max: 200 });
    const author_label = str(body.author_label, 'author_label', { min: 1, max: 200 });
    const cover_image_data =
      body.cover_image_data === undefined
        ? undefined
        : dataUrl(body.cover_image_data, 'cover_image_data', TEN_MB);

    const supabase = getSupabase();
    await ensureIdentity(supabase, owner_id, author_label);

    const jobId = randomUUID();
    const { error } = await supabase.from('generation_jobs').insert({
      id: jobId,
      status: 'pending',
      progress: 0,
      stage: 'queued',
      world_id: null,
      error: null,
      params: { title, theme, image_style, room_count, owner_id, author_label, cover_image_data },
    });
    if (error) throw error;

    // Fire-and-forget: the job row drives progress; request returns 202 now.
    runGeneration(supabase, jobId).catch(() => {});

    res.status(202).json({ job_id: jobId });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/worlds                                                     */
/* ------------------------------------------------------------------ */

router.get('/', async (req, res, next) => {
  try {
    const scope = oneOf(req.query.scope || 'explore', 'scope', ['mine', 'explore']);
    const ownerId = optionalStr(req.query.owner_id, 'owner_id', { max: 200 });
    const sort = oneOf(req.query.sort || 'newest', 'sort', ['newest', 'popular']);
    const limit = queryInt(req.query.limit, 'limit', { min: 1, max: 100, def: 24 });
    const offset = queryInt(req.query.offset, 'offset', { min: 0, max: 100000, def: 0 });

    if (scope === 'mine' && !ownerId) {
      return res.status(400).json({ error: 'owner_id is required for scope=mine' });
    }

    const supabase = getSupabase();
    let q = supabase.from('worlds').select('*', { count: 'exact' });
    if (scope === 'mine') q = q.eq('owner_id', ownerId);
    else q = q.eq('is_public', true);
    q = q.order(sort === 'popular' ? 'play_count' : 'created_at', { ascending: false });
    q = q.range(offset, offset + limit - 1);

    const { data: worlds, error, count } = await q;
    if (error) throw error;

    const ids = (worlds || []).map((w) => w.id);
    let favCounts = {};
    if (ids.length > 0) {
      const { data: favs } = await supabase.from('favorites').select('world_id').in('world_id', ids);
      for (const f of favs || []) favCounts[f.world_id] = (favCounts[f.world_id] || 0) + 1;
    }

    res.json({
      worlds: (worlds || []).map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        image_url: w.image_url,
        image_style: w.image_style,
        room_count: w.room_count,
        author_label: w.author_label,
        owner_id: w.owner_id,
        created_at: w.created_at,
        play_count: w.play_count,
        favorite_count: favCounts[w.id] || 0,
      })),
      total: count || 0,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/worlds/:id                                                 */
/* ------------------------------------------------------------------ */

router.get('/:id', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;

    const [rooms, exits, npcs, items, quests] = await Promise.all([
      supabase.from('rooms').select('*').eq('world_id', worldId).order('sort'),
      supabase.from('exits').select('*').eq('world_id', worldId),
      supabase.from('npcs').select('*').eq('world_id', worldId),
      supabase.from('items').select('*').eq('world_id', worldId),
      supabase.from('quests').select('*').eq('world_id', worldId).order('sort'),
    ]);
    for (const r of [rooms, exits, npcs, items, quests]) {
      if (r.error) throw r.error;
    }

    // Count this as a play (fire-and-forget).
    supabase
      .from('worlds')
      .update({ play_count: (world.play_count || 0) + 1 })
      .eq('id', worldId)
      .then(() => {});

    res.json({
      world,
      rooms: rooms.data || [],
      exits: exits.data || [],
      npcs: npcs.data || [],
      items: items.data || [],
      quests: quests.data || [],
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* favorites                                                           */
/* ------------------------------------------------------------------ */

router.post('/:id/favorite', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;
    await ensureIdentity(supabase, identityId, 'Explorer');

    const { error } = await supabase.from('favorites').upsert(
      { id: randomUUID(), world_id: worldId, identity_id: identityId },
      { onConflict: 'world_id,identity_id', ignoreDuplicates: true }
    );
    if (error) throw error;

    const newly_unlocked = await checkAndUnlock(supabase, identityId);
    res.json({ favorited: true, newly_unlocked });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/favorite', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('world_id', worldId)
      .eq('identity_id', identityId);
    if (error) throw error;
    res.json({ favorited: false });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/worlds/:id/share                                          */
/* ------------------------------------------------------------------ */

router.post('/:id/share', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;
    await ensureIdentity(supabase, identityId, 'Explorer');

    const unlocked = await unlockAchievement(supabase, identityId, 'sharer');
    const newly_unlocked = unlocked ? [unlocked] : [];
    res.json({ ok: true, newly_unlocked });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/worlds/:id/progress/visit                                 */
/* ------------------------------------------------------------------ */

router.post('/:id/progress/visit', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const roomId = uuid(req.body?.room_id, 'room_id');
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;
    await ensureIdentity(supabase, identityId, 'Explorer');

    const { data: room } = await supabase
      .from('rooms')
      .select('id,is_secret')
      .eq('id', roomId)
      .eq('world_id', worldId)
      .maybeSingle();
    if (!room) return res.status(404).json({ error: 'Room not found in this world' });

    let progress = await upsertProgressRow(supabase, worldId, identityId);
    const rooms_visited = addUnique(progress.rooms_visited, roomId);
    const secrets_found = room.is_secret
      ? addUnique(progress.secrets_found, roomId)
      : progress.secrets_found;

    const { data: updated, error } = await supabase
      .from('progress')
      .update({ rooms_visited, secrets_found })
      .eq('id', progress.id)
      .select()
      .single();
    if (error) throw error;
    progress = updated;

    const newly_unlocked = await checkAndUnlock(supabase, identityId);
    res.json({ progress: await progressPayload(supabase, worldId, progress), newly_unlocked });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/worlds/:id/talk                                           */
/* ------------------------------------------------------------------ */

router.post('/:id/talk', talkLimiter, async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const npcId = uuid(req.body?.npc_id, 'npc_id');
    const message = str(req.body?.message, 'message', { min: 1, max: 2000 });
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;
    await ensureIdentity(supabase, identityId, 'Explorer');

    const { data: npc } = await supabase
      .from('npcs')
      .select('*, rooms(name,description)')
      .eq('id', npcId)
      .eq('world_id', worldId)
      .maybeSingle();
    if (!npc) return res.status(404).json({ error: 'NPC not found in this world' });

    const roomName = npc.rooms?.name || 'an unknown place';
    const roomDesc = npc.rooms?.description || '';
    const system = [
      `You are roleplaying in the text adventure game "${world.title}".`,
      `World: ${world.description || ''}`,
      `Current location: ${roomName}. ${roomDesc}`,
      `You are ${npc.name}${npc.role ? `, ${npc.role}` : ''}.`,
      `Personality: ${npc.personality || 'mysterious'}.`,
      `Background: ${npc.dialogue_seed || ''}`,
      'Stay in character at all times. Reply in 2-4 sentences. Never break character or mention you are an AI.',
    ].join('\n');

    // Per-request key override via x-groq-key; falls back to server key.
    const overrideKey = req.get('x-groq-key') || undefined;
    const reply = await chat({
      apiKey: overrideKey,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message },
      ],
      maxTokens: 300,
      temperature: 0.8,
    });

    let progress = await upsertProgressRow(supabase, worldId, identityId);
    const { data: updated, error } = await supabase
      .from('progress')
      .update({ conversations: (progress.conversations || 0) + 1 })
      .eq('id', progress.id)
      .select()
      .single();
    if (error) throw error;

    const newly_unlocked = await checkAndUnlock(supabase, identityId);
    res.json({ reply, newly_unlocked });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/worlds/:id/take                                           */
/* ------------------------------------------------------------------ */

router.post('/:id/take', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const itemId = uuid(req.body?.item_id, 'item_id');
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;
    await ensureIdentity(supabase, identityId, 'Explorer');

    const { data: item } = await supabase
      .from('items')
      .select('*')
      .eq('id', itemId)
      .eq('world_id', worldId)
      .maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item not found in this world' });
    if (item.taken_by && item.taken_by !== identityId) {
      return res.status(400).json({ error: 'That item has already been taken' });
    }

    if (item.taken_by !== identityId) {
      const { error } = await supabase
        .from('items')
        .update({ taken_by: identityId })
        .eq('id', itemId);
      if (error) throw error;
    }

    let progress = await upsertProgressRow(supabase, worldId, identityId);
    const items_collected = addUnique(progress.items_collected, itemId);
    const { data: updated, error } = await supabase
      .from('progress')
      .update({ items_collected })
      .eq('id', progress.id)
      .select()
      .single();
    if (error) throw error;

    const newly_unlocked = await checkAndUnlock(supabase, identityId);
    res.json({ ok: true, newly_unlocked });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/worlds/:id/quests/:quest_id/complete                      */
/* ------------------------------------------------------------------ */

router.post('/:id/quests/:quest_id/complete', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const questId = uuid(req.params.quest_id, 'quest_id');
    const identityId = str(req.body?.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;
    await ensureIdentity(supabase, identityId, 'Explorer');

    const { data: quest } = await supabase
      .from('quests')
      .select('id')
      .eq('id', questId)
      .eq('world_id', worldId)
      .maybeSingle();
    if (!quest) return res.status(404).json({ error: 'Quest not found in this world' });

    let progress = await upsertProgressRow(supabase, worldId, identityId);
    const quests_completed = addUnique(progress.quests_completed, questId);
    const { data: updated, error } = await supabase
      .from('progress')
      .update({ quests_completed })
      .eq('id', progress.id)
      .select()
      .single();
    if (error) throw error;

    const newly_unlocked = await checkAndUnlock(supabase, identityId);
    res.json({ ok: true, newly_unlocked });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* GET /api/worlds/:id/progress?identity_id=                           */
/* ------------------------------------------------------------------ */

router.get('/:id/progress', async (req, res, next) => {
  try {
    const worldId = uuid(req.params.id, 'id');
    const identityId = str(req.query.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();
    const world = await getWorldOr404(supabase, worldId, res);
    if (!world) return;

    const { data: progress } = await supabase
      .from('progress')
      .select('*')
      .eq('world_id', worldId)
      .eq('identity_id', identityId)
      .maybeSingle();

    const empty = {
      rooms_visited: [],
      quests_completed: [],
      items_collected: [],
      secrets_found: [],
      conversations: 0,
    };
    res.json(
      progress ? await progressPayload(supabase, worldId, progress) : { ...empty, progress_pct: 0 }
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
