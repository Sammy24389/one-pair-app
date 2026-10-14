import {useEffect, useMemo, useState} from 'react'
import {BatteryCharging, BatteryMedium, ChevronRight, Clock, MapPin, Phone, Plus, Settings2, Video, X} from 'lucide-react'
import {burst} from '../components/Fx'
import {Avatar, flashEl, MediaImg, Sheet, useFocusTarget} from '../components/ui'
import {dailyImageUrl, dailyQuestions, MOODS, STATUSES, TOUCHES, touchesFor} from '../lib/content'
import {daysTogether, inDaysLabel, upcoming} from '../lib/days'
import {identity, type Mode} from '../lib/identity'
import {fmtDistance} from '../lib/location'
import {goTab, openRoute, push} from '../lib/nav'
import {computeNudges, nudgeRoute, snoozeNudge, type Nudge} from '../lib/nudges'
import {haptic, onAppVisibility} from '../lib/platform'
import {nativeBridge} from '../lib/native'
import {settings} from '../lib/settings'
import type {Space} from '../lib/space'
import {getSpace, useActiveSpace, useSpaceIds, useSpaceVersion} from '../lib/spaces'
import {cx, fmtAgo, haversineKm, pickForDay, todayKey} from '../lib/util'

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night'
}

const peerLocalTime = (tz?: string) => {
  if (!tz || tz === Intl.DateTimeFormat().resolvedOptions().timeZone) return null
  try {
    return new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', timeZone: tz})
  } catch {
    return null
  }
}

const Switcher = ({space}: {space: Space}) => {
  const ids = useSpaceIds()
  const [open, setOpen] = useState(false)
  if (ids.length < 2) return null
  return (
    <>
      <button className="chip" onClick={() => setOpen(true)}>
        {space.peerProfile().emoji} {space.peerProfile().name} <ChevronRight size={14} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your pairs">
        {ids.map(id => {
          const s = getSpace(id)
          if (!s) return null
          return (
            <button key={id} className="list-row" onClick={() => (settings.set({activePairId: id}), setOpen(false))}>
              <Avatar p={s.peerProfile()} size={40} conn={s.conn} />
              <div className="grow">
                <h3>{s.peerProfile().name}</h3>
                <div className="small muted">{s.meta.get('mode') === 'couple' ? 'Couple' : 'Best friends'}</div>
              </div>
              {s.unreadCount() > 0 && <span className="chip on">{s.unreadCount()}</span>}
            </button>
          )
        })}
        <button className="btn ghost block" style={{marginTop: 12}} onClick={() => (setOpen(false), push('pair'))}>
          <Plus size={18} /> Add another pair
        </button>
      </Sheet>
    </>
  )
}

