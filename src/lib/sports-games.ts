import type {GameInfo, GameKind, PartyGame} from './game-types'

export type SportKind = 'darts'|'archery'|'basketball'|'cup-pong'
export type ShotInput = {aim:number; elevation:number; power:number}
export type FlightPoint = {x:number;y:number;z:number;t:number}
export type SportResult = {path:FlightPoint[];score:number;label:string;collisions:number;cup:number}
export const SPORTS_INFO:GameInfo[] = [
  {kind:'darts',title:'Darts',minPlayers:2,maxPlayers:4,rules:'Six darts each. Flick upward and release to throw. Real single, double and treble rings; highest total wins.'},
  {kind:'archery',title:'Archery',minPlayers:2,maxPlayers:4,rules:'Six arrows each. Pull the bowstring down, aim and release. Compensate for the shared crosswind. Ten-ring scoring; highest total wins.'},
  {kind:'basketball',title:'Basketball',minPlayers:2,maxPlayers:4,rules:'One minute each. Lift and flick the ball toward the hoop as often as you can. Rim and backboard rebounds count; each basket scores two.'},
  {kind:'cup-pong',title:'Cup Pong',minPlayers:2,maxPlayers:4,rules:'Six flick throws each at identical six-cup racks. Table bounces and rim rebounds are live. Each cup scores once; most cups wins.'},
]
export const isSport = (kind:GameKind):kind is SportKind => SPORTS_INFO.some(info=>info.kind===kind)
export const CUPS = [{x:0,z:3.4},{x:-.19,z:3.73},{x:.19,z:3.73},{x:-.38,z:4.06},{x:0,z:4.06},{x:.38,z:4.06}]
const finite = (n:unknown):n is number => typeof n==='number' && Number.isFinite(n)
export function validShot(input:unknown):input is ShotInput {
  if(!input || typeof input!=='object') return false
  const s=input as ShotInput
  return finite(s.aim)&&Math.abs(s.aim)<=1&&finite(s.elevation)&&s.elevation>=5&&s.elevation<=75&&finite(s.power)&&s.power>=0&&s.power<=1
}
export function sportSeed(id:string) {let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619);return hash>>>0}
export function sportWind(seed:number) {return ((seed%101)-50)/100}
const q=(n:number)=>Math.round(n*1e9)/1e9
export function simulateSport(kind:SportKind,input:ShotInput,seed:number,removed:number[]=[]):SportResult {
  if(!validShot(input)) throw new Error('Invalid shot')
  const target=kind==='darts'||kind==='archery'
  const speed=kind==='darts'?12+input.power*7:kind==='archery'?10+input.power*18:kind==='basketball'?5+input.power*7:3+input.power*5
  const elevation=input.elevation*Math.PI/180,angle=input.aim*(target?.16:.22)
  let x=0,y=kind==='basketball'?1.8:kind==='cup-pong'?1.1:1.5,z=0
  let vx=Math.sin(angle)*Math.cos(elevation)*speed,vy=Math.sin(elevation)*speed,vz=Math.cos(angle)*Math.cos(elevation)*speed
  const path:FlightPoint[]=[{x,y,z,t:0}];let score=0,label='Miss',collisions=0,cup=-1
  const dt=1/240,gravity=9.81,wind=kind==='archery'?sportWind(seed):0
  let rimCooldown=0,boardHit=false,tableBounces=0
  for(let step=1;step<=1440;step++) {
    const previous={x,y,z};vx=q(vx+wind*dt);vy=q(vy-gravity*dt);x=q(x+vx*dt);y=q(y+vy*dt);z=q(z+vz*dt)
    if(target && z>=8) {
      const f=(8-previous.z)/(z-previous.z);x=previous.x+(x-previous.x)*f;y=previous.y+(y-previous.y)*f;z=8
      const radius=Math.hypot(x,y-1.6)
      if(kind==='archery') {score=radius<=.8?Math.max(1,10-Math.floor(radius/.08)):0;label=score?`${score} ring`:'Outside target'}
      else {
        const sectors=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
        const sector=sectors[Math.floor(((Math.atan2(x,y-1.6)*180/Math.PI+369)%360)/18)]
        const multiplier=radius>=.58&&radius<=.64?3:radius>=.92&&radius<=1?2:1
        score=radius>1?0:radius<.045?50:radius<.1?25:sector*multiplier
        label=score===50?'Bullseye':score===25?'Outer bull':score?`${multiplier===3?'Treble ':multiplier===2?'Double ':''}${sector}`:'Outside board'
      }
      path.push({x,y,z,t:step*dt});break
    }
    if(!target) {
      const ball=kind==='basketball'?.12:.02,ringY=kind==='basketball'?3.05:.88
      const rings=kind==='basketball'?[{x:0,z:6}]:CUPS.filter((_,index)=>!removed.includes(index))
      if(rimCooldown>0)rimCooldown--
      for(const ring of rings) {
        const radial=Math.hypot(x-ring.x,z-ring.z),radius=kind==='basketball'?.23:.085
        if(previous.y>=ringY && y<ringY && vy<0 && radial<radius-ball*.6) {score=kind==='basketball'?2:1;cup=kind==='cup-pong'?CUPS.indexOf(ring):-1;label=kind==='basketball'?'Basket!':'Cup!';break}
        const distance=Math.hypot(radial-radius,y-ringY),tube=ball+(kind==='basketball'?.018:.009)
        if(!rimCooldown&&distance<tube&&radial>0) {
          const nx=(x-ring.x)/radial*(radial-radius)/Math.max(distance,.001),ny=(y-ringY)/Math.max(distance,.001),nz=(z-ring.z)/radial*(radial-radius)/Math.max(distance,.001)
          const dot=vx*nx+vy*ny+vz*nz
          if(dot<0){vx=q(vx-1.6*dot*nx);vy=q(vy-1.6*dot*ny);vz=q(vz-1.6*dot*nz);collisions++;rimCooldown=12}
        }
      }
      if(kind==='basketball'&&!boardHit&&previous.z<6.42-ball&&z>=6.42-ball&&Math.abs(x)<.9&&y>2.9&&y<4.1) {z=6.42-ball;vz=-Math.abs(vz)*.72;boardHit=true;collisions++}
      if(kind==='cup-pong'&&vy<0&&previous.y>.72+ball&&y<=.72+ball&&z>.3&&z<4.6&&Math.abs(x)<.8) {y=.72+ball;vy=-vy*.72;vx*=.9;vz*=.9;collisions++;tableBounces++}
      if(score){path.push({x,y,z,t:step*dt});break}
      if(tableBounces>4)break
    }
    if(step%4===0)path.push({x,y,z,t:step*dt})
    if(y<0||z>12||z<-.5||Math.abs(x)>4)break
  }
  return {path,score,label,collisions,cup}
}
export function createSportsData(kind:GameKind,players:string[],id:string):Record<string,unknown> {
  if(!isSport(kind))throw new Error('Unknown sport')
  return {sportVersion:2,seed:sportSeed(id),scores:players.map(()=>0),shots:players.map(()=>0),cups:players.map(()=>[]),...(kind==='basketball'?{roundStarted:false,roundElapsed:0,roundsDone:players.map(()=>false)}:{})}
}
export function validSportsData(game:PartyGame) {
  if(isTimedBasketball(game))return validBasketball(game)
  const d=game.data,n=game.players.length
  const ints=(v:unknown,max:number)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=max)
  const validCups=(v:unknown):v is number[]=>Array.isArray(v)&&v.length<=6&&new Set(v).size===v.length&&v.every(i=>Number.isInteger(i)&&i>=0&&i<6)
  if(!isSport(game.kind)||n<2||n>4||![1,2].includes(Number(d.sportVersion))||!Number.isInteger(d.seed)||Number(d.seed)<0||Number(d.seed)>0xffffffff||!ints(d.scores,360)||!ints(d.shots,6)||!Array.isArray(d.cups)||d.cups.length!==n||!d.cups.every(validCups))return false
  const scores=d.scores as number[],shots=d.shots as number[],total=shots.reduce((a,b)=>a+b,0)
  if(shots.some((count,i)=>count!==Math.floor(total/n)+(i<total%n?1:0)))return false
  if(scores.some((score,i)=>score>shots[i]*(game.kind==='darts'?60:game.kind==='archery'?10:game.kind==='basketball'?2:1)))return false
  if(game.kind==='cup-pong'&&scores.some((score,i)=>score!==(d.cups as number[][])[i].length))return false
  if(game.kind!=='cup-pong'&&(d.cups as number[][]).some(c=>c.length))return false
  if(total===0)return d.lastShot===undefined&&game.turn===0&&!game.winner&&!game.draw
  const last=d.lastShot as (ShotInput&{actor:number;score:number;label:string;cups:number[]})|undefined
  if(!last||!validShot(last)||last.actor!==(total-1)%n||!validCups(last.cups)||typeof last.label!=='string')return false
  const result=simulateSport(game.kind,last,Number(d.seed),last.cups)
  if(last.score!==result.score||last.label!==result.label)return false
  if(total<n*6)return game.turn===total%n&&!game.winner&&!game.draw
  const best=Math.max(...scores),leaders=scores.map((score,i)=>score===best?i:-1).filter(i=>i>=0)
  return game.turn===n-1&&(leaders.length===1?game.winner===game.players[leaders[0]]&&!game.draw:game.draw&&game.winner===null)
}
export function moveSports(game:PartyGame,move:Record<string,unknown>):boolean {
  if(isTimedBasketball(game))return moveBasketball(game,move)
  if(!validSportsData(game)||!isSport(game.kind)||!validShot(move)||game.winner||game.draw)return false
  const scores=game.data.scores as number[],shots=game.data.shots as number[],cups=game.data.cups as number[][],actor=game.turn
  if(!Number.isInteger(actor)||actor<0||actor>=shots.length||shots[actor]>=6)return false
  const result=simulateSport(game.kind,move,Number(game.data.seed),cups[actor])
  game.data.lastShot={aim:move.aim,elevation:move.elevation,power:move.power,actor,score:result.score,label:result.label,cups:[...cups[actor]]}
  scores[actor]+=result.score;shots[actor]++
  if(result.cup>=0)cups[actor].push(result.cup)
  if(shots.every(count=>count===6)) {const best=Math.max(...scores),leaders=scores.map((s,i)=>s===best?i:-1).filter(i=>i>=0);game.winner=leaders.length===1?game.players[leaders[0]]:null;game.draw=leaders.length!==1}
  else game.turn=(actor+1)%game.players.length
  return true
}

