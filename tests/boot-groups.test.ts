import {afterEach, expect, it, vi} from 'vitest'
import type {PeerGroup, GroupMessage} from '../src/lib/groups'
import {bootstrap} from '../src/boot'

const state = vi.hoisted(() => ({
  hidden: true, locked: false, groupCall: true, keepAlive: false, rooms: [] as number[],
  groupsChanged: null as null | (() => void),
  message: null as null | ((group: PeerGroup, message: GroupMessage) => void),
  settingsChanged: null as null | (() => void),
  notify: vi.fn(), toast: vi.fn(), open: vi.fn(), stop: vi.fn(async () => {}), start: vi.fn(async () => {})
}))
vi.mock('../src/lib/groups', () => ({groupEvents: {subscribe: vi.fn()}, groupRegistry: {get: () => ({records: state.rooms}), subscribe: (f: () => void) => {state.groupsChanged = f}}, groupRecoveryTargets: () => [], initializeGroups: vi.fn(), hasGroupCall: () => state.groupCall, onGroupMessage: (f: typeof state.message) => { state.message = f }}))
vi.mock('../src/components/Fx', () => ({burst: vi.fn()}))
vi.mock('../src/lib/content', () => ({TOUCHES: {}}))
vi.mock('../src/lib/identity', () => ({identity: {get: () => ({deviceId: 'me', pairs: []}), subscribe: vi.fn()}}))
vi.mock('../src/lib/nav', () => ({back: vi.fn(), nav: {get: () => ({tab: 'home', stack: []})}, openRoute: state.open}))
vi.mock('../src/lib/nudges', () => ({planNotifications: vi.fn()}))
vi.mock('../src/lib/native', () => ({nativeBridge: {startKeepAlive: state.start, stopKeepAlive: state.stop, addListener: vi.fn()}}))
vi.mock('../src/lib/notify', () => ({initChannels: vi.fn(), notifyNow: state.notify, pingPartner: vi.fn(), toast: state.toast}))
vi.mock('../src/lib/platform', () => ({hapticPattern: vi.fn(), isAppHidden: () => state.hidden, isNative: false, onAppVisibility: vi.fn()}))
vi.mock('../src/lib/security', () => ({initAutoLock: vi.fn(), lockState: {get: () => ({locked: state.locked})}}))
vi.mock('../src/lib/settings', () => ({settings: {get: () => ({keepAlive: state.keepAlive, privacyBlur: true}), subscribe: (f: () => void) => { state.settingsChanged = f }}}))
vi.mock('../src/lib/spaces', () => ({allSpaces: () => [], onSpaceCreated: vi.fn(), syncSpaces: vi.fn()}))
vi.mock('../src/lib/reachability', () => ({createReachability: () => ({wake: vi.fn(), offline: vi.fn()})}))
vi.mock('../src/lib/sound', () => ({playHeart: vi.fn(), playPop: vi.fn()}))
afterEach(() => vi.useRealTimers())

it('keeps group call service types and routes fresh messages with private previews', () => {
  vi.useFakeTimers()
  bootstrap()
  expect(state.stop).not.toHaveBeenCalled()
  expect(state.start).not.toHaveBeenCalled()
  state.groupCall = false
  state.settingsChanged!()
  expect(state.stop).toHaveBeenCalledOnce()

  const group = {record: {id: 'group-id', title: 'Friends'}} as PeerGroup
  const message: GroupMessage = {id: 'message', from: 'friend', name: 'Sam', text: 'Hello', ts: Date.now()}
  state.message!(group, {...message, from: 'me'})
  state.message!(group, {...message, ts: Date.now() - 60_000})
  state.message!(group, {...message, ts: Date.now() + 60_000})
  expect(state.notify).not.toHaveBeenCalled()
  state.message!(group, message)
  expect(state.notify).toHaveBeenCalledWith('OnePair', 'New group message', {sub: 'groups', focus: 'group-id', tab: 'more'})
  state.hidden = false
  state.message!(group, message)
  expect(state.toast).toHaveBeenLastCalledWith(expect.objectContaining({title: 'Friends', body: 'Sam: Hello'}))
  const toast = state.toast.mock.lastCall![0] as {action: () => void}
  toast.action()
  expect(state.open).toHaveBeenCalledWith({sub: 'groups', focus: 'group-id', tab: 'more'})
  state.locked = true
  state.message!(group, message)
  expect(state.toast).toHaveBeenLastCalledWith(expect.objectContaining({title: 'OnePair', body: 'New group message'}))
  state.keepAlive = true
  state.rooms = [1]
  state.groupsChanged!()
  expect(state.start).toHaveBeenCalledOnce()
  vi.clearAllTimers()
})
