import {afterEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import type {Space} from '../src/lib/space'
import CallOverlay from '../src/screens/Call'

vi.mock('../src/components/ui', () => ({Avatar: () => <span>Avatar</span>}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function setup(phase: 'active' | 'incoming' = 'active') {
  const remote = {getVideoTracks: () => [{readyState: 'live'}]} as unknown as MediaStream
  const call = {
    state: {phase, remote, local: null, video: true, startedAt: Date.now(), muted: false, camOff: false, facing: 'user'},
    toggleMute: vi.fn(), hangup: vi.fn(), decline: vi.fn(), accept: vi.fn(), enableVideo: vi.fn(), toggleCamera: vi.fn(), flipCamera: vi.fn()
  }
  const space = {call, peerProfile: () => ({name: 'Alex'})} as unknown as Space
  const onMinimize = vi.fn(), onRestore = vi.fn()
  const props = {space, minimized: false, onMinimize, onRestore}
  return {props, call, remote, onMinimize, onRestore}
}
it('preserves the exact playing remote video and stream when minimized and restored', () => {
  const {props, remote} = setup()
  const view = render(<CallOverlay {...props} />)
  const video = view.container.querySelector('video')!
  expect(video).toBeTruthy()
  expect(video.srcObject).toBe(remote)
  view.rerender(<CallOverlay {...props} minimized />)
  expect(screen.getByRole('region', {name: 'Call with Alex'})).toBeTruthy()
  expect(view.container.querySelector('video')).toBe(video)
  expect(video.srcObject).toBe(remote)
  fireEvent.keyDown(screen.getByRole('button', {name: 'Move call window'}), {key: 'ArrowDown'})
  expect(view.container.querySelector('video')).toBe(video)
  expect(video.srcObject).toBe(remote)
  expect(props.onRestore).not.toHaveBeenCalled()
  view.rerender(<CallOverlay {...props} />)
  expect(view.container.querySelector('video')).toBe(video)
  expect(video.srcObject).toBe(remote)
})
it('offers restore, mute, and end controls in compact mode', () => {
  const {props, call, onRestore} = setup()
  const view = render(<CallOverlay {...props} minimized />)
  fireEvent.click(screen.getByRole('button', {name: 'Return to call'}))
  fireEvent.click(screen.getByRole('button', {name: 'Mute microphone'}))
  fireEvent.click(screen.getByRole('button', {name: 'End call'}))
  expect(onRestore).toHaveBeenCalledOnce()
  expect(call.toggleMute).toHaveBeenCalledOnce()
  expect(call.hangup).toHaveBeenCalledOnce()
  call.state.muted = true
  view.rerender(<CallOverlay {...props} minimized />)
  expect(screen.getByRole('button', {name: 'Unmute microphone'}).getAttribute('aria-pressed')).toBe('true')
})
it('minimizes using its button or Escape, and does not minimize again when compact', () => {
  const {props, onMinimize} = setup()
  const view = render(<CallOverlay {...props} />)
  fireEvent.click(screen.getByRole('button', {name: 'Minimize call'}))
  fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'})
  expect(onMinimize).toHaveBeenCalledTimes(2)
  view.rerender(<CallOverlay {...props} minimized />)
  fireEvent.keyDown(screen.getByRole('region'), {key: 'Escape'})
  expect(onMinimize).toHaveBeenCalledTimes(2)
})
it('keeps incoming calls expanded with only answer and decline controls', () => {
  const {props, onMinimize, call} = setup('incoming')
  render(<CallOverlay {...props} />)
  expect(screen.queryByRole('button', {name: 'Minimize call'})).toBeNull()
  fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'})
  expect(onMinimize).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', {name: 'Accept'}))
  fireEvent.click(screen.getByRole('button', {name: 'Decline'}))
  expect(call.accept).toHaveBeenCalledOnce()
  expect(call.decline).toHaveBeenCalledOnce()
})
it('releases a wake lock acquired after unmount', async () => {
  let resolve!: (lock: {release: () => Promise<void>}) => void
  const request = vi.fn(() => new Promise<{release: () => Promise<void>}>(r => { resolve = r }))
  vi.stubGlobal('navigator', {wakeLock: {request}})
  const {props} = setup()
  const view = render(<CallOverlay {...props} />)
  expect(request).toHaveBeenCalledWith('screen')
  view.unmount()
  const release = vi.fn(async () => {})
  await act(async () => { resolve({release}) })
  expect(release).toHaveBeenCalledOnce()
})
it('traps keyboard focus in the expanded call and restores the original focus', () => {
  const previous = document.createElement('button')
  document.body.append(previous)
  previous.focus()
  const {props} = setup()
  const view = render(<CallOverlay {...props} />)
  const minimize = screen.getByRole('button', {name: 'Minimize call'})
  const end = screen.getByRole('button', {name: 'End call'})
  expect(document.activeElement).toBe(minimize)
  fireEvent.keyDown(minimize, {key: 'Tab', shiftKey: true})
  expect(document.activeElement).toBe(end)
  fireEvent.keyDown(end, {key: 'Tab'})
  expect(document.activeElement).toBe(minimize)
  view.unmount()
  expect(document.activeElement).toBe(previous)
  previous.remove()
})
it('keeps a minimized locked call inert without taking focus and restores controls after unlocking', () => {
  const previous = document.createElement('button')
  previous.textContent = 'Unlock app'
  document.body.append(previous)
  previous.focus()
  const {props, onRestore} = setup()
  const view = render(<CallOverlay {...props} />)
  view.rerender(<CallOverlay {...props} minimized locked />)
  const compact = view.container.querySelector('[role="region"]')!
  expect(compact.hasAttribute('inert')).toBe(true)
  expect(compact.getAttribute('aria-hidden')).toBe('true')
  expect(document.activeElement).toBe(previous)
  expect(compact.contains(document.activeElement)).toBe(false)
  expect(screen.queryByRole('button', {name: 'Return to call'})).toBeNull()
  view.rerender(<CallOverlay {...props} minimized locked={false} />)
  expect(compact.hasAttribute('inert')).toBe(false)
  expect(compact.hasAttribute('aria-hidden')).toBe(false)
  const restore = screen.getByRole('button', {name: 'Return to call'})
  fireEvent.click(restore)
  expect(onRestore).toHaveBeenCalledOnce()
  view.unmount()
  previous.remove()
})
