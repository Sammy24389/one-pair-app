import {useEffect, useRef, useState} from 'react'
import {identity} from '../lib/identity'
import {groupEvents, type PeerGroup} from '../lib/groups'
import {openPigeonState, refreshOpenPigeon, openOpenPigeonPicker, openOpenPigeonGame} from '../lib/openpigeon'
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
    <p>Play OpenPigeon games inside OnePair, then return to your room to keep chatting. No second app is needed.</p>
    {!state.supported ? <p className="openpigeon-notice">OpenPigeon games currently need the Padi Android app on every participating device. Browser and PC support will come later.</p> : <>
      <p className="muted small">Choose 2–4 room members. Each game determines its supported player count; all players need this OnePair Android build.</p>
      {(error || state.error) && <p role="alert" className="openpigeon-notice">{error || state.error}</p>}
      {state.loading && <p role="status">Preparing OpenPigeon…</p>}
      {state.locked && <p role="status">An OpenPigeon game is active. Finish or close it before opening another.</p>}
      {!state.installed ? <p className="openpigeon-notice">The included game engine is unavailable. Update OnePair or retry below.</p> : <>
        <p className="openpigeon-install-status">OpenPigeon included{state.version ? ` · ${state.version}` : ''}</p>
        {owner ? <><fieldset className="openpigeon-members" disabled={locked}><legend>Choose players</legend>{members.map(member => <label key={member.device}><input type="checkbox" checked={selected.includes(member.device)} disabled={member.device === me || member.openpigeon !== 1 || (!selected.includes(member.device) && selected.length >= 4)} onChange={() => setChosen(selected.includes(member.device) ? selected.filter(id => id !== member.device) : [...selected, member.device])}/><span>{member.name}<small>{member.device === me ? 'Room creator' : member.openpigeon === 1 ? 'Supports OpenPigeon' : 'Needs Padi Android update'}</small></span></label>)}</fieldset><button className="btn primary block" disabled={locked || !ready} onClick={() => void run(() => openOpenPigeonPicker(group, selected))}>Choose a game</button>{!ready && <p className="muted small">Select at least one connected friend using a compatible Padi Android app.</p>}</> : <p className="openpigeon-notice">The room creator chooses players and starts the game. Your invitations appear below.</p>}
      </>}
      {(state.error || (!state.loading && !state.installed)) && <button className="btn" disabled={locked} onClick={() => void run(refreshOpenPigeon)}>Retry connection</button>}
      <p className="muted small">Games by OpenPigeon. Included from its AGPL release with original creator credits preserved.</p>
    </>}
      <section className="openpigeon-matches" aria-label="OpenPigeon matches"><h3>Your matches</h3>{!group.openPigeonSessions.length ? <p className="muted">No OpenPigeon matches yet.</p> : <ul>{group.openPigeonSessions.map(session => {
        const participant = session.participants.includes(me)
        const playable = participant && state.supported && state.installed && group.openPigeonReady(session.participants)
        return <li key={session.id}><div><h4>{session.message.caption || session.message.ldText || 'OpenPigeon game'}</h4>{session.message.subcaption && <p>{session.message.subcaption}</p>}<small className="muted">{session.participants.map(name).join(' · ')}</small></div><button className="btn" disabled={locked || !playable} onClick={() => void run(() => openOpenPigeonGame(group, session))} aria-label={`Open ${session.message.caption || 'OpenPigeon game'}`}>Open / Resume</button>{!participant && <small className="muted">You are not a player in this match.</small>}{participant && !playable && <small className="muted">Use the latest OnePair Android build, and wait for all players to connect.</small>}</li>
      })}</ul>}</section>
  </section>
}
