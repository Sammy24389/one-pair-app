import {afterEach, expect, it, vi} from 'vitest'
import {PeerGroup, groupInvitation, parseGroupInvitation, raceMove, type Race} from '../src/lib/groups'
import {identity} from '../src/lib/identity'
import {claimMedia, releaseMedia} from '../src/lib/media-lease'
vi.mock('trystero', () => ({joinRoom: vi.fn()}))
vi.mock('../src/lib/crypto', () => ({hkdfHex: vi.fn(async () => 'password')}))
vi.mock('../src/lib/settings', () => ({iceServers: () => [], settings: {get: () => ({startTab:'home', lockMode:'off', sounds:false, notificationTone:'silent', keepAlive:false})}}))
vi.mock('../src/lib/idb', () => ({idbGet: vi.fn(async () => undefined), idbPut: vi.fn(async () => {}), idbDel: vi.fn(async () => {})}))
const record = {id: 'group123456', owner: 'owner123456', title: 'Friends', secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}
const groups: PeerGroup[] = []
afterEach(() => {groups.forEach(g => g.leaveCall()); groups.length = 0; vi.unstubAllGlobals()})
it('round trips invitations and rejects malformed or oversized input', () => {
  expect(parseGroupInvitation(groupInvitation(record))).toEqual(record)
  for (const raw of ['wrong', 'PADI-GROUP:invalid', 'x'.repeat(1601), groupInvitation({...record, title: ''}), groupInvitation({...record, secret: 'short'})]) expect(() => parseGroupInvitation(raw)).toThrow()
})
it('validates turn, version, legal move, winner and exact target at the host', () => {
  const race: Race = {players: ['owner123456', 'friend123456'], total: 18, turn: 0, winner: null, version: 3}
  expect(raceMove(race, 'friend123456', 2, 3)).toBeNull()
  expect(raceMove(race, 'owner123456', 2, 2)).toBeNull()
  expect(raceMove(race, 'owner123456', 4, 3)).toBeNull()
  expect(raceMove(race, 'owner123456', 1.5, 3)).toBeNull()
  const won = raceMove(race, 'owner123456', 3, 3)!
  expect(won.winner).toBe('owner123456')
  expect(raceMove(won, 'friend123456', 1, 4)).toBeNull()
  expect(raceMove({...race, total: 20}, 'owner123456', 2, 3)).toBeNull()
})
it('rejects capture when another call owns the microphone', async () => {
  const owner = {}; claimMedia(owner)
  const group = new PeerGroup(record); groups.push(group)
  group.room = {} as never
  await expect(group.joinCall(false)).rejects.toThrow('current call')
  releaseMedia(owner)
})
it('stops media granted after cancellation without publishing it', async () => {
  let grant!: (s: MediaStream) => void
  const stop = vi.fn()
  const stream = {getTracks: () => [{stop}]} as unknown as MediaStream
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: () => new Promise<MediaStream>(r => {grant = r})}})
  const group = new PeerGroup(record); groups.push(group)
  const addStream = vi.fn()
  group.room = {addStream, removeStream: vi.fn()} as never
  const pending = group.joinCall(false)
  group.leaveCall(); grant(stream); await pending
  expect(stop).toHaveBeenCalledOnce()
  expect(addStream).not.toHaveBeenCalled()
  expect(group.local).toBeNull()
})
it('caps retained group history and validates outgoing text', () => {
  const group = new PeerGroup(record); groups.push(group)
  expect(() => group.message(' ')).toThrow()
  expect(() => group.message('x'.repeat(2001))).toThrow()
  for (let i = 0; i < 310; i++) group.message('message ' + i)
  expect(group.messages).toHaveLength(300)
})

