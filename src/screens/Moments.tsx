import {useMemo, useState} from 'react'
import {CalendarHeart, ImagePlus, Pencil, Plus, Trash2} from 'lucide-react'
import {EmojiPicker, Empty, flashEl, MediaImg, Seg, Sheet, Switch, useFocusTarget} from '../components/ui'
import {daysTogether, onThisDay, upcoming} from '../lib/days'
import type {Mode} from '../lib/identity'
import {compressImage, pickFiles} from '../lib/media'
import type {Space} from '../lib/space'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import type {DayKind, SpecialDay} from '../lib/types'
import {parseDateKey, todayKey, uid} from '../lib/util'

const KINDS: [DayKind, string, string][] = [
  ['countdown', 'Countdown', '⏳'],
  ['birthday', 'Birthday', '🎂'],
  ['anniversary', 'Anniversary', '💞'],
  ['memory', 'Memory', '📸'],
  ['custom', 'Other', '⭐']
]

const DAY_EMOJI = ['⏳', '🎂', '💞', '📸', '⭐', '✈️', '🎉', '🎄', '🏖️', '🎓', '💍', '🏠', '🎁', '🍰', '🎬', '🎵', '🌹', '🐾', '⚽', '🎮', '🍕', '☕', '🌙', '🔥']

const DayEditor = ({space, day, open, onClose}: {space: Space; day: SpecialDay | null; open: boolean; onClose: () => void}) => {
  const [kind, setKind] = useState<DayKind>(day?.kind ?? 'countdown')
  const [title, setTitle] = useState(day?.title ?? '')
  const [date, setDate] = useState(day?.date ?? todayKey())
  const [yearly, setYearly] = useState(day?.yearly ?? false)
  const [emoji, setEmoji] = useState(day?.emoji ?? '⏳')
  const [note, setNote] = useState(day?.note ?? '')
  const [mediaId, setMediaId] = useState(day?.mediaId)

  const save = () => {
    const d: SpecialDay = {
      id: day?.id ?? uid(),
      title: title.trim(),
      date,
      kind,
      yearly: kind === 'birthday' || kind === 'anniversary' ? true : yearly,
      emoji,
      note: note.trim() || undefined,
      mediaId,
      by: day?.by ?? space.me,
      ts: day?.ts ?? Date.now()
    }
    space.days.set(d.id, d)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={day ? 'Edit' : 'Add a special day'}>
      <div className="col" style={{gap: 12}}>
        <div className="chips">
          {KINDS.map(([k, label, e]) => (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => (setKind(k), setEmoji(e))}>
              {e} {label}
            </button>
          ))}
        </div>
        <input className="input" placeholder={kind === 'memory' ? 'What happened?' : kind === 'birthday' ? "Whose birthday?" : 'Title'} value={title} onChange={e => setTitle(e.target.value)} maxLength={60} />
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        {kind !== 'birthday' && kind !== 'anniversary' && kind !== 'memory' && (
          <div className="row between">
            <span>Repeats every year</span>
            <Switch checked={yearly} onChange={setYearly} />
          </div>
        )}
        <textarea className="textarea" placeholder="A note (optional)" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
        {mediaId ? (
          <div style={{position: 'relative'}}>
            <MediaImg id={mediaId} className="tl-photo" />
            <button className="icon-btn" style={{position: 'absolute', top: 18, right: 8}} onClick={() => setMediaId(undefined)} aria-label="Remove photo">
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <button
            className="btn ghost"
            onClick={async () => {
              const [f] = await pickFiles('image/*')
              if (!f) return
              const {blob} = await compressImage(f)
              setMediaId(await space.addMedia(blob))
            }}
          >
            <ImagePlus size={18} /> Add photo
          </button>
        )}
        <div className="card tight flat" style={{background: 'var(--surface-2)'}}>
          <EmojiPicker value={emoji} onChange={setEmoji} list={DAY_EMOJI} />
        </div>
        <div className="row">
          {day && (
            <button className="btn danger" onClick={() => (space.days.delete(day.id), onClose())}>
              <Trash2 size={18} />
            </button>
          )}
          <button className="btn grow" disabled={!title.trim() || !date} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Sheet>
  )
}

const SinceEditor = ({space, open, onClose}: {space: Space; open: boolean; onClose: () => void}) => {
  const [since, setSince] = useState((space.meta.get('since') as string) ?? '')
  const [mode, setMode] = useState<Mode>((space.meta.get('mode') as Mode) ?? 'friends')
  return (
    <Sheet open={open} onClose={onClose} title="Your story">
      <div className="col" style={{gap: 12}}>
        <Seg value={mode} onChange={setMode} options={[['friends', '🤝 Best friends'], ['couple', '💞 Couple']]} />
        <label className="label">{mode === 'couple' ? 'Together since' : 'Friends since'}</label>
        <input className="input" type="date" max={todayKey()} value={since} onChange={e => setSince(e.target.value)} />
        <button
          className="btn block"
          onClick={() => {
            space.doc.transact(() => {
              space.meta.set('mode', mode)
              if (since) space.meta.set('since', since)
            })
            onClose()
          }}
        >
          Save
        </button>
        <p className="tiny muted center">Changes sync to both of you.</p>
      </div>
    </Sheet>
  )
}

