import {useMemo, useState} from 'react'
import {Check, Plus, Trash2} from 'lucide-react'
import {burst} from '../components/Fx'
import {Empty, TopBar} from '../components/ui'
import {haptic} from '../lib/platform'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import type {ListName} from '../lib/types'
import {cx, uid} from '../lib/util'

const LISTS: [ListName, string, string][] = [
  ['bucket', '🌍', 'Bucket list'],
  ['watch', '🍿', 'Watchlist'],
  ['ideas', '💡', 'Ideas'],
  ['places', '📍', 'Places'],
  ['wish', '🎁', 'Wishlist']
]

export default function Lists() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [list, setList] = useState<ListName>('bucket')
  const [text, setText] = useState('')

  const items = useMemo(
    () => (space ? [...space.lists.values()].filter(i => i.list === list).sort((a, b) => Number(a.done) - Number(b.done) || b.ts - a.ts) : []),
    [space, v, list]
  )
  if (!space) return null

  const add = () => {
    const t = text.trim()
    if (!t) return
    const id = uid()
    space.lists.set(id, {id, list, text: t, done: false, by: space.me, ts: Date.now()})
    setText('')
  }

  const done = items.filter(i => i.done).length

  return (
    <div className="screen full">
      <TopBar title="Shared lists" sub={items.length ? `${done} of ${items.length} done` : 'Plan things together'} />
      <div className="chips">
        {LISTS.map(([k, e, label]) => (
          <button key={k} className={cx('chip', list === k && 'on')} onClick={() => setList(k)}>
            {e} {label}
          </button>
        ))}
      </div>
      <div className="row" style={{marginTop: 14}}>
        <input className="input" placeholder="Add something…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} maxLength={140} />
        <button className="icon-btn accent" onClick={add} aria-label="Add">
          <Plus size={20} />
        </button>
      </div>
      <div className="card" style={{marginTop: 14, paddingTop: 4, paddingBottom: 4}}>
        {items.length === 0 ? (
          <Empty emoji={LISTS.find(l => l[0] === list)![1]} title="Nothing here yet" />
        ) : (
          items.map(i => (
            <div key={i.id} className="list-row">
              <button
                className={cx('check', i.done && 'on')}
                onClick={() => {
                  haptic('light')
                  space.lists.set(i.id, {...i, done: !i.done, doneTs: !i.done ? Date.now() : undefined})
                  if (!i.done && list === 'bucket') burst('🎉', 10)
                }}
                aria-label="Toggle"
              >
                {i.done && <Check size={14} />}
              </button>
              <div className="grow">
                <div className={cx(i.done && 'done-text')}>{i.text}</div>
                <div className="tiny muted">added by {i.by === space.me ? 'you' : space.peerProfile().name}</div>
              </div>
              <button className="icon-btn plain" onClick={() => space.lists.delete(i.id)} aria-label="Delete">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
