import {useCallback, useEffect, useRef, useState} from 'react'
import {Check, Copy, RefreshCw, ScanLine, Share2, X} from 'lucide-react'
import {QrCode, qrPayload, QrScanner} from '../components/Qr'
import {Avatar, Seg, Sheet, TopBar} from '../components/ui'
import {importBackup} from '../lib/backup'
import {pickFiles} from '../lib/media'
import {identity, regenerateCode, type Mode} from '../lib/identity'
import {goTab} from '../lib/nav'
import {settings} from '../lib/settings'
import {PairingSession, type PairingView} from '../lib/pairing'
import {isValidCode, normalizeCode, todayKey} from '../lib/util'
import {toast} from '../lib/notify'

const ModePicker = ({mode, setMode}: {mode: Mode; setMode: (m: Mode) => void}) => (
  <div className="mode-pick">
    <button className={mode === 'friends' ? 'on' : ''} onClick={() => setMode('friends')}>
      <span className="e">🤝</span>Best friends
    </button>
    <button className={mode === 'couple' ? 'on' : ''} onClick={() => setMode('couple')}>
      <span className="e">💞</span>Couple
    </button>
  </div>
)

const Fingerprint = ({emoji}: {emoji?: string[]}) =>
  emoji ? (
    <>
      <div className="emoji-row">{emoji.map((e, i) => <span key={i}>{e}</span>)}</div>
      <p className="small muted center">Both screens should show the same emojis. If they don't, decline.</p>
    </>
  ) : null

const finish = () => goTab(settings.get().startTab)

