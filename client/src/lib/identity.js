// Anonymous, public identity for Saxum. No login — every visitor gets a
// stable local identity on first load, stored in localStorage.
const KEY = 'saxum_identity'

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