export default function Moments() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [editing, setEditing] = useState<SpecialDay | null | 'new'>(null)
  const [sinceOpen, setSinceOpen] = useState(false)

  const data = useMemo(() => {
    if (!space) return null
    const memories = [...space.days.values()].filter(d => d.kind === 'memory').sort((a, b) => b.date.localeCompare(a.date))
    return {
      since: space.meta.get('since') as string | undefined,
      mode: (space.meta.get('mode') as Mode) ?? 'friends',
      list: upcoming(space),
      memories,
      otd: onThisDay(space)
    }
  }, [space, v])

  useFocusTarget(f => f.startsWith('day-') && flashEl(document.querySelector(`[data-focus="${CSS.escape(f)}"]`)), [v])

  if (!space || !data) return null

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Moments</h1>
        <button className="icon-btn accent" onClick={() => setEditing('new')} aria-label="Add">
          <Plus size={22} />
        </button>
      </div>

      <button className="card tap" style={{width: '100%', textAlign: 'left'}} onClick={() => setSinceOpen(true)}>
        <div className="row">
          <div className="day-card grow">
            <div className="em">{data.mode === 'couple' ? '💞' : '🤝'}</div>
            <div>
              <h3>{data.since ? `Since ${parseDateKey(data.since).toLocaleDateString([], {dateStyle: 'long'})}` : 'When did your story start?'}</h3>
              <div className="small muted">{data.since ? `Day ${daysTogether(data.since).toLocaleString()}` : 'Set it to unlock milestones and anniversaries'}</div>
            </div>
          </div>
          <Pencil size={16} className="muted" />
        </div>
      </button>

      {(data.otd.memories.length > 0 || data.otd.photos.length > 0) && (
        <div className="section">
          <div className="section-title">
            <h3>🕰️ On this day</h3>
          </div>
          <div className="card">
            {data.otd.memories.map(m => (
              <div key={m.id}>
                <h3>{m.emoji} {m.title}</h3>
                <div className="small muted">{new Date().getFullYear() - parseDateKey(m.date).getFullYear()} year(s) ago</div>
                {m.mediaId && <MediaImg id={m.mediaId} className="tl-photo" />}
              </div>
            ))}
            {data.otd.photos.length > 0 && (
              <div className="grid3" style={{marginTop: 10}}>
                {data.otd.photos.slice(0, 6).map(([k, p]) => (
                  <MediaImg key={k} id={p.mediaId} style={{aspectRatio: '1', objectFit: 'cover', borderRadius: 12, width: '100%'}} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <h3>Upcoming</h3>
        </div>
        {data.list.length === 0 ? (
          <div className="card">
            <Empty emoji="📅" title="Nothing planned yet">
              Add birthdays, trips, or countdowns to the next time you see each other.
            </Empty>
          </div>
        ) : (
          <div className="card">
            {data.list.map(u => (
              <button key={u.key} className="list-row day-card" data-focus={`day-${u.key}`} onClick={() => u.day && setEditing(u.day)} disabled={!u.day}>
                <div className="em">{u.emoji}</div>
                <div className="grow">
                  <h3 className="ellipsis">{u.title}</h3>
                  <div className="tiny muted">
                    {u.date.toLocaleDateString([], {weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'})}
                    {u.years ? ` · ${u.years}${u.day?.kind === 'birthday' ? ' yrs' : ' yr'}` : ''}
                  </div>
                </div>
                <div>
                  <div className="n">{u.inDays === 0 ? '🎉' : u.inDays}</div>
                  <div className="tiny muted" style={{textAlign: 'right'}}>{u.inDays === 0 ? 'Today' : u.inDays === 1 ? 'day' : 'days'}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">
          <h3>Memories</h3>
          <button className="small" style={{color: 'var(--accent)', fontWeight: 600}} onClick={() => setEditing('new')}>
            + Add
          </button>
        </div>
        {data.memories.length === 0 ? (
          <div className="card">
            <Empty emoji="📸" title="Your timeline is empty">
              Save first dates, trips, inside jokes – with photos. They resurface “on this day”.
            </Empty>
          </div>
        ) : (
          <div className="timeline">
            {data.memories.map(m => (
              <button key={m.id} className="card tap tl-item" style={{width: '100%', textAlign: 'left', display: 'block'}} onClick={() => setEditing(m)}>
                <div className="tiny muted">{parseDateKey(m.date).toLocaleDateString([], {dateStyle: 'medium'})}</div>
                <h3>
                  {m.emoji} {m.title}
                </h3>
                {m.note && <div className="small muted" style={{marginTop: 4}}>{m.note}</div>}
                {m.mediaId && <MediaImg id={m.mediaId} className="tl-photo" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="center muted tiny" style={{marginTop: 20}}>
        <CalendarHeart size={14} style={{verticalAlign: -2}} /> Everything here syncs between your two devices.
      </div>

      {editing && <DayEditor key={editing === 'new' ? 'new' : editing.id} space={space} day={editing === 'new' ? null : editing} open onClose={() => setEditing(null)} />}
      {sinceOpen && <SinceEditor space={space} open onClose={() => setSinceOpen(false)} />}
    </div>
  )
}
