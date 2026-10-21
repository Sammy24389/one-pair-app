import {useEffect, useState} from 'react'
import {Camera, Download, Fingerprint, Lock as LockIcon, Plus, RefreshCw, Trash2, Upload, Wifi} from 'lucide-react'
import {Donate} from '../components/Donate'
import {Avatar, EmojiPicker, Seg, Sheet, StartPagePicker, Switch, TopBar} from '../components/ui'
import {dailyImageUrl, GRADIENTS} from '../lib/content'
import {exportBackup, importBackup} from '../lib/backup'
import {identity, removePair, type Mode} from '../lib/identity'
import {avatarFromFile, compressImage, pickFiles} from '../lib/media'
import {goTab, type Sub} from '../lib/nav'
import {ensureNotifyPermission, ntfyTopicFor, toast} from '../lib/notify'
import {isNative, onAppVisibility} from '../lib/platform'
import {nativeBridge} from '../lib/native'
import {biometryAvailable, enrollWebBiometric, lockNow, setPin} from '../lib/security'
import {ACCENTS, COMMUNITY_TURN, iceServers, settings, type IceServer, type LockMode, type ThemeName} from '../lib/settings'
import {getSpace, reconnectAll, useActiveSpace, useSpaceIds, useSpaceVersion} from '../lib/spaces'
import {cx, todayKey} from '../lib/util'
import {putMedia} from '../lib/idb'

declare const __APP_VERSION__: string

const Row = ({title, sub, children}: {title: string; sub?: string; children: React.ReactNode}) => (
  <div className="list-row">
    <div className="grow">
      <div style={{fontWeight: 600}}>{title}</div>
      {sub && <div className="tiny muted">{sub}</div>}
    </div>
    {children}
  </div>
)

// ---------------- Profile ----------------

const Profile = () => {
  const {profile, code} = identity.use()
  const set = (p: Partial<typeof profile>) => identity.set({profile: {...profile, ...p}})
  return (
    <>
      <TopBar title="Profile" />
      <div className="card col" style={{alignItems: 'center'}}>
        <button
          style={{position: 'relative'}}
          onClick={async () => {
            const [f] = await pickFiles('image/*')
            if (f) set({avatar: await avatarFromFile(f)})
          }}
        >
          <Avatar p={profile} size={96} />
          <span className="icon-btn accent" style={{position: 'absolute', right: -4, bottom: -4, width: 34, height: 34}}>
            <Camera size={16} />
          </span>
        </button>
        {profile.avatar && (
          <button className="small muted" onClick={() => set({avatar: undefined})}>
            Remove photo
          </button>
        )}
        <input className="input" value={profile.name} maxLength={32} onChange={e => set({name: e.target.value})} placeholder="Name" />
      </div>
      <div className="card" style={{marginTop: 14}}>
        <EmojiPicker value={profile.emoji} onChange={emoji => set({emoji, avatar: undefined})} />
      </div>
      <div className="card" style={{marginTop: 14}}>
        <div className="small muted">Your pairing code</div>
        <div className="code" style={{marginTop: 8, fontSize: 22}}>{code}</div>
      </div>
    </>
  )
}

// ---------------- Appearance ----------------

const THEMES: [ThemeName, string, string, string][] = [
  ['material', 'Material', 'color-mix(in oklab, var(--accent) 12%, #fff)', 'var(--accent)'],
  ['glass', 'Glass', 'linear-gradient(135deg,#ff7aa2,#7c5cff)', 'rgba(255,255,255,.45)'],
  ['neumorph', 'Soft UI', '#e7e9ef', '#e7e9ef'],
  ['amoled', 'AMOLED', '#000', '#1a1a1a'],
  ['paper', 'Paper', '#f7f1e6', '#fffaf1'],
  ['aurora', 'Aurora', 'linear-gradient(135deg,#00f5a0,#00d9f5,#8a2be2)', 'rgba(255,255,255,.18)']
]

