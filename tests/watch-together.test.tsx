import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import WatchTogether from '../src/components/WatchTogether'
import type {PeerGroup} from '../src/lib/groups'
vi.mock('../src/lib/groups',()=>({groupEvents:{use:()=>{}}}))
vi.mock('../src/lib/platform',()=>({isNative:false,withSystemUi:(fn:()=>unknown)=>fn()}))

class Track extends EventTarget {
  stop=vi.fn()
}
class Stream {
  tracks:Track[]
  constructor(tracks:Track[]=[]) {this.tracks=[...tracks]}
  getTracks() {return this.tracks}
  getAudioTracks() {return this.tracks}
  getVideoTracks() {return this.tracks}
  addTrack(track:Track) {this.tracks.push(track)}
}
const contexts:Context[]=[]
let resume=vi.fn(async()=>{})
class Context {
  state='running'
  destination={}
  audioTrack=new Track()
  node={connect:vi.fn(),disconnect:vi.fn()}
  close=vi.fn(async()=>{this.state='closed'})
  resume=()=>resume()
  createMediaElementSource=vi.fn(()=>this.node)
  createMediaStreamDestination=()=>({stream:new Stream([this.audioTrack])})
  constructor() {contexts.push(this)}
}
function group() {
  const value={presentation:null as MediaStream|null,shared:new Map(),present:vi.fn(async(stream:MediaStream,_title:string)=>{value.presentation=stream}),stopPresentation:vi.fn(()=>{value.presentation?.getTracks().forEach(track=>track.stop());value.presentation=null})}
  return value
}
function selectSource() {
  fireEvent.change(screen.getByLabelText('Choose video or music'),{target:{files:[new File(['movie'],'movie.mp4',{type:'video/mp4'})]}})
}
function deferred() {
  let resolve!:()=>void
  const promise=new Promise<void>(done=>{resolve=done})
  return {promise,resolve}
}
beforeEach(()=>{
  contexts.length=0;resume=vi.fn(async()=>{})
  vi.stubGlobal('AudioContext',Context);vi.stubGlobal('MediaStream',Stream)
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:watch-source'),revokeObjectURL:vi.fn()})
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>42));vi.stubGlobal('cancelAnimationFrame',vi.fn())
  vi.spyOn(HTMLMediaElement.prototype,'readyState','get').mockReturnValue(2)
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})
  vi.spyOn(HTMLVideoElement.prototype,'videoWidth','get').mockReturnValue(0)
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();delete (HTMLCanvasElement.prototype as unknown as Record<string,unknown>).captureStream})
it('cannot publish when unmounted while audio permission/resume is pending',async()=>{
  const pending=deferred();resume.mockReturnValue(pending.promise)
  const room=group(),view=render(<WatchTogether group={room as unknown as PeerGroup}/>);selectSource()
  fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))
  expect(contexts).toHaveLength(1);view.unmount()
  await act(async()=>{pending.resolve();await pending.promise})
  expect(room.present).not.toHaveBeenCalled();expect(contexts[0].close).toHaveBeenCalledOnce()
  expect(contexts[0].createMediaElementSource).not.toHaveBeenCalled()
})
it('stops produced tracks and cannot publish after unmount during media play()',async()=>{
  const pending=deferred();vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(pending.promise)
  const room=group(),view=render(<WatchTogether group={room as unknown as PeerGroup}/>);selectSource()
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();view.unmount()
  await act(async()=>{pending.resolve();await pending.promise})
  expect(room.present).not.toHaveBeenCalled();expect(contexts[0].audioTrack.stop).toHaveBeenCalledOnce()
  expect(contexts[0].node.disconnect).toHaveBeenCalledOnce();expect(contexts[0].close).toHaveBeenCalledOnce()
})
it('publishes captured video and audio, releases both on stop and can start a fresh playback',async()=>{
  vi.spyOn(HTMLVideoElement.prototype,'videoWidth','get').mockReturnValue(1280)
  vi.spyOn(HTMLVideoElement.prototype,'videoHeight','get').mockReturnValue(720)
  const videoTrack=new Track()
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as never)
  Object.defineProperty(HTMLCanvasElement.prototype,'captureStream',{configurable:true,value:vi.fn(()=>new Stream([videoTrack]))})
  const room=group();render(<WatchTogether group={room as unknown as PeerGroup}/>);selectSource()
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  expect(room.present).toHaveBeenCalledOnce();expect(room.present.mock.calls[0][1]).toBe('movie.mp4')
  expect(room.present.mock.calls[0][0].getTracks()).toHaveLength(2)
  fireEvent.click(screen.getByRole('button',{name:'Stop sharing'}))
  expect(videoTrack.stop).toHaveBeenCalled();expect(contexts[0].audioTrack.stop).toHaveBeenCalled()
  expect(contexts[0].close).toHaveBeenCalledOnce();expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  expect(room.present).toHaveBeenCalledTimes(2);expect(contexts).toHaveLength(2)
  delete (HTMLCanvasElement.prototype as unknown as Record<string,unknown>).captureStream
})
it('remounts a failed media source so a publication failure can be retried',async()=>{
  const room=group();room.present.mockRejectedValueOnce(new Error('Connection failed'))
  const view=render(<WatchTogether group={room as unknown as PeerGroup}/>);selectSource()
  const first=view.container.querySelector('video')
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  expect(screen.getByRole('alert').textContent).toContain('Connection failed')
  expect(view.container.querySelector('video')).not.toBe(first)
  expect(contexts[0].audioTrack.stop).toHaveBeenCalledOnce();expect(contexts[0].close).toHaveBeenCalledOnce()
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  expect(room.present).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'Stop sharing'})).toBeTruthy()
})
it('releases a late screen picker capture if the sharing screen has unmounted',async()=>{
  vi.stubGlobal('isSecureContext',true)
  const capture=new Stream([new Track()]);let resolve!:(value:MediaStream)=>void
  const pending=new Promise<MediaStream>(done=>{resolve=done})
  vi.stubGlobal('navigator',{mediaDevices:{getDisplayMedia:vi.fn(()=>pending)}})
  const room=group(),view=render(<WatchTogether group={room as unknown as PeerGroup}/>)
  fireEvent.click(screen.getByRole('button',{name:'Share screen'}));view.unmount()
  await act(async()=>{resolve(capture as unknown as MediaStream);await pending})
  expect(room.present).not.toHaveBeenCalled();expect(capture.tracks[0].stop).toHaveBeenCalledOnce()
})

it('remounts the media element after a room stops sharing externally',async()=>{
  const room=group(),view=render(<WatchTogether group={room as unknown as PeerGroup}/>);selectSource()
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  const first=view.container.querySelector('video')
  act(()=>{room.stopPresentation();view.rerender(<WatchTogether group={room as unknown as PeerGroup}/>)})
  expect(view.container.querySelector('video')).not.toBe(first)
  expect(contexts[0].close).toHaveBeenCalledOnce()
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Share this playback'}))})
  expect(room.present).toHaveBeenCalledTimes(2)
})
