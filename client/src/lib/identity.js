// Anonymous, public identity for Saxum. No login — every visitor gets a
// stable local identity on first load, stored in localStorage.
const KEY = 'saxum_identity'

export const DISPLAY_NAME_MAX = 30

export function getIdentity() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.id === 'string' && typeof parsed.label === 'string') {
        return parsed
      }
    }
  } catch {
    // fall through to creation
  }
  const id = crypto.randomUUID()
  const identity = {
    id,
    label: 'Explorer #' + id.slice(0, 4).toUpperCase(),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(identity))
  } catch {
    // storage unavailable; identity is session-scoped then
  }
  return identity
}

// Rename the local display name (leaderboard + world bylines). The stable
// random id is unchanged; only the human-readable label is replaced.
export function setDisplayName(label) {
  const clean = (label || '').trim().slice(0, DISPLAY_NAME_MAX)
  if (!clean) throw new Error('Display name must not be blank')
  const identity = { ...getIdentity(), label: clean }
  try {
    localStorage.setItem(KEY, JSON.stringify(identity))
  } catch {
    // ignore storage failures
  }
  return identity
}
