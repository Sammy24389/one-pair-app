import {afterEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import PartyGames from '../src/components/PartyGames'
import {createPartyGame, type GameKind, type PartyGame} from '../src/lib/party-games'
const players = [{id:'a',name:'Alex'},{id:'b',name:'Blair'}]
afterEach(() => {cleanup(); vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-reduce-motion')})
function setup(kind:GameKind | null, options: {me?:string;players?:typeof players;game?:PartyGame;isHost?:boolean}={}) {
  const onMove=vi.fn(),onStart=vi.fn()
  render(<PartyGames game={options.game || (kind ? createPartyGame(kind,['a','b'],'game-one') : null)} players={options.players || players} me={options.me || 'a'} isHost={options.isHost ?? true} onStart={onStart} onMove={onMove}/>)
  return {onMove,onStart}
}
it('offers all eight games and starts a selected game with chosen participants', () => {
  const {onStart}=setup(null)
  expect(screen.getByLabelText('Choose a game').children.length).toBe(8)
  fireEvent.click(screen.getByRole('button',{name:/Four in a row 2 players/}))
  fireEvent.click(screen.getByRole('button',{name:'Start Four in a row'}))
  expect(onStart).toHaveBeenCalledWith('connect4',['a','b'])
})
it('keeps the creator selected and disables start without an opponent', () => {
  setup(null)
  expect((screen.getByRole('checkbox',{name:'You'}) as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox',{name:'Blair'}))
  expect((screen.getByRole('button',{name:'Start Darts'}) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('checkbox',{name:'Blair'}) as HTMLInputElement).checked).toBe(false)
})
it('lets guests browse but only the creator can start', () => {
  setup(null,{isHost:false})
  expect(screen.queryByRole('button',{name:'Start Darts'})).toBeNull()
  expect(screen.getByText(/creator starts games/)).toBeTruthy()
})
it('submits a real column move and prevents spectators from playing', () => {
  const {onMove}=setup('connect4')
  fireEvent.click(screen.getByRole('button',{name:'Drop in column 3'}))
  expect(onMove).toHaveBeenCalledWith({column:2})
  cleanup()
  setup('connect4',{me:'spectator'})
  expect((screen.getByRole('button',{name:'Drop in column 3'}) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Watching/)).toBeTruthy()
})
it('pauses when an active participant disconnects', () => {
  setup('connect4',{players:[players[0]]})
  expect(screen.getByText(/waiting for a player to reconnect/)).toBeTruthy()
  expect((screen.getByRole('button',{name:'Drop in column 1'}) as HTMLButtonElement).disabled).toBe(true)
})
it('labels word entry, states dictionary limitation, and sends a word', () => {
  const {onMove}=setup('words')
  fireEvent.change(screen.getByLabelText('Your word'),{target:{value:'apple'}})
  fireEvent.click(screen.getByRole('button',{name:'Play word'}))
  expect(onMove).toHaveBeenCalledWith({word:'apple'})
  expect(screen.getByText(/no dictionary is used/)).toBeTruthy()
})
it('renders checkers pieces and sends an origin/destination pair', () => {
  const {onMove}=setup('checkers')
  fireEvent.click(screen.getByRole('button',{name:'Row 3, column 2: You piece'}))
  fireEvent.click(screen.getByRole('button',{name:'Row 4, column 1: empty'}))
  expect(onMove).toHaveBeenCalledWith({from:17,to:24})
})
it('reads mancala seeds from pits and sends relative pit index', () => {
  const {onMove}=setup('mancala')
  fireEvent.click(screen.getByRole('button',{name:'Sow pit 2, 4 seeds'}))
  expect(onMove).toHaveBeenCalledWith({pit:1})
})
it('renders paintball positions and sends a grid action', () => {
  const {onMove}=setup('paintball')
  expect(screen.getByRole('button',{name:'Row 1, column 1, You'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Row 1, column 2'}))
  expect(onMove).toHaveBeenCalledWith({action:'move',x:1,y:0})
})
it('offers a keyboard friendly reduced-motion aiming alternative and guards duplicate shots', () => {
  const {onMove}=setup('basketball')
  fireEvent.click(screen.getByRole('checkbox',{name:'Reduced motion: manual aiming'}))
  fireEvent.change(screen.getByRole('slider',{name:/Vertical aim/}),{target:{value:'25'}})
  fireEvent.click(screen.getByRole('button',{name:'Shoot now'}))
  expect(onMove).toHaveBeenCalledWith({x:.5,y:.25})
  expect((screen.getByRole('button',{name:'Shoot now'}) as HTMLButtonElement).disabled).toBe(true)
})
it('renders all sports surfaces and hides cleared cup targets', () => {
  setup('darts')
  expect(screen.getByRole('img',{name:/Dartboard/})).toBeTruthy()
  cleanup()
  const game=createPartyGame('cup-pong',['a','b'],'cups')
  ;(game.data.cups as number[][])[1][0]=0
  setup('cup-pong',{game})
  expect(screen.getByRole('img',{name:/Cup pong table/}).querySelectorAll('.party-cup').length).toBe(5)
})

it('cancels aiming when the app is hidden without submitting a shot', () => {
  const cancel=vi.fn()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 77))
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const {onMove}=setup('darts')
  fireEvent.click(screen.getByRole('button',{name:'Start aiming'}))
  expect(screen.getByRole('button',{name:'Throw now'})).toBeTruthy()
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'})
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(cancel).toHaveBeenCalledWith(77)
  expect(onMove).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Start aiming'})).toBeTruthy()
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
})
it('honors app reduced-motion preference and recovers from a thrown send error', () => {
  document.documentElement.setAttribute('data-reduce-motion','')
  const onMove=vi.fn(() => {throw new Error('Connection lost. Try again.')})
  render(<PartyGames game={createPartyGame('basketball',['a','b'],'retry')} players={players} me="a" isHost onStart={vi.fn()} onMove={onMove}/>)
  expect((screen.getByRole('checkbox',{name:'Reduced motion: manual aiming'}) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'Shoot now'}))
  expect(screen.getByRole('alert').textContent).toContain('Connection lost')
  expect((screen.getByRole('button',{name:'Shoot now'}) as HTMLButtonElement).disabled).toBe(false)
})
