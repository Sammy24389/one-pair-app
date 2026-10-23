import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import PartyGames from '../src/components/PartyGames'
import {createPartyGame,type GameKind} from '../src/lib/party-games'
const players=[{id:'a',name:'Alex'},{id:'b',name:'Blair'}]
afterEach(()=>cleanup())
function setup(kind:GameKind|null,me='a',isHost=true,connected=players){const onMove=vi.fn(),onStart=vi.fn();render(<PartyGames game={kind?createPartyGame(kind,['a','b'],'game-one'):null} players={connected} me={me} isHost={isHost} onStart={onStart} onMove={onMove}/>);return {onMove,onStart}}
it('offers only the thirteen selected games and filters the three categories',()=>{
  setup(null);expect(screen.getByLabelText('Choose a game').children.length).toBe(13)
  fireEvent.click(screen.getByRole('button',{name:'Boards'}));expect(screen.getByLabelText('Choose a game').children.length).toBe(5)
  fireEvent.click(screen.getByRole('button',{name:'Words'}));expect(screen.getByLabelText('Choose a game').children.length).toBe(3)
  fireEvent.click(screen.getByRole('button',{name:'Sports'}));expect(screen.getByLabelText('Choose a game').children.length).toBe(5)
})
it('starts selected games with shuffled chosen participants and keeps creator selected',()=>{
  const {onStart}=setup(null)
  expect((screen.getByRole('checkbox',{name:'You'})as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:/Chess 2 players/}));fireEvent.click(screen.getByRole('button',{name:'Start Chess'}))
  expect(onStart.mock.calls[0][0]).toBe('chess');expect([...onStart.mock.calls[0][1]].sort()).toEqual(['a','b'])
})
it('disables start without opponent and does not let guests start',()=>{
  setup(null);fireEvent.click(screen.getByRole('checkbox',{name:'Blair'}));expect((screen.getByRole('button',{name:'Start Four in a Row'})as HTMLButtonElement).disabled).toBe(true)
  cleanup();setup(null,'a',false);expect(screen.queryByRole('button',{name:/^Start /})).toBeNull()
})
it('routes board moves and prevents spectators or disconnected players acting',()=>{
  const {onMove}=setup('connect4');fireEvent.click(screen.getByRole('button',{name:'Drop into column 3'}));expect(onMove).toHaveBeenCalledWith({column:2})
  cleanup();setup('connect4','spectator');expect((screen.getByRole('button',{name:'Drop into column 3'})as HTMLButtonElement).disabled).toBe(true)
  cleanup();setup('connect4','a',true,[players[0]]);expect(screen.getByText(/Game paused/)).toBeTruthy();expect((screen.getByRole('button',{name:'Drop into column 3'})as HTMLButtonElement).disabled).toBe(true)
})

it('pauses a match with an explicit update message for incompatible reconnected players',()=>{render(<PartyGames game={createPartyGame('connect4',['a','b'],'update')} players={players} me="a" isHost compatible={false} onStart={vi.fn()} onMove={vi.fn()}/>);expect(screen.getByText(/needs to update/)).toBeTruthy();expect((screen.getByRole('button',{name:'Drop into column 1'})as HTMLButtonElement).disabled).toBe(true)})
