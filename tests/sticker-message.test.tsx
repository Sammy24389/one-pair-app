import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import StickerMessage from '../src/components/StickerMessage'
const data=vi.hoisted(()=>({url:'blob:sticker',get:vi.fn(),add:vi.fn()}))
vi.mock('../src/components/ui',()=>({useMediaUrl:()=>data.url}))
vi.mock('../src/lib/idb',()=>({getMedia:data.get}))
vi.mock('../src/lib/stickers',()=>({addSticker:data.add}))
afterEach(()=>{cleanup();data.url='blob:sticker';vi.resetAllMocks();vi.unstubAllGlobals()})
it('offers a visible save action for a received sticker and saves only once',async()=>{
  const blob=new Blob(['image'],{type:'image/webp'});data.get.mockResolvedValue({blob});data.add.mockResolvedValue([])
  render(<StickerMessage mediaId="incoming" name="Friend sticker" />)
  expect(screen.getByRole('img',{name:'Friend sticker'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Add to stickers'}))
  expect(await screen.findByRole('button',{name:'Saved to stickers'})).toBeTruthy()
  expect(data.get).toHaveBeenCalledWith('incoming');expect(data.add).toHaveBeenCalledExactlyOnceWith(blob,'Friend sticker')
})
it('waits for transfer and allows retry after storage failure',async()=>{
  data.url='';const view=render(<StickerMessage mediaId="incoming" />)
  expect((screen.getByRole('button',{name:'Add to stickers'}) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('status').textContent).toContain('Waiting')
  data.url='blob:sticker';view.rerender(<StickerMessage mediaId="incoming" />)
  data.get.mockResolvedValue({blob:new Blob()});data.add.mockRejectedValue(new Error('Storage full'))
  fireEvent.click(screen.getByRole('button',{name:'Add to stickers'}))
  expect((await screen.findByRole('alert')).textContent).toBe('Storage full')
  expect((screen.getByRole('button',{name:'Add to stickers'}) as HTMLButtonElement).disabled).toBe(false)
})

it('plays video stickers silently inline in a loop and saves the original video',async()=>{
  const blob=new Blob(['video'],{type:'video/mp4'});data.get.mockResolvedValue({blob});data.add.mockResolvedValue([])
  const {container}=render(<StickerMessage mediaId="video" name="Video sticker" mime="video/mp4" />)
  const video=container.querySelector('video')!
  expect(video.loop).toBe(true);expect(video.muted).toBe(true);expect(video.playsInline).toBe(true)
  fireEvent.click(screen.getByRole('button',{name:'Add to stickers'}))
  await screen.findByRole('button',{name:'Saved to stickers'})
  expect(data.add).toHaveBeenCalledWith(blob,'Video sticker')
})

it('offers video controls instead of autoplay when reduced motion is requested',()=>{
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList))
  const {container}=render(<StickerMessage mediaId="video" mime="video/webm" />)
  const video=container.querySelector('video')!
  expect(video.autoplay).toBe(false);expect(video.controls).toBe(true)
})
