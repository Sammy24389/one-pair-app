import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {PeerGroup,onOpenPigeonMessage} from '../src/lib/groups'
import {idbGet,idbPut} from '../src/lib/idb'
import {joinRoom} from 'trystero'
import {normalizeOpenPigeonMessage,normalizeOpenPigeonSession,OPENPIGEON_RETENTION_MS,OPENPIGEON_MATCH_MS,openPigeonSessionActive,type OpenPigeonMessage,type OpenPigeonSession} from '../src/lib/openpigeon-protocol'
const local = vi.hoisted(() => ({deviceId:'owner123456',profile:{name:'Owner'}}))
const state = vi.hoisted(() => ({native:true,platform:'android'}))
vi.mock('../src/lib/identity',() => ({identity:{get:() => local}}))
vi.mock('trystero',() => ({joinRoom:vi.fn()}))
vi.mock('../src/lib/crypto',() => ({hkdfHex:async () => 'password',hmacHex:async (_:unknown,message:string) => 'mac-' + message,timingSafeEqual:(a:string,b:string) => a === b}))
vi.mock('../src/lib/settings',() => ({iceServers:() => [],settings:{get:() => ({keepAlive:false})}}))
vi.mock('../src/lib/native',() => ({nativeBridge:null}))
vi.mock('../src/lib/platform',() => ({get isNative(){return state.native},get platform(){return state.platform},withSystemUi:(f:() => unknown) => f()}))
vi.mock('../src/lib/idb',() => ({idbGet:vi.fn(async () => undefined),idbPut:vi.fn(async () => {}),idbDel:vi.fn(async () => {})}))
const record = {id:'group123456',owner:'owner123456',title:'Friends',secret:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}
const players = [record.owner,'friend123456']
const live: PeerGroup[] = []
const subscriptions: (() => void)[] = []
const message = (messageGuid = 'message-1',session = 'opaque-session'): OpenPigeonMessage => ({messageGuid,session,url:'data:?ver=52&data=a%2Bb+%25',isLive:false,caption:'Basketball'})
const snapshot = (revision = 1,overrides:Partial<OpenPigeonSession> = {}): OpenPigeonSession => ({id:'opaque-session',participants:players,revision,author:record.owner,message:message('message-' + revision),updatedAt:Date.now(),...overrides})
function make() {
  const group = new PeerGroup(record),send = vi.fn()
  group.peers.set('friend',{device:players[1],name:'Friend',openpigeon:1})
  group.peers.set('third',{device:'third123456',name:'Third',openpigeon:1})
  Reflect.set(group,'send',send);live.push(group)
  return {group,send}
}
function guest() {
  const result = make();local.deviceId=players[1]
  result.group.peers.delete('friend');result.group.peers.set('owner',{device:record.owner,name:'Owner',openpigeon:1})
  return result
}
const receive = (group:PeerGroup,event:unknown,peer = 'friend') => Reflect.get(group,'receive').call(group,event,peer)
beforeEach(() => {local.deviceId=record.owner;state.native=true;state.platform='android';vi.clearAllMocks();vi.mocked(idbGet).mockResolvedValue(undefined)})
afterEach(async () => {subscriptions.splice(0).forEach(stop => stop());await Promise.all(live.splice(0).map(group => group.destroy()));vi.useRealTimers()})
it('preserves opaque URLs and sessions exactly while stripping image and unknown fields',() => {
  const input = {...message(),session:'a%2Fb+z',imageBase64:'untrusted-image',imageURL:'https://bad.example/image'}
  const normalized = normalizeOpenPigeonMessage(input)!
  expect(normalized.url).toBe(input.url);expect(normalized.session).toBe(input.session)
  expect(normalized).not.toHaveProperty('imageBase64');expect(normalized).not.toHaveProperty('imageURL')
  for (const url of ['https://bad.example','javascript:alert(1)','data://bad',' data:?x=1','/data:?x=1','data:?'+ 'x'.repeat(90000)]) expect(normalizeOpenPigeonMessage({...message(),url})).toBeNull()
  expect(normalizeOpenPigeonMessage({...message(),url:'data:?'+'\"'.repeat(60000)})).toBeNull()
  expect(normalizeOpenPigeonMessage({...message(),session:'a b'})).toBeNull()
  expect(normalizeOpenPigeonMessage({...message(),caption:'x'.repeat(201)})).toBeNull()
  expect(normalizeOpenPigeonSession(snapshot(1,{participants:[record.owner,record.owner]}),record.owner)).toBeNull()
})
it('requires selected connected Android peers and owner-only creation',async () => {
  const {group} = make()
  expect(group.openPigeonReady(players)).toBe(true)
  state.native=false;expect(group.openPigeonReady(players)).toBe(false)
  state.native=true;state.platform='ios';expect(group.openPigeonReady(players)).toBe(false)
  state.platform='android';group.peers.get('friend')!.openpigeon=undefined
  await expect(group.openPigeonMessage(players,message())).rejects.toThrow('Android')
  group.peers.get('friend')!.openpigeon=1;local.deviceId=players[1]
  group.peers.set('owner',{device:record.owner,name:'Owner',openpigeon:1})
  await expect(group.openPigeonMessage(players,message())).rejects.toThrow('creator must start')
})
it('publishes accepted owner updates only to selected players and persists without previews',async () => {
  const {group,send} = make(),listener=vi.fn();subscriptions.push(onOpenPigeonMessage(listener))
  await group.openPigeonMessage(players,{...message(),imageBase64:'large-preview'})
  expect(group.openPigeonSessions[0].revision).toBe(1)
  expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][1]).toBe('friend')
  expect(listener).toHaveBeenCalledTimes(1)
  expect(idbPut).toHaveBeenCalledWith('kv','group.openpigeon.'+record.id,expect.objectContaining({sessions:expect.any(Array)}))
  expect(JSON.stringify(vi.mocked(idbPut).mock.calls)).not.toContain('large-preview')
  await group.openPigeonMessage(players,message());expect(group.openPigeonSessions[0].revision).toBe(1);expect(listener).toHaveBeenCalledTimes(1)
})
it('rejects nonparticipants, stale revisions, roster changes and replayed GUIDs',async () => {
  const {group,send} = make();await group.openPigeonMessage(players,message())
  receive(group,{type:'pigeon-request',participants:players,message:message('message-2'),revision:1},'third')
  expect(group.openPigeonSessions[0].revision).toBe(1)
  receive(group,{type:'pigeon-request',participants:players,message:message('message-2'),revision:0})
  expect(group.openPigeonSessions[0].revision).toBe(1)
  receive(group,{type:'pigeon-request',participants:[...players,'third123456'],message:message('message-2'),revision:1})
  expect(group.openPigeonSessions[0].revision).toBe(1)
  receive(group,{type:'pigeon-request',participants:players,message:message('message-2'),revision:1})
  expect(group.openPigeonSessions[0].revision).toBe(2)
  receive(group,{type:'pigeon-request',participants:players,message:message('message-1'),revision:2})
  expect(group.openPigeonSessions[0].revision).toBe(2)
  expect(send.mock.calls.filter(([event]) => event.type === 'pigeon-rejected')).toHaveLength(4)
  expect(send.mock.calls.some(([event,target]) => event.type === 'pigeon-state' && event.replay === true && target === 'friend')).toBe(true)
  expect(send.mock.calls.some(([event,target]) => event.type === 'pigeon-state' && target === 'third')).toBe(false)
})
it('guests accept only owner state, reject rollbacks and mark catch-up state and suppress duplicate replay',() => {
  const {group} = guest(),listener=vi.fn();subscriptions.push(onOpenPigeonMessage(listener))
  receive(group,{type:'pigeon-state',session:snapshot()},'third');expect(group.openPigeonSessions).toHaveLength(0)
  receive(group,{type:'pigeon-state',session:snapshot(),replay:true},'owner');expect(group.openPigeonSessions).toHaveLength(1);expect(listener).toHaveBeenCalledWith(group,expect.anything(),true)
  receive(group,{type:'pigeon-state',session:snapshot(2,{author:players[1]})},'owner');expect(listener).toHaveBeenCalledTimes(2)
  receive(group,{type:'pigeon-state',session:snapshot()},'owner')
  receive(group,{type:'pigeon-state',session:snapshot(2,{author:players[1]})},'owner')
  receive(group,{type:'pigeon-state',session:snapshot(2,{message:message('conflicting')})},'owner')
  expect(group.openPigeonSessions[0].revision).toBe(2);expect(listener).toHaveBeenCalledTimes(2)
})
it('waits for owner acknowledgement before accepting a guest native callback',async () => {
  const {group,send} = guest();receive(group,{type:'pigeon-state',session:snapshot(),replay:true},'owner')
  let accepted=false
  const promise=group.openPigeonMessage(players,message('message-2')).then(() => {accepted=true})
  expect(send.mock.calls.at(-1)).toEqual([{type:'pigeon-request',participants:players,message:message('message-2'),revision:1},'owner'])
  await Promise.resolve();expect(accepted).toBe(false)
  receive(group,{type:'pigeon-state',session:snapshot(2,{author:players[1]})},'owner')
  await promise;expect(accepted).toBe(true)
})
it('rejects guest callbacks on owner refusal, timeout and close',async () => {
  vi.useFakeTimers();const {group} = guest();receive(group,{type:'pigeon-state',session:snapshot()},'owner')
  const refused=expect(group.openPigeonMessage(players,message('refused'))).rejects.toThrow('changed')
  receive(group,{type:'pigeon-rejected',messageGuid:'refused',session:'opaque-session',reason:'Game changed'},'owner');await refused
  const timed=expect(group.openPigeonMessage(players,message('timed'))).rejects.toThrow('did not confirm')
  await vi.advanceTimersByTimeAsync(12000);await timed
  const closed=expect(group.openPigeonMessage(players,message('closed'))).rejects.toThrow('closed')
  await group.destroy();await closed
})
it('loads only valid recent bounded sessions and replays selected participant history on join',async () => {
  const {group} = make(),action={send:vi.fn(async () => {})},room={makeAction:() => action,leave:vi.fn(async () => {})}
  vi.mocked(joinRoom).mockReturnValue(room as never)
  const sessions = [snapshot(),snapshot(3,{id:'expired',message:message('old','expired'),updatedAt:Date.now()-OPENPIGEON_RETENTION_MS-1}),snapshot(2,{revision:-1})]
  vi.mocked(idbGet).mockImplementation(async (_store,key) => key.startsWith('group.openpigeon.') ? {sessions,seen:{}} : undefined)
  await group.connect();expect(group.openPigeonSessions).toHaveLength(1)
  Reflect.get(room,'onPeerJoin')('friend')
  const events=action.send.mock.calls.map(args => JSON.parse((args as unknown[])[0] as string))
  expect(events.filter(event => event.type === 'pigeon-state')).toHaveLength(1)
  action.send.mockClear();Reflect.get(room,'onPeerJoin')('third')
  expect(action.send.mock.calls.map(args => JSON.parse((args as unknown[])[0] as string)).some(event => event.type === 'pigeon-state')).toBe(false)
})
it('retains at most 24 sessions and accepts large opaque messages under the transport cap',async () => {
  const {group} = make()
  for (let i=0;i<25;i++) await group.openPigeonMessage(players,message('m'+i,'session'+i))
  expect(group.openPigeonSessions).toHaveLength(24);expect(group.openPigeonSessions[0].id).toBe('session24')
  const large={...message('large','large-session'),url:'data:?ver=52&data='+'x'.repeat(85000)}
  await expect(group.openPigeonMessage(players,large)).resolves.toBeUndefined()
  expect(group.openPigeonSessions[0].message.url).toBe(large.url)
  receive(group,{type:'pigeon-request',participants:players,message:{...large,messageGuid:'large-update'},revision:1})
  expect(group.openPigeonSessions[0].revision).toBe(2)
})
it('applies the existing per-peer event rate bound to native requests',async () => {
  const {group} = make();await group.openPigeonMessage(players,message())
  for(let revision=1;revision<=61;revision++) receive(group,{type:'pigeon-request',participants:players,message:message('m'+revision),revision})
  expect(group.openPigeonSessions[0].revision).toBe(61)
})

