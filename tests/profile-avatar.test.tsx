import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {Avatar} from '../src/components/ui'
import {readFileSync} from 'node:fs'
const appCss = readFileSync('src/styles/app.css', 'utf8')
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

it.each([28, 40, 96])('keeps photo and video inside the circular %ipx frame without clipping presence', async size => {
  const style = document.createElement('style')
  style.textContent = appCss.match(/\.avatar(?:-media)?(?:[^{}]*)\{[^}]*\}/g)?.join('\n') ?? ''
  document.head.append(style)
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  state.url.mockResolvedValue('blob:profile')
  const view = render(<Avatar size={size} conn="online" p={{name: 'Friend', emoji: '🙂', avatar: 'data:image/png;base64,eA=='}} />)
  try {
    const frame = view.container.querySelector<HTMLElement>('.avatar')!
    const clip = frame.querySelector<HTMLElement>('.avatar-media')!
    const dot = frame.querySelector('.dot.on')!
    expect(getComputedStyle(frame).width).toBe(`${size}px`)
    expect(getComputedStyle(frame).height).toBe(`${size}px`)
    expect(getComputedStyle(frame).borderRadius).toBe('50%')
    expect(getComputedStyle(frame).overflow).toBe('visible')
    expect(getComputedStyle(clip).position).toBe('absolute')
    expect(getComputedStyle(clip).inset).toBe('0px')
    expect(getComputedStyle(clip).overflow).toBe('hidden')
    expect(dot.parentElement).toBe(frame)
    const expectBounded = (media: HTMLElement) => {
      expect(media.parentElement).toBe(clip)
      const css = getComputedStyle(media)
      expect(css.position).toBe('absolute')
      expect(css.inset).toBe('0px')
      expect(css.width).toBe('100%')
      expect(css.height).toBe('100%')
      expect(css.objectFit).toBe('cover')
      expect(css.objectPosition).toBe('center')
    }
    expectBounded(frame.querySelector('img')!)
    view.rerender(<Avatar size={size} conn="online" p={{name: 'Friend', emoji: '🙂', avatarMedia: {id: 'abc123def456gh78', mime: 'video/mp4', size: 2}}} />)
    await waitFor(() => expect(frame.querySelector('video')).toBeTruthy())
    expectBounded(frame.querySelector('video')!)
  } finally {view.unmount(); style.remove()}
})
