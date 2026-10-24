import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import * as Y from 'yjs'
import {Space} from '../src/lib/space'
import {STATUS_LIFETIME} from '../src/lib/status'

const fixture = vi.hoisted(() => ({actions: new Map<string, any>(), stored: vi.fn(), has: vi.fn(async (_id: string) => false)}))
vi.mock('y-indexeddb', () => ({IndexeddbPersistence: class {whenSynced = Promise.resolve(); destroy = vi.fn()}}))
vi.mock('../src/lib/identity', () => ({identity: {get: () => ({deviceId: 'me'})}}))
vi.mock('../src/lib/call', () => ({CallController: class {dispose = vi.fn(); hangup = vi.fn()}}))
vi.mock('../src/lib/idb', () => ({getMedia: vi.fn(), putMedia: fixture.stored, hasMedia: fixture.has}))
vi.mock('../src/lib/crypto', () => ({hkdfHex: vi.fn(async () => 'room'), hkdf: vi.fn(async () => new Uint8Array()), hmacHex: vi.fn(), timingSafeEqual: vi.fn()}))
vi.mock('trystero', () => ({joinRoom: () => ({makeAction: (name: string) => {
  const action = {send: vi.fn(async () => {})}
  fixture.actions.set(name, action)
  return action
}, leave: vi.fn(async () => {})})}))
let space: Space
beforeEach(async () => {
  vi.useFakeTimers()
  fixture.actions.clear()
  fixture.stored.mockReset()
  fixture.has.mockReset().mockResolvedValue(false)
  space = new Space({id: 'pair', secret: 'AA==', peerDevice: 'peer', peerName: 'Peer', createdAt: 0})
  await space.connect()
  space.peerId = 'connection'
})
afterEach(async () => {await space.destroy(); vi.useRealTimers()})

function status(id: string, from = 'peer', ts = Date.now()) {
  return {id, from, text: '', ts, kind: 'image' as const, mediaId: `media-${id}`, mime: 'image/png', size: 4}
}

it('requests active paired status media after a remote document update and retains chat media recovery', async () => {
  const remote = new Y.Doc()
  const statuses = remote.getMap('statuses')
  statuses.set('photo', status('photo'))
  statuses.set('mine', status('mine', 'me'))
  statuses.set('expired', status('expired', 'peer', Date.now() - STATUS_LIFETIME))
  statuses.set('foreign', status('foreign', 'stranger'))
  statuses.set('oversized', {...status('oversized'), size: 11 * 1024 * 1024})
  remote.getArray('messages').push([{id: 'chat', mediaId: 'chat-image'}])
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(1500)
  expect(fixture.actions.get('need').send).toHaveBeenCalledWith(expect.arrayContaining(['media-photo', 'media-mine', 'chat-image']), {target: 'connection'})
  const requested = fixture.actions.get('need').send.mock.calls[0][0]
  expect(requested).toHaveLength(3)
  remote.destroy()
})

it('rejects status media that differs from declared type or length and accepts matching data', async () => {
  space.statuses.set('photo', status('photo'))
  const receive = fixture.actions.get('media').onMessage
  await receive(new Uint8Array(3), {metadata: {id: 'media-photo', mime: 'image/png'}})
  await receive(new Uint8Array(4), {metadata: {id: 'media-photo', mime: 'video/mp4'}})
  expect(fixture.stored).not.toHaveBeenCalled()
  await receive(new Uint8Array(4), {metadata: {id: 'media-photo', mime: 'image/png'}})
  expect(fixture.stored).toHaveBeenCalledWith('media-photo', expect.any(Blob), undefined)
})

it('preserves the existing chat attachment receive contract', async () => {
  await fixture.actions.get('media').onMessage(new Uint8Array(4), {metadata: {id: 'chat-media', mime: 'application/pdf', name: 'note.pdf'}})
  expect(fixture.stored).toHaveBeenCalledWith('chat-media', expect.any(Blob), 'note.pdf')
})

