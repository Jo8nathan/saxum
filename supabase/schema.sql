-- ============================================================
-- Saxum Rebuild — Postgres schema (Supabase)
--
-- ACCESS MODEL / RLS DECISION:
-- Row Level Security is intentionally NOT enabled on these tables.
-- All database access goes through the Express API server, which uses
-- the Supabase SERVICE-ROLE key server-side only. The key is never
-- exposed to browser clients; clients only talk to the API, which
-- enforces authentication/authorization (anonymous identities, ownership
-- checks) before touching the database. RLS is therefore redundant and
-- is left off by design. Do not enable RLS without also wiring the API
-- to use per-request (anon/user) credentials instead of service-role.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- identities: anonymous visitor identities (client-generated ids)
-- ============================================================
CREATE TABLE identities (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- worlds: a generated or imported text-adventure game
-- ============================================================
CREATE TABLE worlds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_style TEXT DEFAULT 'Realistic',
  image_url   TEXT,
  room_count  INT DEFAULT 0,
  author_label TEXT DEFAULT '',
  owner_id    TEXT,
  is_public   BOOLEAN DEFAULT true,
  play_count  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- rooms: locations within a world
-- ============================================================
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url   TEXT,
  is_secret   BOOLEAN DEFAULT false,
  x           INT DEFAULT 0,
  y           INT DEFAULT 0,
  sort        INT DEFAULT 0
);

-- ============================================================
-- exits: directed connections between rooms
-- ============================================================
CREATE TABLE exits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  from_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  to_room_id   UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  label        TEXT DEFAULT ''
);

-- ============================================================
-- npcs: characters living in rooms
-- ============================================================
CREATE TABLE npcs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  role         TEXT DEFAULT '',
  personality  TEXT DEFAULT '',
  dialogue_seed TEXT DEFAULT ''
);

-- ============================================================
-- items: pickable objects (room_id NULL = held/inventory state
-- when taken_by is set, or unplaced)
-- ============================================================
CREATE TABLE items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  room_id     UUID REFERENCES rooms(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  taken_by    TEXT
);

-- ============================================================
-- quests: objectives handed out by NPCs
-- ============================================================
CREATE TABLE quests (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id  UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  npc_id    UUID REFERENCES npcs(id) ON DELETE SET NULL,
  title     TEXT NOT NULL,
  objective TEXT DEFAULT '',
  reward    TEXT DEFAULT '',
  sort      INT DEFAULT 0
);

-- ============================================================
-- favorites: which identities favorited which worlds
-- ============================================================
CREATE TABLE favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  identity_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (world_id, identity_id)
);

-- ============================================================
-- progress: per-identity game state within a world
-- ============================================================
CREATE TABLE progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id         UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  identity_id      TEXT NOT NULL,
  rooms_visited    UUID[] DEFAULT '{}',
  quests_completed UUID[] DEFAULT '{}',
  items_collected  UUID[] DEFAULT '{}',
  secrets_found    UUID[] DEFAULT '{}',
  conversations    INT DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (world_id, identity_id)
);

-- ============================================================
-- achievement_unlocks: which achievements an identity has earned
-- ============================================================
CREATE TABLE achievement_unlocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id     TEXT NOT NULL,
  achievement_key TEXT NOT NULL,
  unlocked_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (identity_id, achievement_key)
);

-- ============================================================
-- generation_jobs: async world-generation job tracking
-- ============================================================
CREATE TABLE generation_jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status     TEXT DEFAULT 'pending',
  progress   INT DEFAULT 0,
  stage      TEXT DEFAULT '',
  world_id   UUID REFERENCES worlds(id) ON DELETE SET NULL,
  error      TEXT,
  params     JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes: every world_id FK column, plus the common