it('reports storage failure to the native callback and can retry its accepted update',async () => {
  const {group} = make()
  vi.mocked(idbPut).mockRejectedValueOnce(new Error('quota'))
  await expect(group.openPigeonMessage(players,message())).rejects.toThrow('could not be saved')
  expect(group.error).toContain('could not be saved')
  await expect(group.openPigeonMessage(players,message())).resolves.toBeUndefined()
  expect(group.openPigeonSessions[0].revision).toBe(1)
})
it('does not restore a delayed storage load after the group was closed',async () => {
  const {group} = make()
  let finish!:(value:unknown) => void
  vi.mocked(idbGet).mockImplementationOnce(() => new Promise(resolve => {finish=resolve}))
  const connecting=group.connect();await group.destroy();finish([]);await connecting
  expect(joinRoom).not.toHaveBeenCalled();expect(group.openPigeonSessions).toHaveLength(0)
})

it('keeps a fixed24hour deadline across turns and rejects play at expiry',async () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
  const {group}=make();await group.openPigeonMessage(players,message())
  const created=group.openPigeonSessions[0].createdAt
  await vi.advanceTimersByTimeAsync(OPENPIGEON_MATCH_MS-1)
  await group.openPigeonMessage(players,message('later'))
  expect(group.openPigeonSessions[0].createdAt).toBe(created)
  expect(openPigeonSessionActive(group.openPigeonSessions[0])).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(openPigeonSessionActive(group.openPigeonSessions[0])).toBe(false)
  await expect(group.openPigeonMessage(players,message('too-late'))).rejects.toThrow('expired')
})
it('closes completed games immediately and cannot revive them with another turn',async () => {
  const {group}=make();await group.openPigeonMessage(players,message())
  await group.openPigeonMessage(players,{...message('finished'),completed:true})
  expect(openPigeonSessionActive(group.openPigeonSessions[0])).toBe(false)
  await expect(group.openPigeonMessage(players,message('revive'))).rejects.toThrow('finished')
  expect(group.openPigeonSessions[0].message.completed).toBe(true)
})
it('validates completion and creation metadata and keeps opaque payload unchanged',() => {
  expect(normalizeOpenPigeonMessage({...message(),completed:'yes'})).toBeNull()
  expect(normalizeOpenPigeonMessage({...message(),completed:true})?.completed).toBe(true)
  expect(normalizeOpenPigeonSession({...snapshot(),createdAt:Date.now()+1e6},record.owner)).toBeNull()
  expect(normalizeOpenPigeonSession({...snapshot(),createdAt:-1},record.owner)).toBeNull()
})
