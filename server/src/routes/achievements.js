'use strict';

const express = require('express');
const { getSupabase } = require('../lib/supabase');
const { ACHIEVEMENTS } = require('../lib/achievements');
const { str } = require('../lib/validation');

const router = express.Router();

/**
 * GET /api/achievements?identity_id=
 * Returns all 26 achievements with unlocked state for the identity.
 */
router.get('/', async (req, res, next) => {
  try {
    const identityId = str(req.query.identity_id, 'identity_id', { max: 200 });
    const supabase = getSupabase();
    const { data: unlocks } = await supabase
      .from('achievement_unlocks')
      .select('achievement_key,created_at')
      .eq('identity_id', identityId);
    const byKey = Object.fromEntries((unlocks || []).map((u) => [u.achievement_key, u.created_at]));
    res.json(
      ACHIEVEMENTS.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        unlocked: Object.prototype.hasOwnProperty.call(byKey, a.key),
        unlocked_at: byKey[a.key] || null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
