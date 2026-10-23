import {sha256} from '@noble/hashes/sha2.js'
import {Chess, type Square} from 'chess.js'
import type {GameInfo, GameKind, PartyGame} from './game-types'

export const BOARD_INFO: GameInfo[] = [
  {kind:'connect4',title:'Four in a Row',minPlayers:2,maxPlayers:2,rules:'Drop a disc. Connect four in any direction.'},
  {kind:'checkers',title:'Checkers',minPlayers:2,maxPlayers:2,rules:'American checkers. Captures are compulsory; complete every jump. Crowning ends your turn. 80 quiet turns draw.'},
  {kind:'mancala',title:'Mancala',minPlayers:2,maxPlayers:2,rules:'Kalah: sow counterclockwise, skip the opposing store. Landing in your store earns another turn. Capture from an empty own pit.'},
  {kind:'chess',title:'Chess',minPlayers:2,maxPlayers:2,rules:'Standard chess, including castling, en passant and promotion. Checkmate wins; repetition, fifty-move rule, stalemate, insufficient material and 1,000 half-moves draw.'},
  {kind:'gomoku',title:'Gomoku',minPlayers:2,maxPlayers:2,rules:'Place a stone on an intersection. Five or more in a continuous line wins. Freestyle rules; opening player is randomly seated.'},
  {kind:'sea-battle',title:'Sea Battle',minPlayers:2,maxPlayers:2,rules:'Secret fleets: five ships on an 8 × 8 sea. Fire once, then answer the opponent’s shot. Sink all 17 cells to win. Fleets are verified at the end; keep this device’s game data until completion.'},
  {kind:'reversi',title:'Reversi',minPlayers:2,maxPlayers:2,rules:'Bracket opposing discs along straight lines to flip them. No legal move passes automatically. Most discs wins when neither side can move.'},
]
const int=(v:unknown,min:number,max:number):v is number=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max
const nums=(v:unknown,n:number,min:number,max:number):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(x=>int(x,min,max))
const own=(piece:number,side:number)=>piece===side+1||piece===side+3
export function createBoardData(kind:GameKind,_players:string[],_id:string):Record<string,unknown>{
  if(kind==='sea-battle')return {roots:[null,null],shots:[[],[]],pending:null,hits:[0,0],phase:'setup',reveals:[null,null],candidate:null}
  if(kind==='chess')return {moves:[],fen:new Chess().fen()}
  if(kind==='mancala')return {pits:Array.from({length:14},(_,i)=>i===6||i===13?0:4)}
  if(kind==='checkers')return {board:Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2===0?0:i<24?1:i>=40?2:0),forced:-1,quiet:0}
  if(kind==='reversi'){const board=Array(64).fill(0);board[27]=2;board[28]=1;board[35]=1;board[36]=2;return {board,passed:false}}
  return {board:Array(kind==='connect4'?42:225).fill(0)}
}
function chessState(game:PartyGame):Chess|null{
  try{
    if(!Array.isArray(game.data.moves)||game.data.moves.length>1000||!game.data.moves.every(m=>typeof m==='string'&&m.length<=12))return null
    const chess=new Chess()
    for(const move of game.data.moves as string[])chess.move(move)
    return chess.fen()===game.data.fen&&game.turn===(chess.turn()==='w'?0:1)?chess:null
  }catch{return null}
}
export function checkersMoves(board:number[],side:number,jumps:boolean,only=-1):[number,number][]{
  const result:[number,number][]=[]
  board.forEach((piece,from)=>{
    if(!own(piece,side)||(only!==-1&&from!==only))return
    for(const dy of piece>2?[-1,1]:[side===0?1:-1])for(const dx of [-1,1]){
      const r=Math.floor(from/8),c=from%8,step=jumps?2:1,y=r+dy*step,x=c+dx*step
      if(x<0||x>7||y<0||y>7||board[y*8+x])continue
      const middle=board[(r+dy)*8+c+dx]
      if(jumps&&(!middle||own(middle,side)))continue
      result.push([from,y*8+x])
    }
  });return result
}
export function reversiFlips(board:number[],side:number,to:number):number[]{
  if(board[to]||to<0||to>=64)return []
  const result:number[]=[]
  for(const [dx,dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]){
    let x=to%8+dx,y=Math.floor(to/8)+dy;const line:number[]=[]
    while(x>=0&&x<8&&y>=0&&y<8&&board[y*8+x]===2-side){line.push(y*8+x);x+=dx;y+=dy}
    if(line.length&&x>=0&&x<8&&y>=0&&y<8&&board[y*8+x]===side+1)result.push(...line)
  }return result
}
export function legalBoardMoves(game:PartyGame,from?:number):number[]{
  const board=game.data.board as number[]
  if(game.winner||game.draw)return []
  if(game.kind==='connect4')return Array.from({length:7},(_,i)=>i).filter(i=>!board[i])
  if(game.kind==='gomoku')return board.flatMap((v,i)=>v?[]:[i])
  if(game.kind==='reversi')return board.flatMap((_,i)=>reversiFlips(board,game.turn,i).length?[i]:[])
  if(game.kind==='mancala')return Array.from({length:6},(_,i)=>i).filter(i=>(game.data.pits as number[])[game.turn*7+i]>0)
  if(game.kind==='chess'){
    const chess=chessState(game);if(!chess)return []
    return chess.moves({verbose:true,...(from===undefined?{}:{square:indexSquare(from)})}).map(m=>squareIndex(m.to))
  }
  const jumps=checkersMoves(board,game.turn,true,game.data.forced as number)
  return (jumps.length?jumps:checkersMoves(board,game.turn,false)).filter(([f])=>from===undefined||f===from).map(([,t])=>t)
}
export const indexSquare=(index:number):Square=>`${'abcdefgh'[index%8]}${8-Math.floor(index/8)}` as Square
export const squareIndex=(square:string)=>'abcdefgh'.indexOf(square[0])+(8-Number(square[1]))*8
export function validBoardData(game:PartyGame):boolean{
  const d=game.data
  if(game.players.length!==2)return false
  if(game.kind==='sea-battle')return validSeaData(game)
  if(game.kind==='chess')return !!chessState(game)
  if(game.kind==='mancala')return nums(d.pits,14,0,48)&&d.pits.reduce((a,b)=>a+b,0)===48
  if(game.kind==='checkers')return nums(d.board,64,0,4)&&int(d.forced,-1,63)&&int(d.quiet,0,80)&&d.board.every((p,i)=>!p||(Math.floor(i/8)+i%8)%2===1)&&[0,1].every(s=>(d.board as number[]).filter(p=>own(p,s)).length<=12)&&(d.forced===-1||checkersMoves(d.board,game.turn,true,d.forced).length>0)
  if(game.kind==='connect4')return nums(d.board,42,0,2)&&d.board.every((p,i,b)=>!p||i>=35||b[i+7]!==0)
  if(game.kind==='gomoku')return nums(d.board,225,0,2)
  if(game.kind==='reversi')return nums(d.board,64,0,2)&&typeof d.passed==='boolean'
  return false
}
function lineWon(board:number[],size:number,to:number,piece:number,needed:number){
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
    let count=1
    for(const sign of [-1,1]){let x=to%size+dx*sign,y=Math.floor(to/size)+dy*sign;while(x>=0&&x<size&&y>=0&&y<board.length/size&&board[y*size+x]===piece){count++;x+=dx*sign;y+=dy*sign}}
    if(count>=needed)return true
  }return false
}
export function moveBoard(game:PartyGame,move:Record<string,unknown>):boolean{
  if(game.kind==='sea-battle')return moveSea(game,move)
  const d=game.data,side=game.turn,win=(s:number)=>{game.winner=game.players[s]},next=()=>{game.turn=1-game.turn}
  if(game.kind==='chess'){
    if(!int(move.from,0,63)||!int(move.to,0,63)||!(move.promotion===undefined||['q','r','b','n'].includes(String(move.promotion))))return false
    const chess=chessState(game);if(!chess)return false
    try{const result=chess.move({from:indexSquare(move.from),to:indexSquare(move.to),promotion:typeof move.promotion==='string'?move.promotion:'q'});(d.moves as string[]).push(result.san);d.fen=chess.fen();next();d.lastMove=[move.from,move.to];if(chess.isCheckmate())win(side);else if(chess.isDraw()||(d.moves as string[]).length>=1000)game.draw=true;return true}catch{return false}
  }
  if(game.kind==='mancala'){
    if(!int(move.pit,0,5))return false
    const b=d.pits as number[],ownStore=side===0?6:13,otherStore=side===0?13:6,start=side*7+move.pit
    let seeds=b[start],i=start;if(!seeds)return false;b[start]=0
    while(seeds){i=(i+1)%14;if(i===otherStore)continue;b[i]++;seeds--}
    if(i!==ownStore&&Math.floor(i/7)===side&&b[i]===1&&b[12-i]>0){b[ownStore]+=b[12-i]+1;b[i]=0;b[12-i]=0}
    d.lastPit=start
    if(b.slice(0,6).every(v=>!v)||b.slice(7,13).every(v=>!v)){
      for(let j=0;j<6;j++){b[6]+=b[j];b[j]=0;b[13]+=b[j+7];b[j+7]=0}
      if(b[6]===b[13])game.draw=true;else win(b[6]>b[13]?0:1)
    }else if(i!==ownStore)next()
    return true
  }
  const b=d.board as number[]
  if(game.kind==='checkers'){
    if(!int(move.from,0,63)||!int(move.to,0,63))return false
    const jumps=checkersMoves(b,side,true,d.forced as number),options=jumps.length?jumps:d.forced===-1?checkersMoves(b,side,false):[]
    if(!options.some(([f,t])=>f===move.from&&t===move.to))return false
    const from=move.from,to=move.to,piece=b[from],jump=Math.abs(Math.floor(from/8)-Math.floor(to/8))===2
    b[from]=0;b[to]=piece;if(jump)b[(from+to)/2]=0
    const promoted=piece<=2&&(side===0?to>=56:to<8);if(promoted)b[to]=piece+2
    d.quiet=jump||promoted?0:Number(d.quiet)+1;d.lastMove=[from,to]
    if(jump&&!promoted&&checkersMoves(b,side,true,to).length)d.forced=to
    else{d.forced=-1;next();if(!checkersMoves(b,game.turn,true).length&&!checkersMoves(b,game.turn,false).length)win(side)}
    if(!game.winner&&Number(d.quiet)>=80)game.draw=true
    return true
  }
  if(game.kind==='connect4'){
    if(!int(move.column,0,6)||b[move.column])return false
    let row=5;while(b[row*7+move.column])row--
    const to=row*7+move.column;b[to]=side+1;d.lastMove=[to];if(lineWon(b,7,to,side+1,4))win(side);else if(b.every(Boolean))game.draw=true;next();return true
  }
  if(!int(move.to,0,b.length-1)||b[move.to])return false
  if(game.kind==='gomoku'){b[move.to]=side+1;d.lastMove=[move.to];if(lineWon(b,15,move.to,side+1,5))win(side);else if(b.every(Boolean))game.draw=true;next();return true}
  if(game.kind==='reversi'){
    const flips=reversiFlips(b,side,move.to);if(!flips.length)return false
    b[move.to]=side+1;flips.forEach(i=>b[i]=side+1);d.lastMove=[move.to,...flips];next();d.passed=false
    if(!legalBoardMoves(game).length){next();d.passed=true;if(!legalBoardMoves(game).length){const score=b.reduce((a,v)=>a+(v===1?1:v===2?-1:0),0);if(!score)game.draw=true;else win(score>0?0:1)}}return true
  }return false
}


