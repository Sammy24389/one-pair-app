import type {GameInfo, GameKind, PartyGame} from './game-types'
import {BOARD_INFO, createBoardData, validBoardData, moveBoard} from './board-games'
import {WORD_INFO, createWordData, validWordData, moveWord} from './word-games'
import {SPORTS_INFO, createSportsData, validSportsData, moveSports} from './sports-games'
import {PAINTBALL_INFO,createPaintballData,validPaintball,movePaintball} from './paintball'
import * as legacy from './legacy-party-games'
export type {GameKind, PartyGame} from './game-types'
export {CUP_TARGETS} from './legacy-party-games'
export const GAME_INFO:GameInfo[] = [...BOARD_INFO.filter(info=>info.kind!=='sea-battle'&&info.kind!=='reversi'),...WORD_INFO,...SPORTS_INFO,PAINTBALL_INFO]
export const GAME_PROTOCOL = 3
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v)
const board = (kind:GameKind) => BOARD_INFO.some(info=>info.kind===kind)
const word = (kind:GameKind) => WORD_INFO.some(info=>info.kind===kind)
const sport = (kind:GameKind) => SPORTS_INFO.some(info=>info.kind===kind)
export function createPartyGame(kind:GameKind,players:string[],id:string):PartyGame {
  const info=GAME_INFO.find(info=>info.kind===kind)
  if (!info) {
    if(kind==='words')return legacy.createPartyGame(kind,players,id)
    throw new Error('Unknown game.')
  }
  if(typeof id!=='string'||!id||id.length>100||!Array.isArray(players)||players.length<info.minPlayers||players.length>info.maxPlayers||new Set(players).size!==players.length||players.some(p=>typeof p!=='string'||!p||p.length>100))throw new Error('Invalid game participants')
  const data=kind==='paintball'?createPaintballData():board(kind)?createBoardData(kind,players,id):word(kind)?createWordData(kind,players,id):createSportsData(kind,players,id)
  return {id,kind,players:[...players],turn:0,version:0,winner:null,draw:false,data:{...data,collectionVersion:GAME_PROTOCOL}}
}
export function validPartyGame(value:unknown):value is PartyGame {
  if(!object(value)||!object(value.data))return false
  if(value.data.collectionVersion===undefined)return legacy.validPartyGame(value)
  if(value.data.collectionVersion!==GAME_PROTOCOL&&value.data.collectionVersion!==2)return false
  const game=value as unknown as PartyGame,info=[...BOARD_INFO,...WORD_INFO,...SPORTS_INFO,PAINTBALL_INFO].find(info=>info.kind===game.kind)
  if(!info||typeof game.id!=='string'||!game.id||game.id.length>100||!Array.isArray(game.players)||game.players.length<info.minPlayers||game.players.length>info.maxPlayers||new Set(game.players).size!==game.players.length||game.players.some(p=>typeof p!=='string'||!p||p.length>100)||!Number.isInteger(game.turn)||game.turn<0||game.turn>=game.players.length||!Number.isInteger(game.version)||game.version<0||game.version>10000||typeof game.draw!=='boolean'||!(game.winner===null||game.players.includes(game.winner))||(game.draw&&game.winner!==null))return false
  try {if(JSON.stringify(value).length>(game.kind==='sea-battle'?110000:50000))return false;return game.kind==='paintball'?validPaintball(game):board(game.kind)?validBoardData(game):word(game.kind)?validWordData(game):validSportsData(game)}catch{return false}
}
export function applyPartyMove(state:PartyGame,actor:string,move:Record<string,unknown>,version:number):PartyGame|null {
  if(!validPartyGame(state)||!object(move)||version!==state.version||state.players[state.turn]!==actor||state.winner||state.draw||state.version>=10000)return null
  if(state.data.collectionVersion===undefined)return legacy.applyPartyMove(state as legacy.PartyGame,actor,move,version)
  try {
    if(JSON.stringify(move).length>20000)return null
    const game=structuredClone(state)
    const accepted=game.kind==='paintball'?movePaintball(game,move):board(game.kind)?moveBoard(game,move):word(game.kind)?moveWord(game,move):sport(game.kind)?moveSports(game,move):false
    if(!accepted)return null
    game.version++
    return validPartyGame(game)?game:null
  }catch{return null}
}
