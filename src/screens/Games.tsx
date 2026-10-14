import {RotateCcw, Shuffle} from 'lucide-react'
import {burst} from '../components/Fx'
import {Avatar, TopBar} from '../components/ui'
import {DARES, THIS_OR_THAT, TRUTHS, WOULD_YOU_RATHER} from '../lib/content'
import type {Mode} from '../lib/identity'
import {goTab} from '../lib/nav'
import {haptic} from '../lib/platform'
import type {Space} from '../lib/space'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import {cx} from '../lib/util'

// ---------- Tic-tac-toe ----------

type TTT = {board: string[]; turn: string; winner: string; starter: string; scores: Record<string, number>}

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]

const winLine = (b: string[]) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d])

const TicTacToe = ({space}: {space: Space}) => {
  const me = space.me
  const peer = space.peer
  const fresh = (starter: string, scores: Record<string, number> = {}): TTT => ({board: Array(9).fill(''), turn: starter, winner: '', starter, scores})
  // Deterministic first starter so both devices agree before any move is synced.
  const g = (space.games.get('ttt') as TTT | undefined) ?? fresh([me, peer].sort()[0])
  const line = winLine(g.board)
  const mark = (d: string) => (d === g.starter ? '❌' : d ? '⭕' : '')

  const play = (i: number) => {
    if (g.winner || g.board[i] || g.turn !== me) return
    haptic('light')
    const board = [...g.board]
    board[i] = me
    const w = winLine(board)
    const winner = w ? me : board.every(Boolean) ? 'draw' : ''
    const scores = w ? {...g.scores, [me]: (g.scores[me] ?? 0) + 1} : g.scores
    space.games.set('ttt', {...g, board, turn: peer, winner, scores})
    if (w) burst('🏆', 10)
  }

  const status = g.winner === 'draw' ? "It's a draw!" : g.winner ? (g.winner === me ? 'You won! 🎉' : `${space.peerProfile().name} won`) : g.turn === me ? 'Your move' : `Waiting for ${space.peerProfile().name}…`

  return (
    <>
      <div className="card row between">
        <div className="col" style={{alignItems: 'center', gap: 4}}>
          <Avatar p={space.myProfile()} size={44} />
          <b>{g.scores[me] ?? 0}</b>
        </div>
        <div className="center">
          <h2>{status}</h2>
          <div className="tiny muted">{mark(me)} is you</div>
        </div>
        <div className="col" style={{alignItems: 'center', gap: 4}}>
          <Avatar p={space.peerProfile()} size={44} />
          <b>{g.scores[peer] ?? 0}</b>
        </div>
      </div>
      <div className="card" style={{marginTop: 14}}>
        <div className="ttt">
          {g.board.map((c, i) => (
            <button key={i} className={cx(line?.includes(i) && 'win')} onClick={() => play(i)}>
              {mark(c)}
            </button>
          ))}
        </div>
      </div>
      {g.winner && (
        <button className="btn block" style={{marginTop: 14}} onClick={() => space.games.set('ttt', fresh(g.starter === me ? peer : me, g.scores))}>
          <RotateCcw size={18} /> Rematch
        </button>
      )}
    </>
  )
}

// ---------- Pick-a-side games (would you rather / this or that) ----------

type Picks = {idx: number; picks: Record<string, number>}

