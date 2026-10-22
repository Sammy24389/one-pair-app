import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const bridge=vi.hoisted(()=>({startScreenCapture:vi.fn(),stopScreenCapture:vi.fn(),addListener:vi.fn()}))
vi.mock('../src/lib/native',()=>({nativeBridge:bridge}))
import {captureScreen,screenCaptureAvailable} from '../src/lib/screen-capture'
class Track extends EventTarget { nativeStop=vi.fn(); stop=this.nativeStop }
const listeners=new Map<string,(value:unknown)=>void>()
let track:Track, draw:ReturnType<typeof vi.fn>, remove:ReturnType<typeof vi.fn>
let stream:MediaStream|undefined
const images:FakeImage[]=[]
class FakeImage {onload:(()=>void)|null=null;onerror:(()=>void)|null=null;src='';naturalWidth=640;naturalHeight=360;constructor(){images.push(this)}}
beforeEach(()=>{
  track=new Track();draw=vi.fn();remove=vi.fn(async()=>{});listeners.clear();images.length=0
  bridge.startScreenCapture.mockResolvedValue({width:640,height:360});bridge.stopScreenCapture.mockResolvedValue(undefined)
  bridge.addListener.mockImplementation(async(name:string,handler:(value:unknown)=>void)=>{listeners.set(name,handler);return {remove}})
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw} as never)
  Object.defineProperty(HTMLCanvasElement.prototype,'captureStream',{configurable:true,value:vi.fn(()=>({getVideoTracks:()=>[track],getTracks:()=>[track]}))})
  vi.stubGlobal('Image',FakeImage)
})
afterEach(async()=>{stream?.getTracks().forEach(t=>t.stop());stream=undefined;await Promise.resolve();await Promise.resolve();vi.restoreAllMocks();vi.clearAllMocks();vi.unstubAllGlobals();delete (HTMLCanvasElement.prototype as unknown as Record<string,unknown>).captureStream})
it('offers native sharing and stops native capture when its published track is stopped',async()=>{
  expect(screenCaptureAvailable()).toBe(true);stream=await captureScreen()
  expect(bridge.startScreenCapture).toHaveBeenCalledOnce();stream.getVideoTracks()[0].stop()
  expect(bridge.stopScreenCapture).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledTimes(2);expect(track.nativeStop).toHaveBeenCalledOnce()
})
it('bounds frame size and drops frames while an image is still decoding',async()=>{
  stream=await captureScreen();const frame=listeners.get('screenFrame')!
  frame({data:'x'.repeat(360001),width:640,height:360});frame({data:'jpg',width:3000,height:2000});expect(images).toHaveLength(0)
  frame({data:'jpg',width:640,height:360});frame({data:'next',width:640,height:360});expect(images).toHaveLength(1)
  images[0].onload!();expect(draw).toHaveBeenCalledOnce();frame({data:'next',width:640,height:360});expect(images).toHaveLength(2)
})
it('turns an Android system Stop into a video-track ended event',async()=>{
  stream=await captureScreen();const ended=vi.fn();track.addEventListener('ended',ended)
  listeners.get('screenCaptureStopped')!({reason:'Stopped by user'})
  expect(ended).toHaveBeenCalledOnce();expect(track.nativeStop).toHaveBeenCalledOnce();expect(bridge.stopScreenCapture).not.toHaveBeenCalled()
})
it('releases listeners and native resources after consent rejection',async()=>{
  bridge.startScreenCapture.mockRejectedValueOnce(new Error('Permission denied'))
  await expect(captureScreen()).rejects.toThrow('Permission denied');expect(remove).toHaveBeenCalledTimes(2);expect(bridge.stopScreenCapture).toHaveBeenCalledOnce()
})
it('rejects invalid capture dimensions rather than creating an unbounded canvas',async()=>{
  bridge.startScreenCapture.mockResolvedValueOnce({width:4000,height:4000})
  await expect(captureScreen()).rejects.toThrow('dimensions');expect(bridge.stopScreenCapture).toHaveBeenCalledOnce()
})
it('does not start another capture until the previous native stop finishes',async()=>{
  let done!:()=>void;bridge.stopScreenCapture.mockReturnValueOnce(new Promise<void>(resolve=>{done=resolve}))
  stream=await captureScreen();stream.getTracks()[0].stop()
  await expect(captureScreen()).rejects.toThrow('already running');done();await Promise.resolve();await Promise.resolve()
})

it('ends the outgoing track and releases native capture when canvas rendering fails',async()=>{
  stream=await captureScreen();const ended=vi.fn();track.addEventListener('ended',ended)
  draw.mockImplementationOnce(()=>{throw new Error('Canvas context lost')})
  listeners.get('screenFrame')!({data:'jpg',width:640,height:360})
  expect(()=>images[0].onload!()).not.toThrow()
  expect(ended).toHaveBeenCalledOnce();expect(track.nativeStop).toHaveBeenCalledOnce()
  expect(bridge.stopScreenCapture).toHaveBeenCalledOnce();expect(remove).toHaveBeenCalledTimes(2)
  expect(images[0].onload).toBeNull();expect(images[0].onerror).toBeNull()
})
it('rejects a capture stopped by Android while native startup is pending',async()=>{
  let started!:(size:{width:number;height:number})=>void
  bridge.startScreenCapture.mockReturnValueOnce(new Promise<{width:number;height:number}>(resolve=>{started=resolve}))
  const pending=captureScreen()
  await vi.waitFor(()=>expect(bridge.startScreenCapture).toHaveBeenCalledOnce())
  listeners.get('screenCaptureStopped')!({reason:'Android revoked capture'})
  started({width:640,height:360})
  await expect(pending).rejects.toThrow('Android revoked capture')
  expect(remove).toHaveBeenCalledTimes(2);expect(bridge.stopScreenCapture).not.toHaveBeenCalled()
  expect(track.nativeStop).not.toHaveBeenCalled()
})
it('recovers the capture lock after the native stop promise rejects',async()=>{
  bridge.stopScreenCapture.mockRejectedValueOnce(new Error('Service already stopped'))
  stream=await captureScreen();stream.getTracks()[0].stop()
  await vi.waitFor(async()=>{stream=await captureScreen()})
  expect(bridge.startScreenCapture).toHaveBeenCalledTimes(2)
})
it('drops an undecodable frame and permits a later valid frame',async()=>{
  stream=await captureScreen();const frame=listeners.get('screenFrame')!
  frame({data:'broken',width:640,height:360});images[0].onerror!()
  frame({data:'valid',width:640,height:360});expect(images).toHaveLength(2)
  images[1].onload!();expect(draw).toHaveBeenCalledOnce();expect(bridge.stopScreenCapture).not.toHaveBeenCalled()
})
