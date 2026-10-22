import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {PeerGroup} from '../src/lib/groups'
import {joinRoom} from 'trystero'
import {notifyNow, toast} from '../src/lib/notify'
import {playNotificationTone} from '../src/lib/sound'

const privacy=vi.hoisted(()=>({hidden:false,locked:false,blur:false}))
const local=vi.hoisted(()=>({deviceId:'owner123456',profile:{name:'Owner'}}))
vi.mock('../src/lib/identity',()=>({identity:{get:()=>local}}))
vi.mock('trystero',()=>({joinRoom:vi.fn()}))
vi.mock('../src/lib/crypto',()=>({hkdfHex:async()=>'password',hmacHex:async()=>'',timingSafeEqual:()=>true}))
vi.mock('../src/lib/settings',()=>({iceServers:()=>[],settings:{get:()=>({keepAlive:false,privacyBlur:privacy.blur})}}))
vi.mock('../src/lib/native',()=>({nativeBridge:null}))
vi.mock('../src/lib/platform',()=>({withSystemUi:(f:()=>unknown)=>f(),isAppHidden:()=>privacy.hidden}))
vi.mock('../src/lib/security',()=>({lockState:{get:()=>({locked:privacy.locked})}}))
vi.mock('../src/lib/idb',()=>({idbGet:vi.fn(async()=>undefined),idbPut:vi.fn(async()=>{}),idbDel:vi.fn(async()=>{})}))
vi.mock('../src/lib/notify',()=>({notifyNow:vi.fn(async()=>{}),toast:vi.fn()}))
vi.mock('../src/lib/sound',()=>({playNotificationTone:vi.fn()}))
vi.mock('../src/lib/nav',()=>({openRoute:vi.fn()}))
const record={id:'group123456',owner:'owner123456',title:'Friends',secret:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}
const live:PeerGroup[]=[]
const receive=(group:PeerGroup,event:unknown,peer='friend')=>Reflect.get(group,'receive').call(group,event,peer)
function media() {
  const ended: (()=>void)[]=[]
  const track={stop:vi.fn(),addEventListener:vi.fn((_name:string,fn:()=>void)=>ended.push(fn))}
  const stream={getTracks:()=>[track]} as unknown as MediaStream
  return {stream,track,end:()=>ended.forEach(fn=>fn())}
}
function setup() {
  const room={addStream:vi.fn((_stream:MediaStream,_options?:unknown)=>[Promise.resolve()]),removeStream:vi.fn(),leave:vi.fn(async()=>{}),makeAction:()=>({send:vi.fn(async()=>{})}),onPeerStream:undefined as unknown as (stream:MediaStream,peer:string,metadata?:unknown)=>void}
  const group=new PeerGroup(record);group.room=room as never
  group.peers.set('friend',{device:'friend123456',name:'Friend'});live.push(group)
  const send=vi.fn();Reflect.set(group,'send',send)
  return {group,room,send}
}
beforeEach(()=>{vi.clearAllMocks();privacy.hidden=false;privacy.locked=false;privacy.blur=false})
afterEach(async()=>{await Promise.all(live.splice(0).map(group=>group.destroy()));vi.restoreAllMocks()})
it('rejects a presentation without a connected room and releases its capture',async()=>{
  const {group}=setup(),capture=media();group.room=null
  await expect(group.present(capture.stream,'Screen')).rejects.toThrow('Connect')
  expect(capture.track.stop).toHaveBeenCalledOnce();expect(group.presentation).toBeNull()
})
it('replaces a presentation, unregisters the old stream and ignores its late ended event',async()=>{
  const {group,room,send}=setup(),first=media(),second=media()
  await group.present(first.stream,'First');await group.present(second.stream,'Second')
  expect(first.track.stop).toHaveBeenCalledOnce();expect(room.removeStream).toHaveBeenCalledWith(first.stream)
  first.end();expect(group.presentation).toBe(second.stream)
  second.end();expect(group.presentation).toBeNull();expect(second.track.stop).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledWith({type:'presentation-ended'})
})
it('cleans a failed stream publication and bounds the shared title',async()=>{
  const {group,room}=setup(),capture=media()
  room.addStream.mockReturnValueOnce([Promise.reject(new Error('Transport lost'))])
  await expect(group.present(capture.stream,'a'.repeat(200))).rejects.toThrow('Transport lost')
  expect(group.presentation).toBeNull();expect(capture.track.stop).toHaveBeenCalledOnce()
  expect(room.addStream.mock.calls[0][1]).toEqual({metadata:{padi:'presentation',title:'a'.repeat(80)}})
})
it('does not let an older publication failure terminate a newer presentation',async()=>{
  const {group,room}=setup(),first=media(),second=media()
  let reject!:(error:Error)=>void
  room.addStream.mockReturnValueOnce([new Promise<void>((_,fail)=>{reject=fail})])
  const earlier=group.present(first.stream,'First').catch(()=>{})
  await group.present(second.stream,'Second');reject(new Error('Old transport failed'));await earlier
  expect(group.presentation).toBe(second.stream);expect(second.track.stop).not.toHaveBeenCalled()
})
it('alerts once for a new authorized group caller and suppresses duplicates and unknown peers',()=>{
  const {group}=setup();privacy.hidden=true;vi.spyOn(Date,'now').mockReturnValue(100000)
  receive(group,{type:'call',joined:true},'intruder')
  receive(group,{type:'call',joined:'yes'})
  expect(notifyNow).not.toHaveBeenCalled()
  receive(group,{type:'call',joined:true});receive(group,{type:'call',joined:true})
  expect(group.callers.has('friend')).toBe(true)
  expect(notifyNow).toHaveBeenCalledExactlyOnceWith('Incoming group call','Friend is calling in Friends',{sub:'groups',focus:record.id,tab:'more'})
  expect(toast).toHaveBeenCalledOnce();expect(playNotificationTone).toHaveBeenCalledOnce()
  receive(group,{type:'call',joined:false});receive(group,{type:'call',joined:true})
  expect(notifyNow).toHaveBeenCalledOnce()
})
it('does not play an incoming-call alert while already in the call',()=>{
  const {group}=setup();group.local=media().stream
  receive(group,{type:'call',joined:true})
  expect(notifyNow).not.toHaveBeenCalled();expect(playNotificationTone).not.toHaveBeenCalled()
})
it('keeps a remote presentation separate from conference call video',async()=>{
  const {group,room}=setup();group.room=null
  vi.mocked(joinRoom).mockReturnValue(room as never);await group.connect()
  const screen=media().stream,camera=media().stream
  room.onPeerStream(screen,'friend',{padi:'presentation',title:'Cinema'})
  expect(group.shared.get('friend')?.stream).toBe(screen);expect(group.remote.size).toBe(0)
  group.local=media().stream;group.callers.add('friend');room.onPeerStream(camera,'friend')
  expect(group.remote.get('friend')).toBe(camera);expect(group.shared.get('friend')?.stream).toBe(screen)
  receive(group,{type:'presentation-ended'});expect(group.shared.size).toBe(0);expect(group.remote.get('friend')).toBe(camera)
})

it('uses an in-app notice without a duplicate system notification in the foreground',()=>{
  const {group}=setup();receive(group,{type:'call',joined:true})
  expect(toast).toHaveBeenCalledOnce();expect(playNotificationTone).toHaveBeenCalledOnce();expect(notifyNow).not.toHaveBeenCalled()
})
it.each(['locked','blur'] as const)('hides room and caller details for %s notifications',mode=>{
  const {group}=setup();privacy.hidden=true;privacy[mode]=true
  receive(group,{type:'call',joined:true})
  expect(notifyNow).toHaveBeenCalledOnce()
  const text=String(vi.mocked(notifyNow).mock.calls[0][1])
  expect(text).not.toContain('Friend');expect(text).not.toContain('Friends')
  const notice=vi.mocked(toast).mock.calls[0][0]
  expect(notice.body).not.toContain('Friend')
})
