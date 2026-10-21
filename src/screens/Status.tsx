import {useEffect, useState} from 'react'
import {TopBar} from '../components/ui'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import {activeStatuses, postStatus, pruneStatuses, removeStatus, STATUS_TEXT_LIMIT, STATUS_LIFETIME} from '../lib/status'

export default function Status() {
  const space = useActiveSpace()
  useSpaceVersion(space)
  const [now, setNow] = useState(Date.now)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    const refresh = () => {
      const time = Date.now()
      setNow(time)
      if (space) pruneStatuses(space.statuses, space.me, time)
    }
    refresh()
    const timer = setInterval(refresh, 1000)
    return () => clearInterval(timer)
  }, [space])
  if (!space) return null
  const statuses = activeStatuses(space.statuses, [space.me, space.peer], now)
  const peer = space.peerProfile().name || 'Your pair'
  return <div className="screen full">
    <TopBar title="Status" sub={`Shared only with ${peer}`} />
    <div className="card col" style={{gap: 12}}>
      <p className="small muted" style={{margin: 0}}>Share a text update for 24 hours. Your pair receives it when both devices are online together.</p>
      <form className="col" style={{gap: 8}} onSubmit={event => {
        event.preventDefault()
        try {
          postStatus(space.statuses, space.me, text)
          setText('')
          setError('')
          setMessage('Status saved. It will sync when your pair connects.')
          setNow(Date.now())
        } catch (cause) { setMessage(''); setError(cause instanceof Error ? cause.message : 'Status could not be published.') }
      }}>
        <label htmlFor="status-text">Your update</label>
        <textarea id="status-text" className="textarea" rows={4} maxLength={STATUS_TEXT_LIMIT} value={text} onChange={e => setText(e.target.value)} aria-describedby="status-count" />
        <span id="status-count" className="tiny muted">{text.length}/{STATUS_TEXT_LIMIT} characters</span>
        {error && <p role="alert">{error}</p>}
        <button className="btn block" type="submit" disabled={!text.trim()} style={{minHeight: 44}}>Share status</button>
      </form>
      <p className="small muted" role="status" style={{margin: 0}}>{message}</p>
    </div>
    <div className="section col" style={{gap: 12}}>
      <h3>Recent updates</h3>
      {!statuses.length && <p className="muted">No active statuses. Share the first update.</p>}
      {statuses.map(status => <article className="card" key={status.id}>
        <div className="row between" style={{gap: 12}}>
          <strong>{status.from === space.me ? 'You' : peer}</strong>
          {status.from === space.me && <button className="btn ghost" style={{minHeight: 44}} onClick={() => { removeStatus(space.statuses, space.me, status.id); setMessage('Status deleted. Deletion syncs when both devices reconnect.') }}>Delete</button>}
        </div>
        <p style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{status.text}</p>
        <p className="tiny muted" style={{marginBottom: 0}}>Expires in {Math.max(1, Math.ceil((status.ts + STATUS_LIFETIME - now) / 60000))} min</p>
      </article>)}
    </div>
  </div>
}
