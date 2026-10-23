import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Plus, X} from 'lucide-react'
import {useMediaUrl} from './ui'
import {StatusVideo} from './StatusVideo'
import {allSpaces, useSpaceIds} from '../lib/spaces'
import {statusFeed} from '../lib/status-feed'
import {push} from '../lib/nav'
import type {StatusRecord} from '../lib/status'
import '../styles/status-updates.css'

type Update = ReturnType<typeof statusFeed>[number]

export function StatusAsset({status, compact = false}: {status: StatusRecord; compact?: boolean}) {
  const url = useMediaUrl(status.mediaId)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [status.mediaId])
  if (!status.mediaId) return <span className="status-text-preview">{status.text}</span>
  if (!url) return <span className="small muted">{compact ? 'Transferring...' : 'Waiting for media. Keep both devices online to transfer it.'}</span>
  if (failed && compact) return <span className="small muted">Preview unavailable</span>
  if (failed) return <div><p role="alert">This device could not display this media. Try an MP4 video with H.264/AAC encoding.</p><button className="btn ghost" onClick={() => setFailed(false)}>Retry media</button></div>
  return status.kind === 'video'
    ? <StatusVideo key={url} src={url} compact={compact} label={compact ? 'Video status preview' : 'Status video'} onError={() => setFailed(true)} />
    : <img src={url} alt={status.text || 'Status photo'} loading="lazy" onError={() => setFailed(true)} />
}

export function StatusViewer({update, onClose}: {update: Update; onClose: () => void}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); close.current()}
      if (event.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('button, video[controls], [tabindex="0"]')]
        const first = items[0], last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus()}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus()}
      }
    }
    document.addEventListener('keydown', key, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {document.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; previous?.focus()}
  }, [])
  return createPortal(<div className="status-viewer" onClick={event => {if (event.target === event.currentTarget) onClose()}}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={`${update.name}'s status`} className="status-viewer-panel">
      <header><strong>{update.name}</strong><button className="icon-btn" aria-label="Close status" onClick={onClose}><X size={24} /></button></header>
      <div className="status-full-media"><StatusAsset status={update.status} /></div>
      {update.status.mediaId && update.status.text && <p className="status-caption">{update.status.text}</p>}
    </div>
  </div>, document.body)
}

export function HomeStatusUpdates() {
  const ids = useSpaceIds()
  const [, refresh] = useState(0)
  const [selected, setSelected] = useState<Update>()
  useEffect(() => {
    const off = allSpaces().map(space => space.subscribe(() => refresh(v => v + 1)))
    const timer = setInterval(() => refresh(v => v + 1), 30000)
    return () => {off.forEach(fn => fn()); clearInterval(timer)}
  }, [ids])
  const updates = statusFeed(allSpaces())
  const visible = selected && updates.find(x => x.status.id === selected.status.id && x.status.from === selected.status.from)
  return <section className="home-statuses" aria-label="Paired users' statuses">
    <div className="row between"><h3>Status</h3><button className="btn ghost sm" onClick={() => push('status')}>View all</button></div>
    <div className="home-status-strip">
      <button className="home-status-add" onClick={() => push('status')}><span><Plus size={24} /></span><strong>Add status</strong><small>10 per day</small></button>
      {updates.map(update => <button key={`${update.status.from}:${update.status.id}`} className="home-status-tile" aria-label={`View ${update.name}'s status`} onClick={() => setSelected(update)}>
        <div className="home-status-preview"><StatusAsset status={update.status} compact /></div><strong>{update.name}</strong>
      </button>)}
      {!updates.length && <p className="small muted home-status-empty">Share a moment with your paired users. Updates stay for 24 hours.</p>}
    </div>
    {visible && <StatusViewer update={visible} onClose={() => setSelected(undefined)} />}
  </section>
}
