'use strict';

/**
 * Ensure an identity row exists so labels show on leaderboards and worlds.
 * By default it only CREATES a missing row — it never overwrites an existing
 * label (so gameplay actions can't clobber a custom display name). Pass
 * { setLabel: true } to explicitly rename (used by POST /api/identity).
 * Best-effort: never throws.
 */
async function ensureIdentity(supabase, identityId, label, opts = {}) {
  if (!identityId) return;
  const { setLabel = false } = opts;
  try {
    const { data: existing } = await supabase
      .from('identities')
      .select('id')
      .eq('id', identityId)
      .maybeSingle();
    if (!existing) {
      await supabase.from('identities').insert({
        id: identityId,
        label: (label || 'Explorer').slice(0, 200),
      });
    } else if (setLabel && label) {
      await supabase
        .from('identities')
        .update({ label: String(label).slice(0, 200) })
        .eq('id', identityId);
    }
  } catch {
    // ignore — identity bookkeeping must not break gameplay
  }
}

module.exports = { ensureIdentity };
