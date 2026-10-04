import React, { useState } from 'react'
import { api } from '../lib/api.js'
import { getIdentity } from '../lib/identity.js'

// Share controls for a world: copyable link (also records the share on the
// server), plus X / Facebook / LinkedIn share URLs.
export default function ShareButtons({ worldId, title }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const pageUrl = `${window.location.origin}/w/${worldId}`
  const text = title ? `Explore "${title}" — a text adventure on Saxum` : 'Explore this text adventure on Saxum'

  const copyLink = async () => {
    setError('')
    try {
      await navigator.clipboard.writeText(pageUrl)
    } catch {
      // clipboard API unavailable (non-secure context); fall back to prompt
      window.prompt('Copy this link:', pageUrl)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    try {
      const identity = getIdentity()
      await api.shareWorld(worldId, identity.id)
    } catch (e) {
      setError(e.message || 'Could not record the share.')
    }
  }

  return (
    <div className="share-row">
      <button className="btn btn-small" onClick={copyLink}>
        {copied ? '✓ Link copied' : '🔗 Copy link'}
      </button>
      <a
        className="btn btn-small btn-ghost"
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        𝕏
      </a>
      <a
        className="btn btn-small btn-ghost"
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        f
      </a>
      <a
        className="btn btn-small btn-ghost"
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        in
      </a>
      {error && <span className="inline-error">{error}</span>}
    </div>
  )
}
