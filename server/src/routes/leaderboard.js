'use strict';

/**
 * Leaderboard over identity aggregates.
 *
 * categories:
 *   quests        → sum of cardinality(quests_completed) per identity
 *   locations     → sum of cardinality(rooms_visited) per identity
 *   worlds        → count of worlds by owner_id
 *   items         → sum of cardinality(items_collected) per identity
 *   conversations → sum(conversations) per identity
 */

const express = require('express');
const { getSupabase } = require('../lib/supabase');
const { oneOf, queryInt } = require('../lib/validation');

const router = express.Router();

const CATEGORIES = ['quests', 'locations', 'worlds', 'items', 'conversations'];
const BADGES = { 1: 'Champion', 2: 'Elite', 3: 'Master' };

const card = (arr) => (Array.isArray(arr) ? arr.length : 0);

router.get('/', async (req, res, next) => {
  try {
    const category = oneOf(req.query.category || 'quests', 'category', CATEGORIES);
    const limit = queryInt(req.query.limit, 'limit', { min: 1, max: 100, def: 20 });
    const supabase = getSupabase();

    // Identity labels (fallback 'Explorer').
    const { data: identities } = await supabase.from('identities').select('id,label');
    const labels = Object.fromEntries((identities || []).map((i) => [i.id, i.label || 'Explorer']));

    const totals = {}; // identityId → value
    if (category === 'worlds') {
      const { data: worlds } = await supabase.from('worlds').select('owner_id');
      for (const w of worlds || []) {
        if (!w.owner_id) continue;
        totals[w.owner_id] = (totals[w.owner_id] || 0) + 1;
      }
    } else {
      const { data: rows } = await supabase.from('progress').select('*');
      for (const p of rows || []) {
        const id = p.identity_id;
        if (!id) continue;
        let v = 0;
        if (category === 'quests') v = card(p.quests_completed);
        else if (category === 'locations') v = card(p.rooms_visited);
        else if (category === 'items') v = card(p.items_collected);
        else if (category === 'conversations') v = p.conversations || 0;
        totals[id] = (totals[id] || 0) + v;
      }
    }

    const ranked = Object.entries(totals)
      .map(([id, value]) => ({ label: labels[id] || 'Explorer', value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, limit)
      .map((row, i) => ({
        rank: i + 1,
        label: row.label,
        value: row.value,
        badge: BADGES[i + 1] || null,
      }));

    res.json(ranked);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
