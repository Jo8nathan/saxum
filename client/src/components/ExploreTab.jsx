import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { getIdentity } from '../lib/identity.js'
import ShareButtons from './ShareButtons.jsx'

const PAGE_SIZE = 24

// World card shared by the Explore and My Worlds tabs.
export function WorldCard({ world, identity }) {
  const [favorited, setFavorited] = useState(false)
  const [favBusy, setFavBusy] = useState(false)
  const [favError, setFavError] = useState('')
  const [progressPct, setProgressPct] = useState(null)

  useEffect(() => {
    let cancelled = false
    api.getProgress(world.id, identity.id)
      .then((p) => {
        if (!cancelled && p && typeof p.progress_pct === 'number') setProgressPct(p.progress_pct)
      })
      .catch(() => { /* progress is best-effort on cards */ })
    return () => { cancelled = true }
  }, [world.id, identity.id])

  const toggleFavorite = async () => {
    if (favBusy) return
    setFavBusy(true)
    setFavError('')
    try {
      if (favorited) {
        await api.unfavoriteWorld(world.id, identity.id)
        setFavorited(false)
      } else {
        await api.favoriteWorld(world.id, identity.id)
        setFavorited(true)
      }
    } catch (e) {
      setFavError(e.message || 'Could not update favorite.')
    } finally {
      setFavBusy(false)
    }
  }

  return (
    <div className="world-card">
      <Link to={`/w/${world.id}`} className="world-card-cover">
        {world.image_url ? (
          <img src={world.image_url} alt={world.title} />
        ) : (
          <div className="world-card-cover-fallback">🗺️</div>
        )}
      </Link>
      <div className="world-card-body">
        <Link to={`/w/${world.id}`} className="world-card-title">{world.title}</Link>
        {world.description && (
          <p className="world-card-desc">{world.description}</p>
        )}
        <div className="world-card-meta">
          <span>🚪 {world.room_count ?? '?'} rooms</span>
          {world.author_label && <span>✍️ {world.author_label}</span>}
          {world.play_count != null && <span>▶ {world.play_count}</span>}
          {world.favorite_count != null && <span>❤️ {world.favorite_count}</span>}
        </div>
        {progressPct !== null && (
          <div className="world-card-progress">
            <div className="progress-track mini">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="hint">{Math.round(progressPct)}% explored</span>
          </div>
        )}
        <div className="world-card-actions">
          <button
            className={'btn btn-small' + (favorited ? ' btn-fav-active' : ' btn-ghost')}
            onClick={toggleFavorite}
            disabled={favBusy}
            title={favorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            {favorited ? '❤️ Favorited' : '🤍 Favorite'}
          </button>
        </div>
        {favError && <p className="error">{favError}</p>}
        <ShareButtons worldId={world.id} title={world.title} />
      </div>
    </div>
  )
}

// Explore tab: browse public worlds with sort + refresh.
export default function ExploreTab() {
  const [identity] = useState(() => getIdentity())
  const [sort, setSort] = useState('newest')
  const [worlds, setWorlds] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (sortValue, fromOffset, append) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const res = await api.listWorlds({
        scope: 'explore',
        owner_id: identity.id,
        sort: sortValue,
        limit: PAGE_SIZE,
        offset: fromOffset,
      })
      const list = res.worlds || []
      const tot = typeof res.total === 'number' ? res.total : list.length
      setWorlds((prev) => (append ? [...prev, ...list] : list))
      setTotal(tot)
      setOffset(fromOffset + list.length)
    } catch (e) {
      setError(e.message || 'Could not load worlds.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [identity.id])

  useEffect(() => {
    setOffset(0)
    setWorlds([])
    load(sort, 0, false)
  }, [sort, load])

  const refresh = () => {
    setOffset(0)
    setWorlds([])
    load(sort, 0, false)
  }

  return (
    <div className="tab-pane">
      <div className="explore-toolbar">
        <label className="sort-label">
          Sort:&nbsp;
          <select className="input input-inline" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="popular">Most Popular</option>
          </select>
        </label>
        <button className="btn btn-ghost btn-small" onClick={refresh} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      {loading && <div className="center"><div className="spinner" /><p>Loading worlds…</p></div>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && worlds.length === 0 && (
        <p className="empty">No worlds yet — create one!</p>
      )}

      <div className="worlds-grid">
        {worlds.map((w) => (
          <WorldCard key={w.id} world={w} identity={identity} />
        ))}
      </div>

      {!loading && !error && worlds.length < total && (
        <div className="center load-more">
          <button
            className="btn btn-ghost"
            onClick={() => load(sort, offset, true)}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : `Load more (${worlds.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  )
}
