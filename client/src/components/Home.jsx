import React, { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { getIdentity } from '../lib/identity.js'
import ExploreTab, { WorldCard } from './ExploreTab.jsx'
import LeaderboardsTab from './LeaderboardsTab.jsx'
import AchievementsDialog from './AchievementsDialog.jsx'
import SettingsDialog from './SettingsDialog.jsx'
import CreateWorldDialog from './CreateWorldDialog.jsx'
import TutorialButton from './TutorialButton.jsx'

const TABS = [
  { key: 'mine', label: '🌍 My Worlds' },
  { key: 'explore', label: '🧭 Explore' },
  { key: 'leaderboards', label: '🏆 Leaderboards' },
]

// Home: header (achievements, tutorial, settings, create), three tabs.
export default function Home() {
  const [identity] = useState(() => getIdentity())
  const [tab, setTab] = useState('mine')
  const [showAchievements, setShowAchievements] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [unlockedCount, setUnlockedCount] = useState(null)

  const [myWorlds, setMyWorlds] = useState([])
  const [myLoading, setMyLoading] = useState(true)
  const [myError, setMyError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.getAchievements(identity.id)
      .then((res) => {
        if (!cancelled) {
          const list = Array.isArray(res) ? res : res.achievements || []
          setUnlockedCount(list.filter((a) => a.unlocked).length)
        }
      })
      .catch(() => { /* header count is best-effort */ })
    return () => { cancelled = true }
  }, [identity.id])

  useEffect(() => {
    if (tab !== 'mine') return
    let cancelled = false
    setMyLoading(true)
    setMyError('')
    api.listWorlds({ scope: 'mine', owner_id: identity.id, sort: 'newest', limit: 50 })
      .then((res) => {
        if (!cancelled) {
          setMyWorlds(res.worlds || [])
          setMyLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setMyError(e.message || 'Could not load your worlds.')
          setMyLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [tab, identity.id])

  return (
    <div className="page">
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">🗺️</span>
          <div>
            <h1>Saxum</h1>
            <p className="tagline">Infinite text-adventure worlds</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setShowAchievements(true)}>
            🏆 Achievements {unlockedCount !== null ? `${unlockedCount}/26` : ''}
          </button>
          <TutorialButton />
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>✨ Create New World</button>
        </div>
      </header>
      <p className="identity-line">
        Playing as <strong>{identity.label}</strong> — no login needed, your identity lives in this browser.
      </p>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'tab' + (tab === t.key ? ' active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'mine' && (
          <div className="tab-pane">
            {myLoading && <div className="center"><div className="spinner" /><p>Loading your worlds…</p></div>}
            {myError && <p className="error">{myError}</p>}
            {!myLoading && !myError && myWorlds.length === 0 && (
              <div className="empty-state">
                <p className="empty">No worlds yet — create one!</p>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                  ✨ Create your first world
                </button>
              </div>
            )}
            <div className="worlds-grid">
              {myWorlds.map((w) => (
                <WorldCard key={w.id} world={w} identity={identity} />
              ))}
            </div>
          </div>
        )}
        {tab === 'explore' && <ExploreTab />}
        {tab === 'leaderboards' && <LeaderboardsTab />}
      </main>

      {showAchievements && (
        <AchievementsDialog identityId={identity.id} onClose={() => setShowAchievements(false)} />
      )}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showCreate && <CreateWorldDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
