import {useEffect,useRef,useState} from 'react'
import type {GameViewProps,PartyGame} from '../lib/game-types'

type Frame={pits:number[];at:number;held:number;label:string}
// Presentation-only replay. Canonical state still comes exclusively from the host.
export function mancalaFrames(before:PartyGame,after:PartyGame):Frame[]{
  const start=after.data.lastPit
  if(before.id!==after.id||after.version!==before.version+1||!Number.isInteger(start)||Math.floor(Number(start)/7)!==before.turn||Number(start)%7>5)return []
  const pits=[...(before.data.pits as number[])],side=before.turn,store=side*7+6,skip=(1-side)*7+6
  let held=pits[Number(start)],at=Number(start)
  if(!held)return []
  pits[at]=0
  const frames:Frame[]=[{pits:[...pits],at,held,label:'Scooping seeds'}]
  while(held){at=(at+1)%14;if(at===skip)continue;pits[at]++;held--;frames.push({pits:[...pits],at,held,label:'Dropping one seed'})}
  if(at!==store&&Math.floor(at/7)===side&&pits[at]===1&&pits[12-at]>0){held=pits[at]+pits[12-at];pits[at]=0;pits[12-at]=0;frames.push({pits:[...pits],at:12-at,held,label:'Collecting captured seeds'});pits[store]+=held;frames.push({pits:[...pits],at:store,held:0,label:'Capture into store'})}
  if(pits.slice(0,6).every(v=>!v)||pits.slice(7,13).every(v=>!v)){for(const owner of [0,1]){let total=0;for(let j=0;j<6;j++){total+=pits[owner*7+j];pits[owner*7+j]=0}if(total){frames.push({pits:[...pits],at:owner*7+2,held:total,label:'Collecting remaining seeds'});pits[owner*7+6]+=total;frames.push({pits:[...pits],at:owner*7+6,held:0,label:'Final seeds into store'})}}}
  // Never invent a replay for a divergent snapshot or missed moves.
  return JSON.stringify(pits)===JSON.stringify(after.data.pits)?frames:[]
}
function Seeds({count}:{count:number}){return <span className="bg-seeds" aria-hidden="true">{Array.from({length:Math.min(count,24)},(_,i)=><i key={i} style={{left:`${18+(i*31)%66}%`,top:`${16+(i*23)%64}%`,transform:`rotate(${i*47}deg)`}}/>)}</span>}
export default function MancalaBoard({game,active,me,name,onMove}:GameViewProps){
  const previous=useRef(game),[frame,setFrame]=useState<Frame|null>(null),board=useRef<HTMLDivElement>(null),[position,setPosition]=useState({x:0,y:0})
  useEffect(()=>{
    const before=previous.current;previous.current=game
    const frames=mancalaFrames(before,game)
    if(!frames.length||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setFrame(null);return}
    setFrame(frames[0]);let index=0
    const timer=window.setInterval(()=>{index++;if(index>=frames.length){window.clearInterval(timer);setFrame(null)}else setFrame(frames[index])},360)
    return()=>window.clearInterval(timer)
  },[game.id,game.version])
  useEffect(()=>{if(!frame||!board.current)return;const pit=board.current.querySelector<HTMLElement>(`[data-pit="${frame.at}"]`);if(pit){const a=pit.getBoundingClientRect(),b=board.current.getBoundingClientRect();setPosition({x:a.left-b.left+a.width/2,y:a.top-b.top+a.height/2})}},[frame,me])
  const pits=frame?.pits||game.data.pits as number[],bottom=me===game.players[1]?1:0,top=1-bottom
  const store=(owner:number)=><div className="bg-store" data-pit={owner*7+6}><Seeds count={pits[owner*7+6]}/><strong>{pits[owner*7+6]}</strong></div>
  return <div className="bg-mancala"><p className="bg-mancala-label">{name(game.players[top])}</p><div className="bg-mancala-scroll"><div className="bg-kalah" ref={board}>{store(top)}<div className="bg-pit-rows">{[top,bottom].map((owner,row)=><div className="bg-pit-row" key={owner}>{Array.from({length:6},(_,j)=>row===0?5-j:j).map(pit=><button key={pit} data-pit={owner*7+pit} className={`bg-pit ${game.data.lastPit===owner*7+pit?'bg-last':''}`} aria-label={`${name(game.players[owner])}, pit ${pit+1}, ${pits[owner*7+pit]} seeds`} disabled={!active||!!frame||game.turn!==owner||!pits[owner*7+pit]} onClick={()=>onMove({pit})}><Seeds count={pits[owner*7+pit]}/><strong>{pits[owner*7+pit]}</strong></button>)}</div>)}</div>{store(bottom)}{frame&&<div className="bg-sowing-hand" aria-hidden="true" style={{left:position.x,top:position.y}}><svg viewBox="0 0 90 70"><path d="M8 49Q0 36 9 31L24 39 17 14Q15 6 22 5Q29 5 30 14L37 32 33 7Q33 0 39 1Q45 0 46 8L49 31 51 10Q53 3 59 6Q64 8 62 17L61 37 69 25Q74 20 79 25Q83 29 78 36L67 56Q59 69 43 67L22 64Z" fill="#dba677" stroke="#8b593d" strokeWidth="2"/></svg><div className="bg-held-seeds"><Seeds count={frame.held}/></div><span className="bg-held-count">{frame.held}</span></div>}</div></div><p role="status" className="bg-sowing-caption">{frame?`${frame.label} · ${frame.held} in hand`:'Tap a pit to scoop and sow its seeds.'}</p><p className="bg-mancala-label">{name(game.players[bottom])}</p></div>
}
