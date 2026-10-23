import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {StatusVideo} from '../src/components/StatusVideo'

const draw = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  draw.mockClear()
  vi.spyOn(globalThis, 'setTimeout')
  vi.spyOn(globalThis, 'clearTimeout')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage: draw} as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,frame')
})
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.useRealTimers()})
function decoded(video: HTMLVideoElement, duration = 4) {
  Object.defineProperties(video, {readyState: {value: 2}, videoWidth: {value: 1920}, videoHeight: {value: 1080}, duration: {value: duration}})
  fireEvent.loadedMetadata(video)
  fireEvent.seeked(video)
}
it('replaces compact native video UI with a bounded decoded frame without playing', () => {
  const view = render(<StatusVideo src="blob:clip" label="Video preview" compact />)
  const video = screen.getByLabelText('Video preview') as HTMLVideoElement
  expect(video.controls).toBe(false)
  expect(video.muted).toBe(true)
  expect(video.autoplay).toBe(false)
  decoded(video)
  const image = screen.getByAltText('Video preview') as HTMLImageElement
  expect(image.src).toBe('data:image/jpeg;base64,frame')
  expect(draw.mock.calls[0].slice(1)).toEqual([0, 0, 480, 270])
  expect(video.currentTime).toBe(0.1)
  expect(document.querySelector('video')).toBeNull()
  view.unmount()
  const timers = vi.mocked(setTimeout).mock
  const index = timers.calls.findIndex(call => call[1] === 8000)
  expect(clearTimeout).toHaveBeenCalledWith(timers.results[index].value)
})
it('keeps original video controls and uses its decoded frame as poster', () => {
  render(<StatusVideo src="blob:clip" label="Status video" />)
  const video = screen.getByLabelText('Status video') as HTMLVideoElement
  decoded(video, 0.1)
  expect(video.currentTime).toBe(0.05)
  expect(video.poster).toBe('data:image/jpeg;base64,frame')
  expect(video.controls).toBe(true)
  expect(video.autoplay).toBe(false)
})
it('clears stale thumbnails when the source changes and releases pending timers', () => {
  const view = render(<StatusVideo src="blob:one" label="Preview" compact />)
  decoded(screen.getByLabelText('Preview') as HTMLVideoElement)
  view.rerender(<StatusVideo src="blob:two" label="Preview" compact />)
  expect(screen.queryByAltText('Preview')).toBeNull()
  const next = screen.getByLabelText('Preview') as HTMLVideoElement
  expect(next.src).toBe('blob:two')
  act(() => {vi.advanceTimersByTime(8000)})
  expect(screen.getByText('Preview unavailable')).toBeTruthy()
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('does not seek or draw frames after playback starts or the view unmounts', () => {
  const view = render(<StatusVideo src="blob:clip" label="Status video" />)
  const video = screen.getByLabelText('Status video') as HTMLVideoElement
  fireEvent.play(video)
  decoded(video)
  expect(draw).not.toHaveBeenCalled()
  expect(video.currentTime).toBe(0)
  view.unmount()
  fireEvent.seeked(video)
  expect(draw).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('reports decode failure immediately and removes its timeout and listeners', () => {
  render(<StatusVideo src="blob:broken" label="Preview" compact />)
  const video = screen.getByLabelText('Preview') as HTMLVideoElement
  expect(video.getAttribute('aria-hidden')).toBe('true')
  expect(video.tabIndex).toBe(-1)
  fireEvent.error(video)
  expect(screen.getByText('Preview unavailable')).toBeTruthy()
  decoded(video)
  expect(draw).not.toHaveBeenCalled()
  const timers = vi.mocked(setTimeout).mock
  const index = timers.calls.findIndex(call => call[1] === 8000)
  expect(clearTimeout).toHaveBeenCalledWith(timers.results[index].value)
})
