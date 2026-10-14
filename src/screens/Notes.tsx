import {useMemo, useState} from 'react'
import {PenLine} from 'lucide-react'
import {burst} from '../components/Fx'
import {Empty, Seg, Sheet, TopBar, useFocusTarget} from '../components/ui'
import {OPEN_WHEN} from '../lib/content'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import type {Note} from '../lib/types'
import {fmtDay, uid} from '../lib/util'

type Kind = Note['kind']

const Composer = ({onSave, onClose}: {onSave: (n: Omit<Note, 'id' | 'from' | 'ts'>) => void; onClose: () => void}) => {
  const [kind, setKind] = useState<Kind>('jar')
  const [title, setTitle] = useState(OPEN_WHEN[0])
  const [text, setText] = useState('')
  const [date, setDate] = useState('')
  return (
    <Sheet open onClose={onClose} title="Write something">
      <div className="col" style={{gap: 12}}>
        <Seg value={kind} onChange={setKind} options={[['jar', '🫙 Jar note'], ['openwhen', '💌 Open when'], ['capsule', '⏳ Capsule']]} />
        <p className="tiny muted" style={{margin: 0}}>
          {kind === 'jar' ? 'A little note for the jar – they can draw one any time.' : kind === 'openwhen' ? 'A letter they open in a specific moment.' : 'Sealed until a date you choose.'}
        </p>
        {kind === 'openwhen' && (
          <select className="select" value={title} onChange={e => setTitle(e.target.value)}>
            {OPEN_WHEN.map(o => (
              <option key={o}>{o}</option>
            ))}
          </select>
        )}
        {kind === 'capsule' && <input className="input" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} />}
        <textarea className="textarea" style={{minHeight: 160}} placeholder="Dear…" value={text} onChange={e => setText(e.target.value)} maxLength={4000} />
        <button
          className="btn block"
          disabled={!text.trim() || (kind === 'capsule' && !date)}
          onClick={() => {
            onSave({
              kind,
              text: text.trim(),
              title: kind === 'openwhen' ? title : kind === 'capsule' ? `Time capsule` : undefined,
              revealAt: kind === 'capsule' ? new Date(date + 'T09:00').getTime() : undefined
            })
            onClose()
          }}
        >
          Seal & send
        </button>
      </div>
    </Sheet>
  )
}

export default function Notes() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [writing, setWriting] = useState(false)
  const [reading, setReading] = useState<Note | null>(null)

  const data = useMemo(() => {
    if (!space) return null
    const all = [...space.notes.values()].sort((a, b) => b.ts - a.ts)
    const forMe = all.filter(n => n.from !== space.me)
    return {
      jar: forMe.filter(n => n.kind === 'jar'),
      letters: forMe.filter(n => n.kind !== 'jar'),
      sent: all.filter(n => n.from === space.me)
    }
  }, [space, v])

  useFocusTarget(f => {
    if (!f.startsWith('note-') || !space) return false
    const n = space.notes.get(f.slice(5))
    if (n && !(n.revealAt && n.revealAt > Date.now())) {
      if (!n.opened) space.notes.set(n.id, {...n, opened: Date.now()})
      setReading(n)
    }
    return true
  }, [v])

  if (!space || !data) return null
  const peer = space.peerProfile()

  const open = (n: Note) => {
    if (n.revealAt && n.revealAt > Date.now()) return
    if (!n.opened) {
      space.notes.set(n.id, {...n, opened: Date.now()})
      burst('💌', 8)
    }
    setReading(n)
  }

  const drawJar = () => {
    const pool = data.jar.filter(n => !n.opened)
    const pick = (pool.length ? pool : data.jar)[Math.floor(Math.random() * (pool.length || data.jar.length))]
    if (pick) open(pick)
  }

  return (
    <div className="screen full">
      <TopBar
        title="Letters & love jar"
        right={
          <button className="icon-btn accent" onClick={() => setWriting(true)} aria-label="Write">
            <PenLine size={18} />
          </button>
        }
      />

      <button className="card tap center" style={{width: '100%'}} onClick={drawJar} disabled={!data.jar.length}>
        <div style={{fontSize: 56}}>🫙</div>
        <h3>{data.jar.length ? `${data.jar.filter(n => !n.opened).length} new notes in the jar` : 'The jar is empty'}</h3>
        <div className="small muted">{data.jar.length ? 'Tap to draw one' : `Ask ${peer.name} to fill it up`}</div>
      </button>

      <div className="section">
        <div className="section-title">
          <h3>Letters for you</h3>
        </div>
        {data.letters.length === 0 ? (
          <div className="card">
            <Empty emoji="💌" title="No letters yet" />
          </div>
        ) : (
          <div className="grid2">
            {data.letters.map(n => {
              const sealed = !!n.revealAt && n.revealAt > Date.now()
              return (
                <button key={n.id} className="envelope tap" onClick={() => open(n)} style={{opacity: sealed ? 0.6 : 1}}>
                  <span className="e">{sealed ? '🔒' : n.opened ? '📖' : '💌'}</span>
                  {n.title}
                  {sealed && <span className="tiny muted">Opens {new Date(n.revealAt!).toLocaleDateString()}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {data.sent.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h3>You sent</h3>
          </div>
          <div className="card" style={{paddingTop: 4, paddingBottom: 4}}>
            {data.sent.map(n => (
              <div key={n.id} className="list-row">
                <span style={{fontSize: 22}}>{n.kind === 'jar' ? '🫙' : n.kind === 'openwhen' ? '💌' : '⏳'}</span>
                <div className="grow">
                  <div className="ellipsis">{n.title ?? n.text}</div>
                  <div className="tiny muted">
                    {fmtDay(n.ts)} · {n.opened ? 'opened' : 'not opened yet'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {writing && <Composer onClose={() => setWriting(false)} onSave={n => {
            const id = uid()
            space.notes.set(id, {...n, id, from: space.me, ts: Date.now()})
          }} />}
      <Sheet open={!!reading} onClose={() => setReading(null)} title={reading?.title ?? `From ${peer.name}`}>
        {reading && <div className="letter">{reading.text}</div>}
        <div className="tiny muted" style={{marginTop: 16}}>— {peer.name}, {reading && fmtDay(reading.ts)}</div>
      </Sheet>
    </div>
  )
}
