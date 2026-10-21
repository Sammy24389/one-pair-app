import {useEffect, useRef, useState} from 'react'
import {TopBar} from '../components/ui'
import {identity} from '../lib/identity'
import PartyGames from '../components/PartyGames'
import {nav, push, takeFocus} from '../lib/nav'
import {ensureNotifyPermission} from '../lib/notify'
import '../styles/call-pip.css'
import {hostGroupCode, redeemGroupCode, stopGroupCode, type HostedGroupCode} from '../lib/group-codes'
import {activeGroupCall, acceptGroupInvitation, createGroup, forgetGroup, getGroup, groupEvents, groupInvitation, groupRegistry, type PeerGroup} from '../lib/groups'

function Stream({stream, muted = false}: {stream: MediaStream; muted?: boolean}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { const el = ref.current; if (!el) return; el.srcObject = stream; void el.play().catch(() => setBlocked(true)); return () => {el.srcObject = null} }, [stream])
  const hasVideo = !!stream.getVideoTracks?.().some(track => track.enabled && track.readyState !== 'ended')
  return <div className="group-stream">{!hasVideo && <span className="group-voice-placeholder">Voice</span>}<video ref={ref} autoPlay playsInline muted={muted} style={{width: '100%', maxHeight: 180, borderRadius: 12}} />{blocked && <button className="btn" onClick={() => {void ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))}}>Play call audio</button>}</div>
}
export function GroupsCallOverlay({locked = false}: {locked?: boolean}) {
  groupEvents.use()
  const group = activeGroupCall()
  const [expanded, setExpanded] = useState(true)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  useEffect(() => {setMuted(false); setCameraOff(false)}, [group?.local])
  if (!group) return null
  const remoteIds = [...new Set([...group.remote.keys(), ...(group.callers ?? [])])]
  return <div className={`group-call ${expanded ? '' : 'call-pip'}`} role="region" aria-label={`Group call: ${group.record.title}`}
    inert={locked || undefined} aria-hidden={locked || undefined} style={{visibility: locked ? 'hidden' : 'visible'}}>
    <div className="group-call-heading"><strong>{group.record.title} · {group.joining ? 'Connecting…' : 'Group call'}</strong>
      <button className="btn" aria-label={expanded ? 'Minimize' : 'Expand'} onClick={() => setExpanded(!expanded)}>{expanded ? 'Keep chatting' : 'Expand'}</button></div>
    <div className="group-call-grid">
      {group.local && <div className={`group-participant ${cameraOff ? 'camera-off' : ''}`}><span>You</span><Stream stream={group.local} muted />{cameraOff && <span className="group-camera-off">Camera off</span>}</div>}
      {remoteIds.map(id => <div className="group-participant" key={id}>
        <span>{group.peers.get(id)?.name || 'Participant'}</span>
        {group.remote.get(id) ? <Stream stream={group.remote.get(id)!} /> : <div className="group-waiting">Joining…</div>}
      </div>)}
    </div>
    <div className="group-call-controls">
      <button className="btn" aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={muted} onClick={() => {const next = !muted; group.local?.getAudioTracks().forEach(track => {track.enabled = !next}); setMuted(next)}}>{muted ? 'Unmute' : 'Mute'}</button>
      {!!group.local?.getVideoTracks().length && <button className="btn" aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={cameraOff} onClick={() => {const next = !cameraOff; group.local?.getVideoTracks().forEach(track => {track.enabled = !next}); setCameraOff(next)}}>{cameraOff ? 'Video on' : 'Video off'}</button>}
      <button className="btn danger" onClick={() => group.leaveCall()}>Leave call</button>
    </div>
  </div>
}
export default function Groups() {
  const {records} = groupRegistry.use()
  groupEvents.use()
  const [selected, setSelected] = useState<string | null>(null)
  const focus = nav.use(state => state.focus)
  useEffect(() => {if (focus) setSelected(takeFocus() || null)}, [focus])
  const [title, setTitle] = useState('')
  const [invite, setInvite] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [roomCode, setRoomCode] = useState<HostedGroupCode | null>(null)
  const [joining, setJoining] = useState(false)
  const joiningRequest = useRef<AbortController | null>(null)
  useEffect(() => () => joiningRequest.current?.abort(), [])
  const [now, setNow] = useState(Date.now)
  useEffect(() => {if (!sharing) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer)}, [sharing])
  const record = records.find(r => r.id === selected)
  const group = record ? getGroup(record) : null
  const run = (fn: () => void | Promise<unknown>) => {setError(''); try {void Promise.resolve(fn()).catch(e => setError(e instanceof Error ? e.message : 'Try again.'))} catch(e) {setError(e instanceof Error ? e.message : 'Try again.')}}
  return <div className="screen"><TopBar title="Multiplayer & calls" />
    {error && <p role="alert">{error}</p>}
    {!group ? <>
      {!identity.get().pairs.length && <button className="btn ghost" onClick={() => push('pair')}>Pair a device for private chat</button>}
      <p className="muted">Start a room and share its 12-character code, or enter a friend's code. Up to four people can chat, call and play together.</p>
      <form className="card col" style={{gap: 12}} onSubmit={event => {event.preventDefault(); run(async () => {
        const created = createGroup(title.trim() || 'Game room')
        setSelected(created.record.id); setTitle(''); setSharing(true); setRoomCode(null)
        setRoomCode(await hostGroupCode(created.record.id, groupInvitation(created.record)))
      })}}><label htmlFor="group-title">Room name (optional)</label><input id="group-title" className="input" value={title} placeholder="Game room" maxLength={60} onChange={event => setTitle(event.target.value)} /><button className="btn primary" type="submit">Start a room</button></form>
      <form className="card col" style={{gap: 12}} onSubmit={async event => {
        event.preventDefault()
        if (joining) return
        setJoining(true); setError('')
        const controller = new AbortController()
        joiningRequest.current = controller
        try {
          const invitation = invite.trim().startsWith('PADI-GROUP:') ? invite.trim() : await redeemGroupCode(invite, controller.signal)
          if (controller.signal.aborted) return
          setSelected(acceptGroupInvitation(invitation).record.id); setInvite(''); setSharing(false)
        } catch (cause) {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not join room.')}
        finally {if (!controller.signal.aborted) setJoining(false)}
      }}>
        <label htmlFor="group-invite">12-character room code</label>
        <input id="group-invite" className="input" value={invite} maxLength={1600} placeholder="ABCD-EFGH-JKLM" autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={event => setInvite(event.target.value)} required disabled={joining} />
        <button className="btn" type="submit" disabled={joining || !invite.trim()}>{joining ? 'Finding room…' : 'Join with code'}</button>
        {joining && <button className="btn ghost" type="button" onClick={() => {joiningRequest.current?.abort(); setJoining(false)}}>Cancel joining</button>}
        <p className="tiny muted">Keep the inviter online. You can also paste an older full invitation here.</p>
      </form>
      {records.map(r => <button className="list-row card" key={r.id} onClick={() => setSelected(r.id)}>{r.title}</button>)}
      <details className="card"><summary>Connection & notifications</summary><div className="col" style={{gap: 8, marginTop: 8}}><button className="btn ghost" onClick={() => push('connection')}>Connection settings</button><button className="btn ghost" onClick={() => void ensureNotifyPermission()}>Enable message notifications</button></div></details>
    </> : <>
      <button className="btn" onClick={() => {setSelected(null); setSharing(false)}}>All groups</button>
      <h2 style={{overflowWrap: 'anywhere'}}>{group.record.title}</h2><p className="small muted">{group.peers.size + 1}/4 devices · {group.connected ? 'Connected' : 'Waiting for friends'}</p>
      {group.error && <p role="alert">{group.error}</p>}
      <div className="row" style={{flexWrap: 'wrap'}}><button className="btn" onClick={() => run(async () => {
        setSharing(true); setRoomCode(null)
        setRoomCode(await hostGroupCode(group.record.id, groupInvitation(group.record)))
      })}>Share room code</button><button className="btn" disabled={!!group.local || group.joining} onClick={() => run(() => group.joinCall(false))}>Join voice call</button><button className="btn" disabled={!!group.local || group.joining} onClick={() => run(() => group.joinCall(true))}>Join video call</button></div>
      {sharing && <div className="card col" style={{gap: 12}}>
        <h3>Invite friends</h3><p className="small">Ask friends to open Multiplayer and enter this code. Stay online until they join.</p>
        {roomCode ? <>
          <output className="room-code" aria-label="Room invite code">{roomCode.code}</output>
          <p className="tiny muted">{now >= roomCode.expiresAt ? 'Code expired. Share a new code.' : 'Code expires in ' + Math.ceil((roomCode.expiresAt - now) / 60000) + ' min. Share only with people you want to invite.'}</p>
          <button className="btn" disabled={now >= roomCode.expiresAt} onClick={() => run(() => navigator.clipboard.writeText(roomCode.code))}>Copy code</button>
        </> : error ? <p className="small">Code unavailable. Use Share room code to retry.</p> : <p role="status">Creating your code…</p>}
        <details><summary>Full invitation for older app versions</summary><label htmlFor="share-group">Private invitation</label><textarea id="share-group" className="input" readOnly value={groupInvitation(group.record)} /></details>
      </div>}

      <PartyGames game={group.party}
        players={[{id: identity.get().deviceId, name: identity.get().profile.name || 'You'}, ...[...group.peers.values()].map(peer => ({id: peer.device, name: peer.name || 'Friend'}))]}
        me={identity.get().deviceId} isHost={group.record.owner === identity.get().deviceId}
        onStart={(kind, players) => run(() => group.startParty(kind, players))}
        onMove={move => run(() => group.partyMove(move))} error={error} />
      <details style={{marginTop: 12}}><summary>More games: Race to 21</summary><RaceGame group={group} onError={setError} /></details>
      <div className="card" role="log" aria-label="Group messages" style={{maxHeight: '40dvh', overflowY: 'auto'}}>{group.messages.length === 0 && <p className="muted">Send the first message.</p>}{group.messages.map(m => <div key={m.id} style={{padding: '8px 0', overflowWrap: 'anywhere'}}><strong className="small">{m.name || 'Friend'}</strong><p style={{whiteSpace: 'pre-wrap', margin: '4px 0'}}>{m.text}</p></div>)}</div>
      <form className="row" onSubmit={e => {e.preventDefault(); run(() => {group.message(text); setText('')})}}><label className="grow">Message<input className="input" value={text} maxLength={2000} onChange={e => setText(e.target.value)} required /></label><button className="btn primary" type="submit">Send</button></form>
      <p className="small muted">Only the latest 300 text messages are stored on this device. History is shared by group members; use groups with trusted friends.</p>
      <button className="btn" onClick={() => {if (confirm('Leave this group and remove its local messages? Your friends keep their copies.')) run(async () => {stopGroupCode(group.record.id); await forgetGroup(group.record.id); setSelected(null)})}}>Leave and forget group</button>
    </>}
  </div>
}
function RaceGame({group, onError}: {group: PeerGroup; onError: (message: string) => void}) {
  const race = group.race
  const me = identity.get().deviceId
  const name = (id: string) => id === me ? 'You' : [...group.peers.values()].find(p => p.device === id)?.name || 'Friend'
  return <div className="card" style={{marginTop: 12}}><h3>Race to 21</h3><p className="small muted">Take turns adding 1, 2 or 3. Reach exactly 21 to win. Two to four players; the creator must stay connected.</p>{group.record.owner === me && <button className="btn" onClick={() => {try {group.startRace()} catch(e) {onError((e as Error).message)}}}>{race ? 'Restart game' : 'Start game'}</button>}{race && <><p>Total: <strong>{race.total}</strong> · {race.winner ? name(race.winner) + ' won!' : name(race.players[race.turn]) + ' to play'}</p><div className="row">{[1,2,3].map(n => <button className="btn" key={n} disabled={!!race.winner || race.players[race.turn] !== me || race.total + n > 21} onClick={() => group.move(n)}>+{n}</button>)}</div></>}</div>
}
