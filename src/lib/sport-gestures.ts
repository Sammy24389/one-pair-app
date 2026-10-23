import type {ShotInput,SportKind} from './sports-games'
export type GesturePoint={x:number;y:number;t:number}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
export function gestureShot(kind:SportKind,start:GesturePoint,end:GesturePoint):ShotInput|null {
  const dx=end.x-start.x,dy=end.y-start.y,duration=end.t-start.t
  if(![dx,dy,duration].every(Number.isFinite)||duration<20||duration>5000)return null
  const distance=kind==='archery'?dy:-dy
  if(distance<22)return null
  const aim=clamp(dx/(kind==='archery'?-125:145),-1,1)
  const strength=clamp(distance/240,.05,1)
  if(kind==='darts'||kind==='archery'){
    const power=kind==='darts'?clamp(.25+strength*.65,0,1):strength
    const speed=kind==='darts'?12+power*7:10+power*18
    const height=(distance-120)/140+.1,g=9.81,d=8,v2=speed*speed
    const root=Math.max(0,v2*v2-g*(g*d*d+2*height*v2))
    const elevation=clamp(Math.atan((v2-Math.sqrt(root))/(g*d))*180/Math.PI,5,75)
    return {aim,elevation,power}
  }
  const speed=clamp(distance/Math.max(80,duration),.1,2)
  return {aim,elevation:clamp(kind==='basketball'?43+strength*8:29+strength*10,20,75),power:clamp((kind==='basketball'?.30:.28)+strength*.38+speed*.10,0,1)}
}