export const BASKETBALL_ROUND_MS=60000
export const BASKETBALL_SHOT_INTERVAL=350
export const isTimedBasketball=(game:PartyGame)=>game.kind==='basketball'&&game.data.sportVersion===2
export const basketballRoundRunning=(game:PartyGame)=>isTimedBasketball(game)&&game.data.roundStarted===true&&!game.winner&&!game.draw
export const basketballElapsed=(game:PartyGame)=>Number(game.data.roundElapsed)||0
function validBasketball(game:PartyGame):boolean {
  const d=game.data,n=game.players.length,scores=d.scores as number[],shots=d.shots as number[],done=d.roundsDone as boolean[]
  if(n<2||n>4||!Number.isInteger(d.seed)||Number(d.seed)<0||Number(d.seed)>0xffffffff||typeof d.roundStarted!=='boolean'||!Number.isInteger(d.roundElapsed)||Number(d.roundElapsed)<0||Number(d.roundElapsed)>60000)return false
  if(!Array.isArray(scores)||!Array.isArray(shots)||!Array.isArray(done)||scores.length!==n||shots.length!==n||done.length!==n||!done.every(v=>typeof v==='boolean'))return false
  if(!Array.isArray(d.cups)||d.cups.length!==n||!d.cups.every(c=>Array.isArray(c)&&!c.length))return false
  if(shots.some((v,i)=>!Number.isInteger(v)||v<0||v>120||!Number.isInteger(scores[i])||scores[i]<0||scores[i]>v*2||scores[i]%2!==0))return false
  const expectedActor=shots.map((count,i)=>count>0?i:-1).filter(i=>i>=0).at(-1)??-1
  if(expectedActor<0){if(d.lastShot!==undefined)return false}
  else {const last=d.lastShot as ShotInput&{actor:number;score:number;label:string;cups:number[];elapsed:number};if(!validShot(last)||last.actor!==expectedActor||!Array.isArray(last.cups)||last.cups.length||!Number.isInteger(last.elapsed)||last.elapsed<0||last.elapsed>=60000)return false;const result=simulateSport('basketball',last,Number(d.seed));if(last.score!==result.score||last.label!==result.label||d.roundStarted&&last.actor===game.turn&&last.elapsed!==d.roundElapsed)return false}
  const finished=done.filter(Boolean).length
  if(done.some((v,i)=>v!==(i<finished)))return false
  if(finished===n){const best=Math.max(...scores),leaders=scores.map((s,i)=>s===best?i:-1).filter(i=>i>=0);if(d.roundStarted||game.turn!==n-1||Number(d.roundElapsed)!==60000)return false;return leaders.length===1?game.winner===game.players[leaders[0]]&&!game.draw:game.draw&&game.winner===null}
  if(game.turn!==finished||game.winner||game.draw||shots.some((v,i)=>i>game.turn&&v!==0)||scores.some((v,i)=>i>game.turn&&v!==0))return false
  if(!d.roundStarted&&(Number(d.roundElapsed)!==0||shots[game.turn]!==0))return false
  return true
}
function moveBasketball(game:PartyGame,move:Record<string,unknown>):boolean {
  if(!validBasketball(game)||game.winner||game.draw)return false
  const d=game.data,actor=game.turn,shots=d.shots as number[],scores=d.scores as number[],done=d.roundsDone as boolean[]
  if(move.type==='start-round'){if(d.roundStarted)return false;d.roundStarted=true;return true}
  if(move.type==='finish-round'){
    if(!d.roundStarted||move.elapsed!==60000)return false
    done[actor]=true;d.roundStarted=false
    if(done.every(Boolean)){d.roundElapsed=60000;const best=Math.max(...scores),leaders=scores.map((s,i)=>s===best?i:-1).filter(i=>i>=0);game.winner=leaders.length===1?game.players[leaders[0]]:null;game.draw=leaders.length!==1}
    else {game.turn++;d.roundElapsed=0}
    return true
  }
  const elapsed=move.elapsed
  if(!d.roundStarted||!validShot(move)||!Number.isInteger(elapsed)||Number(elapsed)<0||Number(elapsed)>=60000||shots[actor]>=120||shots[actor]>0&&Number(elapsed)-Number(d.roundElapsed)<BASKETBALL_SHOT_INTERVAL)return false
  const result=simulateSport('basketball',move,Number(d.seed))
  d.lastShot={aim:move.aim,elevation:move.elevation,power:move.power,actor,score:result.score,label:result.label,cups:[],elapsed}
  d.roundElapsed=elapsed;scores[actor]+=result.score;shots[actor]++
  return true
}
