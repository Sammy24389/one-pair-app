import {useState} from 'react'
import {Shuffle} from 'lucide-react'
import {Sheet} from '../components/ui'
import {DATE_IDEAS} from '../lib/content'
import type {Mode} from '../lib/identity'
import {push, type Sub} from '../lib/nav'
import {toast} from '../lib/notify'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import {uid} from '../lib/util'

const TILES: {sub: Sub; emoji: string; title: string; body: string; both?: boolean}[] = [
  {sub: 'daily', emoji: '💭', title: 'Daily question', body: 'Answer to reveal theirs'},
  {sub: 'photo', emoji: '📸', title: 'Photo of the day', body: 'One snap each, every day'},
  {sub: 'game-ttt', emoji: '❌', title: 'Tic-tac-toe', body: 'Turn-based, synced live'},
  {sub: 'game-wyr', emoji: '🤔', title: 'Would you rather', body: 'See if you match'},
  {sub: 'game-tot', emoji: '⚡', title: 'This or that', body: 'Quick-fire picks'},
  {sub: 'game-tod', emoji: '🎲', title: 'Truth or dare', body: 'Take turns, answer in chat'},
  {sub: 'doodle', emoji: '🎨', title: 'Doodle together', body: 'A shared canvas'}
]

export default function Play() {
  const space = useActiveSpace()
  useSpaceVersion(space)
  const [idea, setIdea] = useState<string | null>(null)
  if (!space) return null
  const mode = (space.meta.get('mode') as Mode) ?? 'friends'
  const ttt = space.games.get('ttt') as {turn?: string; winner?: string} | undefined

  return (
    <div className="screen">
      <div className="topbar">
        <h1>Play</h1>
      </div>
      <div className="grid2">
        {TILES.map(t => (
          <button key={t.sub} className="card tap game-tile" onClick={() => push(t.sub)}>
            <span className="e">{t.emoji}</span>
            <div>
              <h3>{t.title}</h3>
              <div className="tiny muted">{t.sub === 'game-ttt' && ttt?.turn === space.me && !ttt.winner ? '🟢 Your move!' : t.body}</div>
            </div>
          </button>
        ))}
        <button className="card tap game-tile" onClick={() => setIdea(DATE_IDEAS[Math.floor(Math.random() * DATE_IDEAS.length)])}>
          <span className="e">💡</span>
          <div>
            <h3>{mode === 'couple' ? 'Date idea' : 'Hangout idea'}</h3>
            <div className="tiny muted">Can't decide? Spin it</div>
          </div>
        </button>
      </div>

      <Sheet open={!!idea} onClose={() => setIdea(null)} title={mode === 'couple' ? '💡 Date idea' : '💡 Hangout idea'}>
        <h2 style={{fontSize: 22, margin: '6px 0 20px'}}>{idea}</h2>
        <div className="row">
          <button className="btn ghost grow" onClick={() => setIdea(DATE_IDEAS[Math.floor(Math.random() * DATE_IDEAS.length)])}>
            <Shuffle size={18} /> Another
          </button>
          <button
            className="btn grow"
            onClick={() => {
              const id = uid()
              space.lists.set(id, {id, list: 'ideas', text: idea!, done: false, by: space.me, ts: Date.now()})
              toast({title: 'Saved to Ideas list', icon: '💡'})
              setIdea(null)
            }}
          >
            Save it
          </button>
        </div>
      </Sheet>
    </div>
  )
}
