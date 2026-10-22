import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cropVideo,stickerVideoCodec,videoDuration} from '../src/lib/video-crop'
let draw:ReturnType<typeof vi.fn>,stopTrack:ReturnType<typeof vi.fn>,instance:Recorder
class Recorder {
  static isTypeSupported=vi.fn((type:string)=>type.includes('vp8'))
  state='inactive';mimeType='video/webm;codecs=vp8'
  onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;ondataavailable:((event:{data:Blob})=>void)|null=null
  constructor(){instance=this}
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['video'],{type:'video/webm'})});this.onstop?.()}
}
const source=()=>{
  const video=document.createElement('video')
  Object.defineProperties(video,{videoWidth:{value:800},videoHeight:{value:400},duration:{value:2,configurable:true},seeking:{value:false}})
  video.pause=vi.fn();video.play=vi.fn(async()=>{})
  return video
}
beforeEach(()=>{
  vi.useFakeTimers();draw=vi.fn();stopTrack=vi.fn()
  vi.stubGlobal('MediaRecorder',Recorder)
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw} as any)
  Object.defineProperty(HTMLCanvasElement.prototype,'captureStream',{configurable:true,value:vi.fn(()=>({getTracks:()=>[{stop:stopTrack}]}))})
  vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn())
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete (HTMLCanvasElement.prototype as any).captureStream})
it('records only selected pixels at bounded dimensions and releases tracks',async()=>{
  const video=source(),promise=cropVideo(video,{x:200,y:0,width:600,height:400},new AbortController().signal)
  await Promise.resolve();await Promise.resolve();video.dispatchEvent(new Event('ended'))
  const result=await promise
  expect(result.type).toBe('video/webm');expect(result.size).toBeGreaterThan(0)
  expect(draw).toHaveBeenCalledWith(video,200,0,600,400,0,0,512,340)
  expect(stopTrack).toHaveBeenCalledOnce();expect(instance.state).toBe('inactive')
})
it('cancels export and stops the recorder and canvas tracks',async()=>{
  const controller=new AbortController(),promise=cropVideo(source(),{x:0,y:0,width:800,height:400},controller.signal)
  const rejected=expect(promise).rejects.toMatchObject({name:'AbortError'})
  await Promise.resolve();await Promise.resolve();controller.abort();await rejected
  expect(stopTrack).toHaveBeenCalledOnce();expect(instance.state).toBe('inactive')
})
it('bounds export time and reports codec failure',async()=>{
  const promise=cropVideo(source(),{x:0,y:0,width:800,height:400},new AbortController().signal)
  const rejected=expect(promise).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(22000);await rejected;expect(stopTrack).toHaveBeenCalledOnce()
  Recorder.isTypeSupported.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(false)
  expect(stickerVideoCodec()).toBe('')
})
it('rejects invalid regions and long clips before opening tracks',async()=>{
  await expect(cropVideo(source(),{x:700,y:0,width:200,height:100},new AbortController().signal)).rejects.toThrow('Invalid crop')
  const video=source();Object.defineProperty(video,'duration',{value:20,configurable:true})
  await expect(cropVideo(video,{x:0,y:0,width:800,height:400},new AbortController().signal)).rejects.toThrow('15 seconds')
  expect(stopTrack).not.toHaveBeenCalled()
})

it('bounds duration-less WebM probing and cleans up on cancellation',async()=>{
  const video=source();Object.defineProperty(video,'duration',{value:Infinity})
  const controller=new AbortController(),pending=videoDuration(video,controller.signal)
  expect(video.currentTime).toBe(1e10)
  video.currentTime=2;video.dispatchEvent(new Event('seeked'));expect(await pending).toBe(2)
  const cancelled=videoDuration(video,controller.signal),rejected=expect(cancelled).rejects.toMatchObject({name:'AbortError'})
  controller.abort();await rejected
})

it('cleans up failed recorder startup without leaving timers or tracks',async()=>{
  vi.spyOn(Recorder.prototype,'start').mockImplementationOnce(()=>{throw new Error('encoder unavailable')})
  await expect(cropVideo(source(),{x:0,y:0,width:800,height:400},new AbortController().signal)).rejects.toThrow('could not start')
  expect(stopTrack).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0)
})

it('times out duration probing after three seconds and removes listeners',async()=>{
  const video=source();Object.defineProperty(video,'duration',{value:Infinity})
  const controller=new AbortController(),removeVideo=vi.spyOn(video,'removeEventListener'),removeAbort=vi.spyOn(controller.signal,'removeEventListener')
  const pending=videoDuration(video,controller.signal),rejected=expect(pending).rejects.toThrow('Could not read video duration.')
  await vi.advanceTimersByTimeAsync(2999)
  expect(vi.getTimerCount()).toBe(1)
  expect(removeVideo).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1);await rejected
  expect(vi.getTimerCount()).toBe(0)
  expect(removeVideo).toHaveBeenCalledWith('seeked',expect.any(Function))
  expect(removeAbort).toHaveBeenCalledWith('abort',expect.any(Function))
})
