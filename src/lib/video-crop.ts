import {validateCrop,type CropRect} from './image-crop'

export function stickerVideoCodec() {
  if(typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function')return ''
  return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'].find(type=>MediaRecorder.isTypeSupported(type)) || ''
}

export function videoDuration(video:HTMLVideoElement,signal:AbortSignal):Promise<number> {
  if(signal.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'))
  if(video.duration!==Infinity)return Promise.resolve(video.duration)
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('Could not read video duration.')),3000)
    const finish=(error?:Error)=>{clearTimeout(timer);video.removeEventListener('seeked',ready);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(Number.isFinite(video.duration)?video.duration:video.currentTime)}
    const ready=()=>finish(),abort=()=>finish(new DOMException('Cancelled','AbortError'))
    video.addEventListener('seeked',ready,{once:true});signal.addEventListener('abort',abort,{once:true});try{video.currentTime=1e10}catch{finish(new Error('Could not read video duration.'))}
  })
}

// Encode only the selected pixels. No audio track enters a video sticker.
export async function cropVideo(video:HTMLVideoElement,crop:CropRect,signal:AbortSignal,onProgress:(fraction:number)=>void=()=>{}):Promise<Blob> {
  validateCrop(video.videoWidth,video.videoHeight,crop)
  const duration=await videoDuration(video,signal)
  if(!Number.isFinite(duration)||duration<=0||duration>15)throw new Error('Choose a video up to 15 seconds.')
  const mime=stickerVideoCodec(),canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(crop.width,crop.height))
  if(!mime || typeof canvas.captureStream!=='function')throw new Error('Video cropping is unavailable in this browser. Keep the full video or try Chrome.')
  canvas.width=Math.max(2,Math.floor(crop.width*scale/2)*2);canvas.height=Math.max(2,Math.floor(crop.height*scale/2)*2)
  const context=canvas.getContext('2d');if(!context)throw new Error('Video editing is unavailable on this device.')
  if(signal.aborted)throw new DOMException('Cancelled','AbortError')
  video.pause();video.loop=false;video.currentTime=0
  await new Promise<void>((resolve,reject)=>{
    let timer:ReturnType<typeof setTimeout>
    const finish=(error?:Error)=>{clearTimeout(timer);video.removeEventListener('seeked',ready);signal.removeEventListener('abort',abort);error?reject(error):resolve()}
    const ready=()=>finish(),abort=()=>finish(new DOMException('Cancelled','AbortError'))
    video.addEventListener('seeked',ready,{once:true});signal.addEventListener('abort',abort,{once:true})
    timer=setTimeout(()=>finish(new Error('Could not rewind this video.')),3000)
    if(video.currentTime===0 && !video.seeking)finish()
  })
  const draw=()=>context.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height)
  draw()
  const stream=canvas.captureStream(24)
  try {
    return await new Promise<Blob>((resolve,reject)=>{
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1_200_000}),chunks:Blob[]=[]
      let frame=0,bytes=0,settled=false,timer:ReturnType<typeof setTimeout>
      const cleanup=()=>{clearTimeout(timer);cancelAnimationFrame(frame);video.pause();video.removeEventListener('ended',ended);signal.removeEventListener('abort',abort)}
      const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();if(recorder.state!=='inactive')recorder.stop();reject(error)}
      const abort=()=>fail(new DOMException('Cancelled','AbortError'))
      const ended=()=>{if(recorder.state!=='inactive')recorder.stop()}
      recorder.ondataavailable=event=>{bytes+=event.data.size;if(bytes>5*1024*1024)fail(new Error('Cropped video exceeds 5 MB. Choose a shorter clip.'));else if(event.data.size)chunks.push(event.data)}
      recorder.onerror=()=>fail(new Error('This device could not encode the video. Keep the original or try another browser.'))
      recorder.onstop=()=>{if(settled)return;settled=true;cleanup();const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});blob.size?resolve(blob):reject(new Error('Video recording was empty.'))}
      const tick=()=>{if(settled||signal.aborted)return;try{draw();onProgress(Math.min(1,video.currentTime/duration));frame=requestAnimationFrame(tick)}catch{fail(new Error('Could not draw this video.'))}}
      signal.addEventListener('abort',abort,{once:true});video.addEventListener('ended',ended,{once:true})
      timer=setTimeout(()=>fail(new Error('Video export timed out. Keep this tab visible and try again.')),22000)
      try{recorder.start(250);frame=requestAnimationFrame(tick);video.play().catch(()=>fail(new Error('Video playback was blocked. Tap Preview before exporting.')))}catch{fail(new Error('This device could not start video export. Keep the original or try another browser.'))}
    })
  } finally {stream.getTracks().forEach(track=>track.stop())}
}
