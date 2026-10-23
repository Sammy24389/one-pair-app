import {useEffect,useId,useRef,useState} from 'react'
import type {GameViewProps} from '../lib/game-types'
import {newPaintChoice,paintCommit,validPaintChoice,type PaintChoice} from '../lib/paintball'
import '../styles/paintball.css'
const STORE='onepair.paintball.pending.v1'
type Saved={key:string;at:number;choice:PaintChoice}
function saved():Saved[]{try{const list=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(list)?list.filter(x=>x&&typeof x.key==='string'&&x.key.length<250&&Number.isFinite(x.at)&&Date.now()-x.at<7*86400000&&validPaintChoice(x.choice)).slice(-24):[]}catch{return []}}
export default function Paintball({game,me,active,name,onMove}:GameViewProps){
 const side=game.players.indexOf(me),round=Number(game.data.round),key=JSON.stringify([game.id,me,round]),commits=game.data.commits as (string|null)[],choices=game.data.choices as (PaintChoice|null)[]
 const [cover,setCover]=useState(1),[aim,setAim]=useState(1),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const gesture=useRef<{id:number;mode:'hide'|'aim';x:number;y:number}|null>(null),auto=useRef(''),uid=useId()
 const history=game.data.history as {choices:PaintChoice[]}[],last=history.at(-1)
 const canChoose=active&&side>=0&&!commits[side]&&!busy
 function lock(target:number){
  if(!canChoose)return
  const original=saved().find(x=>x.key===key)
  const choice=original?.choice||newPaintChoice(cover,target)
  setCover(choice.cover);setAim(choice.target)
  try{localStorage.setItem(STORE,JSON.stringify([...saved().filter(x=>x.key!==key),{key,at:Date.now(),choice}].slice(-24)));setBusy(true);onMove({action:'commit',commit:paintCommit(game,side,choice)});setError(original?'Resending your original locked choice.':'')}catch{setBusy(false);setError('Could not save your private choice. Free device storage and retry.')}
 }
 function reveal(){const choice=saved().find(x=>x.key===key)?.choice;if(!choice){setError('Your locked choice is missing. Return to the device where you made this choice.');return}onMove({action:'reveal',choice})}
 useEffect(()=>{setBusy(false);gesture.current=null;setError('')},[game.id,game.version])
 useEffect(()=>{const cancel=()=>{gesture.current=null};window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);return()=>{window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel)}},[])
 useEffect(()=>{if(!busy)return;const timer=setTimeout(()=>{setBusy(false);setError('Waiting for confirmation. Check the connection before trying again.')},4000);return()=>clearTimeout(timer)},[busy])
 useEffect(()=>{const token=game.id+':'+game.version;if(active&&side>=0&&commits.every(Boolean)&&!choices[side]&&auto.current!==token){auto.current=token;reveal()}},[game.id,game.version,active,side])
 const lane=(x:number,width:number)=>Math.max(0,Math.min(2,Math.floor(x/width*3)))
 return <section className="paint-arena" aria-label="Paintball arena">
  <div className="paint-score">{game.players.map((p,i)=><div key={p}><span>{name(p)}</span><strong>{(game.data.scores as number[])[i]} / 3</strong></div>)}<span>Exchange {Math.min(round+1,7)} / 7</span></div>
  <p role="status">{game.winner||game.draw?'Exchange complete.':commits.every(Boolean)?'Both choices locked. Revealing the exchange…':canChoose?'Choose cover below. Drag your aim up to a barrel and release.':'Waiting for the other player to lock a choice.'}</p>
  {error&&<p role="alert">{error}</p>}
  <svg className="paint-scene" viewBox="0 0 420 430" role="img" aria-label="Three opposing barrels above and three hiding barrels below. Drag below to hide; drag upward and release over an opposing barrel to lock your shot."
   onPointerDown={e=>{if(!canChoose||e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=(e.clientY-rect.top)/rect.height*430;e.currentTarget.setPointerCapture(e.pointerId);gesture.current={id:e.pointerId,mode:y>300?'hide':'aim',x:e.clientX,y:e.clientY};if(y>300)setCover(lane(x,rect.width));else setAim(lane(x,rect.width))}}
   onPointerMove={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;const rect=e.currentTarget.getBoundingClientRect();if(g.mode==='hide'&&(e.clientY-rect.top)/rect.height*430>280)setCover(lane(e.clientX-rect.left,rect.width));else{g.mode='aim';setAim(lane(e.clientX-rect.left,rect.width))}}}
   onPointerUp={e=>{const g=gesture.current;gesture.current=null;if(!g||g.id!==e.pointerId||g.mode!=='aim')return;const rect=e.currentTarget.getBoundingClientRect(),y=(e.clientY-rect.top)/rect.height*430;if(y>=60&&y<=240&&e.clientX>=rect.left&&e.clientX<=rect.right)lock(lane(e.clientX-rect.left,rect.width))}}
   onPointerCancel={()=>{gesture.current=null}} onLostPointerCapture={()=>{gesture.current=null}}>
   <defs><linearGradient id={uid+'-floor'} x2="0" y2="1"><stop stopColor="#234253"/><stop offset="1" stopColor="#111d30"/></linearGradient><linearGradient id={uid+'-metal'}><stop stopColor="#1f6c72"/><stop offset=".35" stopColor="#50b2ac"/><stop offset="1" stopColor="#163c51"/></linearGradient><radialGradient id={uid+'-head'} cx=".3" cy=".25"><stop stopColor="#ffdc9e"/><stop offset="1" stopColor="#a9704b"/></radialGradient></defs>
   <rect width="420" height="430" rx="24" fill="#0d1d2d"/><path d="M0 160H420V430H0Z" fill={'url(#'+uid+'-floor)'}/>{[0,1,2,3,4].map(i=><path key={i} d={`M210 160L${i*105} 430`} stroke="#497080" opacity=".35"/>)}
   <text x="210" y="38" textAnchor="middle" fill="#c8e8e7" fontSize="13" letterSpacing="3">LOCK. HIDE. SPLAT.</text>
   {[0,1].map(row=>[0,1,2].map(i=><g key={row+'-'+i} transform={`translate(${70+i*140} ${row===0?135:353}) scale(${row===0?.78:1})`}>
    <ellipse cy="49" rx="42" ry="10" fill="#020914" opacity=".5"/>
    {row===1&&cover===i&&<g className="paint-player"><circle cy="-45" r="18" fill={'url(#'+uid+'-head)'}/><path d="M-23-14Q0-40 23-14L28 24H-28Z" fill="#f1b764"/><rect x="-17" y="-50" width="34" height="10" rx="5" fill="#243246"/></g>}
    <path d="M-31-24H31V40Q0 54-31 40Z" fill={'url(#'+uid+'-metal)'}/><ellipse cy="-24" rx="31" ry="10" fill="#66c4bd"/><ellipse cy="-24" rx="24" ry="6" fill="#21545e"/><path d="M-30-3Q0 8 30-3M-30 25Q0 36 30 25" fill="none" stroke="#163e4e" strokeWidth="5"/>
    {row===0&&aim===i&&canChoose&&<g fill="none" stroke="#ffe5a5" strokeWidth="2"><circle r="20"/><path d="M-28 0H-10M10 0H28M0-28V-10M0 10V28"/></g>}
    {last&&row===0&&side>=0&&last.choices[side].target===i&&<g className="paint-splat" fill={last.choices[side].target===last.choices[1-side].cover?'#f58aaf':'#86d9ee'}><circle r="17"/><circle cx="-22" cy="8" r="6"/><circle cx="11" cy="-20" r="5"/><circle cx="20" cy="15" r="7"/></g>}
    <text y="73" textAnchor="middle" fill="#d9ecef" fontSize="14">{i+1}</text>
   </g>))}
   <path d={`M${70+cover*140} 306L${70+aim*140} 175`} stroke="#efcf8a" strokeWidth="2" strokeDasharray="5 9" opacity={canChoose?.45:0}/>
  </svg>
  <details><summary>Keyboard and tap controls</summary><div className="paint-alternatives" role="group" aria-label="Choose hiding barrel">{[0,1,2].map(i=><button key={i} className="btn" disabled={!canChoose} aria-pressed={cover===i} onClick={()=>setCover(i)}>Hide at {i+1}</button>)}</div><div className="paint-alternatives" role="group" aria-label="Aim and lock">{[0,1,2].map(i=><button key={i} className="btn" disabled={!canChoose} onClick={()=>lock(i)}>Aim at {i+1} and lock</button>)}</div></details>
  {active&&commits.every(Boolean)&&side>=0&&!choices[side]&&<button className="btn" onClick={reveal}>Retry reveal</button>}
  <p className="small muted">Choices stay private until both players lock. Withholding a reveal or losing the original device can stall this friendly match.</p>
 </section>
}
