import rawWords from '../assets/words/english.txt?raw'
import type {GameInfo, GameKind, PartyGame} from './game-types'

export const WORD_INFO:GameInfo[] = [
  {kind:'word-hunt',title:'Word Hunt',minPlayers:2,maxPlayers:4,rules:'Trace adjacent letters without reusing a tile. Find up to six words, then finish. Each player gets the same board.'},
  {kind:'anagrams',title:'Anagrams',minPlayers:2,maxPlayers:4,rules:'Build words from the six letters. Each letter can be used once per word. Six words or finish; identical racks for everyone.'},
  {kind:'word-bites',title:'Word Bites',minPlayers:2,maxPlayers:4,rules:'Move whole letter pieces into empty spaces. Submit a straight connected word of 3–8 letters. Six words or finish; identical boards for everyone.'},
]
let dictionary:string[]|undefined
export function isGameWord(word:string):boolean {
  if(!/^[a-z]{3,8}$/.test(word))return false
  dictionary??=rawWords.trim().split(/\s+/)
  let low=0,high=dictionary.length-1
  while(low<=high){const mid=(low+high)>>>1,value=dictionary[mid];if(value===word)return true;if(value<word)low=mid+1;else high=mid-1}
  return false
}
export const wordPoints = (word:string) => word.length === 3 ? 100 : word.length === 4 ? 400 : (word.length-3)*400
export type LetterPiece = {id:number; text:string; x:number; y:number; vertical:boolean}
type WordData = {puzzle:number; scores:number[]; found:string[][]; done:boolean[]; shifts:number[]; pieces:LetterPiece[][]; last:string}
const racks = 'RETAIN STREAM PLANET LISTEN MASTER GARDEN SILENT ORANGE FLOWER WINTER SUMMER SPRING CASTLE SILVER GOLDEN FOREST STREAM BOTTLE CANDLE POCKET RIBBON SINGER ARTIST TRAVEL SAILOR ROCKET MARKET BASKET PARCEL THREAD SHADOW WINDOW PILLOW BRIDGE CIRCLE SQUARE PURPLE VIOLET MARBLE KITTEN RABBIT MONKEY TURTLE DRAGON SPIDER ORCHID COTTON BUTTON JACKET CARPET HARBOR ANCHOR CAMERA COFFEE COOKIE DINNER BUTTER PEPPER TOMATO POTATO BANANA CHERRY'.split(' ')
const hunts = ['CATSREINOLATEDOG','STARTONECAMPSELF','PLANETARICODESUN','LISTENAROCATDEEP','MASTEROILCANDYES','GARDENOTICAPSELF']
function puzzleIndex(id:string) {let h=2166136261;for(const c of id) h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%racks.length}
function initialPieces(puzzle:number):LetterPiece[] {
  const rack=racks[puzzle]
  return [{id:0,text:rack.slice(0,2),x:0,y:0,vertical:false},{id:1,text:rack.slice(2,4),x:3,y:0,vertical:false},{id:2,text:rack.slice(4),x:0,y:2,vertical:true},
    {id:3,text:'S',x:4,y:3,vertical:false},{id:4,text:'O',x:1,y:5,vertical:false},{id:5,text:'C',x:5,y:5,vertical:false},{id:6,text:'D',x:3,y:4,vertical:false},{id:7,text:'P',x:5,y:2,vertical:false}]
}
export function createWordData(_kind:GameKind,players:string[],id:string):Record<string,unknown> {
  const puzzle=puzzleIndex(id)
  return {puzzle,scores:players.map(()=>0),found:players.map(()=>[]),done:players.map(()=>false),shifts:players.map(()=>0),pieces:players.map(()=>initialPieces(puzzle)),last:''}
}
export function wordLetters(game:PartyGame) {
  const d=game.data as unknown as WordData
  if(game.kind!=='word-hunt')return racks[d.puzzle]
  if(d.puzzle<hunts.length)return hunts[d.puzzle].padEnd(16,'S').slice(0,16)
  const bag='AAAAAAEEEEEEIIIIOOOOUURSTLNCMDPBGHF',board=Array<string>(16)
  let seed=d.puzzle*2654435761
  for(let i=0;i<16;i++){seed=Math.imul(seed^seed>>>15,2246822519)>>>0;board[i]=bag[seed%bag.length]}
  ;[0,1,2,3,7,6].forEach((cell,i)=>{board[cell]=racks[d.puzzle][i]})
  return board.join('')
}
export function pieceCells(piece:LetterPiece):number[] {return [...piece.text].map((_,i)=>(piece.y+(piece.vertical?i:0))*6+piece.x+(piece.vertical?0:i))}
export function wordPieceBoard(pieces:LetterPiece[]):string[] {const board=Array<string>(36).fill('');for(const p of pieces) pieceCells(p).forEach((cell,i)=>{board[cell]=p.text[i]});return board}
function lettersContain(letters:string,word:string):boolean {
  const remaining=[...letters.toLowerCase()]
  for(const letter of word){const i=remaining.indexOf(letter);if(i<0)return false;remaining.splice(i,1)}
  return true
}
function huntContains(letters:string,word:string):boolean {
  const board=letters.toLowerCase()
  function search(cell:number,index:number,used:number):boolean {
    if(board[cell]!==word[index]||(used&(1<<cell)))return false
    if(index===word.length-1)return true
    for(let next=0;next<16;next++)if(next!==cell&&Math.abs(next%4-cell%4)<=1&&Math.abs(Math.floor(next/4)-Math.floor(cell/4))<=1&&search(next,index+1,used|(1<<cell)))return true
    return false
  }
  return Array.from({length:16},(_,i)=>i).some(cell=>search(cell,0,0))
}
export function validWordData(game:PartyGame):boolean {
  const d=game.data as unknown as WordData,n=game.players.length
  if(!d || n<2||n>4||!Number.isInteger(game.turn)||game.turn<0||game.turn>=n||!Number.isInteger(d.puzzle)||d.puzzle<0||d.puzzle>=racks.length||typeof d.last!=='string'||d.last.length>8) return false
  if(!Array.isArray(d.scores)||!Array.isArray(d.found)||!Array.isArray(d.done)||!Array.isArray(d.shifts)||!Array.isArray(d.pieces)||[d.scores,d.found,d.done,d.shifts,d.pieces].some(a=>a.length!==n)) return false
  const validPlayers=d.found.every((list,i)=>{
    if(!Array.isArray(list)||list.length>6||new Set(list).size!==list.length||list.some(w=>typeof w!=='string'||!isGameWord(w)||(game.kind==='word-hunt'?!huntContains(wordLetters(game),w):!lettersContain(game.kind==='anagrams'?racks[d.puzzle]:initialPieces(d.puzzle).map(p=>p.text).join(''),w)))||d.scores[i]!==list.reduce((sum,w)=>sum+wordPoints(w),0)||typeof d.done[i]!=='boolean'||(list.length===6&&!d.done[i])||!Number.isInteger(d.shifts[i])||d.shifts[i]<0||d.shifts[i]>40) return false
    const pieces=d.pieces[i],initial=initialPieces(d.puzzle)
    if(!Array.isArray(pieces)||pieces.length!==initial.length) return false
    const occupied=new Set<number>()
    return pieces.every((p,j)=>{
      if(!p||p.id!==j||p.text!==initial[j].text||p.vertical!==initial[j].vertical||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x+(p.vertical?1:p.text.length)>6||p.y+(p.vertical?p.text.length:1)>6) return false
      return pieceCells(p).every(cell=>{if(occupied.has(cell))return false;occupied.add(cell);return true})
    })
  })
  if(!validPlayers||d.last!==(d.found.flat().at(-1)||''))return false
  const next=d.done.findIndex(complete=>!complete)
  if(next>=0){
    if(game.turn!==next||game.winner!==null||game.draw||d.done.slice(next+1).some(Boolean))return false
    for(let i=next+1;i<n;i++)if(d.found[i].length||d.shifts[i]||JSON.stringify(d.pieces[i])!==JSON.stringify(initialPieces(d.puzzle)))return false
    return true
  }
  const best=Math.max(...d.scores),leaders=d.scores.map((score,i)=>score===best?i:-1).filter(i=>i>=0)
  return game.turn===n-1&&game.winner===(leaders.length===1?game.players[leaders[0]]:null)&&game.draw===(leaders.length>1)
}
function finish(game:PartyGame,d:WordData) {
  d.done[game.turn]=true
  if(d.done.every(Boolean)) {const best=Math.max(...d.scores),seats=d.scores.map((s,i)=>s===best?i:-1).filter(i=>i>=0);game.winner=seats.length===1?game.players[seats[0]]:null;game.draw=seats.length>1}
  else {do{game.turn=(game.turn+1)%game.players.length}while(d.done[game.turn])}
}
export function moveWord(game:PartyGame,move:Record<string,unknown>):boolean {
  const d=game.data as unknown as WordData,seat=game.turn
  if(!validWordData(game)||d.done[seat]) return false
  if(move.action==='finish') {finish(game,d);return true}
  if(game.kind==='word-bites'&&move.action==='shift') {
    const {piece,x,y}=move
    if(!Number.isInteger(piece)||!Number.isInteger(x)||!Number.isInteger(y)||d.shifts[seat]>=40) return false
    const old=d.pieces[seat][Number(piece)]
    if(!old||(old.x===x&&old.y===y))return false
    const next={...old,x:Number(x),y:Number(y)}
    if(next.x<0||next.y<0||next.x+(next.vertical?1:next.text.length)>6||next.y+(next.vertical?next.text.length:1)>6)return false
    const occupied=new Set(d.pieces[seat].filter(p=>p.id!==piece).flatMap(pieceCells))
    if(pieceCells(next).some(cell=>occupied.has(cell)))return false
    d.pieces[seat][Number(piece)]=next;d.shifts[seat]++;return true
  }
  const path=move.path
  if(!Array.isArray(path)||path.length<3||path.length>8||path.some(c=>!Number.isInteger(c))||new Set(path).size!==path.length)return false
  let word=''
  if(game.kind==='word-hunt') {
    const letters=wordLetters(game)
    for(let i=0;i<path.length;i++) {const c=Number(path[i]);if(c<0||c>=16)return false;if(i){const prev=Number(path[i-1]);if(Math.abs(c%4-prev%4)>1||Math.abs(Math.floor(c/4)-Math.floor(prev/4))>1)return false}word+=letters[c]}
  } else if(game.kind==='anagrams') {
    const letters=wordLetters(game)
    if(path.some(c=>c<0||c>=letters.length))return false
    word=path.map(c=>letters[c]).join('')
  } else if(game.kind==='word-bites') {
    const board=wordPieceBoard(d.pieces[seat]),step=Number(path[1])-Number(path[0])
    if(step!==1&&step!==6)return false
    if(path.some((c,i)=>c<0||c>=36||!board[c]||(i>0&&(c!==path[0]+i*step||(step===1&&Math.floor(c/6)!==Math.floor(path[0]/6))))))return false
    word=path.map(c=>board[c]).join('')
  } else return false
  word=word.toLowerCase()
  if(!isGameWord(word)||d.found[seat].includes(word))return false
  d.found[seat].push(word);d.scores[seat]+=wordPoints(word);d.last=word
  if(d.found[seat].length===6)finish(game,d)
  return true
}
