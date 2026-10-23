import {useEffect, useState} from 'react'
import {GAME_INFO,GAME_PROTOCOL,type GameKind,type PartyGame} from '../lib/party-games'
import {BOARD_INFO} from '../lib/board-games'
import {WORD_INFO} from '../lib/word-games'
import BoardGames from './BoardGames'
import WordGames from './WordGames'
import SportsGames from './SportsGames'
import Paintball from './Paintball'
import '../styles/party-games.css'
import '../styles/game-collection.css'

type Player={id:string;name:string}
type Props={game:PartyGame|null;players:Player[];me:string;isHost:boolean;onStart:(kind:GameKind,players:string[])=>void;onMove:(move:Record<string,unknown>)=>void;error?:string;compatible?:boolean}
const family=(kind:GameKind)=>BOARD_INFO.some(info=>info.kind===kind)?'boards':WORD_INFO.some(info=>info.kind===kind)?'words':'sports'
function shuffleSeats(players:string[]){
  const seats=[...players]
  for(let i=seats.length-1;i>0;i--){const range=i+1,limit=0x100000000-0x100000000%range;let value:number;do{value=crypto.getRandomValues(new Uint32Array(1))[0]}while(value>=limit);const j=value%range;[seats[i],seats[j]]=[seats[j],seats[i]]}
  return seats
}
function GameArtwork({kind}:{kind:GameKind}){
  const group=family(kind),index=GAME_INFO.findIndex(info=>info.kind===kind)
  return <svg className={`game-art art-${kind}`} viewBox="0 0 180 110" aria-hidden="true">
    <ellipse cx="90" cy="94" rx="65" ry="8" fill="#000" opacity=".2"/>
    {kind==='paintball'?<><path d="M25 64L90 35L155 64V92H25Z" fill="#244c50"/>{[46,90,134].map((x,i)=><g key={x}><rect x={x-12} y={43+i%2*12} width="24" height="35" rx="4" fill="#6cc6b7"/><ellipse cx={x} cy={43+i%2*12} rx="12" ry="4" fill="#b6e8d9"/></g>)}<circle cx="100" cy="64" r="12" fill="#f485ad"/></>:group==='boards'?kind==='mancala'?<><rect x="17" y="27" width="146" height="60" rx="28" fill="#b98551"/>{Array.from({length:12},(_,i)=><ellipse key={i} cx={40+(i%6)*20} cy={45+Math.floor(i/6)*25} rx="8" ry="9" fill="#563d2b"/>)}</>:kind==='sea-battle'?<><path d="M15 80 Q35 70 55 80 T95 80 T135 80 T175 80" stroke="#8bd9e6" fill="none" strokeWidth="4"/><path d="M35 59 H145 L128 78 H53 Z" fill="#a9bdcf"/><path d="M75 36 H106 V59 H75 Z M88 22 H94 V36" fill="#dce6ee" stroke="#dce6ee" strokeWidth="4"/></>:<><path d="M35 20 H150 L162 83 H21 Z" fill="#263b54" stroke="#8ca1b9" strokeWidth="2"/>{Array.from({length:24},(_,i)=><circle key={i} cx={45+(i%6)*18} cy={33+Math.floor(i/6)*13} r="5" fill={(i+index)%3===0?'#e8b95a':(i+index)%3===1?'#e56767':'#121f30'}/>)}</>:group==='words'?<>{['W','O','R','D'].map((letter,i)=><g key={letter} transform={`translate(${25+i*32} ${35+(i%2)*13}) rotate(${i%2?7:-7} 15 15)`}><rect width="30" height="38" rx="6" fill="#bc904b"/><rect width="30" height="32" rx="6" fill="#ffedbd"/><text x="15" y="23" textAnchor="middle" fontSize="22" fontWeight="800" fill="#3d3427">{letter}</text></g>)}</>:kind==='darts'||kind==='archery'?<>{[40,32,24,16,8].map((r,i)=><circle key={r} cx="90" cy="53" r={r} fill={['#f0e6cf','#263245','#c84956','#dfb254','#f5d67c'][i]}/>)}<path d="M91 51 L134 20 M120 22 L133 20 L132 34" fill="none" stroke="#eef5ff" strokeWidth="4"/></>:kind==='cup-pong'?<>{Array.from({length:6},(_,i)=><g key={i} transform={`translate(${55+i%3*30} ${32+Math.floor(i/3)*32})`}><path d="M-11 0 H11 L8 23 H-8 Z" fill="#d86070"/><ellipse rx="12" ry="5" fill="#f5eee7"/><ellipse rx="8" ry="3" fill="#783244"/></g>)}<circle cx="133" cy="22" r="8" fill="#fff7de"/></>:<><path d="M100 17 H157 V50 H100 Z" fill="#c3d9ed" stroke="#fff" strokeWidth="3"/><ellipse cx="126" cy="52" rx="20" ry="7" fill="none" stroke="#f7a45d" strokeWidth="5"/><circle cx="66" cy="66" r="27" fill="#e99a4b" stroke="#7c492b" strokeWidth="3"/><path d="M40 66 H93 M66 40 V92 M47 47 Q80 67 47 85 M85 47 Q52 66 85 85" fill="none" stroke="#7c492b" strokeWidth="2"/></>}
  </svg>
}
export default function PartyGames({game,players,me,isHost,onStart,onMove,error,compatible=true}:Props){
  const [kind,setKind]=useState<GameKind>('connect4'),[category,setCategory]=useState('all'),[chosen,setChosen]=useState<string[]|null>(null),[catalog,setCatalog]=useState(false),[localError,setLocalError]=useState('')
  const info=GAME_INFO.find(info=>info.kind===kind)!,current=game&&GAME_INFO.find(info=>info.kind===game.kind)
  const name=(id:string)=>id===me?'You':players.find(player=>player.id===id)?.name||'Disconnected player'
  const available=[...players.filter(player=>player.id===me),...players.filter(player=>player.id!==me)]
  const selected=chosen===null?available.slice(0,info.maxPlayers).map(player=>player.id):chosen.filter(id=>players.some(player=>player.id===id))
  const selection=isHost&&!selected.includes(me)?[me,...selected]:selected
  const missing=!!game?.players.some(id=>!players.some(player=>player.id===id))
  const modern=game?.data.collectionVersion===GAME_PROTOCOL&&!!current
  const active=!!game&&modern&&!game.winner&&!game.draw&&!missing&&compatible&&game.players[game.turn]===me
  useEffect(()=>{setLocalError('')},[game?.id,game?.version])
  const run=(action:()=>void)=>{setLocalError('');try{action()}catch(e){setLocalError(e instanceof Error?e.message:'Please try again.')}}
  return <section className="party card game-collection" aria-label="Party games">
    <header className="collection-heading"><div><span className="collection-eyebrow">PLAY TOGETHER</span><h2>{game&&!catalog?current?.title||'Previous game':'Pick your next match'}</h2><p className="muted small">{game&&!catalog?'Connected friends. One shared match.':'13 games · boards, words and gesture play'}</p></div>{game&&isHost&&<button className="btn" onClick={()=>setCatalog(!catalog)}>{catalog?'Back to game':'Choose another game'}</button>}</header>
    {(error||localError)&&<p role="alert">{localError||error}</p>}
    {(!game||catalog)&&<>
      <nav className="collection-tabs" aria-label="Game categories">{[['all','All games'],['boards','Boards'],['words','Words'],['sports','Sports']].map(([value,title])=><button type="button" className="btn" key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{title}</button>)}</nav>
      <div className="collection-catalog" aria-label="Choose a game">{GAME_INFO.filter(item=>category==='all'||family(item.kind)===category).map(item=><button type="button" key={item.kind} className={`collection-choice family-${family(item.kind)}`} aria-label={`${item.title} ${item.minPlayers===item.maxPlayers?item.minPlayers:`${item.minPlayers}–${item.maxPlayers}`} players`} aria-pressed={kind===item.kind} onClick={()=>{setKind(item.kind);setChosen(null)}}><GameArtwork kind={item.kind}/><span><strong>{item.title}</strong><small>{item.minPlayers===item.maxPlayers?item.minPlayers:`${item.minPlayers}–${item.maxPlayers}`} players</small></span></button>)}</div>
      <section className="collection-setup"><h3>{info.title}</h3><p className="party-rules">{info.rules}</p>{isHost?<><fieldset className="party-player-picker"><legend>Choose {info.minPlayers===info.maxPlayers?info.minPlayers:`${info.minPlayers}–${info.maxPlayers}`} players</legend>{players.map(player=><label key={player.id}><input type="checkbox" disabled={player.id===me} checked={selection.includes(player.id)} onChange={()=>setChosen(selection.includes(player.id)?selection.filter(id=>id!==player.id):[...selection,player.id])}/>{name(player.id)}</label>)}</fieldset><button className="btn primary block" disabled={selection.length<info.minPlayers||selection.length>info.maxPlayers} onClick={()=>run(()=>{onStart(kind,shuffleSeats(selection));setCatalog(false)})}>Start {info.title}</button></>:<p className="muted">The group creator starts games. Browse while you wait.</p>}<p className="tiny muted">Seats shuffle each match. Board games can have an opening advantage; swap sides for a rematch. Everyone should use this app version.</p></section>
    </>}
    {game&&!catalog&&<>{!modern?<p role="status">This match uses earlier rules. The creator can choose a new game to use the updated collection.</p>:<>
      <p className="party-turn" role="status" aria-live="polite">{game.winner?`${name(game.winner)} won!`:game.draw?'Draw — well played!':missing?'Game paused: waiting for a player to reconnect.':!compatible?'Game paused: a player needs to update the app.':!game.players.includes(me)?`Watching · ${name(game.players[game.turn])} to play`:active?'Your turn':`${name(game.players[game.turn])} to play`}</p>
      <details className="collection-rules"><summary>How to play</summary><p>{current?.rules}</p></details>
      {game.kind==='paintball'?<Paintball key={game.id} game={game} active={active} me={me} name={name} onMove={move=>run(()=>onMove(move))}/>:family(game.kind)==='boards'?<BoardGames key={game.id} game={game} active={active} me={me} name={name} onMove={move=>run(()=>onMove(move))}/>:family(game.kind)==='words'?<WordGames key={game.id} game={game} active={active} me={me} name={name} onMove={move=>run(()=>onMove(move))}/>:<SportsGames key={game.id} game={game} active={active} me={me} name={name} onMove={move=>run(()=>onMove(move))}/>}
    </>}</>}
  </section>
}
