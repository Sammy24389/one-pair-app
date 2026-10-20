import {useEffect, useRef, useState} from 'react'
import {Plus, Trash2, X} from 'lucide-react'
import {STICKERS} from '../lib/content'
import {pickFiles} from '../lib/media'
import {addSticker, getStickers, removeSticker, STICKER_ACCEPT, type SavedSticker} from '../lib/stickers'

const Preview = ({sticker}: {sticker: SavedSticker}) => {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const value = URL.createObjectURL(sticker.blob)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [sticker.blob])
  return url ? <img src={url} alt={sticker.name} /> : null
}

export default function StickerPicker({onSend, onEmoji, onClose}: {
  onSend: (sticker: SavedSticker) => Promise<void>
  onEmoji: (emoji: string) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<SavedSticker[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const [managing, setManaging] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    getStickers().then(rows => { if (live) setItems(rows) })
      .catch(() => { if (live) setError('Could not load stickers. Close the tray and try again.') })
      .finally(() => { if (live) setLoading(false) })
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { live = false }
  }, [])

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError('')
    try { await action() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your changes. Try again.') }
    finally { pending.current = false; setBusy(false) }
  }

  return (
    <div ref={panel} className="sticker-picker" role="region" aria-label="Sticker library" aria-busy={busy || loading}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="row between">
        <h3>Stickers</h3>
        <div className="row">
          {!!items.length && <button className="sticker-manage" disabled={busy} onClick={() => setManaging(v => !v)}>{managing ? 'Done' : 'Manage'}</button>}
          <button className="icon-btn" onClick={onClose} aria-label="Close stickers"><X size={18} /></button>
        </div>
      </div>
      <button className="btn ghost block" disabled={busy || loading} onClick={() => run(async () => {
        const [file] = await pickFiles(STICKER_ACCEPT)
        if (file) { setItems(await addSticker(file, file.name)); setManaging(false) }
      })}><Plus size={18} />{busy ? 'Working…' : 'Add image sticker'}</button>
      <p className="tiny muted">PNG, JPEG or WebP · up to 2 MB · saved as a static sticker</p>
      {error && <p className="sticker-error small" role="alert">{error}</p>}
      {loading ? <p role="status" className="small muted">Loading stickers…</p> : !items.length ? <p className="small muted">Your saved stickers will appear here. Add an image to get started.</p> : (
        <div className="sticker-grid">
          {items.map(sticker => <div className="sticker-tile" key={sticker.id}>
            <button disabled={busy || managing} onClick={() => run(() => onSend(sticker))} aria-label={`Send ${sticker.name}`}><Preview sticker={sticker} /></button>
            {managing && <button className="sticker-remove" disabled={busy} aria-label={`Remove ${sticker.name}`} onClick={() => run(async () => setItems(await removeSticker(sticker.id)))}><Trash2 size={16} /></button>}
          </div>)}
        </div>
      )}
      {managing && <p className="tiny muted">Removing a saved sticker keeps copies already sent in chat.</p>}
      <h3 className="small">Emoji</h3>
      <div className="sticker-emojis">{STICKERS.map(emoji => <button key={emoji} disabled={busy} onClick={() => onEmoji(emoji)} aria-label={`Send ${emoji}`}>{emoji}</button>)}</div>
    </div>
  )
}
