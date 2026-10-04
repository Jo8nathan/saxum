'use strict';

/**
 * Upsert an identity row so labels exist for leaderboards and worlds.
 * Best-effort: never throws.
 */
async function ensureIdentity(supabase, identityId, label) {
  if (!identityId) return;
  try {
    await supabase.from('identities').upsert(
      {
        id: identityId,
        label: (label || 'Explorer').slice(0, 200),
      },
      { onConflict: 'id', ignoreDuplicates: false }
    );
  } catch {
    // ignore — identity bookkeeping must not break gameplay
  }
}

module.exports = { ensureIdentity };
