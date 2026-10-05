// Fetch wrapper + every Saxum API endpoint. All calls are same-origin
// relative /api paths. The user's personal Groq key (if set in Settings) is
// attached as `x-groq-key` on world-generation and NPC-talk requests only.
const BASE = '/api'
const GROQ_KEY_STORAGE = 'saxum_groq_key'

export function getGroqKey() {
  try {
    return localStorage.getItem(GROQ_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function setGroqKey(key) {
  try {
    if (key) localStorage.setItem(GROQ_KEY_STORAGE, key)
    else localStorage.removeItem(GROQ_KEY_STORAGE)
  } catch {
    // ignore storage failures
  }
}

async function request(path, opts = {}) {
  const { method = 'GET', body, sendGroqKey = false } = opts
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (sendGroqKey) {
    const k = getGroqKey()
    if (k) headers['x-groq-key'] = k
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

function query(params = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: () => request('/health'),

  updateIdentity: (identityId, label) =>
    request('/identity', { method: 'POST', body: { identity_id: identityId, label } }),

  generateWorld: (payload) =>
    request('/worlds/generate', { method: 'POST', body: payload, sendGroqKey: true }),

  getJob: (jobId) => request(`/jobs/${encodeURIComponent(jobId)}`),

  listWorlds: (params = {}) => request('/worlds' + query(params)),

  getWorld: (id) => request(`/worlds/${encodeURIComponent(id)}`),

  favoriteWorld: (id, identityId) =>
    request(`/worlds/${encodeURIComponent(id)}/favorite`, {
      method: 'POST',
      body: { identity_id: identityId },
    }),

  unfavoriteWorld: (id, identityId) =>
    request(`/worlds/${encodeURIComponent(id)}/favorite`, {
      method: 'DELETE',
      body: { identity_id: identityId },
    }),

  shareWorld: (id, identityId) =>
    request(`/worlds/${encodeURIComponent(id)}/share`, {
      method: 'POST',
      body: { identity_id: identityId },
    }),

  visitRoom: (id, identityId, roomId) =>
    request(`/worlds/${encodeURIComponent(id)}/progress/visit`, {
      method: 'POST',
      body: { identity_id: identityId, room_id: roomId },
    }),

  talkToNpc: (id, identityId, npcId, message) =>
    request(`/worlds/${encodeURIComponent(id)}/talk`, {
      method: 'POST',
      body: { identity_id: identityId, npc_id: npcId, message },
      sendGroqKey: true,
    }),

  takeItem: (id, identityId, itemId) =>
    request(`/worlds/${encodeURIComponent(id)}/take`, {
      method: 'POST',
      body: { identity_id: identityId, item_id: itemId },
    }),

  giveItem: (id, identityId, npcId, itemId) =>
    request(`/worlds/${encodeURIComponent(id)}/give`, {
      method: 'POST',
      body: { identity_id: identityId, npc_id: npcId, item_id: itemId },
    }),

  completeQuest: (id, questId, identityId) =>
    request(`/worlds/${encodeURIComponent(id)}/quests/${encodeURIComponent(questId)}/complete`, {
      method: 'POST',
      body: { identity_id: identityId },
    }),

  getProgress: (id, identityId) =>
    request(`/worlds/${encodeURIComponent(id)}/progress` + query({ identity_id: identityId })),

  getLeaderboard: (category) => request('/leaderboard' + query({ category })),

  getAchievements: (identityId) => request('/achievements' + query({ identity_id: identityId })),

  createTutorial: (identityId) =>
    request('/tutorial', {
      method: 'POST',
      body: identityId ? { identity_id: identityId } : {},
    }),
}
