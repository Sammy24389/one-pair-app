import {useEffect,useId,useMemo,useRef,useState} from 'react'
import type {PointerEvent as ReactPointerEvent} from 'react'
import type {GameViewProps} from '../lib/game-types'
import {CUPS,isSport,isTimedBasketball,basketballRoundRunning,basketballElapsed,simulateSport,sportWind,type FlightPoint,type ShotInput} from '../lib/sports-games'
import {gestureShot,type GesturePoint} from '../lib/sport-gestures'
import '../styles/sports-games.css'
const projectWorld=(p:FlightPoint)=>({x:200+p.x*90/(1+.12*p.z),y:330-p.z*22-p.y*45})
export default function SportsGames({game,active,me,name,onMove}:GameViewProps) {
  const kind=isSport(game.kind)?game.kind:'darts',target=kind==='darts'||kind==='archery',timed=isTimedBasketball(game),running=basketballRoundRunning(game)
  const [aim,setAim]=useState(0),[elevation,setElevation]=useState(target?10:kind==='basketball'?47:35),[power,setPower]=useState(target?.55:kind==='basketball'?.55:.55)
  const [frame,setFrame]=useState(100000),[pending,setPending]=useState(false),[notice,setNotice]=useState(''),[heldPoint,setHeldPoint]=useState<GesturePoint|null>(null),[localShot,setLocalShot]=useState<ShotInput|null>(null),[cooldown,setCooldown]=useState(false),[elapsed,setElapsed]=useState(basketballElapsed(game))
  const drag=useRef<{start:GesturePoint;id:number}|null>(null),roundAnchor=useRef(0),previewCups=useRef<number[]>([]),previewVersion=useRef(-1),releaseOrigin=useRef<GesturePoint|null>(null),id=useId()
  const project=(p:FlightPoint)=>target?{x:200+p.x*90,y:358-p.z*13-p.y*90}:kind==='cup-pong'?{x:200+p.x*300/(1+.12*p.z),y:330-p.z*22-p.y*45}:projectWorld(p)
  const last=game.data.lastShot as (ShotInput&{actor:number;label:string;cups:number[]})|undefined
  const result=useMemo(()=>localShot?simulateSport(kind,localShot,Number(game.data.seed),previewCups.current):last?simulateSport(kind,last,Number(game.data.seed),last.cups):null,[kind,last,localShot,game.data.seed])
  const replayIdentity=game.id+':'+((game.data.shots as number[]).reduce((a,b)=>a+b,0)+(localShot&&previewVersion.current===game.version?1:0))
  useEffect(()=>{if(last&&game.players[last.actor]!==me)releaseOrigin.current=null;setPending(false);setNotice('');setLocalShot(null);drag.current=null;setHeldPoint(null)},[game.id,game.version])
  useEffect(()=>{
    if(!result){setFrame(100000);return}
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setFrame(100000);return}
    let raf=0;const start=performance.now();setFrame(0)
    const tick=(now:number)=>{setFrame((now-start)/1000*(timed?2.8:1.5));if(now-start<4500)raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
  },[replayIdentity,timed])
  useEffect(()=>{if(!pending)return;const timer=setTimeout(()=>{setPending(false);setLocalShot(null);setNotice('No confirmation yet. Check your connection and try again.')},4000);return()=>clearTimeout(timer)},[pending])
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(false),350);return()=>clearTimeout(timer)},[cooldown])
  useEffect(()=>{
    if(!running){setElapsed(0);return}
    roundAnchor.current=performance.now()-basketballElapsed(game)
    const timer=setInterval(()=>setElapsed(Math.min(60000,Math.floor(performance.now()-roundAnchor.current))),100)
    return()=>clearInterval(timer)
  },[game.id,game.turn,running])
  useEffect(()=>{const cancel=()=>{drag.current=null;setHeldPoint(null)};document.addEventListener('visibilitychange',cancel);window.addEventListener('blur',cancel);return()=>{document.removeEventListener('visibilitychange',cancel);window.removeEventListener('blur',cancel)}},[])
  const path=result?.path||[],point=path.find(p=>p.t>=frame)||path[path.length-1],drawn=path.filter(p=>p.t<=frame)
  const replaying=!!result&&frame<(path.at(-1)?.t||0),maxed=timed&&(game.data.shots as number[])[game.turn]>=120
  const canShoot=active&&!pending&&!cooldown&&(!timed||running&&elapsed<60000&&!maxed)&&(timed||!replaying)
  const shoot=(input:ShotInput,origin:GesturePoint|null=null)=>{if(!canShoot)return;setNotice('');setPending(true);setCooldown(true);releaseOrigin.current=origin;previewVersion.current=game.version;previewCups.current=[...(game.data.cups as number[][])[game.turn]];setLocalShot(input);onMove({...input,...(timed?{elapsed:Math.floor(performance.now()-roundAnchor.current)}:{})})}
  const position=(event:ReactPointerEvent<SVGSVGElement>):GesturePoint=>{const rect=event.currentTarget.getBoundingClientRect();return {x:(event.clientX-rect.left)*400/(rect.width||400),y:(event.clientY-rect.top)*370/(rect.height||370),t:performance.now()}}
  const flightProject=(p:FlightPoint)=>{const v=project(p),origin=releaseOrigin.current;if(!origin)return v;const start=project({x:0,y:kind==='basketball'?1.8:kind==='cup-pong'?1.1:1.5,z:0,t:0}),blend=Math.max(0,1-p.t/.18);return {x:v.x+(origin.x-start.x)*blend,y:v.y+(origin.y-start.y)*blend}}
  const held=heldPoint||{x:200,y:kind==='archery'?310:300}
  const hint=kind==='archery'?'Pull down on the bowstring, move sideways to aim, then release.':'Hold the projectile, lift and flick upward. Release to throw; direction and speed control the shot.'
  return <div className="sports-game">
    {notice&&<p role="status">{notice}</p>}
    <div className="sports-scoreboard">{game.players.map((player,i)=><div key={player} className={game.turn===i?'current':''}><strong>{name(player)}</strong><span>{(game.data.scores as number[])[i]} points</span><small>{timed?(game.data.roundsDone as boolean[])[i]?'Round complete':game.turn===i&&running?`${Math.ceil((60000-elapsed)/1000)} seconds`:'60 second round':`${(game.data.shots as number[])[i]} / 6 shots`}</small></div>)}</div>
    {timed&&!running&&active&&<button className="btn primary sports-start" disabled={pending} onClick={()=>{setPending(true);onMove({type:'start-round'})}}>Start my 60 seconds</button>}
    <p className="sports-hint">{timed&&running?`${Math.ceil((60000-elapsed)/1000)}s remaining · ${maxed?'Shot limit reached. Waiting for the buzzer.':elapsed>=60000?'Waiting for the host buzzer.':'Keep shooting until the buzzer.'}`:hint}</p>
    <svg className={`sports-scene sports-${kind} ${canShoot?'ready':''}`} viewBox="0 0 400 370" role="img" aria-label={`${kind} gesture arena. ${hint}`} tabIndex={0}
      onKeyDown={e=>{if(e.key==='Escape'){drag.current=null;setHeldPoint(null)}}}
      onPointerDown={e=>{if(!canShoot||e.button!==0)return;const start=position(e);if(start.y<210)return;e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={start,id:e.pointerId};setHeldPoint(start)}}
      onPointerMove={e=>{if(drag.current?.id!==e.pointerId)return;setHeldPoint(position(e))}}
      onPointerUp={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const end=position(e);drag.current=null;setHeldPoint(null);e.currentTarget.releasePointerCapture?.(e.pointerId);const input=gestureShot(kind,d.start,end);if(input)shoot(input,end);else setNotice(kind==='archery'?'Pull farther down before releasing.':'Flick upward before releasing.')}}
      onPointerCancel={()=>{drag.current=null;setHeldPoint(null)}} onLostPointerCapture={()=>{drag.current=null;setHeldPoint(null)}}>
      <defs><linearGradient id={`${id}-wall`} x2="0" y2="1"><stop stopColor="#102e43"/><stop offset="1" stopColor="#37576b"/></linearGradient><linearGradient id={`${id}-wood`}><stop stopColor="#b27843"/><stop offset=".5" stopColor="#e7b97d"/><stop offset="1" stopColor="#80502c"/></linearGradient><radialGradient id={`${id}-ball`} cx=".3" cy=".25"><stop stopColor={kind==='basketball'?'#ffc475':'#fff'}/><stop offset="1" stopColor={kind==='basketball'?'#b44f15':'#a6b1bb'}/></radialGradient></defs>
      <rect width="400" height="370" rx="24" fill={`url(#${id}-wall)`}/><path d={kind==='basketball'?"M0 198H400V370H0Z":"M0 260L400 260V370H0Z"} fill={kind==='basketball'?`url(#${id}-wood)`:"#142b33"}/><path d="M0 370L150 260M400 370L250 260M0 310H400" stroke="#789292" opacity=".25"/>
      {target?<g transform="translate(200 110)">{kind==='darts'?<DartTarget/>:[.8,.72,.64,.56,.48,.4,.32,.24,.16,.08].map((r,i)=><circle key={r} r={r*90} fill={['#eee','#eee','#242b31','#242b31','#3c9bd4','#3c9bd4','#d44a52','#d44a52','#f8d34d','#f8d34d'][i]} stroke="#738188" strokeWidth="1"/>)}</g>:kind==='basketball'?<g><rect x="139" y="3" width="122" height="65" rx="4" fill="#c8e2ee" fillOpacity=".35" stroke="#e0e8ed" strokeWidth="4"/><rect x="179" y="32" width="42" height="28" fill="none" stroke="#e9eef0" strokeWidth="3"/><path d="M188 61L192 85H208L212 61M190 67L208 80M210 67L192 80" fill="none" stroke="#edf3ef" strokeWidth="1.5"/><ellipse cx="200" cy="61" rx="12" ry="6" fill="none" stroke="#ec7848" strokeWidth="5"/></g>:<g><path d="M90 184L310 184L360 310H40Z" fill={`url(#${id}-wood)`} stroke="#f5dab0" strokeWidth="3"/><path d="M200 184V310M62 264H338" stroke="#fff" opacity=".7"/>{[...CUPS].reverse().map(cup=>{const i=CUPS.indexOf(cup);const p=project({x:cup.x,y:.88,z:cup.z,t:0});const removed=(game.data.cups as number[][])[last?.actor??game.turn]?.includes(i);return <g key={i} opacity={removed?.2:1}><path d={`M${p.x-17} ${p.y}l4 27h26l4-27`} fill="#c9364d" stroke="#fa8590"/><ellipse cx={p.x} cy={p.y} rx="17" ry="6" fill="#4d1721" stroke="#fff" strokeWidth="2"/></g>})}</g>}
      {drawn.length>1&&<polyline points={drawn.map(p=>{const v=flightProject(p);return `${v.x},${v.y}`}).join(' ')} fill="none" stroke="#f8e6b3" strokeWidth="2" opacity=".55"/>}
      {point&&(()=>{const p=flightProject(point);return target?<g transform={`translate(${p.x} ${p.y}) rotate(-35)`}><path d="M-18 0H10" stroke="#ddd" strokeWidth="3"/><path d="M-18 0l-10-7v14Z" fill="#e2ba58"/></g>:<circle cx={p.x} cy={p.y} r={kind==='basketball'?27/(1+.3*point.z):13/(1+.4*point.z)} fill={`url(#${id}-ball)`} stroke="#482c1e"/>})()}
      {kind==='basketball'&&<g fill="none" stroke="#f2e4cc" strokeWidth="1.5" opacity=".7"><path d="M142 198L65 370M258 198L335 370M142 198H258M110 270H290"/><ellipse cx="200" cy="300" rx="105" ry="38"/></g>}
      {kind==='archery'&&<g><path d="M166 275Q220 306 166 348" fill="none" stroke="#b88245" strokeWidth="6"/><path d={`M166 275L${166-(heldPoint?Math.max(0,heldPoint.y-(drag.current?.start.y??310)):power*30)} 312L166 348`} fill="none" stroke="#e5e4cf" strokeWidth="1.5"/><path d={`M${166-(heldPoint?Math.max(0,heldPoint.y-(drag.current?.start.y??310)):power*30)} 312H220`} stroke="#e8c583" strokeWidth="3"/></g>}
      {(!replaying||timed)&&kind!=='archery'&&<g transform={`translate(${held.x} ${held.y})`} className="sports-held">{kind==='darts'?<><path d="M0 -22V17" stroke="#dce8ec" strokeWidth="5"/><path d="M0 14L-14 32L0 25L14 32Z" fill="#ef9d54"/></>:<><ellipse cy="29" rx={kind==='basketball'?32:15} ry="7" fill="#0005"/><circle r={kind==='basketball'?27:13} fill={`url(#${id}-ball)`} stroke="#592e1d" strokeWidth="2"/>{kind==='basketball'&&<path d="M-26 0H26M0-26V26M-18-20Q10 0-18 20M18-20Q-10 0 18 20" fill="none" stroke="#652d15" strokeWidth="1.8"/>}</>}</g>}
      {heldPoint&&<path d={`M${drag.current?.start.x??200} ${drag.current?.start.y??310}L${held.x} ${held.y}`} stroke="#fff9" strokeWidth="3" strokeDasharray="5 5"/>}
      <text x="200" y="355" textAnchor="middle" fill="#e7eef1" fontSize="11">{kind==='archery'?'PULL DOWN · RELEASE':'LIFT · FLICK UP · RELEASE'}</text>
    </svg>
    <p className="sports-result" role="status">{pending?'Shot sent…':last?`${name(game.players[last.actor])}: ${last.label}${result?.collisions?` · ${result.collisions} rebound${result.collisions===1?'':'s'}`:''}`:'Your throw begins when you release.'}</p>
    {kind==='archery'&&<p className="small">Crosswind: {sportWind(Number(game.data.seed))===0?'calm':`${Math.abs(sportWind(Number(game.data.seed))).toFixed(2)} m/s² ${sportWind(Number(game.data.seed))>0?'right':'left'}`} · same for every player</p>}
    <details className="sports-accessible"><summary>Keyboard / precision controls</summary><div className="sports-controls"><label htmlFor={`${id}-aim`}>Aim<input id={`${id}-aim`} type="range" min="-1" max="1" step=".01" value={aim} disabled={!canShoot} onChange={e=>setAim(Number(e.target.value))}/></label><label htmlFor={`${id}-arc`}>Elevation<input id={`${id}-arc`} type="range" min="5" max="75" step="1" value={elevation} disabled={!canShoot} onChange={e=>setElevation(Number(e.target.value))}/></label><label htmlFor={`${id}-power`}>Strength<input id={`${id}-power`} type="range" min="0" max="1" step=".01" value={power} disabled={!canShoot} onChange={e=>setPower(Number(e.target.value))}/></label></div><button className="btn sports-shoot" disabled={!canShoot} onClick={()=>shoot({aim,elevation,power})}>Release shot</button></details>
    <p className="small muted">{timed?'Each player gets 60 seconds. The host controls the buzzer.':'Every player gets six throws.'} Equal totals finish as a draw.</p>
  </div>
}

