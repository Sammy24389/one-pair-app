import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {Avatar} from '../src/components/ui'
const state = vi.hoisted(() => ({reduced: false, url: vi.fn()}))
vi.mock('../src/lib/nav', () => ({back: vi.fn(), nav: {use: () => ''}, START_TABS: [], takeFocus: vi.fn()}))
vi.mock('../src/lib/settings', () => ({settings: {use: () => state.reduced}}))
vi.mock('../src/lib/profile-media', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/profile-media')>()
  return {...real, profileVideoUrl: state.url}
})
vi.mock('../src/lib/idb', () => ({getMediaUrl: vi.fn(), getMedia: vi.fn(), onMediaStored: () => () => {}}))
vi.mock('../src/lib/notify', () => ({toasts: {use: () => []}, dismissToast: vi.fn()}))
afterEach(() => {cleanup(); vi.restoreAllMocks(); state.reduced = false; vi.clearAllMocks()})
it('plays a validated profile video silently and falls back after playback failure', async () => {
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  state.url.mockResolvedValue('blob:profile')
  const view = render(<Avatar p={{name: 'Friend', emoji: '🙂', avatarMedia: {id: 'abc123def456gh78', mime: 'video/mp4', size: 2}}} />)
  await waitFor(() => expect(view.container.querySelector('video')).toBeTruthy())
  const video = view.container.querySelector('video')!
  expect(video.muted).toBe(true)
  expect(video.loop).toBe(true)
  fireEvent.error(video)
  expect(screen.getByText('🙂')).toBeTruthy()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile')
})
it('does not autoplay when reduced motion is enabled and rejects external image URLs', async () => {
  state.reduced = true
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  state.url.mockResolvedValue('blob:profile')
  const view = render(<Avatar p={{name: 'Friend', emoji: '🙂', avatarMedia: {id: 'abc123def456gh78', mime: 'video/mp4', size: 2}}} />)
  await waitFor(() => expect(view.container.querySelector('video')).toBeTruthy())
  expect(view.container.querySelector('video')!.autoplay).toBe(false)
  view.rerender(<Avatar p={{name: 'Friend', emoji: '🙂', avatar: 'https://tracker.example/image.jpg'}} />)
  expect(view.container.querySelector('img')).toBe(null)
  expect(screen.getByText('🙂')).toBeTruthy()
})
