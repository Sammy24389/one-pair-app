import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import * as Y from 'yjs'
import {Space} from '../src/lib/space'
import {STATUS_LIFETIME} from '../src/lib/status'

const fixture = vi.hoisted(() => ({actions: new Map<string, any>(), stored: vi.fn(), has: vi.fn(async () => false)}))
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
  fixture.has.mockClear()
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
