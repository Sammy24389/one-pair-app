import {useEffect, useRef, useState, type CSSProperties} from 'react'

// Keep the thumbnail local to this view; the original video remains the shared media.
export function StatusVideo({src, label, compact = false, style, onError}: {
  src: string; label: string; compact?: boolean; style?: CSSProperties; onError?: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [frame, setFrame] = useState({src: '', image: ''})
  const poster = frame.src === src ? frame.image : ''
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const element = video.current
    if (!element) return
    setFrame({src, image: ''})
    setUnavailable(false)
    let active = true
    let captured = false
    const timer = setTimeout(() => {
      active = false
      if (!captured) setUnavailable(true)
      detach()
    }, 8000)
    const capture = () => {
      if (!active || element.readyState < 2 || !element.videoWidth || !element.videoHeight) return
      try {
        const scale = Math.min(1, 480 / Math.max(element.videoWidth, element.videoHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(element.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(element.videoHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return
        context.drawImage(element, 0, 0, canvas.width, canvas.height)
        const image = canvas.toDataURL('image/jpeg', 0.8)
        if (!image.startsWith('data:image/')) return
        captured = true
        setFrame({src, image})
        active = false
        clearTimeout(timer)
        detach()
      } catch { /* The video controls remain usable if a frame cannot be decoded. */ }
    }
    const metadata = () => {
      if (!active) return
      const duration = element.duration
      try { element.currentTime = Number.isFinite(duration) && duration > 0 ? Math.min(0.1, duration / 2) : 0.1 }
      catch { capture() }
    }
    const loaded = () => { if (!element.seeking) capture() }
    const played = () => {active = false; clearTimeout(timer); detach()}
    const failed = () => {active = false; clearTimeout(timer); setUnavailable(true); detach()}
    const detach = () => {
      element.removeEventListener('loadedmetadata', metadata)
      element.removeEventListener('loadeddata', loaded)
      element.removeEventListener('seeked', capture)
      element.removeEventListener('play', played)
      element.removeEventListener('error', failed)
    }
    element.addEventListener('loadedmetadata', metadata)
    element.addEventListener('loadeddata', loaded)
    element.addEventListener('seeked', capture)
    element.addEventListener('play', played)
    element.addEventListener('error', failed)
    if (element.readyState >= 1) metadata()
    return () => {active = false; clearTimeout(timer); detach()}
  }, [src])
  if (compact && poster) return <img src={poster} alt={label} style={style} />
  return <>
    {compact && <span className="small muted">{unavailable ? 'Preview unavailable' : 'Loading preview...'}</span>}
    <video key={src} ref={video} src={src} poster={poster || undefined} controls={!compact} muted={compact} playsInline preload="auto" aria-hidden={compact || undefined} tabIndex={compact ? -1 : undefined} aria-label={label} style={compact ? {position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none'} : style} onError={onError} />
  </>
}