export type SeaSecret={ships:number[][];salts:string[]}
type SeaShot={to:number;hit:boolean|null;salt?:string;proof?:string[]}
type SeaData={roots:(string|null)[];shots:SeaShot[][];pending:{attacker:number;to:number}|null;hits:number[];phase:'setup'|'battle'|'reveal'|'complete';reveals:(SeaSecret|null)[];candidate:number|null}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
const hash=(value:string)=>hex(sha256(new TextEncoder().encode(value)))
const onlyKeys=(value:object,allowed:string[])=>Object.keys(value).every(key=>allowed.includes(key))
const isHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
export function validFleet(ships:unknown):ships is number[][]{
  if(!Array.isArray(ships)||ships.length!==5)return false
  const used=new Set<number>()
  return ships.every((ship,i)=>{
    if(!nums(ship,[5,4,3,3,2][i],0,63))return false
    const sorted=[...ship].sort((a,b)=>a-b),horizontal=sorted.every(n=>Math.floor(n/8)===Math.floor(sorted[0]/8))
    if(!sorted.every((n,j)=>j===0||n-sorted[j-1]===(horizontal?1:8)))return false
    for(const cell of ship){if(used.has(cell))return false;used.add(cell)}return true
  })
}
export function createSeaSecret():SeaSecret{
  const ships:number[][]=[],used=new Set<number>()
  for(const length of [5,4,3,3,2]){
    for(let attempts=0;;attempts++){
      // Rejection sampling is bounded by restarting an empty legal fleet.
      if(attempts>1000){const fallback=[5,4,3,3,2].map((n,row)=>Array.from({length:n},(_,col)=>row*8+col));return {ships:fallback,salts:Array.from({length:64},()=>hex(crypto.getRandomValues(new Uint8Array(32))))}}
      const random=crypto.getRandomValues(new Uint32Array(3)),vertical=random[0]%2===1,x=random[1]%(vertical?8:9-length),y=random[2]%(vertical?9-length:8)
      const cells=Array.from({length},(_,i)=>(y+(vertical?i:0))*8+x+(vertical?0:i))
      if(cells.some(cell=>used.has(cell)))continue
      ships.push(cells);cells.forEach(cell=>used.add(cell));break
    }
  }
  return {ships,salts:Array.from({length:64},()=>hex(crypto.getRandomValues(new Uint8Array(32))))}
}
function seaTree(secret:SeaSecret,id:string,player:string):string[][]{
  const occupied=new Set(secret.ships.flat()),levels=[Array.from({length:64},(_,i)=>hash(JSON.stringify(['onepair-sea-v1',id,player,i,occupied.has(i)?1:0,secret.salts[i]])))]
  while(levels.at(-1)!.length>1){const level=levels.at(-1)!;levels.push(Array.from({length:level.length/2},(_,i)=>hash(`node|${level[i*2]}|${level[i*2+1]}`)))}return levels
}
export function seaRoot(secret:SeaSecret,id:string,player:string):string{return seaTree(secret,id,player).at(-1)![0]}
export function seaProof(secret:SeaSecret,id:string,player:string,to:number):Record<string,unknown>{
  const tree=seaTree(secret,id,player);let index=to
  const proof=tree.slice(0,-1).map(level=>{const sibling=level[index^1];index=Math.floor(index/2);return sibling})
  return {action:'answer',to,hit:secret.ships.some(ship=>ship.includes(to)),salt:secret.salts[to],proof}
}
function verifySeaShot(shot:SeaShot,id:string,player:string,expected:string|null):boolean{
  if(typeof shot.hit!=='boolean'||!isHash(shot.salt)||!Array.isArray(shot.proof)||shot.proof.length!==6||!shot.proof.every(isHash))return false
  let root=hash(JSON.stringify(['onepair-sea-v1',id,player,shot.to,shot.hit?1:0,shot.salt])),index=shot.to
  for(const sibling of shot.proof){root=index%2===0?hash(`node|${root}|${sibling}`):hash(`node|${sibling}|${root}`);index=Math.floor(index/2)}
  return root===expected
}
function validSecret(secret:unknown):secret is SeaSecret{
  if(!secret||typeof secret!=='object')return false
  const s=secret as SeaSecret;return onlyKeys(s,['ships','salts'])&&validFleet(s.ships)&&Array.isArray(s.salts)&&s.salts.length===64&&s.salts.every(isHash)
}
function validSeaData(game:PartyGame):boolean{
  const d=game.data as unknown as SeaData
  if(game.draw||!onlyKeys(d,['roots','shots','pending','hits','phase','reveals','candidate','collectionVersion'])||(game.data.collectionVersion!==undefined&&game.data.collectionVersion!==2))return false
  if(!Array.isArray(d.roots)||d.roots.length!==2||!d.roots.every(v=>v===null||isHash(v))||!nums(d.hits,2,0,17)||!['setup','battle','reveal','complete'].includes(d.phase)||!Array.isArray(d.shots)||d.shots.length!==2||!Array.isArray(d.reveals)||d.reveals.length!==2||!d.reveals.every(s=>s===null||validSecret(s))||!(d.candidate===null||int(d.candidate,0,1)))return false
  if(!d.shots.every(shots=>Array.isArray(shots)&&shots.length<=64&&shots.every(s=>s&&onlyKeys(s,['to','hit','salt','proof'])&&int(s.to,0,63)&&(s.hit===null||typeof s.hit==='boolean'))&&new Set(shots.map(s=>s.to)).size===shots.length))return false
  if(!d.hits.every((hits,side)=>hits===d.shots[side].filter(s=>s.hit===true).length))return false
  if(!d.shots.every((shots,attacker)=>shots.every(shot=>shot.hit===null||verifySeaShot(shot,game.id,game.players[1-attacker],d.roots[1-attacker]))))return false
  if(d.pending!==null&&(!d.pending||!onlyKeys(d.pending,['attacker','to'])||!int(d.pending.attacker,0,1)||!int(d.pending.to,0,63)||game.turn!==1-d.pending.attacker||d.shots[d.pending.attacker].at(-1)?.to!==d.pending.to||d.shots[d.pending.attacker].at(-1)?.hit!==null))return false
  const pendingShots=d.shots.flat().filter(s=>s.hit===null).length
  if(pendingShots!==(d.pending?1:0))return false
  if(d.phase!=='setup'&&d.roots.some(root=>root===null))return false
  if((d.phase==='reveal'||d.phase==='complete')&&(d.candidate===null||d.hits[d.candidate]!==17||d.pending!==null))return false
  if(d.phase==='setup'&&(d.shots.some(s=>s.length)||d.reveals.some(Boolean)||d.candidate!==null||d.pending!==null))return false
  if(d.phase==='setup'&&((d.roots[0]===null&&(d.roots[1]!==null||game.turn!==0))||(d.roots[0]!==null&&(d.roots[1]!==null||game.turn!==1))))return false
  if(d.phase==='battle'&&(d.reveals.some(Boolean)||d.candidate!==null))return false
  const difference=d.shots[0].length-d.shots[1].length
  if(difference<0||difference>1)return false
  if(d.phase==='battle'&&!d.pending&&game.turn!==(difference===0?0:1))return false
  if(d.phase==='battle'&&d.pending&&d.pending.attacker!==(difference===1?0:1))return false
  if(d.phase==='reveal'&&(d.reveals[1]!==null||game.turn!==(d.reveals[0]===null?0:1)))return false
  if(d.phase==='complete'&&(!d.reveals.every(Boolean)||game.winner!==game.players[d.candidate!]))return false
  if(d.phase!=='complete'&&game.winner!==null)return false
  return d.reveals.every((secret,side)=>secret===null||seaRoot(secret,game.id,game.players[side])===d.roots[side])
}
function moveSea(game:PartyGame,move:Record<string,unknown>):boolean{
  const d=game.data as unknown as SeaData,side=game.turn
  if(d.phase==='setup'){
    if(move.action!=='commit'||!isHash(move.root)||d.roots[side]!==null)return false
    d.roots[side]=move.root;game.turn=1-side;if(d.roots.every(Boolean)){d.phase='battle';game.turn=0}return true
  }
  if(d.phase==='reveal'){
    if(move.action!=='reveal'||d.reveals[side]!==null||!validSecret(move.secret)||seaRoot(move.secret,game.id,game.players[side])!==d.roots[side])return false
    d.reveals[side]=move.secret;game.turn=1-side
    if(d.reveals.every(Boolean)){d.phase='complete';game.winner=game.players[d.candidate!]}
    return true
  }
  if(d.phase!=='battle')return false
  if(d.pending){
    const pending=d.pending
    if(move.action!=='answer'||move.to!==pending.to||typeof move.hit!=='boolean'||!isHash(move.salt)||!Array.isArray(move.proof)||move.proof.length!==6||!move.proof.every(isHash))return false
    const answer:SeaShot={to:pending.to,hit:move.hit,salt:move.salt,proof:move.proof as string[]}
    if(!verifySeaShot(answer,game.id,game.players[side],d.roots[side]))return false
    Object.assign(d.shots[pending.attacker].at(-1)!,answer);if(move.hit)d.hits[pending.attacker]++;d.pending=null
    if(d.hits[pending.attacker]===17){d.candidate=pending.attacker;d.phase='reveal';game.turn=0}
    return true
  }
  if(move.action!=='fire'||!int(move.to,0,63)||d.shots[side].some(s=>s.to===move.to))return false
  d.shots[side].push({to:move.to,hit:null});d.pending={attacker:side,to:move.to};game.turn=1-side;return true
}