-- identity-id lookup columns, plus the room FK columns that are
-- hot in game navigation (exits.from_room_id, npcs.room_id,
-- items.room_id)
-- ============================================================
CREATE INDEX idx_rooms_world_id        ON rooms(world_id);
CREATE INDEX idx_exits_world_id        ON exits(world_id);
CREATE INDEX idx_exits_from_room_id    ON exits(from_room_id);
CREATE INDEX idx_npcs_world_id         ON npcs(world_id);
CREATE INDEX idx_npcs_room_id          ON npcs(room_id);
CREATE INDEX idx_items_world_id        ON items(world_id);
CREATE INDEX idx_items_room_id         ON items(room_id);
CREATE INDEX idx_quests_world_id       ON quests(world_id);
CREATE INDEX idx_favorites_world_id    ON favorites(world_id);
CREATE INDEX idx_favorites_identity_id ON favorites(identity_id);
CREATE INDEX idx_progress_world_id     ON progress(world_id);
CREATE INDEX idx_progress_identity_id  ON progress(identity_id);
CREATE INDEX idx_achievement_unlocks_identity_id ON achievement_unlocks(identity_id);
CREATE INDEX idx_generation_jobs_world_id ON generation_jobs(world_id);
CREATE INDEX idx_generation_jobs_status   ON generation_jobs(status);

-- ============================================================
-- updated_at triggers for worlds and progress
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worlds_updated_at
  BEFORE UPDATE ON worlds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_progress_updated_at
  BEFORE UPDATE ON progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Table and column comments
-- ============================================================
COMMENT ON TABLE identities IS 'Anonymous visitor identities; id is generated client-side and passed as owner_id / identity_id.';
COMMENT ON COLUMN identities.id IS 'Client-generated anonymous identity string (primary key).';
COMMENT ON COLUMN identities.label IS 'Human-readable label for the identity (e.g. display name).';

COMMENT ON TABLE worlds IS 'A text-adventure game world; children (rooms, exits, npcs, items, quests) cascade-delete with it.';
COMMENT ON COLUMN worlds.id IS 'World UUID; also used in the public URL path /w/:id.';
COMMENT ON COLUMN worlds.title IS 'Required display title of the world.';
COMMENT ON COLUMN worlds.description IS 'Short blurb shown on the world card.';
COMMENT ON COLUMN worlds.image_style IS 'Art direction for generated imagery (Realistic|Cartoonish|Minimalist).';
COMMENT ON COLUMN worlds.image_url IS 'Cover image URL.';
COMMENT ON COLUMN worlds.room_count IS 'Cached number of rooms; maintained by the API/importer.';
COMMENT ON COLUMN worlds.author_label IS 'Display name credited as the author.';
COMMENT ON COLUMN worlds.owner_id IS 'Anonymous identity id of the owner (NULL for unclaimed worlds).';
COMMENT ON COLUMN worlds.is_public IS 'Whether the world appears in the public gallery.';
COMMENT ON COLUMN worlds.play_count IS 'Cached number of recorded play sessions.';

COMMENT ON TABLE rooms IS 'Locations in a world; exits, npcs and items reference them.';
COMMENT ON COLUMN rooms.world_id IS 'Owning world; cascade-deleted.';
COMMENT ON COLUMN rooms.name IS 'Room name shown to the player.';
COMMENT ON COLUMN rooms.description IS 'Narrative description read to the player on entry.';
COMMENT ON COLUMN rooms.image_url IS 'Optional per-room illustration.';
COMMENT ON COLUMN rooms.is_secret IS 'Hidden rooms only revealed via secrets_found in progress.';
COMMENT ON COLUMN rooms.x IS 'Map canvas x coordinate.';
COMMENT ON COLUMN rooms.y IS 'Map canvas y coordinate.';
COMMENT ON COLUMN rooms.sort IS 'Display sort order.';

COMMENT ON TABLE exits IS 'Directed room-to-room connections (each direction needs its own row).';
COMMENT ON COLUMN exits.world_id IS 'Owning world (denormalized for fast per-world queries); cascade-deleted.';
COMMENT ON COLUMN exits.from_room_id IS 'Room the exit leaves from; cascade-deleted.';
COMMENT ON COLUMN exits.to_room_id IS 'Room the exit leads to; cascade-deleted.';
COMMENT ON COLUMN exits.label IS 'Direction/command label, e.g. "North".';

