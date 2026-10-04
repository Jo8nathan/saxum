'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const { getSupabase } = require('../lib/supabase');
const { unlockAchievement } = require('../lib/achievements');
const { getTutorialSpec, TUTORIAL_TITLE, TUTORIAL_OWNER } = require('../lib/tutorial');
const { coverUrl, roomUrl } = require('../lib/images');
const { ensureIdentity } = require('../lib/identities');
const { optionalStr } = require('../lib/validation');

const router = express.Router();

async function createTutorialWorld(supabase) {
  const spec = getTutorialSpec();
  const worldId = randomUUID();

  const { error: worldErr } = await supabase.from('worlds').insert({
    id: worldId,
    title: spec.title,
    description: spec.description,
    image_style: spec.image_style,
    image_url: coverUrl(spec.image_style, spec.title, spec.cover_prompt),
    room_count: spec.rooms.length,
    author_label: spec.author_label,
    owner_id: spec.owner_id,
    is_public: true,
    play_count: 0,
  });
  if (worldErr) throw worldErr;

  const roomIds = spec.rooms.map(() => randomUUID());
  const { error: roomsErr } = await supabase.from('rooms').insert(
    spec.rooms.map((r, i) => ({
      id: roomIds[i],
      world_id: worldId,
      name: r.name,
      description: r.description,
      image_url: roomUrl(spec.image_style, r.name, r.image_prompt),
      is_secret: r.is_secret,
      x: r.x,
      y: r.y,
      sort: i,
    }))
  );
  if (roomsErr) throw roomsErr;

  const { error: exitsErr } = await supabase.from('exits').insert(
    spec.exits.map((e) => ({
      id: randomUUID(),
      world_id: worldId,
      from_room_id: roomIds[e.from],
      to_room_id: roomIds[e.to],
      label: e.label,
    }))
  );
  if (exitsErr) throw exitsErr;

  const npcIds = spec.npcs.map(() => randomUUID());
  const { error: npcsErr } = await supabase.from('npcs').insert(
    spec.npcs.map((x, i) => ({
      id: npcIds[i],
      world_id: worldId,
      room_id: roomIds[x.room],
      name: x.name,
      role: x.role,
      personality: x.personality,
      dialogue_seed: x.dialogue_seed,
    }))
  );
  if (npcsErr) throw npcsErr;

  const { error: itemsErr } = await supabase.from('items').insert(
    spec.items.map((x) => ({
      id: randomUUID(),
      world_id: worldId,
      room_id: roomIds[x.room],
      name: x.name,
      description: x.description,
      taken_by: null,
    }))
  );
  if (itemsErr) throw itemsErr;

  const { error: questsErr } = await supabase.from('quests').insert(
    spec.quests.map((q, i) => ({
      id: randomUUID(),
      world_id: worldId,
      npc_id: q.giver_npc === null || q.giver_npc === undefined ? null : npcIds[q.giver_npc],
      title: q.title,
      objective: q.objective,
      reward: q.reward,
      sort: i,
    }))
  );
  if (questsErr) throw questsErr;

  return worldId;
}

/**
 * POST /api/tutorial {identity_id?} → {id}
 * Idempotent: reuses the existing tutorial world when present.
 * Grants the 'scholar' achievement when an identity_id is given.
 */
router.post('/', async (req, res, next) => {
  try {
    const identityId = optionalStr(req.body?.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();

    let worldId;
    const { data: existing } = await supabase
      .from('worlds')
      .select('id')
      .eq('title', TUTORIAL_TITLE)
      .eq('owner_id', TUTORIAL_OWNER)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    worldId = existing?.id;
    if (!worldId) {
      worldId = await createTutorialWorld(supabase);
    }

    let scholar = null;
    if (identityId) {
      await ensureIdentity(supabase, identityId, 'Explorer');
      scholar = await unlockAchievement(supabase, identityId, 'scholar');
    }

    res.json({ id: worldId, ...(scholar ? { scholar_unlocked: true } : {}) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
