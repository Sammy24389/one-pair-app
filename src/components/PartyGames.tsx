import {useEffect, useId, useRef, useState} from 'react'
import {CUP_TARGETS, GAME_INFO, type GameKind, type PartyGame} from '../lib/party-games'
import '../styles/party-games.css'

type Player = {id: string; name: string}
type Move = Record<string, unknown>
type Props = {game: PartyGame | null; players: Player[]; me: string; isHost: boolean; onStart: (kind: GameKind, players: string[]) => void; onMove: (move: Move) => void; error?: string}
const icons: Record<GameKind, string> = {darts: '🎯', words: '🔤', basketball: '🏀', paintball: '🎨', connect4: '🔴', checkers: '♟', mancala: '🫘', 'cup-pong': '🥤'}
const cups = CUP_TARGETS
const numbers = (value: unknown): number[] => Array.isArray(value) ? value as number[] : []

export default function PartyGames({game, players, me, isHost, onStart, onMove, error}: Props) {
  const [kind, setKind] = useState<GameKind>('darts')
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [catalog, setCatalog] = useState(false)
  const info = GAME_INFO.find(item => item.kind === kind)!
  const name = (id: string) => id === me ? 'You' : players.find(p => p.id === id)?.name || 'Disconnected player'
  const available = [...players.filter(p => p.id === me), ...players.filter(p => p.id !== me)]
  const selected = chosen === null ? available.slice(0, info.maxPlayers).map(p => p.id) : chosen.filter(id => players.some(p => p.id === id))
  const selection = isHost && !selected.includes(me) ? [me, ...selected] : selected
  const missing = !!game?.players.some(id => !players.some(p => p.id === id))
  const active = !!game && !game.winner && !game.draw && game.players[game.turn] === me && !missing
  const current = game && GAME_INFO.find(item => item.kind === game.kind)
  return <section className="party card" aria-label="Party games">
    <div className="party-heading"><div><span className="small muted">PLAY TOGETHER</span><h3>Game night</h3></div>{game && isHost && <button className="btn" onClick={() => setCatalog(!catalog)}>{catalog ? 'Back to game' : 'Choose another game'}</button>}</div>
    {error && <p role="alert">{error}</p>}
    {(!game || catalog) && <>
      <div className="party-catalog" aria-label="Choose a game">{GAME_INFO.map(item => <button key={item.kind} className="party-choice" aria-label={`${item.title} ${item.minPlayers === item.maxPlayers ? item.minPlayers : `${item.minPlayers}–${item.maxPlayers}`} players`} aria-pressed={kind === item.kind} onClick={() => {setKind(item.kind); setChosen(null)}}><span aria-hidden="true">{icons[item.kind]}</span><strong>{item.title}</strong><small>{item.minPlayers === item.maxPlayers ? item.minPlayers : `${item.minPlayers}–${item.maxPlayers}`} players</small></button>)}</div>
      <p className="party-rules">{info.rules}</p>
      {isHost ? <><fieldset className="party-player-picker"><legend>Players · choose {info.minPlayers === info.maxPlayers ? info.minPlayers : `${info.minPlayers}–${info.maxPlayers}`}</legend>{players.map(player => <label key={player.id}><input type="checkbox" disabled={player.id === me} checked={selection.includes(player.id)} onChange={() => setChosen(selection.includes(player.id) ? selection.filter(id => id !== player.id) : [...selection,player.id])} />{name(player.id)}</label>)}</fieldset><button className="btn primary" disabled={selection.length < info.minPlayers || selection.length > info.maxPlayers} onClick={() => {onStart(kind, selection); setCatalog(false)}}>Start {info.title}</button></> : <p className="muted">The group creator starts games. You can browse the rules while you wait.</p>}
    </>}
    {game && !catalog && <>
      <h4>{icons[game.kind]} {current?.title}</h4><p className="party-rules">{current?.rules}</p>
      <p className="party-turn" role="status" aria-live="polite">{game.winner ? `${name(game.winner)} won!` : game.draw ? 'Draw — well played!' : missing ? 'Game paused: waiting for a player to reconnect.' : game.players.includes(me) ? active ? 'Your turn' : `${name(game.players[game.turn])} to play` : `Watching · ${name(game.players[game.turn])} to play`}</p>
      {['connect4','checkers','paintball','words'].includes(game.kind) && <div className="party-scores" aria-label="Players">{game.players.map((player,index) => <span key={player}>{index+1}: {name(player)}{game.kind === 'words' ? ` · ${numbers(game.data.scores)[index]} / 10 words` : ''}</span>)}</div>}
      <GameBoard key={game.id} game={game} active={active} name={name} onMove={onMove} />
    </>}
  </section>
}