const MoodSheet = ({space, open, onClose}: {space: Space; open: boolean; onClose: () => void}) => {
  const cur = space.moods.get(space.me)
  const [pick, setPick] = useState(cur?.label ?? '')
  const [note, setNote] = useState('')
  const status = space.meta.get(`status:${space.me}`) as string | undefined
  return (
    <Sheet open={open} onClose={onClose} title="How are you feeling?">
      <div className="mood-grid">
        {MOODS.map(m => (
          <button key={m.label} className={cx(pick === m.label && 'on')} onClick={() => setPick(m.label)}>
            <span>{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <input className="input" style={{marginTop: 12}} placeholder="Add a note (optional)" value={note} maxLength={120} onChange={e => setNote(e.target.value)} />
      <div className="section-title" style={{marginTop: 18}}>
        <h3>Status</h3>
      </div>
      <div className="chips wrap" style={{flexWrap: 'wrap'}}>
        {STATUSES.map(s => (
          <button key={s} className={cx('chip', status === s && 'on')} onClick={() => space.meta.set(`status:${space.me}`, status === s ? '' : s)}>
            {s}
          </button>
        ))}
      </div>
      <button
        className="btn block"
        style={{marginTop: 18}}
        disabled={!pick}
        onClick={() => {
          const m = MOODS.find(x => x.label === pick)!
          space.setMood({...m, note: note.trim() || undefined, ts: Date.now()})
          onClose()
        }}
      >
        Share mood
      </button>
    </Sheet>
  )
}

/** Android: one-time prompt to exempt OnePair from battery optimisation so calls ring with the screen off. */
const ReachabilityCard = () => {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!nativeBridge || localStorage.getItem('onepair.reachDismissed')) return
    const check = () => nativeBridge!.batteryStatus().then(b => setShow(!b.unrestricted)).catch(() => {})
    check()
    return onAppVisibility(h => !h && check())
  }, [])
  if (!show) return null
  return (
    <div className="card nudge" style={{marginTop: 14}}>
      <div className="em">📞</div>
      <div className="grow">
        <h3>Don't miss calls</h3>
        <div className="small muted">Let OnePair run unrestricted so calls ring even when your screen is off.</div>
      </div>
      <div className="col" style={{gap: 4, alignItems: 'flex-end'}}>
        <button className="btn sm" onClick={() => nativeBridge!.requestBatteryExemption()}>
          Allow
        </button>
        <button className="tiny muted" onClick={() => (localStorage.setItem('onepair.reachDismissed', '1'), setShow(false))}>
          Not now
        </button>
      </div>
    </div>
  )
}

const NudgeCard = ({n, onAction}: {n: Nudge; onAction: (n: Nudge) => void}) => (
  <div className="card nudge">
    <div className="em">{n.emoji}</div>
    <div className="grow">
      <h3>{n.title}</h3>
      <div className="small muted">{n.body}</div>
    </div>
    <div className="col" style={{gap: 4, alignItems: 'flex-end'}}>
      <button className="btn sm" onClick={() => onAction(n)}>
        {n.cta}
      </button>
      <button className="tiny muted" onClick={() => snoozeNudge(n.id)}>
        Not now
      </button>
    </div>
  </div>
)

export default function Home() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const me = identity.use(i => i.profile)
  const [moodOpen, setMoodOpen] = useState(false)
  settings.use(s => s.nudgeLevel)

  const data = useMemo(() => {
    if (!space) return null
    const mode = (space.meta.get('mode') as Mode) ?? 'friends'
    const since = space.meta.get('since') as string | undefined
    const myLoc = space.locations.get(space.me)
    const peerLoc = space.locations.get(space.peer)
    const distance = myLoc?.sharing && peerLoc?.sharing ? haversineKm(myLoc, peerLoc) : null
    const today = todayKey()
    return {
      mode,
      since,
      days: daysTogether(since),
      peer: space.peerProfile(),
      nudges: computeNudges(space).slice(0, 3),
      next: upcoming(space, 120).slice(0, 3),
      myMood: space.moods.get(space.me),
      peerMood: space.moods.get(space.peer),
      peerStatus: space.meta.get(`status:${space.peer}`) as string | undefined,
      lastSeen: space.lastSeen.get(space.peer),
      distance,
      daily: space.daily.get(today),
      question: pickForDay(dailyQuestions(mode), space.pair.id),
      myPhoto: space.photos.get(`${today}|${space.me}`),
      peerPhoto: space.photos.get(`${today}|${space.peer}`)
    }
  }, [space, v])

  useFocusTarget(f => (f === 'touch' || f === 'mood') && flashEl(document.querySelector(`[data-focus="${f}"]`)))

  if (!space || !data) return null
  const {mode, peer} = data
  const pp = space.peerPresence
  const peerTime = peerLocalTime(pp.tz)

  const sendTouch = (kind: string) => {
    haptic('medium')
    space.sendTouch(kind)
    burst(TOUCHES[kind].emoji, 6)
  }

  const onNudge = (n: Nudge) => {
    // Quick actions happen right here; everything else deep-links (and highlights) like a notification would.
    if (n.action === 'touch') return sendTouch(mode === 'couple' ? 'hug' : 'hi')
    if (n.action === 'mood') return setMoodOpen(true)
    openRoute(nudgeRoute(n, space.pair.id))
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="title">
          <div className="muted small">{greeting()},</div>
          <h1 className="ellipsis">{me.name}</h1>
        </div>
        <Switcher space={space} />
        <button className="icon-btn" onClick={() => push('settings')} aria-label="Settings">
          <Settings2 size={20} />
        </button>
      </div>

      {/* Hero: together counter + live status */}
      <div className="hero">
        <div className="bgimg" style={{backgroundImage: `url(${dailyImageUrl(todayKey() + space.pair.id.slice(0, 4), 900, 600)})`}} />
        <div className="shade" />
        <div className="content col" style={{gap: 14}}>
          <div className="pair">
            <Avatar p={me} size={58} />
            <span className="heartline">{mode === 'couple' ? '💗' : '✨'}</span>
            <Avatar p={peer} size={58} conn={space.conn} />
          </div>
          <div className="center">
            {data.since ? (
              <>
                <div className="count">{data.days.toLocaleString()}</div>
                <div className="small" style={{opacity: 0.9}}>
                  days {mode === 'couple' ? 'together' : 'of friendship'}
                </div>
              </>
            ) : (
              <button className="btn sm" style={{background: 'rgba(255,255,255,.25)'}} onClick={() => goTab('moments')}>
                Set your {mode === 'couple' ? 'anniversary' : 'friendiversary'}
              </button>
            )}
          </div>
          <div className="row wrap" style={{justifyContent: 'center', gap: 8, fontSize: 12.5}}>
            <span className="chip" style={{background: 'rgba(0,0,0,.25)', color: '#fff'}}>
              {space.online ? (pp.visible === false ? '🟢 Online · away' : '🟢 Online') : data.lastSeen ? `Seen ${fmtAgo(data.lastSeen)}` : space.conn === 'searching' ? 'Connecting…' : 'Offline'}
            </span>
            {data.peerStatus && <span className="chip" style={{background: 'rgba(0,0,0,.25)', color: '#fff'}}>{data.peerStatus}</span>}
            {space.online && pp.battery !== undefined && (
              <span className="chip" style={{background: 'rgba(0,0,0,.25)', color: '#fff'}}>
                {pp.charging ? <BatteryCharging size={14} /> : <BatteryMedium size={14} />} {pp.battery}%
              </span>
            )}
            {peerTime && (
              <span className="chip" style={{background: 'rgba(0,0,0,.25)', color: '#fff'}}>
                <Clock size={13} /> {peerTime}
              </span>
            )}
            {data.distance !== null && (
              <span className="chip" style={{background: 'rgba(0,0,0,.25)', color: '#fff'}} onClick={() => push('map')}>
                <MapPin size={13} /> {fmtDistance(data.distance)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Thinking-of-you touches */}
      <div className="card" style={{marginTop: 14}} data-focus="touch">
        <div className="row between" style={{marginBottom: 10}}>
          <h3>Send {peer.name} a little something</h3>
        </div>
        <div className="touch-bar">
          {touchesFor(mode).map(k => (
            <button key={k} className="touch-btn" onClick={() => sendTouch(k)} aria-label={TOUCHES[k].label}>
              {TOUCHES[k].emoji}
            </button>
          ))}
        </div>
      </div>

      <ReachabilityCard />

      {/* Nudges */}
      {data.nudges.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h3>For you two</h3>
          </div>
          {data.nudges.map(n => (
            <NudgeCard key={n.id} n={n} onAction={onNudge} />
          ))}
        </div>
      )}

      {/* Moods */}
      <div className="section" data-focus="mood">
        <div className="section-title">
          <h3>Moods</h3>
        </div>
        <div className="grid2">
          <button className="card tap" style={{textAlign: 'left'}} onClick={() => setMoodOpen(true)}>
            <div className="small muted">You</div>
            <div style={{fontSize: 30}}>{data.myMood?.emoji ?? '➕'}</div>
            <div className="small" style={{fontWeight: 600}}>{data.myMood ? data.myMood.label : 'Share your mood'}</div>
            {data.myMood && <div className="tiny muted">{fmtAgo(data.myMood.ts)}</div>}
          </button>
          <div className="card">
            <div className="small muted">{peer.name}</div>
            <div style={{fontSize: 30}}>{data.peerMood?.emoji ?? '…'}</div>
            <div className="small" style={{fontWeight: 600}}>{data.peerMood?.label ?? 'No mood yet'}</div>
            {data.peerMood?.note && <div className="tiny muted ellipsis">“{data.peerMood.note}”</div>}
            {data.peerMood && <div className="tiny muted">{fmtAgo(data.peerMood.ts)}</div>}
          </div>
        </div>
      </div>

      {/* Daily question */}
      <button className="card tap" style={{width: '100%', textAlign: 'left', marginTop: 14}} onClick={() => push('daily')}>
        <div className="row between">
          <span className="small muted">💭 Today's question</span>
          <span className="tiny muted">
            {data.daily?.answers[space.me] ? '✓ You' : '○ You'} · {data.daily?.answers[space.peer] ? `✓ ${peer.name}` : `○ ${peer.name}`}
          </span>
        </div>
        <h3 style={{marginTop: 6, fontSize: 17}}>{data.question}</h3>
      </button>

      {/* Photo of the day */}
      <button className="card tap" style={{width: '100%', textAlign: 'left', marginTop: 14}} onClick={() => push('photo')}>
        <div className="row between" style={{marginBottom: 10}}>
          <span className="small muted">📸 Today's moments</span>
          <ChevronRight size={16} className="muted" />
        </div>
        <div className="grid2">
          {[data.myPhoto, data.peerPhoto].map((p, i) => (
            <div key={i} style={{aspectRatio: '1', borderRadius: 16, overflow: 'hidden', background: 'var(--surface-2)', display: 'grid', placeItems: 'center'}}>
              {p ? (
                <MediaImg id={p.mediaId} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              ) : (
                <span className="small muted">{i === 0 ? 'Tap to share yours' : `Waiting for ${peer.name}`}</span>
              )}
            </div>
          ))}
        </div>
      </button>

      {/* Upcoming */}
      {data.next.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h3>Coming up</h3>
            <button className="small" style={{color: 'var(--accent)', fontWeight: 600}} onClick={() => goTab('moments')}>
              See all
            </button>
          </div>
          <div className="card">
            {data.next.map(u => (
              <div key={u.key} className="list-row day-card">
                <div className="em" style={{width: 40, height: 40, fontSize: 20}}>
                  {u.emoji}
                </div>
                <div className="grow">
                  <h3 className="ellipsis">{u.title}</h3>
                  <div className="tiny muted">{u.date.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})}{u.years ? ` · ${u.years} yr` : ''}</div>
                </div>
                <div className="small" style={{fontWeight: 700, color: 'var(--accent)'}}>
                  {inDaysLabel(u.inDays)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="section grid3">
        <button className="card tap col" style={{alignItems: 'center', gap: 6}} onClick={() => space.call.start(false)}>
          <Phone size={22} color="var(--accent)" />
          <span className="small">Call</span>
        </button>
        <button className="card tap col" style={{alignItems: 'center', gap: 6}} onClick={() => space.call.start(true)}>
          <Video size={22} color="var(--accent)" />
          <span className="small">Video</span>
        </button>
        <button className="card tap col" style={{alignItems: 'center', gap: 6}} onClick={() => push('map')}>
          <MapPin size={22} color="var(--accent)" />
          <span className="small">Location</span>
        </button>
      </div>

      {space.call.state.error && (
        <div className="card row" style={{marginTop: 14}}>
          <span className="grow small">{space.call.state.error}</span>
          <button className="icon-btn plain" onClick={() => space.call.clearError()} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <MoodSheet space={space} open={moodOpen} onClose={() => setMoodOpen(false)} />
    </div>
  )
}
