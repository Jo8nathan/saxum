import React, { useState } from 'react'
import { getGroqKey, setGroqKey, api } from '../lib/api.js'
import { getIdentity, setDisplayName, DISPLAY_NAME_MAX } from '../lib/identity.js'

// Settings: display name (leaderboard + world bylines) and optional
// personal Groq key, both stored in localStorage.
export default function SettingsDialog({ onClose }) {
  const [name, setName] = useState(() => getIdentity().label)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')
  const [key, setKey] = useState(() => getGroqKey())
  const [saved, setSaved] = useState(false)

  const saveName = async () => {
    setNameError('')
    try {
      const identity = setDisplayName(name)
      await api.updateIdentity(identity.id, identity.label)
      setName(identity.label)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch (e) {
      setNameError(e.message || 'Could not save display name')
    }
  }

  const save = () => {
    setGroqKey(key.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const clear = () => {
    setKey('')
    setGroqKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙️ Settings</h3>
          <button className="btn btn-ghost btn-small" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label className="field-label" htmlFor="display-name">Display name</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="display-name"
              type="text"
              className="input"
              placeholder="e.g. Jonathan"
              value={name}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={saveName}>
              {nameSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          {nameError && <p className="hint" style={{ color: '#c0392b' }}>{nameError}</p>}
          <p className="hint">
            Shown on the leaderboard and as the author of the worlds you create.
            Stored only in this browser — no account needed.
          </p>
          <label className="field-label" htmlFor="groq-key">Personal Groq API key (optional)</label>
          <input
            id="groq-key"
            type="password"
            className="input"
            placeholder="gsk_…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          <p className="hint">
            <strong>Why Groq?</strong> Groq offers fast inference, a generous free tier, and
            reliable text generation — perfect for powering world generation and NPC
            conversations on Saxum. Your key is stored only in this browser's
            localStorage and is sent as the <code>x-groq-key</code> header on
            world-generation and NPC-talk requests. Leave it blank to use the
            platform default.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={clear}>Clear</button>
            <button className="btn btn-primary" onClick={save}>
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