function GameBoard({game, active, name, onMove}: {game: PartyGame; active: boolean; name: (id: string) => string; onMove: (move: Move) => void}) {
  const [word,setWord] = useState('')
  const [from,setFrom] = useState<number | null>(null)
  const [paintAction,setPaintAction] = useState<'move' | 'shoot'>('move')
  const inputId = useId()
  useEffect(() => {setFrom(null)}, [game.version])
  const data = game.data
  if (game.kind === 'darts' || game.kind === 'basketball' || game.kind === 'cup-pong') return <AimGame game={game} active={active} name={name} onMove={onMove} />
  if (game.kind === 'words') return <div className="party-words"><p>Last word: <strong>{String(Array.isArray(data.words) && data.words.length ? data.words[data.words.length - 1] : 'Start with any word')}</strong></p><p className="small muted">Friendly spelling rules: no dictionary is used. Agree on words together.</p><form onSubmit={event => {event.preventDefault(); if (active && word.trim()) {onMove({word: word.trim()}); setWord('')}}}><label htmlFor={inputId}>Your word</label><input id={inputId} className="input" value={word} maxLength={20} disabled={!active} autoComplete="off" onChange={event => setWord(event.target.value)} /><button className="btn primary" disabled={!active || !word.trim()}>Play word</button></form><p className="small">{Array.isArray(data.words) ? (data.words as string[]).join(' → ') : ''}</p></div>
  const board = numbers(data.board)
  if (game.kind === 'connect4') return <div className="party-scroll"><div className="party-connect"><div className="party-board party-seven">{Array.from({length:7},(_,column) => <button className="btn" aria-label={`Drop in column ${column + 1}`} key={column} disabled={!active || !!board[column]} onClick={() => onMove({column})}>↓</button>)}</div><div className="party-board party-seven" role="group" aria-label="Four in a row board">{Array.from({length:42},(_,cell) => <div key={cell} className={`party-disc piece-${board[cell] || 0}`} aria-label={`Row ${Math.floor(cell/7)+1}, column ${cell%7+1}: ${board[cell] ? name(game.players[board[cell]-1]) : 'empty'}`}>{board[cell] ? board[cell] : ''}</div>)}</div></div></div>
  if (game.kind === 'checkers') return <><p className="small">{from === null ? 'Select your piece, then its destination. Captures are mandatory.' : `Piece at ${Math.floor(from/8)+1}, ${from%8+1} selected. Choose a destination.`}</p><div className="party-scroll"><div className="party-board party-eight" role="group" aria-label="Checkers board">{Array.from({length:64},(_,cell) => {const piece = board[cell] || 0; return <button key={cell} className={`party-square ${(Math.floor(cell/8)+cell%8)%2 ? 'dark' : ''} ${from === cell ? 'selected' : ''}`} disabled={!active || (Math.floor(cell/8)+cell%8)%2 === 0 || (from === null && piece !== game.turn+1 && piece !== game.turn+3) || (from === null && Number(data.forced)>=0 && data.forced !== cell)} aria-pressed={from === cell} aria-label={`Row ${Math.floor(cell/8)+1}, column ${cell%8+1}: ${piece ? `${name(game.players[(Math.abs(piece)-1)%2])} ${Math.abs(piece)>2 ? 'king' : 'piece'}` : 'empty'}`} onClick={() => {if (from === null || piece === game.turn+1 || piece === game.turn+3) setFrom(cell); else {onMove({from,to:cell}); setFrom(null)}}}>{piece ? <span className={`party-checker piece-${(Math.abs(piece)-1)%2+1}`}>{Math.abs(piece)>2 ? '♛' : '●'}</span> : ''}</button>})}</div></div>{from !== null && <button className="btn" onClick={() => setFrom(null)}>Cancel selection</button>}</>
  if (game.kind === 'mancala') return <Mancala game={game} active={active} name={name} onMove={onMove} />
  const health = numbers(data.health)
  const positions = Array.isArray(data.positions) ? data.positions as number[][] : []
  return <><div className="party-scores">{game.players.map((player,index) => <span key={player}>{name(player)} · {health[index]} lives</span>)}</div><div className="party-actions"><button className="btn" aria-pressed={paintAction === 'move'} disabled={!active} onClick={() => setPaintAction('move')}>Move one square</button><button className="btn" aria-pressed={paintAction === 'shoot'} disabled={!active} onClick={() => setPaintAction('shoot')}>Shoot</button></div><p className="small">Tap a square to {paintAction}. Shots travel in a straight line up to three squares.</p><div className="party-scroll"><div className="party-board party-seven" role="group" aria-label="Paintball arena">{Array.from({length:49},(_,cell) => {const occupants = positions.map((p,index) => health[index] > 0 && p[0]===cell%7 && p[1]===Math.floor(cell/7) ? index : -1).filter(i => i>=0); return <button key={cell} className="party-square" disabled={!active} aria-label={`Row ${Math.floor(cell/7)+1}, column ${cell%7+1}${occupants.map(i => `, ${name(game.players[i])}`).join('')}`} onClick={() => onMove({action:paintAction,x:cell%7,y:Math.floor(cell/7)})}>{occupants.map(i => <span key={i} className={`party-player piece-${i+1}`}>{i+1}</span>)}</button>})}</div></div></>
}

