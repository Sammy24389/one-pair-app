import {useEffect, useRef, useState} from 'react'
import {TopBar, useMediaUrl} from '../components/ui'
import {allSpaces, useSpaceIds} from '../lib/spaces'
import {STATUS_TEXT_LIMIT, STATUS_LIFETIME, validateStatusMedia, type StatusRecord} from '../lib/status'
import {deleteSharedStatus, pruneOwnStatuses, shareStatus, statusFeed} from '../lib/status-feed'
import {pickFiles} from '../lib/media'
import {StatusViewer} from '../components/StatusUpdates'
import {StatusVideo} from '../components/StatusVideo'

function StatusMedia({status}: {status: StatusRecord}) {
  const url = useMediaUrl(status.mediaId)
  const [failed, setFailed] = useState(false)
  if (!status.mediaId) return null
  if (!url) return <p className="small muted">Waiting for media. Keep both devices online to transfer it.</p>
  if (failed) return <div><p role="alert">This device could not display this media. Try an MP4 video with H.264/AAC encoding.</p><button className="btn ghost" onClick={() => setFailed(false)}>Retry media</button></div>
  const style = {width: '100%', maxHeight: '55vh', objectFit: 'contain' as const, borderRadius: 12, marginTop: 12}
  return status.kind === 'video'
    ? <StatusVideo key={url} src={url} label="Status video" style={style} onError={() => setFailed(true)} />
    : <img src={url} alt={status.text || 'Status photo'} loading="lazy" style={style} onError={() => setFailed(true)} />
}

function DraftMedia({file}: {file: File}) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  if (!url) return null
  const style = {width: '100%', maxHeight: 240, objectFit: 'contain' as const}
  return file.type.startsWith('video/') ? <StatusVideo key={url} src={url} style={style} label="Selected video preview" /> : <img src={url} alt="Selected photo preview" style={style} />
}

export default function Status() {
  const ids = useSpaceIds()
  const [, refreshVersion] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<ReturnType<typeof statusFeed>[number]>()
  useEffect(() => {
    const spaces = allSpaces()
    const off = spaces.map(s => s.subscribe(() => refreshVersion(v => v + 1)))
    const refresh = () => {
      const time = Date.now()
      setNow(time)
      pruneOwnStatuses(spaces, time)
    }
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => { clearInterval(timer); off.forEach(f => f()) }
  }, [ids])
  const spaces = allSpaces()
  const updates = statusFeed(spaces, now)
  const chooseMedia = async () => {
    try {
      const [selected] = await pickFiles('image/jpeg,image/png,image/webp,video/mp4,video/webm')
      if (!selected) return
      validateStatusMedia({kind: selected.type.startsWith('image/') ? 'image' : 'video', mediaId: 'draft', mime: selected.type, size: selected.size})
      setFile(selected)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not select media.') }
  }
  return <div className="screen full">
    <TopBar title="Status" sub="Updates from all your paired users" />
    <div className="card col" style={{gap: 12}}>
      <p className="small muted" style={{margin: 0}}>Share text, photos or videos with all {spaces.length} current paired users for 24 hours. Updates transfer when both devices are online. Maximum 10 uploads per day; deleting an update does not reset this limit.</p>
      <form className="col" style={{gap: 8}} onSubmit={async event => {
        event.preventDefault()
        if (pending.current) return
        pending.current = true
        setBusy(true)
        try {
          await shareStatus(allSpaces(), text, file)
          setText('')
          setFile(undefined)
          setError('')
          setMessage('Status saved. It will sync when your paired users connect.')
          setNow(Date.now())
        } catch (cause) { setMessage(''); setError(cause instanceof Error ? cause.message : 'Status could not be published.') }
        finally { pending.current = false; setBusy(false) }
      }}>
        <label htmlFor="status-text">Your update</label>
        <textarea id="status-text" className="textarea" rows={4} maxLength={STATUS_TEXT_LIMIT} value={text} disabled={busy} onChange={e => setText(e.target.value)} aria-describedby="status-count" />
        <span id="status-count" className="tiny muted">{text.length}/{STATUS_TEXT_LIMIT} characters{file ? ' (optional caption)' : ''}</span>
        <button type="button" className="btn ghost" disabled={busy} style={{minHeight: 44}} onClick={chooseMedia}>Add photo or video</button>
        <span className="tiny muted">JPG, PNG, WebP: up to 10 MB. MP4, WebM: up to 25 MB.</span>
        {file && <div className="col" style={{gap: 8}}><DraftMedia file={file} /><span className="small" style={{overflowWrap: 'anywhere'}}>{file.name}</span><button type="button" className="btn ghost" disabled={busy} onClick={() => setFile(undefined)}>Remove media</button></div>}
        {error && <p role="alert">{error}</p>}
        <button className="btn block" type="submit" disabled={busy || (!text.trim() && !file) || !spaces.length} style={{minHeight: 44}}>{busy ? 'Sharing...' : 'Share status'}</button>
      </form>
      <p className="small muted" role="status" style={{margin: 0}}>{message}</p>
    </div>
    <div className="section col" style={{gap: 12}}>
      <h3>Recent updates</h3>
      {!updates.length && <p className="muted">No active statuses. Share the first update.</p>}
      {updates.map(({status, own, name}) => <article className="card" key={`${status.from}:${status.id}`}>
        <div className="row between" style={{gap: 12}}>
          <strong>{name}</strong>
          {own && <button className="btn ghost" style={{minHeight: 44}} onClick={() => { deleteSharedStatus(allSpaces(), status.id); setMessage('Status deleted. Deletion syncs when paired users reconnect.'); refreshVersion(v => v + 1) }}>Delete</button>}
        </div>
        <StatusMedia status={status} />
        <button className="btn ghost status-open-media" onClick={() => setSelected({status, own, name})}>Open status</button>
        {status.text && <p style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{status.text}</p>}
        <p className="tiny muted" style={{marginBottom: 0}}>Expires in {Math.max(1, Math.ceil((status.ts + STATUS_LIFETIME - now) / 60000))} min</p>
      </article>)}
    </div>
    {selected && updates.some(x => x.status.id === selected.status.id && x.status.from === selected.status.from) && <StatusViewer update={selected} onClose={() => setSelected(undefined)} />}
  </div>
}
