import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import OpenPigeonRoom from '../src/components/OpenPigeonRoom'
import type {PeerGroup} from '../src/lib/groups'
const mocks = vi.hoisted(() => ({state:{supported:true,installed:true,version:'1.0',connected:true,locked:false,loading:false,error:''},picker:vi.fn(),open:vi.fn(),refresh:vi.fn()}))
vi.mock('../src/lib/openpigeon', () => ({openPigeonState:{use:()=>mocks.state},openOpenPigeonPicker:mocks.picker,openOpenPigeonGame:mocks.open,refreshOpenPigeon:mocks.refresh}))
vi.mock('../src/lib/identity', () => ({identity:{use:(select:(s:{deviceId:string})=>string)=>select({deviceId:'me'})}}))
vi.mock('../src/lib/groups', () => ({groupEvents:{use:()=>({version:0})}}))
function room(owner='me', sessions:unknown[]=[]) {return {record:{id:'room',owner},peers:new Map([['peer',{device:'friend',name:'Alex',openpigeon:1}],['pc',{device:'browser',name:'Browser friend'}]]),openPigeonSessions:sessions,openPigeonReady:vi.fn((players:string[])=>players.every(id=>['me','friend'].includes(id)))} as unknown as PeerGroup}
afterEach(cleanup)
beforeEach(()=>{Object.assign(mocks.state,{supported:true,installed:true,version:'1.0',connected:true,locked:false,loading:false,error:''});vi.clearAllMocks()})
it('explains Android requirement on browsers without presenting unusable controls',()=>{mocks.state.supported=false;render(<OpenPigeonRoom group={room()}/>);expect(screen.getByText(/Browser and PC support/)).toBeTruthy();expect(screen.queryByRole('button',{name:/Choose a game/})).toBeNull();expect(screen.queryByRole('button',{name:'Install OpenPigeon'})).toBeNull()})
it('launches native picker with creator and eligible friend instead of local games',async()=>{const group=room();render(<OpenPigeonRoom group={group}/>);expect((screen.getByRole('checkbox',{name:/You/}) as HTMLInputElement).disabled).toBe(true);expect((screen.getByRole('checkbox',{name:/Browser friend/}) as HTMLInputElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Choose a game'}));await waitFor(()=>expect(mocks.picker).toHaveBeenCalledWith(group,['me','friend']));expect(screen.getByText('No OpenPigeon matches yet.')).toBeTruthy()})
it('disables starting without an opponent and blocks non-owner starts',()=>{render(<OpenPigeonRoom group={room()}/>);fireEvent.click(screen.getByRole('checkbox',{name:/Alex/}));expect((screen.getByRole('button',{name:'Choose a game'}) as HTMLButtonElement).disabled).toBe(true);cleanup();render(<OpenPigeonRoom group={room('friend')}/>);expect(screen.queryByRole('button',{name:'Choose a game'})).toBeNull();expect(screen.getByText(/The room creator chooses/)).toBeTruthy()})
it('resumes participant matches and rejects spectator opening',async()=>{const session={id:'one',participants:['me','friend'],revision:1,author:'friend',message:{url:'https://example.com',caption:'Basketball',subcaption:'Your turn'},updatedAt:Date.now()};const group=room('friend',[session]);render(<OpenPigeonRoom group={group}/>);fireEvent.click(screen.getByRole('button',{name:'Open Basketball'}));await waitFor(()=>expect(mocks.open).toHaveBeenCalledWith(group,session));cleanup();render(<OpenPigeonRoom group={room('friend',[{...session,participants:['friend','other']}])}/>);expect((screen.getByRole('button',{name:'Open Basketball'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('You are not a player in this match.')).toBeTruthy()})
it('shows launch errors and disables activity while Padi is locked',async()=>{mocks.picker.mockRejectedValueOnce(new Error('OpenPigeon disconnected'));render(<OpenPigeonRoom group={room()}/>);fireEvent.click(screen.getByRole('button',{name:'Choose a game'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('OpenPigeon disconnected'));cleanup();mocks.state.locked=true;render(<OpenPigeonRoom group={room()}/>);expect((screen.getByRole('button',{name:'Choose a game'}) as HTMLButtonElement).disabled).toBe(true)})

it('shows browser match summaries as text without exposing message URLs as links',()=>{mocks.state.supported=false;render(<OpenPigeonRoom group={room('friend',[{id:'one',participants:['me','friend'],message:{caption:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'},updatedAt:Date.now()}])}/>);expect(screen.getByRole('heading',{name:'<img src=x onerror=alert(1)>'})).toBeTruthy();expect(screen.queryByRole('link')).toBeNull();expect((screen.getByRole('button',{name:'Open <img src=x onerror=alert(1)>'}) as HTMLButtonElement).disabled).toBe(true)})

it('offers engine recovery without a second installation when unavailable',async()=>{mocks.state.installed=false;render(<OpenPigeonRoom group={room()}/>);expect(screen.getByText(/included game engine is unavailable/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Install OpenPigeon'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry connection'}));await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledOnce())})
it('explains the single-install experience and credits OpenPigeon',()=>{render(<OpenPigeonRoom group={room()}/>);expect(screen.getByText(/No second app is needed/)).toBeTruthy();expect(screen.getByText(/Games by OpenPigeon/)).toBeTruthy();expect(screen.getByText(/OpenPigeon included/)).toBeTruthy()})

it('hides completed and24hour-expired matches while retaining active ones',()=>{
 const base={participants:['me','friend'],revision:1,author:'friend',updatedAt:Date.now(),createdAt:Date.now()}
 render(<OpenPigeonRoom group={room('friend',[
 {...base,id:'active',message:{caption:'Active'}},
 {...base,id:'finished',message:{caption:'Finished',completed:true}},
 {...base,id:'expired',createdAt:Date.now()-86400000,message:{caption:'Expired'}}
 ])}/> )
 expect(screen.getByRole('button',{name:'Open Active'})).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Open Finished'})).toBeNull()
 expect(screen.queryByRole('button',{name:'Open Expired'})).toBeNull()
})
