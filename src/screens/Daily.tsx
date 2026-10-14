import {useMemo, useRef, useState} from 'react'
import {Lock} from 'lucide-react'
import {burst} from '../components/Fx'
import {Avatar, flashEl, TopBar, useFocusTarget} from '../components/ui'
import {dailyQuestions} from '../lib/content'
import type {Mode} from '../lib/identity'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import {parseDateKey, pickForDay, todayKey} from '../lib/util'

/** Paired-style daily question: your partner's answer stays hidden until you answer too. */
export default function Daily() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [text, setText] = useState('')
  const answerRef = useRef<HTMLTextAreaElement>(null)

  const data = useMemo(() => {
    if (!space) return null
    const mode = (space.meta.get('mode') as Mode) ?? 'friends'
    const today = todayKey()
    const entry = space.daily.get(today)
    const history = [...space.daily.entries()].filter(([k]) => k !== today).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30)
    return {q: entry?.q ?? pickForDay(dailyQuestions(mode), space.pair.id), entry, history}
  }, [space, v])

  useFocusTarget(f => {
    if (f !== 'answer') return false
    answerRef.current?.focus()
    flashEl(answerRef.current?.closest('.card') ?? null)
    return true
  })

  if (!space || !data) return null
  const mine = data.entry?.answers[space.me]
  const theirs = data.entry?.answers[space.peer]
  const peer = space.peerProfile()

  return (
    <div className="screen full">
      <TopBar title="Daily question" sub={new Date().toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'})} />
      <div className="card">
        <h2 style={{fontSize: 21}}>{data.q}</h2>
      </div>

      {!mine ? (
        <div className="card col" style={{marginTop: 14}}>
          <textarea ref={answerRef} className="textarea" placeholder="Your answer…" value={text} onChange={e => setText(e.target.value)} maxLength={600} autoFocus />
          <button
            className="btn block"
            disabled={!text.trim()}
            onClick={() => {
              space.answerDaily(data.q, text.trim())
              if (theirs) burst('💭', 8)
            }}
          >
            {theirs ? `Answer & reveal ${peer.name}'s` : 'Answer'}
          </button>
        </div>
      ) : null}

      <div className="col" style={{marginTop: 14, gap: 12}}>
        {mine && (
          <div className="card">
            <div className="row" style={{marginBottom: 8}}>
              <Avatar p={space.myProfile()} size={30} />
              <b>You</b>
            </div>
            <div style={{whiteSpace: 'pre-wrap'}}>{mine.text}</div>
          </div>
        )}
        <div className="card">
          <div className="row" style={{marginBottom: 8}}>
            <Avatar p={peer} size={30} />
            <b>{peer.name}</b>
          </div>
          {!theirs ? (
            <div className="muted small">Hasn't answered yet.</div>
          ) : mine ? (
            <div style={{whiteSpace: 'pre-wrap'}}>{theirs.text}</div>
          ) : (
            <div className="row muted small">
              <Lock size={16} /> Answered – answer yours to reveal it.
            </div>
          )}
        </div>
      </div>

      {data.history.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h3>Past questions</h3>
          </div>
          {data.history.map(([k, e]) => (
            <details key={k} className="card" style={{marginBottom: 10}}>
              <summary style={{cursor: 'pointer'}}>
                <span className="tiny muted">{parseDateKey(k).toLocaleDateString([], {dateStyle: 'medium'})}</span>
                <div style={{fontWeight: 600}}>{e.q}</div>
              </summary>
              <div className="col" style={{marginTop: 10}}>
                <div className="small">
                  <b>You:</b> {e.answers[space.me]?.text ?? '—'}
                </div>
                <div className="small">
                  <b>{peer.name}:</b> {e.answers[space.me] ? e.answers[space.peer]?.text ?? '—' : '🔒'}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
