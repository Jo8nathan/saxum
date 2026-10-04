'use strict';

/**
 * The 26 Saxum achievements (key, name, description) plus the unlock engine.
 *
 * Schema note: the DB schema is fixed, so achievements that would need new
 * columns are derived from existing data. In particular:
 *   - "diplomat" unlocks at 5+ total conversations spread across 3+ different
 *     worlds (one progress row per world, so: total conversations >= 5 AND
 *     progress rows with conversations > 0 span >= 3 distinct worlds).
 */

const ACHIEVEMENTS = [
  { key: 'first-steps', name: 'First Steps', description: 'Visit your first room.' },
  { key: 'explorer-10', name: 'Explorer', description: 'Visit 10 rooms in total.' },
  { key: 'explorer-50', name: 'Seasoned Explorer', description: 'Visit 50 rooms in total.' },
  { key: 'cartographer', name: 'Cartographer', description: 'Visit every room of a world.' },
  { key: 'chatter', name: 'Chatter', description: 'Have 5 conversations.' },
  { key: 'conversationalist', name: 'Conversationalist', description: 'Have 25 conversations.' },
  { key: 'diplomat', name: 'Diplomat', description: 'Hold 5 conversations across 3 or more different worlds.' },
  { key: 'collector', name: 'Collector', description: 'Collect 5 items.' },
  { key: 'hoarder', name: 'Hoarder', description: 'Collect 20 items.' },
  { key: 'quest-start', name: 'Quest Starter', description: 'Complete your first quest.' },
  { key: 'quest-hero', name: 'Quest Hero', description: 'Complete 5 quests.' },
  { key: 'quest-legend', name: 'Quest Legend', description: 'Complete 15 quests.' },
  { key: 'secret-finder', name: 'Secret Finder', description: 'Discover a secret room.' },
  { key: 'spelunker', name: 'Spelunker', description: 'Discover 3 secret rooms.' },
  { key: 'world-builder', name: 'World Builder', description: 'Create your first world.' },
  { key: 'architect', name: 'Architect', description: 'Create 3 worlds.' },
  { key: 'visionary', name: 'Visionary', description: 'Create a world with 20 rooms.' },
  { key: 'admirer', name: 'Admirer', description: 'Favorite a world.' },
  { key: 'tastemaker', name: 'Tastemaker', description: 'Favorite 5 worlds.' },
  { key: 'beloved', name: 'Beloved Creator', description: 'One of your worlds earns 5 favorites.' },
  { key: 'tourist', name: 'Tourist', description: 'Play in 3 different worlds.' },
  { key: 'voyager', name: 'Voyager', description: 'Play in 10 different worlds.' },
  { key: 'sharer', name: 'Sharer', description: 'Share a world with someone.' },
  { key: 'scholar', name: 'Scholar', description: 'Complete the Secret Room Tutorial.' },
  { key: 'completionist', name: 'Completionist', description: 'Unlock 15 achievements.' },
  { key: 'legend', name: 'Legend', description: 'Unlock every achievement.' },
];

const BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));

const card = (arr) => (Array.isArray(arr) ? arr.length : 0);

/**
 * Unlock a single achievement directly (e.g. sharer / scholar at event time).
 * Returns the achievement object if newly unlocked, else null.
 */
async function unlockAchievement(supabase, identityId, key) {
  if (!BY_KEY[key]) throw new Error(`Unknown achievement: ${key}`);
  const { data: existing } = await supabase
    .from('achievement_unlocks')
    .select('id')
    .eq('identity_id', identityId)
    .eq('achievement_key', key)
    .maybeSingle();
  if (existing) return null;
  const { error } = await supabase
    .from('achievement_unlocks')
    .insert({ identity_id: identityId, achievement_key: key });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
  if (error) return null;
  return BY_KEY[key];
}

/**
 * Gather the aggregate stats needed to evaluate all achievements.
 */
