import React, { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

// Grid of all 26 achievements with locked/unlocked state.
export default function AchievementsDialog({ identityId, onClose }) {
  const [achievements, setAchievements] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getAchievements(identityId)
      .then((res) => {
        if (!cancelled) {
          setAchievements(Array.isArray(res) ? res : res.achievements || [])
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Could not load achievements.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [identityId])

  const unlockedCount = achievements ? achievements.filter((a) => a.unlocked).length : 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal achievements-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🏆 Achievements ({unlockedCount}/26)</h3>
          <button className="btn btn-ghost btn-small" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <div className="center"><div className="spinner" /><p>Loading achievements…</p></div>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && (
            achievements && achievements.length > 0 ? (
              <div className="achievements-grid">
                {achievements.map((a) => (
                  <div key={a.key} className={'achievement-card' + (a.unlocked ? ' unlocked' : ' locked')}>
                    <div className="achievement-icon">{a.unlocked ? '🏅' : '🔒'}</div>
                    <div className="achievement-name">{a.name || a.key}</div>
                    <div className="achievement-desc">{a.description}</div>
                    {a.unlocked && a.unlocked_at && (
                      <div className="achievement-date">
                        {new Date(a.unlocked_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No achievements found yet. Play some worlds to earn them!</p>
            )
          )}
        </div>
      </div>
    </div>
  )
}
