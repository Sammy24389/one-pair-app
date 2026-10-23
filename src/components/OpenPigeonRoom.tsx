import {useEffect, useRef, useState} from 'react'
import {identity} from '../lib/identity'
import {groupEvents, type PeerGroup} from '../lib/groups'
import {openPigeonState, refreshOpenPigeon, openOpenPigeonPicker, openOpenPigeonGame, installOpenPigeon} from '../lib/openpigeon'
import '../styles/openpigeon.css'

export default function OpenPigeonRoom({group}: {group: PeerGroup}) {
  const state = openPigeonState.use()
  const me = identity.use(s => s.deviceId)
  groupEvents.use()
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {mounted.current = true; return () => {mounted.current = false}}, [])
  useEffect(() => {setChosen(null); setError('')}, [group.record.id])
  const peers = [...group.peers.values()].filter(peer => peer.device !== me)
  const members = [{device: me, name: 'You', openpigeon: state.installed ? 1 : undefined}, ...peers]
  const defaults = [me, ...peers.filter(peer => peer.openpigeon === 1).slice(0, 1).map(peer => peer.device)]
  const selected = (chosen ?? defaults).filter(id => members.some(member => member.device === id))
  const owner = group.record.owner === me
  const locked = state.locked || busy || state.loading
  const ready = selected.length >= 2 && selected.length <= 4 && selected.includes(me) && group.openPigeonReady(selected)
  const name = (id: string) => id === me ? 'You' : peers.find(peer => peer.device === id)?.name || 'Disconnected member'
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try {await action()} catch (e) {if (mounted.current) setError(e instanceof Error ? e.message : 'Could not open OpenPigeon. Please try again.')}
    finally {if (mounted.current) setBusy(false)}
  }
  return <section className="card openpigeon-room" aria-label="OpenPigeon games" aria-busy={busy || state.loading}>
    <header className="openpigeon-heading"><div><span className="openpigeon-eyebrow">PLAY TOGETHER</span><h2>OpenPigeon</h2></div><span className="openpigeon-platform">Android</span></header>
    <p>Open a game in OpenPigeon and return here to keep chatting. OpenPigeon stays a separate app.</p>
    {!state.supported ? <p className="openpigeon-notice">OpenPigeon games currently need the Padi Android app on every participating device. Browser and PC support will come later.</p> : <>
      <p className="muted small">Install OpenPigeon on both devices first. Choose 2–4 room members; the installed OpenPigeon catalogue determines which games and player counts are available.</p>
      {(error || state.error) && <p role="alert" className="openpigeon-notice">{error || state.error}</p>}
      {state.loading && <p role="status">Checking OpenPigeon…</p>}
      {state.locked && <p role="status">An OpenPigeon game is active. Finish or close it before opening another.</p>}
      {!state.installed ? <div className="openpigeon-actions"><button className="btn primary" disabled={locked} onClick={() => void run(installOpenPigeon)}>Install OpenPigeon</button><button className="btn" disabled={locked} onClick={() => void run(refreshOpenPigeon)}>Check installation</button></div> : <>
        <p className="openpigeon-install-status">OpenPigeon installed{state.version ? ` · ${state.version}` : ''}</p>
        {owner ? <><fieldset className="openpigeon-members" disabled={locked}><legend>Choose players</legend>{members.map(member => <label key={member.device}><input type="checkbox" checked={selected.includes(member.device)} disabled={member.device === me || member.openpigeon !== 1 || (!selected.includes(member.device) && selected.length >= 4)} onChange={() => setChosen(selected.includes(member.device) ? selected.filter(id => id !== member.device) : [...selected, member.device])}/><span>{member.name}<small>{member.device === me ? 'Room creator' : member.openpigeon === 1 ? 'Supports OpenPigeon' : 'Needs Padi Android update'}</small></span></label>)}</fieldset><button className="btn primary block" disabled={locked || !ready} onClick={() => void run(() => openOpenPigeonPicker(group, selected))}>Choose a game in OpenPigeon</button>{!ready && <p className="muted small">Select at least one connected friend using a compatible Padi Android app.</p>}</> : <p className="openpigeon-notice">The room creator chooses players and starts the game. Your invitations appear below.</p>}
      </>}
      {state.error && <button className="btn" disabled={locked} onClick={() => void run(refreshOpenPigeon)}>Retry connection</button>}
    </>}
      <section className="openpigeon-matches" aria-label="OpenPigeon matches"><h3>Your matches</h3>{!group.openPigeonSessions.length ? <p className="muted">No OpenPigeon matches yet.</p> : <ul>{group.openPigeonSessions.map(session => {
        const participant = session.participants.includes(me)
        const playable = participant && state.supported && state.installed && group.openPigeonReady(session.participants)
        return <li key={session.id}><div><h4>{session.message.caption || session.message.ldText || 'OpenPigeon game'}</h4>{session.message.subcaption && <p>{session.message.subcaption}</p>}<small className="muted">{session.participants.map(name).join(' · ')}</small></div><button className="btn" disabled={locked || !playable} onClick={() => void run(() => openOpenPigeonGame(group, session))} aria-label={`Open ${session.message.caption || 'OpenPigeon game'}`}>Open / Resume</button>{!participant && <small className="muted">You are not a player in this match.</small>}{participant && !playable && <small className="muted">Use Padi on Android with OpenPigeon installed, and wait for all players to connect.</small>}</li>
      })}</ul>}</section>
  </section>
}
