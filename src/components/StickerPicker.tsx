import {useEffect, useId, useRef, useState} from 'react'
import {Plus, Trash2, X} from 'lucide-react'
import ImageCropper from './ImageCropper'
import EmojiPicker from './EmojiPicker'
import {pickFiles} from '../lib/media'
import {addSticker, getStickers, removeSticker, subscribeStickers, inspectSticker, STICKER_ACCEPT, type SavedSticker} from '../lib/stickers'

const Preview = ({sticker}: {sticker: SavedSticker}) => {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const value = URL.createObjectURL(sticker.blob)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [sticker.blob])
  return url ? sticker.blob.type.startsWith('video/') ? <video src={url} muted playsInline preload="metadata" aria-label={sticker.name} style={{width:'100%',height:'100%',objectFit:'contain',pointerEvents:'none'}} /> : <img src={url} alt={sticker.name} loading="lazy" /> : null
}

export default function StickerPicker({onSend, onEmoji, onClose}: {
  onSend: (sticker: SavedSticker) => Promise<void>
  onEmoji: (emoji: string) => void
  onClose: () => void
}) {
  const id = useId()
  const [tab, setTab] = useState<'stickers' | 'emoji'>('stickers')
  const [items, setItems] = useState<SavedSticker[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const [managing, setManaging] = useState(false)
  const [cropFile, setCropFile] = useState<File>()
  const [cropKind, setCropKind] = useState<'image'|'video'>('image')
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    const unsubscribe = subscribeStickers(rows => {if (live) setItems(rows)})
    getStickers().then(rows => { if (live) setItems(rows) })
      .catch(() => { if (live) setError('Could not load stickers. Close the tray and try again.') })
      .finally(() => { if (live) setLoading(false) })
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { live = false; unsubscribe() }
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
        <h3>Emoji & stickers</h3>
        <div className="row">
          {tab === 'stickers' && !!items.length && <button className="sticker-manage" disabled={busy} onClick={() => setManaging(v => !v)}>{managing ? 'Done' : 'Manage'}</button>}
          <button className="icon-btn" onClick={onClose} aria-label="Close stickers"><X size={18} /></button>
        </div>
      </div>
      <div className="sticker-tabs" role="tablist" aria-label="Message picker">
        {(['emoji', 'stickers'] as const).map(value => <button key={value} type="button" role="tab"
          id={`${id}-${value}-tab`} aria-controls={`${id}-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
          onClick={() => setTab(value)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 'emoji' : event.key === 'End' ? 'stickers' : value === 'emoji' ? 'stickers' : 'emoji'
            setTab(next)
            document.getElementById(`${id}-${next}-tab`)?.focus()
          }}>{value === 'emoji' ? 'Emoji' : 'Stickers'}</button>)}
      </div>
      <div role="tabpanel" id={`${id}-stickers-panel`} aria-labelledby={`${id}-stickers-tab`} hidden={tab !== 'stickers'}>
      <button className="btn ghost block" disabled={busy || loading} onClick={() => run(async () => {
        const [file] = await pickFiles(STICKER_ACCEPT)
        if (file) {
          const info = await inspectSticker(file)
          if (info.kind !== 'animated') {setCropKind(info.kind);setCropFile(file.type === info.mime ? file : new File([file],file.name,{type:info.mime}))}
          else {setItems(await addSticker(file, file.name)); setManaging(false)}
        }
      })}><Plus size={18} />{busy ? 'Working…' : 'Add sticker'}</button>
      <p className="tiny muted">Photos up to 10 MB · animation up to 2 MB · videos up to 5 MB / 15 seconds</p>
      <details className="small"><summary style={{minHeight:44,display:'flex',alignItems:'center',cursor:'pointer'}}>Import WhatsApp sticker files</summary><p>Import an individual WebP/GIF image or short MP4/WebM clip. A WhatsApp pack link or clipboard copy is not a media file.</p><p>On Android, if your Files app allows it, look in Internal storage → Android → media → com.whatsapp → WhatsApp → Media → WhatsApp Stickers. Copy the desired .webp file to Downloads, then choose Add sticker here. If unavailable, obtain the original file from its creator or a desktop save option. iPhone requires an exported file saved in Files.</p><p>Animated files keep their animation; photos and videos open the crop editor. Protected packs and proprietary animation formats are not supported.</p></details>
      {cropFile && <ImageCropper file={cropFile} kind={cropKind} onCancel={() => setCropFile(undefined)} onOriginal={async () => {setItems(await addSticker(cropFile, cropFile.name));setManaging(false);setCropFile(undefined)}} onSave={async blob => {setItems(await addSticker(blob, cropFile.name));setManaging(false);setCropFile(undefined)}} />}
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
      </div>
      <div role="tabpanel" id={`${id}-emoji-panel`} aria-labelledby={`${id}-emoji-tab`} hidden={tab !== 'emoji'}>
      {tab === 'emoji' && <EmojiPicker disabled={busy} onEmoji={onEmoji} />}
      </div>
    </div>
  )
}
