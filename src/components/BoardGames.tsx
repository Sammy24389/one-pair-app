import {useEffect,useId,useRef,useState} from 'react'
import {Chess} from 'chess.js'
import type {GameViewProps} from '../lib/game-types'
import {checkersMoves,indexSquare,legalBoardMoves} from '../lib/board-games'
import '../styles/board-games.css'
import MancalaBoard from './MancalaBoard'

const pieceNames:Record<string,string>={k:'king',q:'queen',r:'rook',b:'bishop',n:'knight',p:'pawn'}
export default function BoardGames(props:GameViewProps){
  const {game,active,me,onMove}=props
  const [selected,setSelected]=useState<number|null>(null),[promotion,setPromotion]=useState('q'),[coordinate,setCoordinate]=useState('A1')
  const id=useId(),drag=useRef<number|null>(null),suppressClick=useRef(false)
  useEffect(()=>setSelected(null),[game.version])
  const d=game.data,side=game.players.indexOf(me),board=Array.isArray(d.board)?d.board as number[]:[],last=Array.isArray(d.lastMove)?d.lastMove as number[]:[]
  if(game.kind==='mancala')return <MancalaBoard {...props}/>
  if(game.kind==='connect4')return <div className="bg-connect-wrap"><div className="bg-drop-row">{Array.from({length:7},(_,column)=><button key={column} aria-label={`Drop into column ${column+1}`} disabled={!active||board[column]!==0} onClick={()=>onMove({column})}><span aria-hidden="true">↓</span></button>)}</div><div className="bg-connect" aria-label="Four in a Row board" onPointerDown={e=>{if(active)e.currentTarget.setPointerCapture?.(e.pointerId)}} onPointerUp={e=>{if(!active)return;const bounds=e.currentTarget.getBoundingClientRect(),column=Math.max(0,Math.min(6,Math.floor((e.clientX-bounds.left)/bounds.width*7)));if(board[column]===0)onMove({column})}}>{board.map((piece,i)=><div className="bg-hole" key={i}><span className={`bg-disc bg-side-${piece} ${last.includes(i)?'bg-fall':''}`} aria-label={piece?`${piece===1?'Coral':'Gold'} disc, row ${Math.floor(i/7)+1}, column ${i%7+1}`:undefined}/></div>)}</div><div className="bg-connect-feet"/><BoardLegend {...props}/></div>
  const size=game.kind==='gomoku'?15:8,isChess=game.kind==='chess',chess=isChess?new Chess(String(d.fen)):null
  const cells=chess?chess.board().flat().map(p=>p?{glyph:p.type,side:p.color==='w'?1:2,name:`${p.color==='w'?'White':'Black'} ${pieceNames[p.type]}`} :null):board.map(piece=>piece?{glyph:piece>2?'♛':'',side:piece===1||piece===3?1:2,name:game.kind==='checkers'?`${piece===1||piece===3?'Coral':'Ivory'} ${piece>2?'king':'checker'}`:`${piece===1?'Dark':'Light'} stone`}:null)
  const targets=legalBoardMoves(game,selected===null?undefined:selected),flip=isChess?side===1:game.kind==='checkers'?side===0:side===1
  const options=game.kind==='checkers'?(()=>{const jumps=checkersMoves(board,game.turn,true,d.forced as number);return jumps.length?jumps:checkersMoves(board,game.turn,false)})():[]
  const playableFrom=(i:number)=>isChess?chess!.get(indexSquare(i))?.color===(game.turn===0?'w':'b'):options.some(([from])=>from===i)
  const choose=(to:number)=>{
    if(!active)return
    if(isChess||game.kind==='checkers'){
      if(selected!==null&&targets.includes(to)){onMove({from:selected,to,...(isChess?{promotion}:{})});setSelected(null)}
      else setSelected(playableFrom(to)?to:null)
    }else if(targets.includes(to))onMove({to})
  }
  return <div className={`bg-game bg-${game.kind}`}>
    {isChess&&<div className="bg-chess-tools"><label htmlFor={`${id}-promotion`}>Promote pawn to</label><select id={`${id}-promotion`} value={promotion} onChange={e=>setPromotion(e.target.value)}>{['q','r','b','n'].map(p=><option value={p} key={p}>{pieceNames[p]}</option>)}</select><span role="status">{chess!.isCheck()?'Check':game.turn===0?'White to move':'Black to move'}</span></div>}
    <div className={`bg-grid bg-grid-${size}`} role="group" aria-label={`${game.kind} board`} style={{gridTemplateColumns:`repeat(${size},1fr)`}}>{Array.from({length:size*size},(_,j)=>flip?size*size-1-j:j).map(i=>{
      const piece=cells[i],target=selected!==null&&targets.includes(i),label=`${String.fromCharCode(65+i%size)}${size-Math.floor(i/size)}`
      return <button key={i} aria-label={`${label}${piece?`, ${piece.name}`:''}${target?', legal destination':''}`} aria-pressed={selected===i} className={`bg-square ${(Math.floor(i/size)+i%size)%2?'bg-dark':'bg-light'} ${selected===i?'bg-selected':''} ${last.includes(i)?'bg-last':''} ${target?'bg-target':''}`} disabled={!active} onPointerDown={e=>{suppressClick.current=false;if(active&&(isChess||game.kind==='checkers')&&playableFrom(i)){drag.current=i;setSelected(i);e.currentTarget.setPointerCapture?.(e.pointerId)}}} onPointerMove={e=>{if(drag.current!==i)return;const rect=e.currentTarget.getBoundingClientRect(),piece=e.currentTarget.querySelector<HTMLElement>('.bg-piece');if(piece){piece.style.transform=`translate(${e.clientX-rect.left-rect.width/2}px,${e.clientY-rect.top-rect.height/2}px) scale(1.12)`;e.currentTarget.style.zIndex='10'}}} onPointerUp={e=>{const piece=e.currentTarget.querySelector<HTMLElement>('.bg-piece');if(piece)piece.style.transform='';e.currentTarget.style.zIndex='';const from=drag.current;drag.current=null;if(from===null)return;const cell=document.elementFromPoint?.(e.clientX,e.clientY)?.closest<HTMLButtonElement>('[data-board-cell]');const to=Number(cell?.dataset.boardCell);if(cell&&e.currentTarget.parentElement?.contains(cell)&&to!==from&&legalBoardMoves(game,from).includes(to)){suppressClick.current=true;onMove({from,to,...(isChess?{promotion}:{})});setSelected(null)}}} onPointerCancel={e=>{drag.current=null;const piece=e.currentTarget.querySelector<HTMLElement>('.bg-piece');if(piece)piece.style.transform='';e.currentTarget.style.zIndex=''}} data-board-cell={i} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}choose(i)}}>{piece&&<span className={`bg-piece bg-side-${piece.side} ${last.includes(i)?'bg-arrive':''}`}>{isChess?<ChessPiece type={piece.glyph}/>:piece.glyph}</span>}{!piece&&target&&<span className="bg-marker"/>}{game.kind==='gomoku'&&[48,56,112,168,176].includes(i)&&!piece&&<span className="bg-star"/>}</button>
    })}</div>
    <div className="bg-coordinate"><label htmlFor={`${id}-square`}>{selected===null?'Square':'Destination'}</label><input id={`${id}-square`} value={coordinate} maxLength={3} onChange={e=>setCoordinate(e.target.value.toUpperCase())} placeholder="A1"/><button className="btn" disabled={!active} onClick={()=>{const match=/^([A-O])(1[0-5]|[1-9])$/.exec(coordinate);if(match){const col=match[1].charCodeAt(0)-65,row=size-Number(match[2]);if(col<size&&row>=0)choose(row*size+col)}}}>Select</button></div>
    <p className="small muted">{game.kind==='checkers'?(d.forced!==-1?'Continue the jump with the highlighted piece.':'Drag a piece to a highlighted square, or tap piece then destination. Captures are required.'):isChess?'Drag a piece to a highlighted destination, or tap piece then destination.':'Place a stone on an intersection. Five in a line wins.'}</p><BoardLegend {...props}/>
  </div>
}
function BoardLegend({game,name}:GameViewProps){return <div className="bg-legend">{game.players.map((player,i)=><span key={player}><i className={`bg-side-${i+1}`}/>{name(player)}</span>)}</div>}