function Mancala({game,active,name,onMove}: {game:PartyGame; active:boolean; name:(id:string)=>string; onMove:(move:Move)=>void}) {
  const board = numbers(game.data.pits)
  const mySide = game.turn
  const otherSide = 1 - mySide
  return <div className="party-mancala"><p>{name(game.players[otherSide])} · Store: {board[otherSide * 7 + 6] || 0}</p><div className="party-pits">{[5,4,3,2,1,0].map(pit => <div className="party-pit" key={pit} aria-label={`Opponent pit ${pit+1}: ${board[pit+otherSide*7] || 0} seeds`}>{board[pit+otherSide*7] || 0}</div>)}</div><div className="party-pits">{[0,1,2,3,4,5].map(pit => <button className="party-pit" key={pit} aria-label={`Sow pit ${pit+1}, ${board[pit+mySide*7] || 0} seeds`} disabled={!active || !board[pit+mySide*7]} onClick={() => onMove({pit})}>{board[pit+mySide*7] || 0}</button>)}</div><p>{name(game.players[mySide])} · Store: {board[mySide * 7 + 6] || 0}</p><p className="small muted">The playable lower row shows the current player's six pits.</p></div>
}

function AimGame({game,active,name,onMove}: {game:PartyGame; active:boolean; name:(id:string)=>string; onMove:(move:Move)=>void}) {
  const [point,setPoint] = useState({x:.5,y:.5})
  const [running,setRunning] = useState(false)
  const [steady,setSteady] = useState(() => !!document.querySelector('[data-reduce-motion]') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [shotError,setShotError] = useState('')
  const [submitted,setSubmitted] = useState<number | null>(null)
  const [impact,setImpact] = useState<{x:number;y:number}|null>(null)
  const pointRef = useRef(point)
  const id = useId()
  useEffect(() => {setRunning(false); if (!active) setSubmitted(null)},[game.version,active])
  useEffect(() => {
    const hidden = () => {if (document.visibilityState === 'hidden') setRunning(false)}
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])
  useEffect(() => {
    if (submitted === null) return
    const timeout = setTimeout(() => setSubmitted(null), 2500)
    return () => clearTimeout(timeout)
  }, [submitted])
  useEffect(() => {
    if (!running || !active) return
    const start = performance.now()
    let frame = 0
    const tick = (now:number) => {const t=(now-start)/1000; const p={x:.5+.43*Math.sin(t*3.7),y:.5+.43*Math.sin(t*2.9+.8)};pointRef.current=p;setPoint(p);frame=requestAnimationFrame(tick)}
    frame=requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  },[running,active])
  const fire = () => {
    const p = steady ? point : pointRef.current
    setShotError(''); setSubmitted(game.version); setRunning(false); setImpact(p)
    try {onMove(p)} catch(error) {setSubmitted(null); setShotError(error instanceof Error ? error.message : 'Shot could not be sent. Try again.')}
  }
  const verb = game.kind === 'basketball' ? 'Shoot' : 'Throw'
  const scores = numbers(game.data.scores)
  const shots = numbers(game.data.shots)
  const target = game.kind === 'cup-pong' ? (() => {const racks = game.data.cups as number[][]; let next=(game.turn+1)%game.players.length; while(next !== game.turn && !racks[next].some(Boolean)) next=(next+1)%game.players.length;return next})() : 0
  return <div className="party-aim-game">{shotError && <p role="alert">{shotError}</p>}<div className="party-scores">{game.players.map((player,index) => <span key={player}>{name(player)} <strong>{scores[index] ?? '—'}</strong><small> · {shots[index] || 0} shots</small></span>)}</div>
    {game.kind === 'cup-pong' && <p className="small">Target: {name(game.players[target])}’s cups</p>}
    <div className={`party-aim party-aim-${game.kind}`} role="img" aria-label={`${game.kind === 'darts' ? 'Dartboard' : game.kind === 'basketball' ? 'Basketball court' : 'Cup pong table'} with aiming crosshair at ${Math.round(point.x*100)}, ${Math.round(point.y*100)} percent`}>
      {game.kind === 'darts' && <Dartboard />}
      {game.kind === 'basketball' && <><div className="party-backboard"/><div className="party-hoop"/><span className="party-ball" aria-hidden="true">🏀</span></>}
      {game.kind === 'cup-pong' && cups.map(([x,y],index) => (game.data.cups as number[][])[target][index] ? <span className="party-cup" key={index} style={{left:`${x*100}%`,top:`${y*100}%`}}>{index+1}</span> : null)}
      {impact && <svg className="party-trajectory" viewBox="0 0 100 100" aria-hidden="true"><path d={`M 50 96 Q 50 ${impact.y*100-20} ${impact.x*100} ${impact.y*100}`} /></svg>}
      {impact && <span className="party-impact" style={{left:`${impact.x*100}%`,top:`${impact.y*100}%`}}>●</span>}
      <span className="party-reticle" style={{left:`${point.x*100}%`,top:`${point.y*100}%`}}>+</span>
    </div>
    <label className="party-steady"><input type="checkbox" checked={steady} disabled={running} onChange={event => setSteady(event.target.checked)} />Reduced motion: manual aiming</label>
    {steady && <div className="party-aim-controls"><label htmlFor={`${id}-x`}>Horizontal aim: {Math.round(point.x*100)}%</label><input id={`${id}-x`} type="range" min="0" max="100" value={Math.round(point.x*100)} disabled={!active} onChange={e => setPoint({...point,x:Number(e.target.value)/100})}/><label htmlFor={`${id}-y`}>Vertical aim: {Math.round(point.y*100)}%</label><input id={`${id}-y`} type="range" min="0" max="100" value={Math.round(point.y*100)} disabled={!active} onChange={e => setPoint({...point,y:Number(e.target.value)/100})}/></div>}
    <p className="small muted">{steady ? 'Adjust the sliders, then take your shot.' : 'Start aiming, then stop the moving crosshair on your target.'}</p>
    <button className="btn primary" disabled={!active || submitted === game.version} onClick={() => {if (steady || running) fire(); else setRunning(true)}}>{steady || running ? `${verb} now` : 'Start aiming'}</button>
    {impact && <p className="small" role="status">Last impact: {Math.round(impact.x*100)}% across, {Math.round(impact.y*100)}% down.</p>}
  </div>
}

function Dartboard() {
  const sectors = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
  const polar = (radius:number, angle:number) => [50+radius*Math.sin(angle*Math.PI/180),50-radius*Math.cos(angle*Math.PI/180)]
  return <svg viewBox="0 0 100 100" className="party-dart-svg" aria-hidden="true">
    {sectors.map((value,index) => {
      const angle=index*18, a=polar(48,angle-9),b=polar(48,angle+9),label=polar(38,angle)
      return <g key={value}><path d={`M 50 50 L ${a.join(' ')} A 48 48 0 0 1 ${b.join(' ')} Z`} fill={index%2 ? '#d4c9b1' : '#302d30'}/><text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="central" fill={index%2 ? '#191919' : '#fff'} fontSize="4">{value}</text></g>
    })}
    <circle cx="50" cy="50" r="46" fill="none" stroke="#ad3f54" strokeWidth="4"/>
    <circle cx="50" cy="50" r="28" fill="none" stroke="#338b68" strokeWidth="4"/>
    <circle cx="50" cy="50" r="5.5" fill="#338b68"/><circle cx="50" cy="50" r="2.5" fill="#ad3f54"/>
  </svg>
}