async function collectStats(supabase, identityId) {
  const [{ data: progressRows }, { data: unlocks }, { data: worlds }, { data: favorites }, { data: ownedWorlds }] =
    await Promise.all([
      supabase.from('progress').select('*').eq('identity_id', identityId),
      supabase.from('achievement_unlocks').select('achievement_key').eq('identity_id', identityId),
      supabase.from('worlds').select('id,owner_id').eq('owner_id', identityId),
      supabase.from('favorites').select('id,world_id,identity_id').eq('identity_id', identityId),
      supabase.from('worlds').select('id,room_count').eq('owner_id', identityId),
    ]);

  const progress = progressRows || [];
  const owned = ownedWorlds || [];
  const worldIds = progress.map((p) => p.world_id);

  // Favorite counts on the identity's own worlds (for "beloved").
  let ownFavoritesTotal = 0;
  if (owned.length > 0) {
    const { data: ownFavs } = await supabase
      .from('favorites')
      .select('id')
      .in('world_id', owned.map((w) => w.id));
    ownFavoritesTotal = (ownFavs || []).length;
  }

  // Cartographer: for every played world, check whether all rooms were visited.
  let cartographer = false;
  if (worldIds.length > 0) {
    const { data: roomRows } = await supabase
      .from('rooms')
      .select('id,world_id')
      .in('world_id', worldIds);
    const roomsByWorld = {};
    for (const r of roomRows || []) {
      (roomsByWorld[r.world_id] = roomsByWorld[r.world_id] || []).push(r.id);
    }
    for (const p of progress) {
      const allRooms = roomsByWorld[p.world_id] || [];
      const visited = new Set(p.rooms_visited || []);
      if (allRooms.length > 0 && allRooms.every((id) => visited.has(id))) {
        cartographer = true;
        break;
      }
    }
  }

  const totalConversations = progress.reduce((s, p) => s + (p.conversations || 0), 0);
  const worldsTalked = progress.filter((p) => (p.conversations || 0) > 0).length;

  return {
    roomsVisited: progress.reduce((s, p) => s + card(p.rooms_visited), 0),
    conversations: totalConversations,
    worldsTalked,
    items: progress.reduce((s, p) => s + card(p.items_collected), 0),
    quests: progress.reduce((s, p) => s + card(p.quests_completed), 0),
    secrets: progress.reduce((s, p) => s + card(p.secrets_found), 0),
    worldsPlayed: progress.length,
    worldsCreated: owned.length,
    bigWorlds: owned.filter((w) => (w.room_count || 0) >= 20).length,
    favoritesGiven: card(favorites),
    ownFavoritesTotal,
    cartographer,
    unlocked: new Set((unlocks || []).map((u) => u.achievement_key)),
  };
}

/** Evaluate candidates against stats. Returns keys that qualify. */
function evaluate(stats) {
  const s = stats;
  const checks = {
    'first-steps': s.roomsVisited >= 1,
    'explorer-10': s.roomsVisited >= 10,
    'explorer-50': s.roomsVisited >= 50,
    cartographer: s.cartographer,
    chatter: s.conversations >= 5,
    conversationalist: s.conversations >= 25,
    diplomat: s.conversations >= 5 && s.worldsTalked >= 3,
    collector: s.items >= 5,
    hoarder: s.items >= 20,
    'quest-start': s.quests >= 1,
    'quest-hero': s.quests >= 5,
    'quest-legend': s.quests >= 15,
    'secret-finder': s.secrets >= 1,
    spelunker: s.secrets >= 3,
    'world-builder': s.worldsCreated >= 1,
    architect: s.worldsCreated >= 3,
    visionary: s.bigWorlds >= 1,
    admirer: s.favoritesGiven >= 1,
    tastemaker: s.favoritesGiven >= 5,
    beloved: s.ownFavoritesTotal >= 5,
    tourist: s.worldsPlayed >= 3,
    voyager: s.worldsPlayed >= 10,
    completionist: s.unlocked.size >= 15,
    legend: s.unlocked.size >= ACHIEVEMENTS.length - 1,
  };
  // 'sharer' and 'scholar' are event-driven, unlocked via unlockAchievement().
  return Object.entries(checks)
    .filter(([key, ok]) => ok && !s.unlocked.has(key))
    .map(([key]) => key);
}

/**
 * Check all rule-based achievements and unlock newly qualifying ones.
 * Loops so meta-achievements (completionist, legend) cascade in the same call.
 * @returns {Promise<Array<{key,name,description}>>} newly unlocked
 */
async function checkAndUnlock(supabase, identityId) {
  const newly = [];
  for (let round = 0; round < 4; round++) {
    const stats = await collectStats(supabase, identityId);
    const candidates = evaluate(stats);
    if (candidates.length === 0) break;
    const rows = candidates.map((key) => ({ identity_id: identityId, achievement_key: key }));
    const { error } = await supabase.from('achievement_unlocks').insert(rows);
    if (error && !/duplicate|unique/i.test(error.message)) throw error;
    // Only report rows that were actually new.
    for (const key of candidates) {
      const wasNew = !stats.unlocked.has(key);
      if (wasNew && BY_KEY[key]) newly.push(BY_KEY[key]);
    }
  }
  return newly;
}

module.exports = {
  ACHIEVEMENTS,
  BY_KEY,
  unlockAchievement,
  checkAndUnlock,
};