it('targets call media only at explicitly joined peers and always releases tracks on teardown failure', async () => {
  const stop = vi.fn()
  const stream = {getTracks: () => [{stop}]} as unknown as MediaStream
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia: vi.fn(async () => stream)}})
  const group = new PeerGroup(record); groups.push(group)
  const addStream = vi.fn(() => [])
  group.room = {addStream, removeStream: vi.fn(() => {throw new Error('transport gone')})} as never
  group.callers.add('explicit-join')
  group.peers.set('passive-peer', {device: 'passive123456', name: 'Passive'})
  await group.joinCall(false)
  expect(addStream).toHaveBeenCalledExactlyOnceWith(stream, {target: 'explicit-join'})
  group.leaveCall()
  expect(stop).toHaveBeenCalledOnce()
  const other = {}; expect(claimMedia(other)).toBe(true); releaseMedia(other)
})

it('chunks all retained messages under the transport limit and paces large replay', async () => {
  vi.useFakeTimers()
  const group = new PeerGroup(record); groups.push(group)
  group.peers.set('friend', {device: 'friend123456', name: 'Friend'})
  group.messages = Array.from({length: 300}, (_, i) => ({id: 'message' + String(i).padStart(5, '0'), from: 'friend123456', name: 'Friend', text: '\u0001'.repeat(2000), ts: Date.now()}))
  const send = vi.fn(); Reflect.set(group, 'send', send)
  Reflect.get(group, 'sendHistory').call(group, 'friend')
  expect(send.mock.calls.length).toBeLessThanOrEqual(25)
  await vi.advanceTimersByTimeAsync(33000)
  const chunks = send.mock.calls.map(c => c[0]).filter(e => e.type === 'history')
  expect(chunks.flatMap(e => e.messages)).toHaveLength(300)
  expect(chunks.every(e => new TextEncoder().encode(JSON.stringify(e)).byteLength <= 48000)).toBe(true)
  await group.destroy(); vi.useRealTimers()
})
it('rejects forged live authors, oversized text and excess event bursts', () => {
  const group = new PeerGroup(record); groups.push(group)
  group.peers.set('friend', {device: 'friend123456', name: 'Old name'})
  const receive = Reflect.get(group, 'receive').bind(group)
  const message = {id: 'message123456', from: 'other123456', name: 'New name', text: 'hello', ts: Date.now()}
  receive({type: 'message', message}, 'friend')
  expect(group.messages).toHaveLength(0)
  receive({type: 'message', message: {...message, from: 'friend123456', text: 'x'.repeat(2001)}}, 'friend')
  expect(group.messages).toHaveLength(0)
  for (let i = 0; i < 65; i++) receive({type: 'message', message: {...message, id: 'message' + String(i).padStart(5, '0'), from: 'friend123456'}}, 'friend')
  expect(group.messages).toHaveLength(58)
  expect(group.messages[0].name).toBe('New name')
})

it('delivers all 300 short messages without the receive item cap dropping history', () => {
  const sender = new PeerGroup(record); const receiver = new PeerGroup(record); groups.push(sender, receiver)
  sender.peers.set('friend', {device: 'friend123456', name: 'Friend'})
  receiver.peers.set('sender', {device: 'sender123456', name: 'Sender'})
  sender.messages = Array.from({length: 300}, (_, i) => ({id: 'message' + String(i).padStart(5, '0'), from: 'friend123456', name: 'Friend', text: 'Hi', ts: Date.now()}))
  Reflect.set(sender, 'send', (event: unknown) => Reflect.get(receiver, 'receive').call(receiver, event, 'sender'))
  Reflect.get(sender, 'sendHistory').call(sender, 'friend')
  expect(receiver.messages).toHaveLength(300)
})

it('requires selected participants to support the same game protocol',()=>{
  const owner=identity.get().deviceId,group=new PeerGroup({...record,owner});groups.push(group)
  group.peers.set('friend',{device:'friend123456',name:'Friend'})
  expect(()=>group.startParty('chess',[owner,'friend123456'])).toThrow('update the app')
  group.peers.set('friend',{device:'friend123456',name:'Friend',games:3})
  group.startParty('chess',[owner,'friend123456'])
  expect(group.party?.kind).toBe('chess')
  expect(group.party?.data.collectionVersion).toBe(3)
  group.peers.set('friend',{device:'friend123456',name:'Friend'})
  expect(group.partyCompatible()).toBe(false)
  expect(group.partyReady()).toBe(false)
})
