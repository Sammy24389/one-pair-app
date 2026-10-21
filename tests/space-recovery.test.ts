import {beforeEach, expect, it, vi} from 'vitest'
import {Space} from '../src/lib/space'

const network = vi.hoisted(() => ({join: vi.fn()}))
vi.mock('trystero', () => ({joinRoom: network.join}))
vi.mock('../src/lib/crypto', () => ({hkdfHex: vi.fn(async () => 'room'), hkdf: vi.fn(async () => new Uint8Array()), hmacHex: vi.fn(), timingSafeEqual: vi.fn()}))
beforeEach(() => network.join.mockReset().mockImplementation(() => ({makeAction: () => ({send: vi.fn(async () => {})}), leave: vi.fn(async () => {})})))

function space(ready = Promise.resolve()) {
  return Object.assign(Object.create(Space.prototype), {
    ready, pair: {peerDevice: 'peer'}, secret: new Uint8Array(), connectionGeneration: 0,
    connecting: null, reconnecting: null, disposed: false, room: null,
    requested: new Set(), call: {state: {phase: 'idle'}, hangup: vi.fn()}, bump: vi.fn()
  }) as Space
}

it('coalesces concurrent asynchronous connection setup', async () => {
  const peer = space()
  const first = peer.connect()
  const second = peer.connect()
  expect(first).toBe(second)
  await Promise.all([first, second])
  expect(network.join).toHaveBeenCalledOnce()
  await peer.disconnect()
})

it('does not reopen a room after disconnect cancels pending setup', async () => {
  let ready!: () => void
  const peer = space(new Promise<void>(resolve => { ready = resolve }))
  const connecting = peer.connect()
  await peer.disconnect()
  ready()
  await connecting
  expect(network.join).not.toHaveBeenCalled()
})

it('keeps active capture and transport intact on automatic reconnect', async () => {
  const peer = space()
  peer.call.state.phase = 'active'
  await peer.reconnect()
  expect(peer.call.hangup).not.toHaveBeenCalled()
  expect(network.join).not.toHaveBeenCalled()
})

it('ignores late peer callbacks from a room that was already disconnected', async () => {
  const peer = space()
  await peer.connect()
  const oldRoom = network.join.mock.results[0].value as {onPeerJoin: (id: string) => void}
  await peer.disconnect()
  oldRoom.onPeerJoin('late-peer')
  expect(peer.peerId).toBeNull()
  expect(peer.conn).toBe('offline')
})

it('preserves a call still waiting for microphone permission', async () => {
  const peer = space()
  Object.assign(peer.call, {busy: true})
  await peer.reconnect()
  expect(peer.call.hangup).not.toHaveBeenCalled()
  expect(network.join).not.toHaveBeenCalled()
})