const Host = () => {
  const code = identity.use(i => i.code)
  const pairs = identity.use(i => i.pairs)
  const [mode, setMode] = useState<Mode>(identity.get().defaultMode)
  const [since, setSince] = useState('')
  const [view, setView] = useState<PairingView>({phase: 'connecting'})
  const [restore, setRestore] = useState('')
  const session = useRef<PairingSession | null>(null)

  useEffect(() => {
    const s = new PairingSession({role: 'host', code, onChange: v => setView({...v})})
    session.current = s
    s.start()
    return () => s.leave()
  }, [code])

  useEffect(() => session.current?.setMode(mode, since), [mode, since])
  useEffect(() => {
    if (view.phase === 'done') {
      finish()
    }
  }, [view.phase])

  const share = async () => {
    const text = `Join me on OnePair 💞 My code: ${code}`
    try {
      if (navigator.share) await navigator.share({text})
      else {
        await navigator.clipboard.writeText(code)
        toast({title: 'Code copied'})
      }
    } catch {
      /* cancelled */
    }
  }

  if (view.phase === 'request' && view.peer)
    return (
      <div className="col" style={{gap: 16}}>
        <div className="card col" style={{alignItems: 'center', gap: 12}}>
          <Avatar p={view.peer} size={72} />
          <h2>{view.peer.name || 'Someone'} wants to pair</h2>
          <Fingerprint emoji={view.emoji} />
          {pairs.length > 0 && (
            <div style={{width: '100%'}}>
              <label className="label">Restore an existing space (e.g. they reinstalled)</label>
              <select className="select" value={restore} onChange={e => setRestore(e.target.value)}>
                <option value="">No – start a fresh space</option>
                {pairs.map(p => (
                  <option key={p.id} value={p.id}>
                    Restore space with {p.peerName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="row">
          <button className="btn ghost grow" onClick={() => session.current?.reject()}>
            <X size={18} /> Decline
          </button>
          <button className="btn grow" onClick={() => session.current?.accept(restore || undefined)}>
            <Check size={18} /> Accept
          </button>
        </div>
      </div>
    )

  return (
    <div className="col" style={{gap: 16}}>
      <div className="card col" style={{gap: 14}}>
        <h3>Your code</h3>
        <div className="qr-wrap">
          <QrCode value={qrPayload(code)} />
        </div>
        <div className="code">{code}</div>
        <div className="row">
          <button className="btn ghost sm grow" onClick={() => navigator.clipboard.writeText(code).then(() => toast({title: 'Copied'}))}>
            <Copy size={16} /> Copy
          </button>
          <button className="btn sm grow" onClick={share}>
            <Share2 size={16} /> Share
          </button>
          <button className="icon-btn" onClick={regenerateCode} aria-label="New code">
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="row small muted">
          <div className="spinner" /> Waiting for your pair to enter this code…
        </div>
      </div>
      <div className="card col" style={{gap: 12}}>
        <h3>What are you two?</h3>
        <ModePicker mode={mode} setMode={setMode} />
        <label className="label" style={{marginTop: 4}}>
          {mode === 'couple' ? 'Together since' : 'Friends since'} (optional)
        </label>
        <input className="input" type="date" max={todayKey()} value={since} onChange={e => setSince(e.target.value)} />
      </div>
    </div>
  )
}

const Guest = () => {
  const [code, setCode] = useState('')
  const [view, setView] = useState<PairingView | null>(null)
  const session = useRef<PairingSession | null>(null)
  useEffect(() => () => session.current?.leave(), [])
  useEffect(() => {
    if (view?.phase === 'done') {
      finish()
    }
  }, [view?.phase])

  const [scanning, setScanning] = useState(false)
  const onScan = useCallback((c: string) => {
    setScanning(false)
    setCode(c)
    connect(c)
  }, [])

  const connect = (c = code) => {
    session.current?.leave()
    const s = new PairingSession({role: 'guest', code: c, onChange: v => setView({...v})})
    session.current = s
    s.start()
  }

  if (view && view.phase !== 'error' && view.phase !== 'declined')
    return (
      <div className="card col" style={{alignItems: 'center', gap: 14}}>
        {view.peer ? <Avatar p={view.peer} size={72} /> : <div className="spinner" />}
        <h2>{view.peer ? `Connecting with ${view.peer.name}` : 'Looking for your pair…'}</h2>
        <Fingerprint emoji={view.emoji} />
        <p className="small muted center">
          {view.phase === 'confirm' ? 'Waiting for them to accept…' : 'Keep both apps open. This usually takes a few seconds.'}
        </p>
        <button className="btn ghost sm" onClick={() => (session.current?.leave(), setView(null))}>
          Cancel
        </button>
      </div>
    )

  return (
    <div className="card col" style={{gap: 14}}>
      <h3>Enter your pair's code</h3>
      <input
        className="input code-input"
        placeholder="XXXX-XXXX-XXXX"
        value={code}
        onChange={e => setCode(normalizeCode(e.target.value))}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
      {view?.phase === 'declined' && <p className="small" style={{color: 'var(--bad)'}}>They declined the request.</p>}
      {view?.phase === 'error' && <p className="small" style={{color: 'var(--bad)'}}>{view.error}</p>}
      <button className="btn block" disabled={!isValidCode(code)} onClick={() => connect()}>
        Connect
      </button>
      <button className="btn block ghost" onClick={() => setScanning(true)}>
        <ScanLine size={18} /> Scan QR code
      </button>
      {scanning && <QrScanner onCode={onScan} onClose={() => setScanning(false)} />}
    </div>
  )
}

const RestoreSheet = ({onClose}: {onClose: () => void}) => {
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet open onClose={onClose} title="Restore from backup">
      <div className="col" style={{gap: 12}}>
        <p className="small muted" style={{margin: 0}}>
          Pick an encrypted backup exported from OnePair. Messages and data come back immediately; photos re-sync from your pair's phone.
        </p>
        <input className="input" type="password" placeholder="Backup password" value={pass} onChange={e => setPass(e.target.value)} />
        <button
          className="btn block"
          disabled={pass.length < 6 || busy}
          onClick={async () => {
            const [f] = await pickFiles('application/json,.json')
            if (!f) return
            setBusy(true)
            try {
              await importBackup(f, pass)
              toast({title: 'Backup restored', icon: '✅'})
              onClose()
              goTab(settings.get().startTab)
            } catch {
              toast({title: 'Wrong password or invalid file'})
            } finally {
              setBusy(false)
            }
          }}
        >
          Choose file
        </button>
      </div>
    </Sheet>
  )
}

export default function Pair({first}: {first?: boolean}) {
  const [role, setRole] = useState<'host' | 'guest'>('host')
  const [restore, setRestore] = useState(false)
  return (
    <div className={first ? 'onb' : 'screen full'} style={first ? {justifyContent: 'flex-start'} : undefined}>
      {first ? (
        <div className="center" style={{marginTop: 20}}>
          <div className="logo" style={{width: 64, height: 64, fontSize: 32, marginBottom: 12}}>🔗</div>
          <h1>Connect with your person</h1>
          <p className="muted small">Share your code, or enter theirs. That's the whole sign-up.</p>
        </div>
      ) : (
        <TopBar title="Add a pair" sub="Share your code or enter theirs" />
      )}
      <div style={{margin: '8px 0 16px'}}>
        <Seg value={role} onChange={setRole} options={[['host', 'Share my code'], ['guest', 'Enter a code']]} />
      </div>
      {role === 'host' ? <Host /> : <Guest />}
      {first && (
        <button className="small muted center" style={{marginTop: 8, textDecoration: 'underline'}} onClick={() => setRestore(true)}>
          Restore from backup file
        </button>
      )}
      {restore && <RestoreSheet onClose={() => setRestore(false)} />}
    </div>
  )
}
