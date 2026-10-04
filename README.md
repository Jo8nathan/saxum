# Saxum

A public AI text-adventure creation and play platform. **No login required** — anyone
with the link can create worlds, play them, and share them.

Saxum replaces an older GitHub Spark–hosted game environment: shared links no longer
hit a login wall, and worlds are hosted on proper infrastructure instead of GitHub's
limited storage.

## Features

- **World creation with AI generation** — describe a world, Groq generates the map,
  NPCs, items, and quests; track progress via generation jobs
- **Play view** — move through the world, see the map, talk to NPCs, pick up items,
  complete quests
- **Explore** — browse worlds created by the community
- **Leaderboards** — top players / worlds (anonymous)
- **26 achievements** — unlock badges as you play
- **Tutorial** — onboarding walkthrough for new players
- **Settings with personal Groq key override** — bring your own Groq API key so you
  don't consume the shared one (useful if you hit generation rate limits)
- **Public share links** — every world gets a shareable URL, no account needed

## Architecture

```
 ┌─────────┐     ┌────────────────────────┐
 │ Browser │────▶│ Vercel: static client  │  (client/dist from React + Vite)
 └─────────┘     │ (client built by Vite) │
                 └───────────┬────────────┘
                             │ /api/* rewrites
                             ▼
                 ┌────────────────────────┐
                 │ api/index.js (serverless│
                 │ wrapper) → Express app │
                 │ (server/src/app.js)    │
                 └────┬────────┬──────┬───┘
                      │        │      │
                      ▼        ▼      ▼
                 ┌─────────┐ ┌─────┐ ┌──────────────┐
                 │Supabase │ │Groq │ │Pollinations  │
                 │Postgres │ │(AI) │ │(images, via  │
                 │         │ │     │ │on-demand URL) │
                 └─────────┘ └─────┘ └──────────────┘
```

- `client/` — React + Vite frontend (has its own `package.json`)
- `server/` — Express API (has its own `package.json`; exports the app from
  `server/src/app.js` via `module.exports`, without calling `listen`)
- `api/index.js` — thin Vercel serverless wrapper: `module.exports = app` for the
  serverless function at `/api`
- `supabase/` — `schema.sql` and related DB assets
- `scripts/` — utilities, including the legacy world importer

