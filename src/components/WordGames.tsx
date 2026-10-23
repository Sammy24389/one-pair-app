import {useEffect, useId, useRef, useState} from 'react'
import type {GameViewProps} from '../lib/game-types'
import {isGameWord, pieceCells, wordLetters, wordPieceBoard, wordPoints, type LetterPiece} from '../lib/word-games'
import '../styles/word-games.css'

export default function WordGames({game,active,name,onMove}:GameViewProps) {
  const [path,setPath]=useState<number[]>([])
  const [mode,setMode]=useState<'word'|'move'>(game.kind==='word-bites'?'move':'word')
  const [piece,setPiece]=useState<number|null>(null)
  const [notice,setNotice]=useState('')
  const pathRef=useRef<number[]>([]),boardRef=useRef<HTMLDivElement>(null)
  const selecting=useRef(false),dragPiece=useRef<number|null>(null),moved=useRef(false)
  const labelId=useId()
  const scores=game.data.scores as number[],found=game.data.found as string[][],done=game.data.done as boolean[],shifts=game.data.shifts as number[]
  const pieces=(game.data.pieces as LetterPiece[][])[game.turn]
  const letters=game.kind==='word-bites'?wordPieceBoard(pieces):[...wordLetters(game)]
  const size=game.kind==='word-bites'?6:game.kind==='word-hunt'?4:6
  const word=path.map(cell=>letters[cell]).join('').toLowerCase()
  const duplicate=found[game.turn].includes(word)
  const canSubmit=active&&isGameWord(word)&&!duplicate
  function updatePath(next:number[]){pathRef.current=next;setPath(next)}
  useEffect(()=>{updatePath([]);setPiece(null);selecting.current=false;dragPiece.current=null;setNotice('')},[game.id,game.version,active])
  useEffect(()=>{const cancel=()=>{selecting.current=false;dragPiece.current=null;pathRef.current=[];setPath([])};window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel)}},[])
  function append(cell:number) {
    if(!active||!letters[cell])return
    const previous=pathRef.current
    const next=(()=>{
      if(previous.at(-2)===cell)return previous.slice(0,-1)
      if(previous.includes(cell)||previous.length===8)return previous
      if(previous.length&&game.kind==='word-hunt') {const last=previous[previous.length-1];if(Math.abs(last%4-cell%4)>1||Math.abs(Math.floor(last/4)-Math.floor(cell/4))>1)return previous}
      if(previous.length&&game.kind==='word-bites') {const last=previous[previous.length-1],step=cell-last;if(previous.length===1?(step!==1&&step!==6):(step!==previous[1]-previous[0]))return previous;if(step===1&&Math.floor(last/6)!==Math.floor(cell/6))return previous}
      return [...previous,cell]
    })()
    updatePath(next)
  }
  function movePiece(id:number,cell:number) {
    const target=pieces[id],x=cell%6,y=Math.floor(cell/6)
    if(x+(target.vertical?1:target.text.length)>6||y+(target.vertical?target.text.length:1)>6||pieceCells({...target,x,y}).some(c=>pieces.some(other=>other.id!==id&&pieceCells(other).includes(c)))) {setNotice('That piece needs an empty space.');return}
    if(target.x===x&&target.y===y)return
    onMove({action:'shift',piece:id,x,y});setPiece(null);setNotice('')
  }
  function choose(cell:number) {
    if(!active)return
    if(game.kind==='word-bites'&&mode==='move') {
      if(piece!==null){movePiece(piece,cell);return}
      const selected=pieces.find(p=>pieceCells(p).includes(cell));if(selected)setPiece(selected.id)
    } else append(cell)
  }
  function cellAt(x:number,y:number) {
    const board=boardRef.current
    if(!board)return null
    const el=document.elementFromPoint?.(x,y)?.closest<HTMLElement>('[data-word-cell]')
    if(el&&board.contains(el))return Number(el.dataset.wordCell)
    for(const tile of board.querySelectorAll<HTMLElement>('[data-word-cell]')){const r=tile.getBoundingClientRect();if(r.width&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return Number(tile.dataset.wordCell)}
    return null
  }
  function submit(){const selected=pathRef.current,chosen=selected.map(cell=>letters[cell]).join('').toLowerCase();if(active&&isGameWord(chosen)&&!found[game.turn].includes(chosen)){onMove({path:[...selected]});updatePath([])}}
  return <section className={`word-studio word-${game.kind}`} aria-labelledby={labelId}>
    <div className="word-scoreboard" aria-label="Scores">{game.players.map((player,i)=><div key={player} className={i===game.turn?'current':''}><span>{name(player)}</span><strong>{scores[i].toLocaleString()}</strong><small>{done[i]?'Finished':`${found[i].length}/6 words`}</small></div>)}</div>
    <div className="word-stage-heading"><div><span className="word-eyebrow">{game.kind==='word-hunt'?'THE LETTER TRAIL':game.kind==='anagrams'?'MIX. MATCH. DISCOVER.':'MAKE ROOM FOR WORDS'}</span><h4 id={labelId}>{game.kind==='word-hunt'?'Follow your next word':game.kind==='anagrams'?'Six letters. New possibilities.':'Slide pieces. Build words.'}</h4></div><span className="word-round">{found[game.turn].length} / 6</span></div>
    <p className="word-instruction">{game.kind==='word-hunt'?'Trace neighboring letters, then release to score. Diagonals count. Tap or use the keyboard to compose too.':game.kind==='anagrams'?'Sweep across letters in any order, then release to score. You can also tap or use the keyboard to compose.':mode==='move'?'Drag a piece by its first letter to an empty square, or select it and tap a destination. Pieces keep their shape.':'Trace a word left to right or top to bottom, then release to score. Letters must touch.'}</p>
    {game.kind==='word-bites'&&<div className="word-tools"><div role="group" aria-label="Word Bites action"><button type="button" aria-pressed={mode==='move'} disabled={!active} onClick={()=>{setMode('move');updatePath([])}}>Move pieces</button><button type="button" aria-pressed={mode==='word'} disabled={!active} onClick={()=>{setMode('word');setPiece(null)}}>Trace word</button></div><small>{40-shifts[game.turn]} moves left</small></div>}
    <div className="word-board-scroll"><div ref={boardRef} className={`word-board word-grid-${size}`} role="group" aria-label={game.kind==='anagrams'?'Anagram letter rack':game.kind==='word-hunt'?'Word Hunt letter board':'Word Bites board'} onPointerMove={event=>{if(!active)return;const cell=cellAt(event.clientX,event.clientY);if(cell===null)return;if(selecting.current)append(cell);if(dragPiece.current!==null)moved.current=true}} onPointerUp={event=>{if(dragPiece.current!==null&&moved.current){const cell=cellAt(event.clientX,event.clientY);if(cell!==null)movePiece(dragPiece.current,cell)}if(selecting.current)submit();selecting.current=false;dragPiece.current=null;if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{selecting.current=false;dragPiece.current=null;updatePath([])}}>
      {letters.map((letter,cell)=>{const part=game.kind==='word-bites'?pieces.find(p=>pieceCells(p).includes(cell)):undefined;return <button type="button" key={cell} data-word-cell={cell} disabled={!active||(mode==='word'&&!letter)} aria-label={`${letter||'Empty'}, ${game.kind==='anagrams'?`tile ${cell+1}`:`row ${Math.floor(cell/size)+1}, column ${cell%size+1}`}${part?`, piece ${part.id+1}`:''}`} aria-pressed={path.includes(cell)||!!part&&piece===part.id} className={`word-tile ${letter?'has-letter':'word-empty'} ${path.includes(cell)?'traced':''} ${part?`piece-${part.id%4} ${part.vertical?'vertical':'horizontal'} ${piece===part.id?'chosen':''}`:''}`} onPointerDown={event=>{if(event.button!==0||!active)return;boardRef.current?.setPointerCapture?.(event.pointerId);if(game.kind==='word-bites'&&mode==='move'){const picked=pieces.find(p=>pieceCells(p)[0]===cell);dragPiece.current=picked?.id??null;moved.current=false;choose(cell)}else{selecting.current=true;append(cell)}}} onClick={event=>{if(event.detail===0)choose(cell)}}>{letter}<small>{path.includes(cell)?path.indexOf(cell)+1:''}</small></button>})}
    </div></div>
    <div className="word-composer"><output aria-label="Selected word" aria-live="polite">{word||'Your word'}</output><span>{canSubmit?`+${wordPoints(word)}`:duplicate?'Already found':word.length>=3?'Not in dictionary':'3–8 letters'}</span></div>
    <div className="word-submit-actions"><button className="btn" type="button" disabled={!active||!path.length} onClick={()=>updatePath(pathRef.current.slice(0,-1))}>Undo letter</button><button className="btn primary" type="button" disabled={!canSubmit} onClick={submit}>Submit word</button><button className="btn" type="button" disabled={!active||!path.length} onClick={()=>updatePath([])}>Clear</button></div>
    {notice&&<p role="status" className="word-feedback">{notice}</p>}
    <div className="word-found"><h5>{name(game.players[game.turn])} found</h5>{found[game.turn].length?<ul>{found[game.turn].map(w=><li key={w}>{w}<span>+{wordPoints(w)}</span></li>)}</ul>:<p>Find your first word.</p>}</div>
    <div className="word-footer"><small>Same puzzle for every player · offline English dictionary · no clock</small><button className="btn" type="button" disabled={!active} onClick={()=>onMove({action:'finish'})}>Finish turn</button></div>
  </section>
}
