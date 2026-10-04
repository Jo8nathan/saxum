import React, { useState } from 'react'
import { getGroqKey, setGroqKey } from '../lib/api.js'

// Settings: optional personal Groq key, stored in localStorage.
export default function SettingsDialog({ onClose }) {
  const [key, setKey] = useState(() => getGroqKey())
  const [saved, setSaved] = useState(false)

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