const PickGame = ({space, id, deck, title}: {space: Space; id: string; deck: [string, string][]; title: string}) => {
  const g = (space.games.get(id) as Picks | undefined) ?? {idx: parseInt(space.pair.id.slice(0, 6), 16) % deck.length, picks: {}}
  const [a, b] = deck[g.idx % deck.length]
  const mine = g.picks[space.me]
  const theirs = g.picks[space.peer]
  const both = mine !== undefined && theirs !== undefined

  const pick = (i: number) => {
    haptic('light')
    const picks = {...g.picks, [space.me]: i}
    space.games.set(id, {...g, picks})
    if (picks[space.peer] === i) burst('💫', 8)
  }

  return (
    <>
      <div className="card center">
        <div className="small muted">{title}</div>
        <div className="col" style={{gap: 12, marginTop: 14}}>
          {[a, b].map((opt, i) => (
            <button key={i} className={cx('choice', mine === i && 'mine')} onClick={() => pick(i)}>
              {opt}
              {both && (
                <div className="tiny muted" style={{marginTop: 6}}>
                  {mine === i && 'You'} {mine === i && theirs === i && '&'} {theirs === i && space.peerProfile().name}
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="small" style={{marginTop: 16, minHeight: 20}}>
          {both ? (mine === theirs ? '✨ You match!' : 'Opposites attract 😄') : mine !== undefined ? `Waiting for ${space.peerProfile().name}…` : theirs !== undefined ? `${space.peerProfile().name} picked – your turn!` : 'Pick one'}
        </div>
      </div>
      <button className="btn block ghost" style={{marginTop: 14}} onClick={() => space.games.set(id, {idx: (g.idx + 1 + Math.floor(Math.random() * 5)) % deck.length, picks: {}})}>
        <Shuffle size={18} /> Next
      </button>
    </>
  )
}

// ---------- Truth or dare ----------

type TOD = {kind: 'truth' | 'dare'; text: string; for: string}

const TruthOrDare = ({space}: {space: Space}) => {
  const mode = (space.meta.get('mode') as Mode) ?? 'friends'
  const g = space.games.get('tod') as TOD | undefined
  const spin = (kind: 'truth' | 'dare') => {
    const deck = kind === 'truth' ? TRUTHS[mode] : DARES[mode]
    haptic('medium')
    space.games.set('tod', {kind, text: deck[Math.floor(Math.random() * deck.length)], for: g?.for === space.me ? space.peer : space.me})
  }
  const forName = g ? (g.for === space.me ? 'You' : space.peerProfile().name) : ''
  return (
    <>
      <div className="card center" style={{minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12}}>
        {g ? (
          <>
            <div className="chip on" style={{alignSelf: 'center'}}>
              {g.kind === 'truth' ? '🗣️ Truth' : '🔥 Dare'} for {forName}
            </div>
            <h2 style={{fontSize: 21}}>{g.text}</h2>
          </>
        ) : (
          <div className="muted">Pick truth or dare to start. Turns alternate automatically.</div>
        )}
      </div>
      <div className="grid2" style={{marginTop: 14}}>
        <button className="btn ghost" onClick={() => spin('truth')}>
          🗣️ Truth
        </button>
        <button className="btn" onClick={() => spin('dare')}>
          🔥 Dare
        </button>
      </div>
      {g && (
        <button className="btn block outline" style={{marginTop: 12}} onClick={() => goTab('chat')}>
          Answer in chat
        </button>
      )}
    </>
  )
}

export default function Games({game}: {game: 'game-ttt' | 'game-wyr' | 'game-tod' | 'game-tot'}) {
  const space = useActiveSpace()
  useSpaceVersion(space)
  if (!space) return null
  const titles = {'game-ttt': 'Tic-tac-toe', 'game-wyr': 'Would you rather', 'game-tod': 'Truth or dare', 'game-tot': 'This or that'}
  return (
    <div className="screen full">
      <TopBar title={titles[game]} sub={space.online ? `Playing live with ${space.peerProfile().name}` : 'Moves sync when you both are online'} />
      {game === 'game-ttt' && <TicTacToe space={space} />}
      {game === 'game-wyr' && <PickGame space={space} id="wyr" deck={WOULD_YOU_RATHER} title="Would you rather…" />}
      {game === 'game-tot' && <PickGame space={space} id="tot" deck={THIS_OR_THAT} title="This or that?" />}
      {game === 'game-tod' && <TruthOrDare space={space} />}
    </div>
  )
}
