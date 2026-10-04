import React, { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const CATEGORIES = [
  { key: 'quests', label: 'Quests' },
  { key: 'locations', label: 'Locations' },
  { key: 'worlds', label: 'Worlds' },
  { key: 'items', label: 'Items' },
  { key: 'conversations', label: 'Conversations' },
]

const BADGE_ICONS = {
  Champion: '🥇',
  Elite: '🥈',
  Master: '🥉',
}

// Leaderboards tab: category selector + ranked table with badges.
export default function LeaderboardsTab() {
  const [category, setCategory] = useState('quests')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getLeaderboard(category)
      .then((res) => {
        if (!cancelled) {
          setRows(Array.isArray(res) ? res : res.leaderboard || res.entries || [])
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Could not load the leaderboard.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [category])

  return (
    <div className="tab-pane">
      <div className="explore-toolbar">
        <label className="sort-label">
          Category:&nbsp;
          <select
            className="input input-inline"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <div className="center"><div className="spinner" /><p>Loading leaderboard…</p></div>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        rows.length === 0 ? (
          <p className="empty">No entries yet — be the first to make the board!</p>
        ) : (
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Explorer</th>
                <th>Score</th>
                <th>Badge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rank = row.rank ?? i + 1
                return (
                  <tr key={row.rank != null ? `r${row.rank}` : `i${i}`} className={rank <= 3 ? 'top-three' : ''}>
                    <td className="rank-cell">#{rank}</td>
                    <td>{row.label || 'Unknown'}</td>
                    <td>{row.value}</td>
                    <td>
                      {row.badge && BADGE_ICONS[row.badge] ? (
                        <span className="badge">{BADGE_ICONS[row.badge]} {row.badge}</span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}
