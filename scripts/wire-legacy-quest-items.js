#!/usr/bin/env node
/**
 * wire-legacy-quest-items.js — one-off: set quests.required_item_id on the
 * live DB from the required_item names in worlds-legacy/*.json.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FILES = [
  { file: 'undersea-dome.json', worldId: 'fd41222b-4556-4b35-9c22-d6344e64666e' },
  { file: 'forgotten-temple.json', worldId: 'fc811797-5686-4a1c-b4c1-73a198b66f5e' },
];

(async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const { file, worldId } of FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'worlds-legacy', file), 'utf8'));
    const { data: items } = await supabase.from('items').select('id,name').eq('world_id', worldId);
    const itemByName = new Map((items || []).map((i) => [i.name.toLowerCase(), i.id]));
    const { data: quests } = await supabase.from('quests').select('id,title').eq('world_id', worldId);
    const questByTitle = new Map((quests || []).map((q) => [q.title, q.id]));
    for (const q of data.quests || []) {
      if (!q.required_item) continue;
      const itemId = itemByName.get(String(q.required_item).toLowerCase());
      const questId = questByTitle.get(q.title);
      if (!itemId || !questId) {
        console.log(`  SKIP ${q.title}: item or quest row not found`);
        continue;
      }
      const { error } = await supabase.from('quests').update({ required_item_id: itemId }).eq('id', questId);
      if (error) throw error;
      console.log(`  wired "${q.title}" -> item "${q.required_item}"`);
    }
  }
  console.log('done');
})().catch((e) => { console.error('wire failed:', e.message); process.exit(1); });
