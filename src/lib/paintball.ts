import {sha256} from '@noble/hashes/sha2.js'
import {bytesToHex} from '@noble/hashes/utils.js'
import type {GameInfo,PartyGame} from './game-types'
export const PAINTBALL_INFO:GameInfo={kind:'paintball',title:'Paintball',minPlayers:2,maxPlayers:2,rules:'Hide behind a barrel, then drag your aim onto an opposing barrel and release. Both choices lock before the exchange is revealed. First to three hits wins after equal attacks; ties draw. Seven exchanges maximum.'}
export type PaintChoice={cover:number;target:number;salt:string}
type Exchange={commits:string[];choices:PaintChoice[]}
const hash=(v:string)=>bytesToHex(sha256(new TextEncoder().encode(v)))
const lane=(v:unknown)=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<3
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function validPaintChoice(v:unknown):v is PaintChoice{return obj(v)&&Object.keys(v).every(k=>['cover','target','salt'].includes(k))&&lane(v.cover)&&lane(v.target)&&hex(v.salt)}
export function paintCommit(game:PartyGame,actor:number,choice:PaintChoice,round=Number(game.data.round)){return hash(JSON.stringify(['paintball-v1',game.id,game.players[actor],round,choice.cover,choice.target,choice.salt]))}
export function newPaintChoice(cover:number,target:number):PaintChoice{return {cover,target,salt:bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}}
export function createPaintballData(){return {paintVersion:1,round:0,commits:[null,null],choices:[null,null],history:[],scores:[0,0]}}
function result(scores:number[],rounds:number,players:string[]){const ended=Math.max(...scores)>=3||rounds===7;return {ended,winner:ended&&scores[0]!==scores[1]?players[scores[0]>scores[1]?0:1]:null,draw:ended&&scores[0]===scores[1]}}
export function validPaintball(game:PartyGame):boolean{
 const d=game.data;if(game.kind!=='paintball'||game.players.length!==2||d.paintVersion!==1||Object.keys(d).some(k=>!['paintVersion','round','commits','choices','history','scores','collectionVersion'].includes(k))||!Number.isInteger(d.round)||Number(d.round)<0||Number(d.round)>7||!Array.isArray(d.history)||d.history.length!==d.round||!Array.isArray(d.commits)||d.commits.length!==2||!Array.isArray(d.choices)||d.choices.length!==2||!Array.isArray(d.scores)||d.scores.length!==2)return false
 const scores=[0,0]
 for(let r=0;r<d.history.length;r++){
  const e=d.history[r] as Exchange;if(!obj(e)||Object.keys(e).some(k=>!['commits','choices'].includes(k))||!Array.isArray(e.commits)||e.commits.length!==2||!Array.isArray(e.choices)||e.choices.length!==2)return false
  if(e.choices.some((c,i)=>!validPaintChoice(c)||e.commits[i]!==paintCommit(game,i,c,r)))return false
  scores[0]+=Number(e.choices[0].target===e.choices[1].cover);scores[1]+=Number(e.choices[1].target===e.choices[0].cover)
  if(result(scores,r+1,game.players).ended&&r!==d.history.length-1)return false
 }
 if(scores.some((s,i)=>s!==(d.scores as number[])[i]))return false
 const terminal=result(scores,d.history.length,game.players)
 if(game.winner!==terminal.winner||game.draw!==terminal.draw)return false
 if(terminal.ended)return game.turn===0&&d.commits.every(c=>c===null)&&d.choices.every(c=>c===null)
 const commits=d.commits,choices=d.choices
 if(commits.some(c=>c!==null&&!hex(c)))return false
 if(!commits[0])return !commits[1]&&choices.every(c=>c===null)&&game.turn===0
 if(!commits[1])return choices.every(c=>c===null)&&game.turn===1
 if(!choices[0])return choices[1]===null&&game.turn===0
 return validPaintChoice(choices[0])&&paintCommit(game,0,choices[0])===commits[0]&&choices[1]===null&&game.turn===1
}
export function movePaintball(game:PartyGame,move:Record<string,unknown>):boolean{
 if(!validPaintball(game)||game.winner||game.draw)return false
 const d=game.data,commits=d.commits as (string|null)[],choices=d.choices as (PaintChoice|null)[],actor=game.turn
 if(move.action==='commit'&&Object.keys(move).every(k=>['action','commit'].includes(k))&&!commits[actor]&&hex(move.commit)){commits[actor]=move.commit as string;game.turn=actor===0?1:0;return true}
 if(move.action!=='reveal'||Object.keys(move).some(k=>!['action','choice'].includes(k))||!commits.every(Boolean)||choices[actor]||!validPaintChoice(move.choice)||paintCommit(game,actor,move.choice)!==commits[actor])return false
 choices[actor]=move.choice
 if(actor===0){game.turn=1;return true}
 const history=d.history as Exchange[];history.push({commits:commits as string[],choices:choices as PaintChoice[]});d.round=history.length
 const scores=d.scores as number[];scores[0]+=Number(choices[0]!.target===choices[1]!.cover);scores[1]+=Number(choices[1]!.target===choices[0]!.cover)
 d.commits=[null,null];d.choices=[null,null];game.turn=0
 const end=result(scores,history.length,game.players);game.winner=end.winner;game.draw=end.draw;return true
}