const Appearance = () => {
  const s = settings.use()
  const space = useActiveSpace()
  useSpaceVersion(space)
  const shared = space?.meta.get('wallpaper') as string | undefined
  const transparent = s.theme === 'glass' || s.theme === 'aurora'

  const pickCustom = async (forBoth: boolean) => {
    const [f] = await pickFiles('image/*')
    if (!f) return
    const {blob} = await compressImage(f, 1920, 0.85)
    if (forBoth && space) {
      const id = await space.addMedia(blob)
      space.meta.set('wallpaper', id)
      settings.set({wallpaper: 'shared'})
    } else {
      const id = `wp-${Date.now()}`
      await putMedia(id, blob)
      settings.set({wallpaper: 'custom', wallpaperValue: id})
    }
  }

  return (
    <>
      <TopBar title="Appearance" />
      <div className="card">
        <h3 style={{marginBottom: 12}}>Theme</h3>
        <div className="theme-swatches">
          {THEMES.map(([id, label, bg, card]) => (
            <button
              key={id}
              className={cx('theme-swatch', s.theme === id && 'on')}
              onClick={() => settings.set({theme: id, ...(id === 'aurora' && s.wallpaper === 'gradient' ? {wallpaperValue: 'aurora'} : {})})}
            >
              <div className="pv" style={{background: bg, boxShadow: id === 'neumorph' ? 'inset 3px 3px 6px #c6c9d2, inset -3px -3px 6px #fff' : undefined}}>
                <i style={{top: 10, background: card, boxShadow: id === 'neumorph' ? '3px 3px 6px #c6c9d2,-3px -3px 6px #fff' : undefined, border: id === 'glass' || id === 'aurora' ? '1px solid rgba(255,255,255,.5)' : undefined}} />
                <i style={{top: 32, right: 30, background: card, boxShadow: id === 'neumorph' ? '3px 3px 6px #c6c9d2,-3px -3px 6px #fff' : undefined}} />
              </div>
              {label}
            </button>
          ))}
        </div>
        {s.theme !== 'amoled' && s.theme !== 'aurora' && (
          <div style={{marginTop: 14}}>
            <Seg value={s.scheme} onChange={scheme => settings.set({scheme})} options={[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} />
          </div>
        )}
      </div>

      <div className="card" style={{marginTop: 14}}>
        <h3 style={{marginBottom: 12}}>Accent</h3>
        <div className="accent-row">
          {ACCENTS.map(a => (
            <button key={a} className={cx('accent-dot', s.accent === a && 'on')} style={{background: a}} onClick={() => settings.set({accent: a})} aria-label={a} />
          ))}
          <label className="accent-dot" style={{background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)', position: 'relative', overflow: 'hidden'}}>
            <input type="color" value={s.accent} onChange={e => settings.set({accent: e.target.value})} style={{opacity: 0, position: 'absolute', inset: 0}} />
          </label>
        </div>
      </div>

      <div className="card" style={{marginTop: 14}}>
        <h3>Wallpaper</h3>
        <div className="tiny muted" style={{marginBottom: 12}}>
          {transparent ? 'Shows behind the whole app.' : 'Shows behind your chat. Pick Glass or Aurora to see it everywhere.'}
        </div>
        <div className="wp-grid">
          <button className={cx(s.wallpaper === 'none' && 'on')} style={{background: 'var(--surface-2)', color: 'var(--text)', textShadow: 'none'}} onClick={() => settings.set({wallpaper: 'none'})}>
            None
          </button>
          <button className={cx(s.wallpaper === 'daily' && 'on')} style={{backgroundImage: `url(${dailyImageUrl(todayKey(), 200, 356)})`}} onClick={() => settings.set({wallpaper: 'daily'})}>
            Daily ✨
          </button>
          {Object.entries(GRADIENTS).map(([id, css]) => (
            <button key={id} className={cx(s.wallpaper === 'gradient' && s.wallpaperValue === id && 'on')} style={{background: css}} onClick={() => settings.set({wallpaper: 'gradient', wallpaperValue: id})} aria-label={id} />
          ))}
        </div>
        <div className="row" style={{marginTop: 12}}>
          <button className={cx('btn sm grow', s.wallpaper !== 'custom' && 'ghost')} onClick={() => pickCustom(false)}>
            My photo
          </button>
          <button className={cx('btn sm grow', s.wallpaper !== 'shared' && 'ghost')} onClick={() => (shared && s.wallpaper !== 'shared' ? settings.set({wallpaper: 'shared'}) : pickCustom(true))}>
            {shared ? 'Our shared one' : 'Set for both of us'}
          </button>
        </div>
        <label className="label" style={{marginTop: 14}}>Dim</label>
        <input className="range" type="range" min={0} max={0.8} step={0.05} value={s.wallpaperDim} onChange={e => settings.set({wallpaperDim: +e.target.value})} />
        <label className="label">Blur</label>
        <input className="range" type="range" min={0} max={24} step={1} value={s.wallpaperBlur} onChange={e => settings.set({wallpaperBlur: +e.target.value})} />
      </div>

      <div className="card" style={{marginTop: 14, paddingTop: 4, paddingBottom: 4}}>
        <Row title="Reduce motion" sub="Disable animations for speed and comfort">
          <Switch checked={s.reduceMotion} onChange={reduceMotion => settings.set({reduceMotion})} />
        </Row>
        <Row title="Haptics">
          <Switch checked={s.haptics} onChange={haptics => settings.set({haptics})} />
        </Row>
        <Row title="Sounds">
          <Switch checked={s.sounds} onChange={sounds => settings.set({sounds})} />
        </Row>
      </div>
    </>
  )
}

// ---------------- Security ----------------

const PinSetup = ({onDone, onClose}: {onDone: () => void; onClose: () => void}) => {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const valid = /^\d{4,6}$/.test(a) && a === b
  return (
    <Sheet open onClose={onClose} title="Set a PIN">
      <div className="col" style={{gap: 12}}>
        <input className="input code-input" type="password" inputMode="numeric" maxLength={6} placeholder="4–6 digits" value={a} onChange={e => setA(e.target.value.replace(/\D/g, ''))} autoFocus />
        <input className="input code-input" type="password" inputMode="numeric" maxLength={6} placeholder="Repeat" value={b} onChange={e => setB(e.target.value.replace(/\D/g, ''))} />
        {b.length >= a.length && a && a !== b && <div className="small" style={{color: 'var(--bad)'}}>PINs don't match</div>}
        <button className="btn block" disabled={!valid} onClick={async () => (await setPin(a), onDone())}>
          Save PIN
        </button>
      </div>
    </Sheet>
  )
}

const Security = () => {
  const s = settings.use()
  const [pinFor, setPinFor] = useState<LockMode | null>(null)
  const [bio, setBio] = useState<{ok: boolean; label: string} | null>(null)
  useEffect(() => {
    biometryAvailable().then(setBio)
  }, [])

  const choose = async (mode: LockMode) => {
    if (mode === 'off') return settings.set({lockMode: 'off'})
    if (mode === 'bio' && !bio?.ok) return toast({title: 'Biometrics unavailable', body: bio?.label})
    if (mode === 'bio' && !isNative && !s.bioCredentialId) {
      try {
        await enrollWebBiometric()
      } catch (e) {
        return toast({title: 'Could not enroll', body: (e as Error).message})
      }
    }
    if (!s.pinHash) return setPinFor(mode) // biometric mode always has the PIN as fallback
    settings.set({lockMode: mode})
  }

  const MODES: [LockMode, string, string][] = [
    ['off', 'Off', 'No lock'],
    ['pin', 'PIN', 'Unlock with your PIN'],
    ['bio', 'Biometric', 'Fingerprint or face unlock, with your PIN as fallback']
  ]

  return (
    <>
      <TopBar title="Privacy & lock" />
      <div className="card" style={{paddingTop: 4, paddingBottom: 4}}>
        {MODES.map(([m, title, sub]) => (
          <button key={m} className="list-row" onClick={() => choose(m)}>
            <span className="ico">{m === 'off' ? <LockIcon size={18} opacity={0.4} /> : m === 'pin' ? <LockIcon size={18} /> : <Fingerprint size={18} />}</span>
            <div className="grow">
              <div style={{fontWeight: 600}}>{title}</div>
              <div className="tiny muted">{sub}</div>
            </div>
            <span className={cx('check', s.lockMode === m && 'on')} style={{borderRadius: '50%'}} />
          </button>
        ))}
      </div>
      {bio && <p className="tiny muted" style={{margin: '8px 6px'}}>Biometrics: {bio.label}</p>}

      {s.lockMode !== 'off' && (
        <div className="card" style={{marginTop: 14, paddingTop: 4, paddingBottom: 4}}>
          <div className="list-row" style={{display: 'block'}}>
            <div style={{fontWeight: 600, marginBottom: 8}}>Auto-lock after</div>
            <Seg value={String(s.autoLockSec)} onChange={v => settings.set({autoLockSec: +v})} options={[['0', 'Instantly'], ['30', '30 s'], ['60', '1 min'], ['300', '5 min']]} />
          </div>
          <Row title="Hide content in app switcher" sub="Blurs the screen when you leave the app">
            <Switch checked={s.privacyBlur} onChange={privacyBlur => settings.set({privacyBlur})} />
          </Row>
          <button className="list-row" onClick={() => setPinFor(s.lockMode)}>
            <div className="grow" style={{fontWeight: 600}}>Change PIN</div>
          </button>
          <button className="list-row" onClick={lockNow}>
            <div className="grow" style={{fontWeight: 600}}>Lock now</div>
          </button>
        </div>
      )}

      <div className="card" style={{marginTop: 14}}>
        <h3>How your data is protected</h3>
        <ul className="small muted" style={{paddingLeft: 18, marginBottom: 0}}>
          <li>Everything lives only on your two devices – there is no server or cloud copy.</li>
          <li>Connections are WebRTC (DTLS-SRTP) encrypted end-to-end; signaling is AES-GCM encrypted with a key derived from your pair secret.</li>
          <li>Only a device holding the pair secret can join your private room (HMAC challenge–response).</li>
          <li>Your PIN is stored as a salted PBKDF2 hash with exponential back-off on wrong attempts.</li>
        </ul>
      </div>
      {pinFor && (
        <PinSetup
          onClose={() => setPinFor(null)}
          onDone={() => {
            settings.set({lockMode: pinFor === 'off' ? 'pin' : pinFor})
            setPinFor(null)
            toast({title: 'Lock enabled', icon: '🔒'})
          }}
        />
      )}
    </>
  )
}

// ---------------- Connection ----------------

const testIce = async (servers: IceServer[]) => {
  const pc = new RTCPeerConnection({iceServers: servers})
  pc.createDataChannel('t')
  const types = new Set<string>()
  pc.onicecandidate = e => e.candidate && types.add(e.candidate.type ?? '')
  await pc.setLocalDescription(await pc.createOffer())
  await new Promise(r => {
    const t = setTimeout(r, 6000)
    pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && (clearTimeout(t), r(null))
  })
  pc.close()
  return types
}

const Connection = () => {
  const s = settings.use()
  const ids = useSpaceIds()
  const space = useActiveSpace()
  useSpaceVersion(space)
  const [test, setTest] = useState<string>('')
  const [turn, setTurn] = useState<IceServer>({urls: 'turn:', username: '', credential: ''})
  const [topic, setTopic] = useState('')

  useEffect(() => {
    if (space) ntfyTopicFor(space, space.me).then(setTopic)
  }, [space])

  const [battery, setBattery] = useState<{unrestricted: boolean; serviceRunning: boolean} | null>(null)
  useEffect(() => {
    if (!nativeBridge) return
    const check = () => nativeBridge!.batteryStatus().then(setBattery).catch(() => {})
    check()
    return onAppVisibility(h => !h && check())
  }, [s.keepAlive])

  const run = async () => {
    setTest('Testing…')
    try {
      const t = await testIce(iceServers())
      setTest(
        `${t.has('srflx') ? '✅ STUN reachable (direct P2P likely works)' : '⚠️ No STUN response'}\n${t.has('relay') ? '✅ TURN relay available (works behind strict NATs)' : '⚠️ No TURN relay – strict networks may fail'}`
      )
    } catch (e) {
      setTest(`Error: ${(e as Error).message}`)
    }
  }

  return (
    <>
      <TopBar title="Connection" sub="Serverless peer-to-peer" />
      <div className="card" style={{paddingTop: 4, paddingBottom: 4}}>
        {ids.map(id => {
          const sp = getSpace(id)
          if (!sp) return null
          return (
            <div key={id} className="list-row">
              <Avatar p={sp.peerProfile()} size={36} conn={sp.conn} />
              <div className="grow">
                <div style={{fontWeight: 600}}>{sp.peerProfile().name}</div>
                <div className="tiny muted">{sp.online ? 'Connected directly' : sp.conn === 'searching' ? 'Waiting for them to come online' : 'Offline'}</div>
              </div>
            </div>
          )
        })}
        <button className="list-row" onClick={reconnectAll}>
          <span className="ico">
            <RefreshCw size={18} />
          </span>
          <div className="grow" style={{fontWeight: 600}}>Reconnect now</div>
        </button>
      </div>

      {!nativeBridge && <div className="card" style={{marginTop: 14}}>
        <h3>Background reception</h3>
        <p className="tiny muted">Keep this app or browser tab open to receive messages while connected. Browsers can suspend background tabs, especially on phones. Reopening the app reconnects automatically and catches up saved messages when the other device is online. Installing the web app does not guarantee background delivery.</p>
      </div>}
      {nativeBridge && (
        <div className="card" style={{marginTop: 14}}>
          <h3>Reachability</h3>
          <p className="tiny muted">
            Keep the background connection enabled to improve message and call reception while OnePair is running. The silent notification and unrestricted battery setting help, but Android or your phone maker can still suspend it. Messages catch up when both devices reconnect. Swiping OnePair away stops reception until you open it again.
          </p>
          <Row title="Stay reachable in background" sub={battery?.serviceRunning ? 'Running' : 'Off'}>
            <Switch checked={s.keepAlive} onChange={keepAlive => settings.set({keepAlive})} />
          </Row>
          <Row title="Unrestricted battery" sub={battery?.unrestricted ? 'Allowed ✓' : 'Recommended so calls ring when the screen is off'}>
            {!battery?.unrestricted && (
              <button className="btn sm" onClick={() => nativeBridge!.requestBatteryExemption()}>
                Allow
              </button>
            )}
          </Row>
        </div>
      )}

      <div className="card" style={{marginTop: 14}}>
        <h3>STUN / TURN servers</h3>
        <p className="tiny muted">
          STUN lets your phones find each other. TURN relays encrypted traffic when a direct path is impossible (e.g. strict mobile carriers). Relayed data stays end-to-end encrypted.
        </p>
        <Row title="Community TURN relay" sub={`${COMMUNITY_TURN[0].urls.split(':')[1]} – free, rate-limited`}>
          <Switch checked={s.useCommunityTurn} onChange={useCommunityTurn => settings.set({useCommunityTurn})} />
        </Row>
        {s.customIce.map((srv, i) => (
          <div key={i} className="list-row">
            <div className="grow small ellipsis">{srv.urls}</div>
            <button className="icon-btn plain" onClick={() => settings.set({customIce: s.customIce.filter((_, j) => j !== i)})} aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="col" style={{marginTop: 10}}>
          <input className="input" placeholder="turn:your.server:3478" value={turn.urls} onChange={e => setTurn({...turn, urls: e.target.value})} />
          <div className="row">
            <input className="input" placeholder="Username" value={turn.username} onChange={e => setTurn({...turn, username: e.target.value})} />
            <input className="input" placeholder="Credential" type="password" value={turn.credential} onChange={e => setTurn({...turn, credential: e.target.value})} />
          </div>
          <button
            className="btn ghost sm"
            disabled={!/^(turns?|stun):.+/.test(turn.urls)}
            onClick={() => {
              settings.set({customIce: [...s.customIce, {urls: turn.urls.trim(), username: turn.username || undefined, credential: turn.credential || undefined}]})
              setTurn({urls: 'turn:', username: '', credential: ''})
              toast({title: 'Server added – reconnecting'})
              reconnectAll()
            }}
          >
            <Plus size={16} /> Add server
          </button>
        </div>
        <button className="btn block" style={{marginTop: 14}} onClick={run}>
          <Wifi size={18} /> Test connectivity
        </button>
        {test && <pre className="small" style={{whiteSpace: 'pre-wrap', marginBottom: 0}}>{test}</pre>}
      </div>

      <div className="card" style={{marginTop: 14}}>
        <Row title="Wake-up pings (ntfy)" sub="Optional. Notifies your pair when they're offline. Contains no message content.">
          <Switch checked={s.ntfyEnabled} onChange={ntfyEnabled => settings.set({ntfyEnabled})} />
        </Row>
        {s.ntfyEnabled && (
          <div className="col" style={{marginTop: 8}}>
            <input className="input" value={s.ntfyServer} onChange={e => settings.set({ntfyServer: e.target.value})} />
            <div className="small">
              To receive pings, install the free <b>ntfy</b> app and subscribe to this private topic:
            </div>
            <div className="code" style={{fontSize: 14, letterSpacing: 0}}>{topic}</div>
            <button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(topic).then(() => toast({title: 'Topic copied'}))}>
              Copy topic
            </button>
            <div className="tiny muted">Both of you need this switched on. Topics are derived from your pair secret, so nobody else can guess them.</div>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------- General ----------------

const General = () => {
  const s = settings.use()
  const space = useActiveSpace()
  useSpaceVersion(space)
  const [pass, setPass] = useState('')
  const [backupOpen, setBackupOpen] = useState<'export' | 'import' | null>(null)
  const hours = Array.from({length: 24}, (_, i) => i)

  const mode = (space?.meta.get('mode') as Mode) ?? 'friends'
  const since = (space?.meta.get('since') as string) ?? ''

  return (
    <>
      <TopBar title="Settings" />
      {space && (
        <div className="card" style={{marginBottom: 14}}>
          <h3>Your space with {space.peerProfile().name}</h3>
          <p className="tiny muted">Changes sync to both of you instantly.</p>
          <Seg
            value={mode}
            onChange={m => {
              space.meta.set('mode', m)
              toast({title: m === 'couple' ? 'Switched to Couple mode 💞' : 'Switched to Friends mode 🤝'})
            }}
            options={[['friends', '🤝 Best friends'], ['couple', '💞 Couple']]}
          />
          <label className="label" style={{marginTop: 12}}>{mode === 'couple' ? 'Together since' : 'Friends since'}</label>
          <input className="input" type="date" max={todayKey()} value={since} onChange={e => e.target.value && space.meta.set('since', e.target.value)} />
        </div>
      )}
      <div className="card" style={{marginBottom: 14}}>
        <h3>Open OnePair on</h3>
        <p className="tiny muted">The page you land on when opening the app. Back from any other page returns here.</p>
        <StartPagePicker />
      </div>
      <div className="card">
        <h3>Nudges</h3>
        <p className="tiny muted">
          Gentle, rhythm-aware reminders: special days, when your pair answered a question or shared a moment, and the occasional "say hi". Never guilt-trips, never spammy.
        </p>
        <Seg value={s.nudgeLevel} onChange={nudgeLevel => (settings.set({nudgeLevel}), nudgeLevel !== 'off' && ensureNotifyPermission())} options={[['off', 'Off'], ['gentle', 'Gentle'], ['balanced', 'Balanced']]} />
        <div className="row" style={{marginTop: 12}}>
          <span className="small grow">Quiet hours</span>
          <select className="select" style={{width: 'auto'}} value={s.quietStart} onChange={e => settings.set({quietStart: +e.target.value})}>
            {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          <span className="small">to</span>
          <select className="select" style={{width: 'auto'}} value={s.quietEnd} onChange={e => settings.set({quietEnd: +e.target.value})}>
            {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <button className="btn ghost sm" style={{marginTop: 12}} onClick={ensureNotifyPermission}>
          Allow notifications
        </button>
      </div>

      <div className="card" style={{marginTop: 14, paddingTop: 4, paddingBottom: 4}}>
        <Row title="Enter to send" sub="On mobile keyboards">
          <Switch checked={s.enterToSend} onChange={enterToSend => settings.set({enterToSend})} />
        </Row>
      </div>

      <div className="card" style={{marginTop: 14}}>
        <h3>Backup</h3>
        <p className="tiny muted">
          Your partner's device is a live backup – if you reinstall, re-pair and choose "Restore". You can also export an encrypted file (messages & data; media re-syncs from your partner).
        </p>
        <div className="row">
          <button className="btn ghost sm grow" onClick={() => setBackupOpen('export')}>
            <Download size={16} /> Export
          </button>
          <button className="btn ghost sm grow" onClick={() => setBackupOpen('import')}>
            <Upload size={16} /> Import
          </button>
        </div>
      </div>

      {space && (
        <div className="card" style={{marginTop: 14}}>
          <h3 style={{color: 'var(--bad)'}}>Danger zone</h3>
          <button
            className="btn danger block"
            style={{marginTop: 10}}
            onClick={() => {
              if (!confirm(`Unpair from ${space.peerProfile().name}? All shared data will be deleted from this device.`)) return
              removePair(space.pair.id)
              goTab('home')
            }}
          >
            <Trash2 size={18} /> Unpair & delete data
          </button>
        </div>
      )}

      <Sheet open={!!backupOpen} onClose={() => setBackupOpen(null)} title={backupOpen === 'export' ? 'Export backup' : 'Import backup'}>
        <div className="col" style={{gap: 12}}>
          <input className="input" type="password" placeholder="Backup password" value={pass} onChange={e => setPass(e.target.value)} />
          <button
            className="btn block"
            disabled={pass.length < 6}
            onClick={async () => {
              try {
                if (backupOpen === 'export') {
                  if (!space || !(await exportBackup(space, pass))) return
                  toast({title: 'Backup saved', icon: '✅'})
                } else {
                  const [f] = await pickFiles('application/json,.json')
                  if (!f) return
                  await importBackup(f, pass)
                  toast({title: 'Backup restored', icon: '✅'})
                }
                setBackupOpen(null)
                setPass('')
              } catch {
                toast({title: 'Wrong password or invalid file'})
              }
            }}
          >
            {backupOpen === 'export' ? 'Export' : 'Choose file'}
          </button>
          <div className="tiny muted">At least 6 characters. Without the password the backup cannot be opened.</div>
        </div>
      </Sheet>
    </>
  )
}

const About = () => (
  <>
    <TopBar title="About" />
    <div className="card center col" style={{alignItems: 'center'}}>
      <div className="logo">💞</div>
      <h2>OnePair</h2>
      <div className="muted small">Version {__APP_VERSION__}</div>
    </div>
    <div className="card" style={{marginTop: 14}}>
      <h3>How it works</h3>
      <p className="small muted">
        OnePair has no backend. Your phones discover each other through public Nostr relays (only encrypted connection offers pass through them), then talk directly over WebRTC. All shared data is a CRDT document stored on both devices and merged automatically, so you can use the app offline and everything syncs when you both are online.
      </p>
      <h3>Open source</h3>
      <p className="small muted" style={{marginBottom: 0}}>
        Built with React, Yjs, Trystero, Capacitor, Leaflet and OpenStreetMap. Daily images from Lorem Picsum.
      </p>
    </div>
    <Donate style={{marginTop: 14}} />
  </>
)

export default function Settings({page}: {page: Sub}) {
  return (
    <div className="screen full">
      {page === 'profile' ? <Profile /> : page === 'appearance' ? <Appearance /> : page === 'security' ? <Security /> : page === 'connection' ? <Connection /> : page === 'about' ? <About /> : <General />}
    </div>
  )
}
