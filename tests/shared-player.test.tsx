import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import SharedPlayer from '../src/components/SharedPlayer'
const stream = {} as MediaStream
beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue()})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('opens a video-only dialog outside the app card and keeps the same stream on exit',async()=>{
  const view=render(<div className="card"><SharedPlayer stream={stream} title="Movie night"/></div>)
  const video=screen.getByLabelText('Movie night') as HTMLVideoElement
  const join=screen.getByRole('button',{name:'Join playback with sound'});join.focus()
  await act(async()=>{fireEvent.click(join)})
  const dialog=screen.getByRole('dialog',{name:'Watching Movie night'})
  expect(view.container.contains(dialog)).toBe(false)
  expect(dialog.querySelector('video')).toBe(video)
  expect(video.srcObject).toBe(stream)
  expect(document.body.style.overflow).toBe('hidden')
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(view.container.contains(video)).toBe(true)
  expect(video.srcObject).toBe(stream)
  expect(document.body.style.overflow).toBe('')
  expect(document.activeElement).toBe(join)
  view.unmount();expect(video.srcObject).toBeNull()
})
it('shows blocked-playback feedback without opening a blank cinema',async()=>{
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('blocked'))
  render(<SharedPlayer stream={stream} title="Movie"/>)
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Join playback with sound'}))})
  expect(screen.getByRole('alert').textContent).toContain('Playback could not start')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('traps keyboard focus and restores page scrolling on unmount',()=>{
  const view=render(<SharedPlayer stream={stream} title="Movie"/>)
  fireEvent.click(screen.getByRole('button',{name:'Open video view'}))
  const back=screen.getByRole('button',{name:'Back to room'})
  expect(document.activeElement).toBe(back)
  fireEvent.keyDown(document,{key:'Tab',shiftKey:true})
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Join playback with sound'}))
  fireEvent.keyDown(document,{key:'Tab'})
  expect(document.activeElement).toBe(back)
  view.unmount();expect(document.body.style.overflow).toBe('')
  expect(screen.queryByRole('dialog')).toBeNull()
})