function DartTarget(){
  const values=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
  const point=(radius:number,degrees:number)=>[radius*90*Math.sin(degrees*Math.PI/180),-radius*90*Math.cos(degrees*Math.PI/180)]
  const band=(inner:number,outer:number,angle:number)=>{const a=point(outer,angle-9),b=point(outer,angle+9),c=point(inner,angle+9),d=point(inner,angle-9);return `M${a.join(' ')}A${outer*90} ${outer*90} 0 0 1 ${b.join(' ')}L${c.join(' ')}A${inner*90} ${inner*90} 0 0 0 ${d.join(' ')}Z`}
  return <><circle r="108" fill="#101b24" stroke="#9ba9ae" strokeWidth="2"/>{values.map((value,i)=>{const label=point(1.12,i*18);return <g key={value}>{[[.1,.58],[.58,.64],[.64,.92],[.92,1]].map(([inner,outer],ring)=><path key={ring} d={band(inner,outer,i*18)} fill={ring%2?(i%2?'#3b8d68':'#bc4652'):(i%2?'#e5d8b8':'#20292c')} stroke="#a6aba5" strokeWidth=".45"/>)}<text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="600" fill="#f4ecda">{value}</text></g>})}<circle r="9" fill="#3b8d68" stroke="#c2c5b6" strokeWidth=".5"/><circle r="4.05" fill="#bc4652" stroke="#c2c5b6" strokeWidth=".5"/></>
}