function ChessPiece({type}:{type:string}){
  const paths:Record<string,string>={p:'M22 36Q24 31 27 25A9 9 0 1 1 37 25Q40 31 42 36L44 46H20Z',r:'M19 10H25V16H29V10H35V16H39V10H45V24L40 28V44H24V28L19 24Z',n:'M19 44L23 33 34 25 25 27 19 23 28 12 38 8 39 15Q49 21 46 43ZM28 16L31 21 33 17Z',b:'M24 44L28 30Q17 24 26 15L32 7 38 15Q47 24 36 30L40 44ZM29 16L35 23',q:'M18 17L26 24 32 13 38 24 46 17 40 43H24ZM16 14A3 3 0 1 0 22 14A3 3 0 1 0 16 14M29 9A3 3 0 1 0 35 9A3 3 0 1 0 29 9M43 14A3 3 0 1 0 49 14A3 3 0 1 0 43 14',k:'M29 6H35V12H41V18H35V23H29V18H23V12H29ZM20 25Q25 20 32 26Q39 20 44 25L40 43H24Z'}
  return <svg className="bg-chess-vector" viewBox="0 0 64 64" aria-hidden="true"><path d={paths[type]} fill="currentColor" stroke="var(--piece-edge)" strokeWidth="2" strokeLinejoin="round"/><path d="M21 44H43L47 52H17ZM16 53H48V57H16Z" fill="currentColor" stroke="var(--piece-edge)" strokeWidth="2"/><path d="M25 47H39" stroke="var(--piece-edge)" strokeWidth="1.5"/></svg>
}
