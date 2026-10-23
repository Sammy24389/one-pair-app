import {expect,it} from 'vitest'
import {GAME_INFO,createPartyGame,validPartyGame,applyPartyMove} from '../src/lib/party-games'
import {createBoardData,createSeaSecret,seaRoot,seaProof} from '../src/lib/board-games'
import {createPartyGame as oldGame} from '../src/lib/legacy-party-games'
const players=['alpha','bravo']
it('creates the thirteen selected games with isolated bounded validated state',()=>{
  expect(GAME_INFO.map(info=>info.kind).sort()).toEqual(['connect4','checkers','mancala','chess','gomoku','paintball','word-hunt','anagrams','word-bites','darts','archery','basketball','cup-pong'].sort())
  for(const info of GAME_INFO){const g=createPartyGame(info.kind,players,'collection-test');expect(validPartyGame(g),info.kind).toBe(true);expect(JSON.stringify(g).length).toBeLessThan(50000);expect(applyPartyMove(g,'bravo',{},0)).toBeNull();expect(applyPartyMove(g,'alpha',{},1)).toBeNull()}
  expect(()=>createPartyGame('chess',['alpha','alpha'],'test')).toThrow()
  expect(()=>createPartyGame('chess',['a','b','c'],'test')).toThrow()
})
it('routes legal moves through independent modules without mutating source',()=>{
  const moves={connect4:{column:0},checkers:{from:17,to:24},mancala:{pit:0},chess:{from:52,to:36},gomoku:{to:112},'word-hunt':{action:'finish'},anagrams:{action:'finish'},'word-bites':{action:'finish'},darts:{aim:0,elevation:20,power:.2},archery:{aim:0,elevation:20,power:.2},basketball:{type:'start-round'},'cup-pong':{aim:0,elevation:35,power:.3}}
  for(const [kind,move]of Object.entries(moves)){const state=createPartyGame(kind as typeof GAME_INFO[number]['kind'],players,'routing');const original=JSON.stringify(state);const next=applyPartyMove(state,'alpha',move,0);expect(next,kind).not.toBeNull();expect(next?.version).toBe(1);expect(JSON.stringify(state)).toBe(original);expect(validPartyGame(next)).toBe(true);expect(applyPartyMove(next!,'alpha',move,0)).toBeNull()}
})
it('rejects malformed or excessive peer payloads and handles earlier snapshots safely',()=>{
  const state=createPartyGame('connect4',players,'bounds')
  for(const value of [null,[],{}, {...state,turn:2},{...state,data:{...state.data,collectionVersion:999}},{...state,version:NaN},{...state,draw:true,winner:'alpha'},{...state,data:{...state.data,padding:'x'.repeat(50000)}}])expect(validPartyGame(value)).toBe(false)
  expect(applyPartyMove(state,'alpha',{padding:'x'.repeat(21000)},0)).toBeNull()
  const legacy=oldGame('connect4',players,'legacy');expect(validPartyGame(legacy)).toBe(true);expect(applyPartyMove(legacy,'alpha',{column:0},0)?.version).toBe(1)
})

it('integrates private fleet commitments and proofs without exposing fleet layouts',()=>{
  const first=createSeaSecret(),second=createSeaSecret();let game:ReturnType<typeof createPartyGame>={id:'private-sea',kind:'sea-battle' as const,players,turn:0,version:0,winner:null as string|null,draw:false,data:{...createBoardData('sea-battle',players,'private-sea'),collectionVersion:2}}
  game=applyPartyMove(game,'alpha',{action:'commit',root:seaRoot(first,game.id,'alpha')},game.version)!
  expect(game).not.toBeNull()
  game=applyPartyMove(game,'bravo',{action:'commit',root:seaRoot(second,game.id,'bravo')},game.version)!
  expect(validPartyGame(game)).toBe(true)
  expect(JSON.stringify(game)).not.toContain('ships')
  const cell=second.ships[0][0]
  game=applyPartyMove(game,'alpha',{action:'fire',to:cell},game.version)!
  expect(applyPartyMove(game,'alpha',seaProof(second,game.id,'bravo',cell),game.version)).toBeNull()
  game=applyPartyMove(game,'bravo',seaProof(second,game.id,'bravo',cell),game.version)!
  expect(validPartyGame(game)).toBe(true)
  expect(game.data.hits).toEqual([1,0])
})

it('retires removed games from new matches but retains safe older snapshots',()=>{for(const kind of ['sea-battle','reversi'] as const)expect(()=>createPartyGame(kind,players,'removed')).toThrow();const old=createPartyGame('chess',players,'old');old.data.collectionVersion=2;expect(validPartyGame(old)).toBe(true)})