it('requests only valid member profile video references after remote sync',async()=>{
  const remote=new Y.Doc(),profiles=remote.getMap('profiles')
  profiles.set('peer',{name:'Peer',emoji:'P',avatarMedia:{id:'abcdefghijklmnop',mime:'video/mp4',size:4}})
  profiles.set('stranger',{name:'Unknown',emoji:'X',avatarMedia:{id:'qrstuvwxyz012345',mime:'video/mp4',size:4}})
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote));await vi.advanceTimersByTimeAsync(1500)
  expect(fixture.actions.get('need').send).toHaveBeenCalledWith(['abcdefghijklmnop'],{target:'connection'});remote.destroy()
})


it('does not postpone media recovery while remote text updates keep arriving', async () => {
  const remote = new Y.Doc()
  remote.getArray('messages').push([{id: 'photo', mediaId: 'recent-photo'}])
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(100)
    remote.getMap('reads').set('peer', i)
    fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  }
  expect(fixture.actions.get('need').send).toHaveBeenCalledTimes(1)
  expect(fixture.actions.get('need').send).toHaveBeenCalledWith(['recent-photo'], {target: 'connection'})
  remote.destroy()
})

it('retries missing media without needing another document update', async () => {
  const remote = new Y.Doc()
  remote.getArray('messages').push([{id: 'photo', mediaId: 'lost-photo'}])
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(150)
  expect(fixture.actions.get('need').send).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(60_150)
  expect(fixture.actions.get('need').send).toHaveBeenCalledTimes(2)
  remote.destroy()
})

it('limits outstanding requests to the sender batch and requests remaining media as slots free', async () => {
  const remote = new Y.Doc()
  remote.getArray('messages').push(Array.from({length: 201}, (_, i) => ({id: `m-${i}`, mediaId: `batch-${i}`})))
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(150)
  const send = fixture.actions.get('need').send
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][0]).toHaveLength(200)
  expect(send.mock.calls[0][0]).not.toContain('batch-200')
  fixture.has.mockImplementation(async (id: string) => id !== 'batch-200')
  await fixture.actions.get('media').onMessage(new Uint8Array(4), {metadata: {id: 'batch-0', mime: 'image/png'}})
  await vi.advanceTimersByTimeAsync(150)
  expect(send).toHaveBeenLastCalledWith(['batch-200'], {target: 'connection'})
  remote.destroy()
})

it('extends the retry deadline while a requested transfer is progressing', async () => {
  const remote = new Y.Doc()
  remote.getArray('messages').push([{id: 'video', mediaId: 'slow-video'}])
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(30_150)
  fixture.actions.get('media').onReceiveProgress(.5, {metadata: {id: 'slow-video'}})
  await vi.advanceTimersByTimeAsync(30_150)
  expect(fixture.actions.get('need').send).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30_150)
  expect(fixture.actions.get('need').send).toHaveBeenCalledTimes(2)
  remote.destroy()
})

it('cancels scheduled retries when the connection is closed', async () => {
  const remote = new Y.Doc()
  remote.getArray('messages').push([{id: 'photo', mediaId: 'pending-photo'}])
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(150)
  const send = fixture.actions.get('need').send
  await space.disconnect()
  await vi.advanceTimersByTimeAsync(61_000)
  expect(send).toHaveBeenCalledTimes(1)
  remote.destroy()
})

it('does not let a pending request-send promise block later automatic retries', async () => {
  fixture.actions.get('need').send.mockImplementationOnce(() => new Promise(() => {}))
  const remote = new Y.Doc()
  remote.getArray('messages').push([{id: 'photo', mediaId: 'pending-send'}])
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(60_300)
  expect(fixture.actions.get('need').send).toHaveBeenCalledTimes(2)
  remote.destroy()
})


it('rotates retry batches so missing old attachments cannot starve later media', async () => {
  const remote = new Y.Doc()
  remote.getArray('messages').push(Array.from({length: 201}, (_, i) => ({id: `m-${i}`, mediaId: `batch-${i}`})))
  fixture.actions.get('up').onMessage(Y.encodeStateAsUpdate(remote))
  await vi.advanceTimersByTimeAsync(60_300)
  const calls = fixture.actions.get('need').send.mock.calls
  expect(calls).toHaveLength(2)
  expect(calls[0][0]).not.toContain('batch-200')
  expect(calls[1][0][0]).toBe('batch-200')
  expect(calls[1][0]).toHaveLength(200)
  remote.destroy()
})
