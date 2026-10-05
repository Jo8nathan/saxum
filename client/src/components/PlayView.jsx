import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { getIdentity } from '../lib/identity.js'
import ShareButtons from './ShareButtons.jsx'
import ImageGallery from './ImageGallery.jsx'

// Defensive accessors — the backend owns exact field names.
const roomIdOf = (r) => r && r.id
const exitFrom = (e) => e.from_room_id ?? e.fromRoomId ?? e.from
const exitTo = (e) => e.to_room_id ?? e.toRoomId ?? e.to
const exitLabel = (e, rooms) => {
  if (e.label) return e.label
  if (e.direction) return e.direction
  if (e.name) return e.name
  const target = rooms.find((r) => roomIdOf(r) === exitTo(e))
  return target ? `Go to ${target.name}` : 'Travel'
}
const questName = (q) => q.name ?? q.title ?? 'Quest'
const questDesc = (q) => q.objective ?? q.description ?? q.details ?? ''
const questIdOf = (q) => q.id ?? q.quest_id ?? q.key

let toastSeq = 0

// SVG world map: current=gold, visited=green, unexplored=gray,
// undiscovered secret=dashed gray '?' node.
function WorldMap({ rooms, exits, currentRoomId, visitedIds }) {
  const PAD = 60
  const R = 16

  const layout = useMemo(() => {
    const pts = rooms.map((r) => ({ x: Number(r.x ?? 0), y: Number(r.y ?? 0) }))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    let minX = Math.min(...xs), maxX = Math.max(...xs)
    let minY = Math.min(...ys), maxY = Math.max(...ys)
    const allSame = (maxX - minX) === 0 && (maxY - minY) === 0
    const coords = {}
    rooms.forEach((r, i) => {
      let x = Number(r.x ?? 0)
      let y = Number(r.y ?? 0)
      if (allSame) {
        const cols = Math.ceil(Math.sqrt(rooms.length))
        x = i % cols
        y = Math.floor(i / cols)
      }
      coords[roomIdOf(r)] = { x, y }
    })
    const cxs = Object.values(coords).map((c) => c.x)
    const cys = Object.values(coords).map((c) => c.y)
    minX = Math.min(...cxs); maxX = Math.max(...cxs)
    minY = Math.min(...cys); maxY = Math.max(...cys)
    const W = 600, H = 420
    const sx = (maxX - minX) === 0 ? 1 : (W - PAD * 2) / (maxX - minX)
    const sy = (maxY - minY) === 0 ? 1 : (H - PAD * 2) / (maxY - minY)
    const s = Math.min(sx, sy)
    const pos = {}
    for (const [id, c] of Object.entries(coords)) {
      pos[id] = { x: PAD + (c.x - minX) * s, y: PAD + (c.y - minY) * s }
    }
    return { pos, W, H }
  }, [rooms])

  const { pos, W, H } = layout
  const visited = new Set(visitedIds)

  const nodeState = (room) => {
    const id = roomIdOf(room)
    if (id === currentRoomId) return 'current'
    if (visited.has(id)) return 'visited'
    if (room.is_secret) return 'secret'
    return 'unexplored'
  }

  const colors = {
    current: { fill: '#e8b13a', stroke: '#ffe9a8' },
    visited: { fill: '#3f7d4e', stroke: '#8fd6a0' },
    unexplored: { fill: '#4a4a55', stroke: '#8a8a96' },
    secret: { fill: 'transparent', stroke: '#8a8a96', dashed: true },
  }

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="world-map" role="img" aria-label="World map">
        {exits.map((e, i) => {
          const a = pos[exitFrom(e)]
          const b = pos[exitTo(e)]
          if (!a || !b) return null
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#5a5a66" strokeWidth="2" opacity="0.6" />
          )
        })}
        {rooms.map((room) => {
          const id = roomIdOf(room)
          const p = pos[id]
          if (!p) return null
          const state = nodeState(room)
          const c = colors[state]
          return (
            <g key={id}>
              <circle
                cx={p.x} cy={p.y} r={R}
                fill={c.fill}
                stroke={c.stroke}
                strokeWidth="2.5"
                strokeDasharray={c.dashed ? '6 4' : undefined}
                className={state === 'current' ? 'map-current' : undefined}
              />
              {state === 'secret' ? (
                <text x={p.x} y={p.y + 5} textAnchor="middle" className="map-secret-q">?</text>
              ) : (
                <text x={p.x} y={p.y + 34} textAnchor="middle" className="map-label">
                  {state === 'current' || state === 'visited' ? (room.name || '') : ''}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="map-legend">
        <span><i className="legend-dot" style={{ background: '#e8b13a' }} /> Current</span>
        <span><i className="legend-dot" style={{ background: '#3f7d4e' }} /> Visited</span>
        <span><i className="legend-dot" style={{ background: '#4a4a55' }} /> Unexplored</span>
        <span><i className="legend-dot legend-dashed">?</i> Undiscovered secret</span>
      </div>
    </div>
  )
}

export default function PlayView() {
  const { id } = useParams()
  const [identity] = useState(() => getIdentity())

  const [world, setWorld] = useState(null)
  const [rooms, setRooms] = useState([])
  const [exits, setExits] = useState([])
  const [npcs, setNpcs] = useState([])
  const [items, setItems] = useState([])
  const [quests, setQuests] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [currentRoomId, setCurrentRoomId] = useState(null)
  const [visitedIds, setVisitedIds] = useState([])
  const [completedQuestIds, setCompletedQuestIds] = useState([])

  const [talkNpc, setTalkNpc] = useState(null)
  const [talkMessages, setTalkMessages] = useState([])
  const [talkInput, setTalkInput] = useState('')
  const [talkSending, setTalkSending] = useState(false)
  const [talkError, setTalkError] = useState('')
  const [giving, setGiving] = useState(false)

  const [galleryOpen, setGalleryOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [actionError, setActionError] = useState('')

  const initialVisitDone = useRef(false)

  const pushAchievements = useCallback((newlyUnlocked) => {
    if (!Array.isArray(newlyUnlocked) || newlyUnlocked.length === 0) return
    const fresh = newlyUnlocked.map((a) => ({
      toastId: ++toastSeq,
      name: a.name || a.key || 'Achievement',
      description: a.description || '',
    }))
    setToasts((prev) => [...prev, ...fresh])
    for (const t of fresh) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.toastId !== t.toastId))
      }, 5000)
    }
  }, [])

  const refreshProgress = useCallback(async () => {
    try {
      const p = await api.getProgress(id, identity.id)
      setProgress(p && p.progress ? p.progress : p)
    } catch {
      // progress refresh is best-effort
    }
  }, [id, identity.id])

  const enterRoom = useCallback(async (roomId) => {
    setCurrentRoomId(roomId)
    setVisitedIds((prev) => (prev.includes(roomId) ? prev : [...prev, roomId]))
    try {
      const res = await api.visitRoom(id, identity.id, roomId)
      const p = res && res.progress ? res.progress : res
      if (p) setProgress(p)
      pushAchievements(res && res.newly_unlocked)
    } catch (e) {
      setActionError(e.message || 'Could not record the visit.')
    }
  }, [id, identity.id, pushAchievements])

  // Initial load
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getWorld(id)
      .then(async (res) => {
        if (cancelled) return
        const w = res.world || res
        const rms = res.rooms || []
        setWorld(w)
        setRooms(rms)
        setExits(res.exits || [])
        setNpcs(res.npcs || [])
        setItems(res.items || [])
        const qs = res.quests || []
        setQuests(qs)
        setCompletedQuestIds(qs.filter((q) => q.completed).map(questIdOf).filter(Boolean))
        setLoading(false)
        try {
          const p = await api.getProgress(id, identity.id)
          if (!cancelled) setProgress(p && p.progress ? p.progress : p)
        } catch {
          // ignore
        }
        if (!cancelled && rms.length > 0 && !initialVisitDone.current) {
          initialVisitDone.current = true
          enterRoom(roomIdOf(rms[0]))
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Could not load this world.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [id, identity.id, enterRoom])

  const currentRoom = rooms.find((r) => roomIdOf(r) === currentRoomId) || null
  const roomNpcs = npcs.filter((n) => (n.room_id ?? n.roomId) === currentRoomId)
  const roomItems = items.filter(
    (it) => (it.room_id ?? it.roomId) === currentRoomId && !it.taken_by,
  )
  const inventory = items.filter((it) => it.taken_by === identity.id)
  const itemNameById = Object.fromEntries(items.map((it) => [it.id, it.name]))
  const npcNameById = Object.fromEntries(npcs.map((n) => [n.id, n.name]))
  const roomExits = exits.filter((e) => exitFrom(e) === currentRoomId)

  const move = (roomId) => {
    if (!roomId || roomId === currentRoomId) return
    setActionError('')
    setTalkNpc(null)
    enterRoom(roomId)
  }

  const takeItem = async (item) => {
    setActionError('')
    try {
      const res = await api.takeItem(id, identity.id, item.id)
      setItems((prev) => prev.map((it) =>
        it.id === item.id ? { ...it, taken_by: identity.id } : it,
      ))
      pushAchievements(res && res.newly_unlocked)
      refreshProgress()
    } catch (e) {
      setActionError(e.message || 'Could not take the item.')
    }
  }

  const completeQuest = async (quest) => {
    setActionError('')
    try {
      const res = await api.completeQuest(id, questIdOf(quest), identity.id)
      setCompletedQuestIds((prev) => {
        const qid = questIdOf(quest)
        return prev.includes(qid) ? prev : [...prev, qid]
      })
      pushAchievements(res && res.newly_unlocked)
      refreshProgress()
    } catch (e) {
      setActionError(e.message || 'Could not complete the quest.')
    }
  }

  const giveItemToNpc = async (item) => {
    if (!talkNpc || giving) return
    setGiving(true)
    setTalkError('')
    try {
      const res = await api.giveItem(id, identity.id, talkNpc.id, item.id)
      setItems((prev) => prev.map((it) =>
        it.id === item.id ? { ...it, taken_by: res.item.taken_by } : it,
      ))
      const lines = [`You gave the ${res.item.name} to ${res.npc.name}.`]
      for (const q of res.completed_quests || []) {
        lines.push(`✅ Quest complete: ${q.title}${q.reward ? ` — Reward: ${q.reward}` : ''}`)
      }
      setTalkMessages((prev) => [...prev, { from: 'system', text: lines.join('\n') }])
      const newIds = (res.completed_quests || []).map((q) => q.id)
      if (newIds.length > 0) {
        setCompletedQuestIds((prev) => [...prev, ...newIds.filter((qid) => !prev.includes(qid))])
      }
      pushAchievements(res && res.newly_unlocked)
      refreshProgress()
    } catch (e) {
      setTalkError(e.message || 'Could not give the item.')
    } finally {
      setGiving(false)
    }
  }

  const openTalk = (npc) => {
    setTalkNpc(npc)
    setTalkMessages([])
    setTalkInput('')
    setTalkError('')
  }

  const sendTalk = async (e) => {
    e.preventDefault()
    const msg = talkInput.trim()
    if (!msg || talkSending || !talkNpc) return
    setTalkError('')
    setTalkSending(true)
    setTalkMessages((prev) => [...prev, { from: 'you', text: msg }])
    setTalkInput('')
    try {
      const res = await api.talkToNpc(id, identity.id, talkNpc.id, msg)
      setTalkMessages((prev) => [...prev, { from: 'npc', text: res.reply || '(silence)' }])
      pushAchievements(res && res.newly_unlocked)
      refreshProgress()
    } catch (err) {
      setTalkError(err.message || 'The NPC seems lost in thought. Try again.')
    } finally {
      setTalkSending(false)
    }
  }

  const progressPct = progress && typeof progress.progress_pct === 'number'
    ? progress.progress_pct
    : 0

  if (loading) {
    return (
      <div className="page center-page">
        <div className="spinner" />
        <p>Entering the world…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page center-page">
        <p className="error">⚠️ {error}</p>
        <Link to="/" className="btn btn-primary">← Back to home</Link>
      </div>
    )
  }

  return (
    <div className="page play-page">
      <header className="play-header">
        <Link to="/" className="btn btn-ghost btn-small">← Back to home</Link>
        <div className="play-title">
          <h2>{world && world.title}</h2>
          {world && world.author_label && <p className="hint">by {world.author_label}</p>}
        </div>
        <div className="play-header-actions">
          <button className="btn btn-ghost btn-small" onClick={() => setGalleryOpen(true)}>
            🖼️ Gallery
          </button>
        </div>
      </header>

      {actionError && <p className="error">{actionError}</p>}

      <div className="play-grid">
        <div className="play-main">
          {currentRoom && (
            <section className="room-card">
              {currentRoom.image_url && (
                <img src={currentRoom.image_url} alt={currentRoom.name} className="room-image" />
              )}
              <h3>{currentRoom.name}</h3>
              <p className="room-desc">{currentRoom.description}</p>
            </section>
          )}

          <section className="panel">
            <h4>🚪 Exits</h4>
            {roomExits.length === 0 ? (
              <p className="hint">No visible exits from here.</p>
            ) : (
              <div className="exits-row">
                {roomExits.map((e, i) => (
                  <button
                    key={e.id ?? i}
                    className="btn btn-small btn-exit"
                    onClick={() => move(exitTo(e))}
                  >
                    {exitLabel(e, rooms)} →
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h4>🧑‍🤝‍🧑 Characters</h4>
            {roomNpcs.length === 0 ? (
              <p className="hint">No one else is here.</p>
            ) : (
              <ul className="entity-list">
                {roomNpcs.map((npc) => (
                  <li key={npc.id} className="entity-row">
                    <div>
                      <strong>{npc.name}</strong>
                      {npc.role && <span className="hint"> — {npc.role}</span>}
                      {npc.personality && <p className="hint entity-sub">{npc.personality}</p>}
                    </div>
                    <button className="btn btn-small" onClick={() => openTalk(npc)}>
                      💬 Talk
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h4>🎒 Items here</h4>
            {roomItems.length === 0 ? (
              <p className="hint">Nothing to pick up.</p>
            ) : (
              <ul className="entity-list">
                {roomItems.map((item) => (
                  <li key={item.id} className="entity-row">
                    <div>
                      <strong>{item.name}</strong>
                      {item.description && <p className="hint entity-sub">{item.description}</p>}
                    </div>
                    <button className="btn btn-small" onClick={() => takeItem(item)}>
                      ✋ Take
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h4>📜 Quest Log</h4>
            {quests.length === 0 ? (
              <p className="hint">No quests in this world — yet.</p>
            ) : (
              <ul className="entity-list">
                {quests.map((q) => {
                  const qid = questIdOf(q)
                  const done = q.completed || completedQuestIds.includes(qid)
                  const reqItemName = q.required_item_id ? (itemNameById[q.required_item_id] || 'a required item') : null
                  const giverName = q.npc_id ? npcNameById[q.npc_id] : null
                  return (
                    <li key={qid || questName(q)} className="entity-row">
                      <div>
                        <strong>{done ? '✅ ' : ''}{questName(q)}</strong>
                        {questDesc(q) && <p className="hint entity-sub">{questDesc(q)}</p>}
                        {reqItemName && !done && (
                          <p className="hint entity-sub">
                            🎁 Needs: <strong>{reqItemName}</strong>
                            {giverName ? ` — give it to ${giverName} while talking` : ' — give it to an NPC while talking'}
                          </p>
                        )}
                      </div>
                      {!done && !reqItemName && (
                        <button className="btn btn-small" onClick={() => completeQuest(q)}>
                          Complete
                        </button>
                      )}
                      {!done && reqItemName && (
                        <span className="hint">Give the item to solve</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <h4>🗺️ World Map</h4>
            {rooms.length > 0 ? (
              <WorldMap rooms={rooms} exits={exits} currentRoomId={currentRoomId} visitedIds={visitedIds} />
            ) : (
              <p className="hint">No map data.</p>
            )}
          </section>
        </div>

        <aside className="play-side">
          <section className="panel">
            <h4>📊 Exploration</h4>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="hint">{Math.round(progressPct)}% explored</p>
            {progress && (
              <ul className="stat-list">
                <li>🚪 Rooms visited: <strong>{progress.rooms_visited ?? '—'}</strong></li>
                <li>📜 Quests completed: <strong>{progress.quests_completed ?? '—'}</strong></li>
                <li>🎒 Items collected: <strong>{progress.items_collected ?? '—'}</strong></li>
                <li>🕵️ Secrets found: <strong>{progress.secrets_found ?? '—'}</strong></li>
                <li>💬 Conversations: <strong>{progress.conversations ?? '—'}</strong></li>
              </ul>
            )}
          </section>

          <section className="panel">
            <h4>🎒 Inventory</h4>
            {inventory.length === 0 ? (
              <p className="hint">Empty pockets. Pick something up!</p>
            ) : (
              <ul className="entity-list">
                {inventory.map((item) => (
                  <li key={item.id} className="entity-row">
                    <div>
                      <strong>{item.name}</strong>
                      {item.description && <p className="hint entity-sub">{item.description}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h4>📣 Share this world</h4>
            <ShareButtons worldId={id} title={world && world.title} />
          </section>
        </aside>
      </div>

      {talkNpc && (
        <div className="modal-overlay" onClick={() => setTalkNpc(null)}>
          <div className="modal talk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💬 {talkNpc.name}{talkNpc.role ? ` — ${talkNpc.role}` : ''}</h3>
              <button className="btn btn-ghost btn-small" onClick={() => setTalkNpc(null)}>✕</button>
            </div>
            <div className="modal-body talk-body">
              {talkNpc.personality && <p className="hint talk-personality">{talkNpc.personality}</p>}
              <div className="talk-history">
                {talkMessages.length === 0 && (
                  <p className="hint">Say something to {talkNpc.name}…</p>
                )}
                {talkMessages.map((m, i) => (
                  <div key={i} className={'talk-bubble ' + (m.from === 'you' ? 'you' : m.from === 'system' ? 'system' : 'npc')}>
                    {m.text}
                  </div>
                ))}
                {talkSending && <div className="talk-bubble npc typing">…</div>}
              </div>
              {talkError && <p className="error">{talkError}</p>}
              <form onSubmit={sendTalk} className="talk-form">
                <input
                  className="input"
                  value={talkInput}
                  onChange={(e) => setTalkInput(e.target.value)}
                  placeholder={`Message ${talkNpc.name}…`}
                  maxLength={500}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={talkSending || !talkInput.trim()}>
                  Send
                </button>
              </form>
              <div className="talk-give">
                {(() => {
                  const wanted = quests.filter((q) =>
                    !completedQuestIds.includes(questIdOf(q)) &&
                    q.required_item_id &&
                    (!q.npc_id || q.npc_id === talkNpc.id),
                  )
                  const held = items.filter((it) => it.taken_by === `npc:${talkNpc.id}`)
                  return (
                    <>
                      {wanted.length > 0 && (
                        <p className="hint">💡 {talkNpc.name} wants: {wanted.map((q) => itemNameById[q.required_item_id] || 'an item').join(', ')}</p>
                      )}
                      <h5>🎁 Give an item</h5>
                      {inventory.length === 0 ? (
                        <p className="hint">Your pockets are empty.</p>
                      ) : (
                        <div className="give-list">
                          {inventory.map((item) => (
                            <button
                              key={item.id}
                              className="btn btn-small"
                              disabled={giving}
                              onClick={() => giveItemToNpc(item)}
                            >
                              Give {item.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {held.length > 0 && (
                        <>
                          <h5>Holding for you</h5>
                          <div className="give-list">
                            {held.map((item) => (
                              <button
                                key={item.id}
                                className="btn btn-small btn-ghost"
                                onClick={() => takeItem(item)}
                              >
                                Take back {item.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {galleryOpen && (
        <ImageGallery world={world} rooms={rooms} onClose={() => setGalleryOpen(false)} />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.toastId} className="toast">
            <div className="toast-title">🏅 Achievement unlocked!</div>
            <div className="toast-name">{t.name}</div>
            {t.description && <div className="toast-desc">{t.description}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
