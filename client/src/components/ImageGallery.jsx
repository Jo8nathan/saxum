import React, { useState } from 'react'

// Modal gallery: world cover plus every room image, with prev/next navigation.
export default function ImageGallery({ world, rooms = [], onClose }) {
  const images = []
  if (world && world.image_url) {
    images.push({ src: world.image_url, label: world.title || 'World cover', kind: 'cover' })
  }
  for (const room of rooms) {
    if (room && room.image_url) {
      images.push({ src: room.image_url, label: room.name || 'Room', kind: 'room' })
    }
  }
  const [index, setIndex] = useState(0)

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length)
  const next = () => setIndex((i) => (i + 1) % images.length)

  if (images.length === 0) return null
  const current = images[index]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal gallery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🖼️ Image Gallery</h3>
          <button className="btn btn-ghost btn-small" onClick={onClose}>✕</button>
        </div>
        <div className="gallery-main">
          {images.length > 1 && (
            <button className="gallery-nav" onClick={prev} aria-label="Previous image">‹</button>
          )}
          <img src={current.src} alt={current.label} className="gallery-image" />
          {images.length > 1 && (
            <button className="gallery-nav" onClick={next} aria-label="Next image">›</button>
          )}
        </div>
        <div className="gallery-caption">
          {current.kind === 'cover' ? 'World cover — ' : ''}{current.label}
          {images.length > 1 && ` (${index + 1} / ${images.length})`}
        </div>
        {images.length > 1 && (
          <div className="gallery-thumbs">
            {images.map((img, i) => (
              <button
                key={i}
                className={'gallery-thumb' + (i === index ? ' active' : '')}
                onClick={() => setIndex(i)}
              >
                <img src={img.src} alt={img.label} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
