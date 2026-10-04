import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { getIdentity } from '../lib/identity.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const IMAGE_STYLES = ['Realistic', 'Cartoonish', 'Minimalist']

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.readAsDataURL(file)
  })
}

// Modal form → POST /worlds/generate → poll /api/jobs/:job_id every 2s →
// navigate to the finished world.
export default function CreateWorldDialog({ onClose }) {
  const [title, setTitle] = useState('')
  const [theme, setTheme] = useState('')
  const [imageStyle, setImageStyle] = useState(IMAGE_STYLES[0])
  const [roomCount, setRoomCount] = useState(10)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [fileError, setFileError] = useState('')
  const [formError, setFormError] = useState('')
  const [job, setJob] = useState(null) // { job_id, status, progress, stage, error }
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const cancelPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    setFileError('')
    setCoverFile(null)
    setCoverPreview('')
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Only PNG, JPG, or WEBP images are accepted.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFileError('Image must be 10 MB or smaller.')
      e.target.value = ''
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCoverFile(file)
      setCoverPreview(dataUrl)
    } catch (err) {
      setFileError(err.message)
      e.target.value = ''
    }
  }

  const pollJob = (jobId) => {
    cancelPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getJob(jobId)
        setJob(res)
        if (res.status === 'done') {
          cancelPolling()
          if (res.world_id) {
            navigate(`/w/${res.world_id}`)
          } else {
            setJob({ ...res, status: 'error', error: 'Generation finished but no world id was returned.' })
          }
        } else if (res.status === 'error') {
          cancelPolling()
        }
      } catch (e) {
        cancelPolling()
        setJob((j) => ({ ...(j || { job_id: jobId }), status: 'error', error: e.message }))
      }
    }, 2000)
  }

  const submit = async (e) => {
    e.preventDefault()
    setFormError('')
    const cleanTitle = title.trim()
    const cleanTheme = theme.trim()
    if (!cleanTitle) {
      setFormError('World Title is required.')
      return
    }
    if (!cleanTheme) {
      setFormError('Theme & Description is required.')
      return
    }
    setSubmitting(true)
    try {
      const identity = getIdentity()
      const payload = {
        title: cleanTitle,
        theme: cleanTheme,
        image_style: imageStyle,
        room_count: roomCount,
        owner_id: identity.id,
        author_label: identity.label,
      }
      if (coverPreview) payload.cover_image_data = coverPreview
      const res = await api.generateWorld(payload)
      if (!res || !res.job_id) throw new Error('Server did not return a job id.')
      setJob({ job_id: res.job_id, status: 'pending', progress: 0, stage: 'Starting…' })
      pollJob(res.job_id)
    } catch (err) {
      setFormError(err.message || 'Could not start world generation.')
      setSubmitting(false)
    }
  }

  const generating = job && (job.status === 'pending' || (!job.error && job.status !== 'error'))

  return (
    <div className="modal-overlay" onClick={generating ? undefined : onClose}>
      <div className="modal create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✨ Create New World</h3>
          {!generating && (
            <button className="btn btn-ghost btn-small" onClick={onClose}>✕</button>
          )}
        </div>
        <div className="modal-body">
          {!job && (
            <form onSubmit={submit} className="create-form">
              <label className="field-label" htmlFor="cw-title">World Title *</label>
              <input
                id="cw-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. The Sunken Library of Vey"
                maxLength={120}
              />

              <label className="field-label" htmlFor="cw-theme">Theme &amp; Description *</label>
              <textarea
                id="cw-theme"
                className="input textarea"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Describe the world: its mood, setting, dangers, and what the player is trying to do…"
                rows={5}
                maxLength={2000}
              />

              <label className="field-label" htmlFor="cw-style">Image Style</label>
              <select
                id="cw-style"
                className="input"
                value={imageStyle}
                onChange={(e) => setImageStyle(e.target.value)}
              >
                {IMAGE_STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <label className="field-label" htmlFor="cw-size">
                World Size: <strong>{roomCount} rooms</strong>
              </label>
              <input
                id="cw-size"
                type="range"
                className="slider"
                min={3}
                max={20}
                value={roomCount}
                onChange={(e) => setRoomCount(Number(e.target.value))}
              />

              <label className="field-label" htmlFor="cw-cover">Cover image (optional — PNG, JPG, or WEBP, ≤ 10 MB)</label>
              <input
                id="cw-cover"
                type="file"
                className="input file-input"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleFile}
              />
              {fileError && <p className="error">{fileError}</p>}
              {coverPreview && (
                <img src={coverPreview} alt="Cover preview" className="cover-preview" />
              )}

              {formError && <p className="error">{formError}</p>}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Starting…' : 'Generate World'}
                </button>
              </div>
            </form>
          )}

          {job && (
            <div className="job-status">
              {job.status === 'error' ? (
                <>
                  <p className="error">⚠️ {job.error || 'World generation failed.'}</p>
                  <div className="modal-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => { setJob(null); setSubmitting(false) }}
                    >
                      Try again
                    </button>
                    <button className="btn btn-ghost" onClick={onClose}>Close</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="job-stage">{job.stage || 'Generating your world…'}</p>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(100, Math.max(0, job.progress || 0))}%` }}
                    />
                  </div>
                  <p className="hint">{Math.round(job.progress || 0)}% — this can take a minute or two. Sit tight!</p>
                  <div className="modal-actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => { cancelPolling(); onClose() }}
                    >
                      Close (generation continues in background)
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
