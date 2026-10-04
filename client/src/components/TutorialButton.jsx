import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { getIdentity } from '../lib/identity.js'

// Header button: spins up the tutorial world and drops the player straight in.
export default function TutorialButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const start = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const identity = getIdentity()
      const res = await api.createTutorial(identity.id)
      if (!res || !res.id) throw new Error('Tutorial world came back without an id.')
      navigate(`/w/${res.id}`)
    } catch (e) {
      setError(e.message || 'Could not start the tutorial.')
      setBusy(false)
    }
  }

  return (
    <span className="tutorial-btn-wrap">
      <button className="btn btn-ghost" onClick={start} disabled={busy}>
        {busy ? 'Summoning…' : '🎓 Tutorial'}
      </button>
      {error && <span className="inline-error">{error}</span>}
    </span>
  )
}
