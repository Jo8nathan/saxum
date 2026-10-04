'use strict';

/**
 * Lazy Supabase client. The app boots fine without SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY set; the first actual DB touch throws.
 */

let client = null;

function getSupabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Resettable for tests. */
function _reset() {
  client = null;
}

module.exports = { getSupabase, _reset };