## Local development

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- A Groq API key ([console.groq.com](https://console.groq.com), free tier)

### Setup

```bash
# 1. Install all workspace dependencies (client + server)
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY

# 3. Create the database schema:
#    open your Supabase project → SQL editor → paste and run supabase/schema.sql

# 4. Start everything (API on :3001, client on :5173)
npm run dev
```

Open http://localhost:5173 in your browser.

## Environment variables

| Variable                    | Required | Default                  | Purpose                                              |
| --------------------------- | -------- | ------------------------ | ---------------------------------------------------- |
| `SUPABASE_URL`              | Yes      | —                        | Your Supabase project URL                            |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | —                        | Service-role key (server-side only; never ship to clients) |
| `GROQ_API_KEY`              | Yes      | —                        | Shared Groq key used for world generation and NPC chat |
| `PORT`                      | No       | `3001`                   | Port the Express API listens on locally              |
| `CLIENT_ORIGIN`             | No       | `http://localhost:5173`  | Allowed CORS origin for the frontend                 |

> **Note:** `CLIENT_ORIGIN` must be set to your deployed frontend URL in production
> (e.g. `https://your-app.vercel.app`). Mark any other production-only variables as
> pending — the values above are the full set defined for local dev per this config.

## Deploying

### Vercel (frontend + API)

1. Import this repo into Vercel.
2. Build command and output directory are already set in `vercel.json`:
   `npm run build` → `client/dist`. `/api/*` requests rewrite to the serverless
   Express function in `api/index.js`.
3. Add the environment variables from the table above in the Vercel dashboard
   (with `CLIENT_ORIGIN` set to your production URL).
4. **Serverless timeout caveat:** world generation is a long-running AI job.
   Vercel Hobby plans cap serverless functions at ~10–60s, so generation requests
   may time out there. Generation jobs are polled via `GET /api/jobs/:job_id`, but
   the job itself runs in-process — on Vercel that in-process work dies with the
   function. If generation becomes unreliable, host the API on a long-running host
   (Render, Railway, or Fly.io) and point the client at it instead.

### Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql` to create tables and policies.
3. Copy the project URL and **service-role** key into your env vars.

### Groq

1. Create a free API key at [console.groq.com](https://console.groq.com).
2. Set it as `GROQ_API_KEY`. All AI calls (world generation, NPC chat) run
   server-side — the key is never exposed to the browser.

## Importing legacy worlds

Worlds exported from the old GitHub Spark environment can be imported:

```bash
cd scripts && npm install && node import-world.js <world.json>
```

Two legacy worlds are already converted and ready to import from
`worlds-legacy/` (run `node convert-legacy.js` there to regenerate them from
`legacy-worlds.json`):

```bash
cd scripts && npm install && node import-world.js ../worlds-legacy/undersea-dome.json --owner legacy-import --author "Jo8nathan"
cd scripts && npm install && node import-world.js ../worlds-legacy/forgotten-temple.json --owner legacy-import --author "Jo8nathan"
```

See `worlds-legacy/README.md` for the conversion mapping and caveats
(notably: Forgotten Temple's unvisited rooms are stubs with no exits, so
navigation into them is one-way).

See `supabase/WORLD_JSON_SCHEMA.md` for the expected JSON format of `<world.json>`.
(Import utilities and schema doc are provided by the backend/data agents; verify
they exist before running.)

## API reference

Base path: `/api`. All routes below are relative to it.

| Method | Endpoint                                   | Description                                        |
| ------ | ------------------------------------------ | -------------------------------------------------- |
| GET    | `/health`                                  | Health check                                       |
| POST   | `/worlds/generate`                         | Start an AI world-generation job                   |
| GET    | `/jobs/:job_id`                            | Poll generation job status / result                |
| GET    | `/worlds`                                  | List / explore worlds                              |
| GET    | `/worlds/:id`                              | Get a single world's details                       |
| POST   | `/worlds/:id/favorite`                     | Favorite a world                                   |
| DELETE | `/worlds/:id/favorite`                     | Unfavorite a world                                 |
| POST   | `/worlds/:id/share`                        | Create / retrieve the public share link for a world |
| POST   | `/worlds/:id/progress/visit`               | Record a room visit during play                    |
| POST   | `/worlds/:id/talk`                         | Talk to an NPC (AI chat via Groq)                  |
| POST   | `/worlds/:id/take`                         | Pick up an item                                    |
| POST   | `/worlds/:id/quests/:quest_id/complete`    | Mark a quest complete                              |
| GET    | `/worlds/:id/progress`                     | Fetch saved play progress for a world              |
| GET    | `/leaderboard`                             | Global leaderboards                                |
| GET    | `/achievements`                            | List achievements (26 total) and unlock state      |
| POST   | `/tutorial`                                | Tutorial progress / completion                     |

> Endpoint behavior details (request/response shapes, auth, exact status codes) are
> owned by the backend agent's implementation in `server/` — check there for the
> authoritative spec if anything here drifts.

## Rate limits

Per this design (enforced server-side):

- **5 world generations / hour / IP** — generation is the most expensive operation
  (long Groq calls)
- **30 NPC talks / minute / IP** — keeps chat abuse in check
- **300 requests / 15 min / IP** — global guardrail

Why: all AI traffic shares one `GROQ_API_KEY`. Without limits, a few heavy users
(or a scraper) could burn the quota and degrade the service for everyone. Users who
need more can set a personal Groq key in Settings, which bypasses the shared-key
constraint for their own usage.

## Anonymous identity model

There are no accounts. On first visit the client generates a random id and stores
it in `localStorage`; the server keys favorites, progress, achievements, and
leaderboard entries off that id.

**Tradeoffs:**

- **Pros:** zero friction — share a link and anyone can play instantly; no PII to
  store or protect.
- **Cons:** progress lives in that browser only — clearing site data or switching
  devices loses it; ids are trivially forgeable, so leaderboards are trust-based,
  not secure; no password recovery or cross-device sync.

## Limitations & tradeoffs

- **Custom cover uploads** are stored as base64 data URLs in Postgres. Fine at
  small scale; they inflate row sizes and don't belong in a database long-term —
  move to object storage (Supabase Storage / S3) if worlds grow.
- **In-memory rate limiting resets on serverless cold starts.** Counters live in
  the function instance, so limits are per-instance, not global, on Vercel. A
  shared store (Redis/Upstash) would fix this.
- **Generation jobs run in-process.** Works fine locally or on a long-running
  host (Render/Railway/Fly), but may time out on Vercel Hobby function limits —
  see the deploy section.
- **Pollinations images are generated on demand via URL.** No image hosting or
  caching is managed by Saxum itself; image URLs embed the prompt parameters.
- **Achievements endpoint shape** (`GET /achievements` vs per-world) and the exact
  tutorial progress contract should be confirmed against the backend
  implementation — flagged as uncertain pending the backend agent's delivery.
