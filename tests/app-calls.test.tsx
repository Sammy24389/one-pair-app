import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import type {CallPhase} from '../src/lib/call'
import App from '../src/App'
import {groupRegistry} from '../src/lib/groups'

const state = vi.hoisted(() => ({
  ids: ['a'],
  hasPairs: true,
  stack: [] as string[],
  pairs: [] as {pair: {id: string}; version: number; call: {state: {phase: CallPhase; id: string}}; subscribe: (f: () => void) => () => void; emit: () => void}[],
  registry: new Set<() => void>(),
  locked: false,
  lockListeners: new Set<() => void>()
}))
vi.mock('../src/lib/spaces', async () => {
  const {useSyncExternalStore} = await import('react')
  return {
    allSpaces: () => state.pairs,
    useSpaceIds: () => useSyncExternalStore(f => {state.registry.add(f); return () => state.registry.delete(f)}, () => state.ids),
    useActiveSpace: () => null,
    useSpaceVersion: () => 0
  }
})
vi.mock('../src/lib/security', async () => {
  const {useSyncExternalStore} = await import('react')
  return {lockState: {use: (select: (value: {locked: boolean}) => unknown) => {
    const locked = useSyncExternalStore(f => {state.lockListeners.add(f); return () => state.lockListeners.delete(f)}, () => state.locked)
    return select({locked})
  }}}
})
vi.mock('../src/lib/settings', () => {
  const values = {scheme:'light',theme:'material',wallpaper:'none',wallpaperValue:'',wallpaperDim:0,wallpaperBlur:0,lockMode:'pin',privacyBlur:false,accent:'#e8577e',startTab:'home'}
  return {settings:{get: () => values, use: (select?: (s: typeof values) => unknown) => select ? select(values) : values}}
})
vi.mock('../src/lib/identity', () => ({identity:{use: (select: (s: {onboarded: boolean; pairs: number[]}) => unknown) => select({onboarded:true,pairs:state.hasPairs ? [1] : []})}}))
vi.mock('../src/lib/nav', () => ({goTab:vi.fn(),nav:{get: () => ({stack:state.stack}),set:vi.fn(),use: () => ({tab:'home',stack:state.stack})}}))
vi.mock('../src/lib/platform', () => ({isNative:false,isSystemUiActive: () => false,onAppVisibility: () => () => {}}))
vi.mock('../src/components/Fx', () => ({FxLayer: () => null}))
vi.mock('../src/components/ui', () => ({Toasts: () => null,useMediaUrl: () => null}))
vi.mock('../src/screens/Groups', () => ({default: () => <div>Room code entry</div>, GroupsCallOverlay: () => null}))
vi.mock('../src/screens/Pair', () => ({default: () => <div>Private pair setup</div>}))
vi.mock('../src/screens/Home', () => ({default: () => <button>Home action</button>}))
vi.mock('../src/screens/Lock', () => ({default: () => <div>App locked</div>}))
vi.mock('../src/screens/Onboarding', () => ({default: () => null}))
vi.mock('../src/screens/Call', () => ({default: ({minimized,onMinimize}: {minimized: boolean;onMinimize: () => void}) => <button onClick={onMinimize}>{minimized ? 'Compact call' : 'Minimize call'}</button>}))

const pair = (id: string) => {
  const listeners = new Set<() => void>()
  return {pair:{id},version:0,call:{state:{phase:'idle' as CallPhase,id:'call-'+id}},
    subscribe: (f: () => void) => {listeners.add(f); return () => {listeners.delete(f)}},
    emit() {this.version++; listeners.forEach(f => f())}}
}
beforeEach(() => {
  state.ids = ['a']; state.pairs = [pair('a')]; state.locked = false; state.hasPairs = true; state.stack = []; groupRegistry.set({records: []})
  vi.stubGlobal('matchMedia', () => ({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
})
afterEach(() => {cleanup(); groupRegistry.set({records: []}); state.registry.clear(); state.lockListeners.clear(); vi.unstubAllGlobals()})
it('observes calls on a pair added after the shell was mounted', async () => {
  render(<App />)
  expect(screen.getByRole('button',{name:'Home action'})).toBeTruthy()
  const added = pair('b')
  act(() => {state.pairs.push(added); state.ids = ['a','b']; state.registry.forEach(f => f())})
  act(() => {added.call.state.phase = 'incoming'; added.emit()})
  expect(await screen.findByRole('button',{name:'Minimize call'})).toBeTruthy()
})
it('keeps app content inert while locked after minimizing a call', async () => {
  state.pairs[0].call.state.phase = 'active'
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('button',{name:'Minimize call'}))
  expect(view.container.querySelector('.app-content')?.hasAttribute('inert')).toBe(false)
  act(() => {state.locked = true; state.lockListeners.forEach(f => f())})
  expect(screen.getByText('App locked')).toBeTruthy()
  expect(view.container.querySelector('.app-content')?.hasAttribute('inert')).toBe(true)
})

it('opens room-code entry without requiring a private pair first', async () => {
  state.hasPairs = false; state.stack = ['groups']
  render(<App />)
  expect(await screen.findByText('Room code entry')).toBeTruthy()
  expect(screen.queryByText('Private pair setup')).toBeNull()
  expect(screen.queryByRole('navigation')).toBeNull()
})
it('returns an unpaired member directly to saved rooms instead of an empty home screen', async () => {
  state.hasPairs = false
  groupRegistry.set({records: [{id: 'group123456', owner: 'owner123456', secret: 'test-secret', title: 'Friends'}]})
  render(<App />)
  expect(await screen.findByText('Room code entry')).toBeTruthy()
  expect(screen.queryByText('Home action')).toBeNull()
})
