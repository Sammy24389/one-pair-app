import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import type {Space} from '../src/lib/space'
import {CallController} from '../src/lib/call'
const mocks = vi.hoisted(() => ({off: vi.fn()}))
vi.mock('../src/lib/identity', () => ({identity: {get: () => ({profile: {name: 'Me'}})}}))
vi.mock('../src/lib/native', () => ({nativeBridge: null}))
vi.mock('../src/lib/notify', () => ({notifyNow: vi.fn(), pingPartner: vi.fn()}))
vi.mock('../src/lib/platform', () => ({isAppHidden: () => false, onAppVisibility: () => mocks.off, withSystemUi: (f: () => Promise<unknown>) => f()}))
vi.mock('../src/lib/settings', () => ({settings: {get: () => ({keepAlive: false, ntfyEnabled: false})}}))
vi.mock('../src/lib/sound', () => ({startRing: vi.fn(), stopRing: vi.fn()}))
vi.mock('../src/lib/util', () => ({uid: () => 'outgoing', vibrate: vi.fn()}))
class Track {
  enabled = true
  stop = vi.fn()
  constructor(public kind: string) {}
  getSettings() { return {facingMode: 'user'} }
}
class Stream {
  constructor(private tracks: Track[] = []) {}
  getTracks() { return [...this.tracks] }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio') }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video') }
  addTrack(t: Track) { this.tracks.push(t) }
  removeTrack(t: Track) { this.tracks = this.tracks.filter(x => x !== t) }
}
const media = (video = false) => new Stream([new Track('audio'), ...(video ? [new Track('video')] : [])]) as unknown as MediaStream
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return {promise, resolve, reject}
}
const getUserMedia = vi.fn()
const controllers: CallController[] = []
function setup() {
  const rtc = {addStream: vi.fn(), removeStream: vi.fn(), addTrack: vi.fn(), replaceTrack: vi.fn(() => [])}
  const space = {online: true, bump: vi.fn(), peerProfile: () => ({name: 'Peer'}), sendCallSignal: vi.fn(), rtc: () => rtc, addMessage: vi.fn(), pair: {id: 'pair'}}
  const call = new CallController(space as unknown as Space)
  controllers.push(call)
  return {call, space, rtc}
}
async function active(video = false) {
  const value = setup()
  getUserMedia.mockResolvedValueOnce(media(video))
  await value.call.start(video)
  value.call.onSignal({t: 'accept', id: 'outgoing'})
  return value
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  getUserMedia.mockReset()
  vi.stubGlobal('MediaStream', Stream)
  vi.stubGlobal('navigator', {mediaDevices: {getUserMedia, enumerateDevices: vi.fn(async () => [])}})
})
afterEach(() => {
  controllers.splice(0).forEach(c => c.dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('deduplicates start and stops acquisition resolved after hangup', async () => {
  const {call, space} = setup()
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  const start = call.start(false)
  await call.start(false)
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  call.hangup()
  const stream = media()
  pending.resolve(stream)
  await start
  expect(call.state.phase).toBe('idle')
  expect(stream.getTracks()[0].stop).toHaveBeenCalledOnce()
  expect(space.sendCallSignal).not.toHaveBeenCalled()
})
it.each(['cancel', 'end', 'decline'])('does not revive an accepted call after %s', async terminal => {
  const {call, rtc} = setup()
  call.onSignal({t: 'ring', id: 'incoming', video: false})
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  const answer = call.accept()
  await call.accept()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  if (terminal === 'decline') call.decline()
  else call.onSignal({t: terminal, id: 'incoming'})
  const stream = media()
  pending.resolve(stream)
  await answer
  expect(call.state.phase).toBe('idle')
  expect(stream.getTracks()[0].stop).toHaveBeenCalledOnce()
  expect(rtc.addStream).not.toHaveBeenCalled()
})
it('ignores an old permission rejection after a new incoming call', async () => {
  const {call, space} = setup()
  call.onSignal({t: 'ring', id: 'first'})
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  const answer = call.accept()
  call.decline()
  call.onSignal({t: 'ring', id: 'second'})
  pending.reject(new Error('denied'))
  await answer
  expect(call.state.id).toBe('second')
  expect(call.state.phase).toBe('incoming')
  expect(space.sendCallSignal).not.toHaveBeenCalledWith({t: 'decline', id: 'second'})
})
it('deduplicates upgrades and stops upgrade resolved after hangup', async () => {
  const {call, rtc} = await active()
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  const upgrade = call.enableVideo()
  await call.enableVideo()
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  call.hangup()
  const stream = media(true)
  pending.resolve(stream)
  await upgrade
  expect(call.state.phase).toBe('idle')
  stream.getTracks().forEach(t => expect(t.stop).toHaveBeenCalledOnce())
  expect(rtc.addTrack).not.toHaveBeenCalled()
})
it('stops camera replacement resolved after hangup', async () => {
  const {call, rtc} = await active(true)
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  const flip = call.flipCamera()
  await Promise.resolve()
  call.hangup()
  const stream = media(true)
  pending.resolve(stream)
  await flip
  expect(call.state.phase).toBe('idle')
  stream.getTracks().forEach(t => expect(t.stop).toHaveBeenCalledOnce())
  expect(rtc.replaceTrack).not.toHaveBeenCalled()
})
it('disposes visibility subscription and rejects work after disposal', async () => {
  const {call} = setup()
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  const start = call.start(false)
  call.dispose()
  call.dispose()
  const stream = media()
  pending.resolve(stream)
  await start
  call.onSignal({t: 'ring', id: 'late'})
  await call.start(false)
  expect(mocks.off).toHaveBeenCalledOnce()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(call.state.phase).toBe('idle')
  expect(stream.getTracks()[0].stop).toHaveBeenCalledOnce()
})

it('reports permission acquisition as busy before the outgoing phase exists', async () => {
  const {call} = setup()
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(pending.promise)
  expect(call.busy).toBe(false)
  const starting = call.start(false)
  expect(call.state.phase).toBe('idle')
  expect(call.busy).toBe(true)
  call.hangup()
  expect(call.busy).toBe(false)
  pending.resolve(media())
  await starting
})


it('shares the screen without replacing microphone audio and restores the original camera', async () => {
  vi.stubGlobal('isSecureContext', true)
  const {call, rtc} = await active(true)
  const microphone = call.state.local!.getAudioTracks()[0]
  const camera = call.state.local!.getVideoTracks()[0]
  const display = new Stream([new Track('video')]) as unknown as MediaStream
  Object.assign(navigator.mediaDevices, {getDisplayMedia: vi.fn(async () => display)})
  await call.shareScreen()
  expect(call.state.sharingScreen).toBe(true)
  expect(call.state.local!.getAudioTracks()[0]).toBe(microphone)
  expect(camera.enabled).toBe(false)
  expect(rtc.replaceTrack).toHaveBeenCalledWith(camera, display.getVideoTracks()[0])
  await call.stopScreenShare()
  expect(call.state.sharingScreen).toBe(false)
  expect(call.state.local!.getVideoTracks()[0]).toBe(camera)
  expect(camera.enabled).toBe(true)
  expect(display.getTracks()[0].stop).toHaveBeenCalled()
})

it('stops a display capture resolved after hangup and does not revive a call', async () => {
  vi.stubGlobal('isSecureContext', true)
  const {call, rtc} = await active()
  const pending = deferred<MediaStream>()
  Object.assign(navigator.mediaDevices, {getDisplayMedia: vi.fn(() => pending.promise)})
  const sharing = call.shareScreen()
  call.hangup()
  const display = new Stream([new Track('video')]) as unknown as MediaStream
  pending.resolve(display)
  await sharing
  expect(display.getTracks()[0].stop).toHaveBeenCalledOnce()
  expect(rtc.addTrack).not.toHaveBeenCalled()
  expect(call.state.phase).toBe('idle')
})

it('reports unsupported capture and cancellation without ending the active call', async () => {
  const {call} = await active()
  await call.shareScreen()
  expect(call.state.error).toContain('unavailable in this browser')
  vi.stubGlobal('isSecureContext', true)
  Object.assign(navigator.mediaDevices, {getDisplayMedia: vi.fn(async () => {throw new DOMException('cancelled', 'NotAllowedError')})})
  await call.shareScreen()
  expect(call.state.error).toContain('cancelled')
  expect(call.state.phase).toBe('active')
  expect(call.state.screenBusy).toBe(false)
})

it('ends screen sharing from the browser stop action and releases retained camera on hangup', async () => {
  vi.stubGlobal('isSecureContext', true)
  const {call} = await active(true)
  const camera = call.state.local!.getVideoTracks()[0]
  const display = new Stream([new Track('video')]) as unknown as MediaStream
  Object.assign(navigator.mediaDevices, {getDisplayMedia: vi.fn(async () => display)})
  await call.shareScreen()
  const track = display.getVideoTracks()[0]
  track.onended?.(new Event('ended'))
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(call.state.sharingScreen).toBe(false)
  await call.shareScreen()
  call.hangup()
  expect(camera.stop).toHaveBeenCalled()
  expect(track.onended).toBeNull()
})


it('returns screen-shared audio-only calls to microphone-only mode', async () => {
  vi.stubGlobal('isSecureContext', true)
  const {call, rtc} = await active()
  const microphone = call.state.local!.getAudioTracks()[0]
  const display = new Stream([new Track('video')]) as unknown as MediaStream
  const removeTrack = vi.fn()
  Object.assign(rtc, {removeTrack})
  Object.assign(navigator.mediaDevices, {getDisplayMedia: vi.fn(async () => display)})
  await call.shareScreen()
  expect(rtc.addTrack).toHaveBeenCalled()
  await call.stopScreenShare()
  expect(removeTrack).toHaveBeenCalledWith(display.getVideoTracks()[0])
  expect(call.state.local!.getVideoTracks()).toEqual([])
  expect(call.state.local!.getAudioTracks()[0]).toBe(microphone)
})