COMMENT ON TABLE npcs IS 'Non-player characters placed in rooms.';
COMMENT ON COLUMN npcs.world_id IS 'Owning world (denormalized); cascade-deleted.';
COMMENT ON COLUMN npcs.room_id IS 'Room the NPC currently stands in; cascade-deleted.';
COMMENT ON COLUMN npcs.name IS 'NPC display name.';
COMMENT ON COLUMN npcs.role IS 'Short role descriptor (e.g. "blacksmith").';
COMMENT ON COLUMN npcs.personality IS 'Personality notes used to seed dialogue.';
COMMENT ON COLUMN npcs.dialogue_seed IS 'Opening dialogue lines for the NPC.';

COMMENT ON TABLE items IS 'Pickable objects; room_id may be NULL when held.';
COMMENT ON COLUMN items.world_id IS 'Owning world (denormalized); cascade-deleted.';
COMMENT ON COLUMN items.room_id IS 'Room the item lies in; NULL when carried; set NULL on room delete.';
COMMENT ON COLUMN items.name IS 'Item name.';
COMMENT ON COLUMN items.description IS 'Item description.';
COMMENT ON COLUMN items.taken_by IS 'Identity id currently holding the item; NULL when lying in a room.';

COMMENT ON TABLE quests IS 'Objectives, optionally given by an NPC.';
COMMENT ON COLUMN quests.world_id IS 'Owning world (denormalized); cascade-deleted.';
COMMENT ON COLUMN quests.npc_id IS 'Quest giver; set NULL if the NPC is deleted.';
COMMENT ON COLUMN quests.title IS 'Quest title.';
COMMENT ON COLUMN quests.objective IS 'What the player must do.';
COMMENT ON COLUMN quests.reward IS 'Reward text shown on completion.';
COMMENT ON COLUMN quests.sort IS 'Display sort order.';

COMMENT ON TABLE favorites IS 'Worlds an identity has favorited (one row per world/identity).';
COMMENT ON COLUMN favorites.world_id IS 'Favorited world; cascade-deleted.';
COMMENT ON COLUMN favorites.identity_id IS 'Identity that favorited it.';

COMMENT ON TABLE progress IS 'Per-identity saved state within a world (one row per world/identity).';
COMMENT ON COLUMN progress.world_id IS 'World the progress belongs to; cascade-deleted.';
COMMENT ON COLUMN progress.identity_id IS 'Identity the progress belongs to.';
COMMENT ON COLUMN progress.rooms_visited IS 'UUIDs of rooms the player has entered.';
COMMENT ON COLUMN progress.quests_completed IS 'UUIDs of completed quests.';
COMMENT ON COLUMN progress.items_collected IS 'UUIDs of items picked up.';
COMMENT ON COLUMN progress.secrets_found IS 'UUIDs of secret rooms discovered.';
COMMENT ON COLUMN progress.conversations IS 'Count of NPC conversations held.';

COMMENT ON TABLE achievement_unlocks IS 'Achievements earned by identities (one row per identity/key).';
COMMENT ON COLUMN achievement_unlocks.identity_id IS 'Identity that earned the achievement.';
COMMENT ON COLUMN achievement_unlocks.achievement_key IS 'Stable achievement key (e.g. "first_world_played").';

COMMENT ON TABLE generation_jobs IS 'Async AI world-generation jobs polled by the client.';
COMMENT ON COLUMN generation_jobs.status IS 'Job lifecycle state: pending|running|done|error.';
COMMENT ON COLUMN generation_jobs.progress IS '0-100 completion percentage.';
COMMENT ON COLUMN generation_jobs.stage IS 'Human-readable current stage (e.g. "rooms").';
COMMENT ON COLUMN generation_jobs.world_id IS 'World created by the job; set NULL if the world is deleted.';
COMMENT ON COLUMN generation_jobs.error IS 'Error message when status is error.';
COMMENT ON COLUMN generation_jobs.params IS 'Generation parameters (prompt, style, room count, etc.).';
