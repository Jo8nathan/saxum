'use strict';

/**
 * POST /api/identity — set (or rename) an anonymous identity's display name.
 * Body: { identity_id, label }
 * Updates the identities row (used by the leaderboard) and re-labels worlds
 * already created under that identity, so bylines stay consistent.
 */

const express = require('express');
const { getSupabase } = require('../lib/supabase');
const { ensureIdentity } = require('../lib/identities');
const { str } = require('../lib/validation');

const LABEL_MAX = 30;

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const identityId = str(body.identity_id, 'identity_id', { min: 1, max: 200 });
    const label = str(body.label, 'label', { min: 1, max: LABEL_MAX }).trim();
    if (!label) return res.status(400).json({ error: 'label must not be blank' });

    const supabase = getSupabase();
    await ensureIdentity(supabase, identityId, label, { setLabel: true });
    await supabase.from('worlds').update({ author_label: label }).eq('owner_id', identityId);

    res.json({ id: identityId, label });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
