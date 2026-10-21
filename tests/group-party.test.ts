import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {PeerGroup, onGroupMessage} from '../src/lib/groups'
import {createPartyGame} from '../src/lib/party-games'
import {joinRoom} from 'trystero'
import {idbGet} from '../src/lib/idb'
const local = vi.hoisted(() => ({deviceId: 'owner123456', profile: {name: 'Owner'}}))
vi.mock('../src/lib/identity', () => ({identity: {get: () => local}}))
vi.mock('trystero', () => ({joinRoom: vi.fn()}))
vi.mock('../src/lib/crypto', () => ({hkdfHex: async () => 'password', hmacHex: async (_:unknown, message:string) => 'mac-' + message, timingSafeEqual: (a:string,b:string) => a === b}))
vi.mock('../src/lib/settings', () => ({iceServers: () => [], settings: {get: () => ({keepAlive:false})}}))
vi.mock('../src/lib/native', () => ({nativeBridge: null}))
vi.mock('../src/lib/platform', () => ({withSystemUi: (f: () => unknown) => f()}))
vi.mock('../src/lib/idb', () => ({idbGet: vi.fn(async () => undefined), idbPut: vi.fn(async () => {}), idbDel: vi.fn(async () => {})}))
const record = {id:'group123456', owner:'owner123456', title:'Friends', secret:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}
const live: PeerGroup[] = []
function make() {
  const group = new PeerGroup(record)
  group.peers.set('friend', {device:'friend123456',name:'Friend'})
  group.peers.set('third', {device:'third123456',name:'Third'})
  live.push(group)
  return group
}
const receive = (group: PeerGroup, event: unknown, peer = 'friend') => Reflect.get(group, 'receive').call(group,event,peer)
beforeEach(() => {local.deviceId = record.owner; vi.mocked(idbGet).mockResolvedValue(undefined); vi.mocked(joinRoom).mockReset()})
afterEach(async () => {await Promise.all(live.splice(0).map(g => g.destroy())); vi.restoreAllMocks()})
it('validates host, chosen participants and local moves before broadcasting', () => {
  const group=make(), send=vi.fn(); Reflect.set(group,'send',send)
  expect(() => group.startParty('connect4',[record.owner,'absent123456'])).toThrow()
  group.startParty('connect4',[record.owner,'friend123456'])
  expect(send.mock.calls.at(-1)?.[0].type).toBe('party-state')
  group.partyMove({column:0})
  expect(group.party?.version).toBe(1)
  expect(() => group.partyMove({column:1})).toThrow()
  local.deviceId='friend123456'
  expect(() => group.startParty('connect4',[record.owner,'friend123456'])).toThrow()
})
it('rejects stale, duplicate, wrong-turn, mismatched-game and disconnected moves', () => {
  const group=make()
  group.startParty('connect4',[record.owner,'friend123456'])
  group.partyMove({column:0})
  const move={type:'party-move',gameId:group.party!.id,version:1,move:{column:1}}
  receive(group,move,'third'); expect(group.party?.version).toBe(1)
  receive(group,{...move,gameId:'other-game'}); expect(group.party?.version).toBe(1)
  group.peers.delete('friend'); receive(group,move); expect(group.party?.version).toBe(1)
  group.peers.set('friend',{device:'friend123456',name:'Friend'})
  receive(group,move); expect(group.party?.version).toBe(2)
  receive(group,move); expect(group.party?.version).toBe(2)
  group.peers.delete('friend'); expect(() => group.partyMove({column:0})).toThrow('reconnect')
})
it('accepts valid owner snapshots and rejects forged, malformed or rolled-back states', () => {
  const group=make(); local.deviceId='friend123456'
  group.peers.set('owner',{device:record.owner,name:'Owner'})
  const game=createPartyGame('words',[record.owner,'friend123456'],'game123456')
  receive(group,{type:'party-state',sequence:1,game},'third'); expect(group.party).toBeNull()
  receive(group,{type:'party-state',sequence:1,game:{...game,data:{words:['<script>'],scores:[0,0]}}},'owner'); expect(group.party).toBeNull()
  receive(group,{type:'party-state',sequence:1,game},'owner'); expect(group.party?.id).toBe(game.id)
  receive(group,{type:'party-state',sequence:0,game:null},'owner'); expect(group.party).not.toBeNull()
  receive(group,{type:'party-state',sequence:2,game:null},'owner'); expect(group.party).toBeNull()
})
it('emits a live notification once and never for history replay', () => {
  const group=make(), incoming=vi.fn(), off=onGroupMessage(incoming)
  const message={id:'message123456',from:'friend123456',name:'Friend',text:'Hello',ts:Date.now()}
  receive(group,{type:'message',message});receive(group,{type:'message',message})
  receive(group,{type:'history',messages:[{...message,id:'history123456'}]})
  expect(incoming).toHaveBeenCalledExactlyOnceWith(group,message)
  off()
})
it('coalesces connection setup and cancels a setup disposed during storage loading', async () => {
  let resolve!: (value:undefined) => void
  vi.mocked(idbGet).mockReturnValue(new Promise<undefined>(r => {resolve=r}))
  const group=new PeerGroup(record);live.push(group)
  const a=group.connect(), b=group.connect();expect(a).toBe(b)
  await group.destroy();resolve(undefined);await a
  expect(joinRoom).not.toHaveBeenCalled()
})
it('does not reconnect healthy rooms or active calls', async () => {
  const group=make(), leave=vi.fn();group.room={leave} as never;group.connected=true
  await group.reconnect();expect(leave).not.toHaveBeenCalled()
  group.connected=false;group.joining=true
  await group.reconnect();expect(leave).not.toHaveBeenCalled()
})
it('rejects bad group proof and frees the pending admission slot', async () => {
  const room={makeAction:()=>({send:vi.fn(async()=>{})}),leave:vi.fn(async()=>{})}
  vi.mocked(joinRoom).mockReturnValue(room as never)
  const group=new PeerGroup(record);live.push(group);await group.connect()
  const options=vi.mocked(joinRoom).mock.calls[0][2]!
  const send=vi.fn(async()=>{}), receiveHello=vi.fn().mockResolvedValueOnce({data:{device:'friend123456',name:'Friend',nonce:'nonce123456'}}).mockResolvedValueOnce({data:{mac:'forged'}})
  await expect(options.onPeerHandshake!('friend',send,receiveHello,true)).rejects.toThrow('proof')
  expect(group.peers.size).toBe(0);expect(Reflect.get(group,'pending')).toBe(0)
})
