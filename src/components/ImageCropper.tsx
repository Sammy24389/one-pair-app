import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {cropImage,resizeCrop,type CropRect,type CropEdge} from '../lib/image-crop'
import {cropVideo,videoDuration} from '../lib/video-crop'
import '../styles/image-cropper.css'

const FULL:CropRect={x:0,y:0,width:1,height:1}
const EDGES:CropEdge[]=['left','right','top','bottom']
export default function ImageCropper({file,kind='image',onSave,onOriginal,onCancel}:{file:File;kind?:'image'|'video';onSave:(blob:Blob)=>Promise<void>;onOriginal:()=>Promise<void>;onCancel:()=>void}) {
  const id=useId(),root=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),bitmap=useRef<ImageBitmap|null>(null),video=useRef<HTMLVideoElement>(null),pending=useRef(false),previewReady=useRef(false),opening=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),controller=useRef<AbortController|null>(null)
  const [media,setMedia]=useState<{url:string;w:number;h:number}>(),[crop,setCrop]=useState<CropRect>(FULL),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('')
  const [videoUrl,setVideoUrl]=useState('')
  useEffect(()=>{
    let live=true,expired=false,loaded:ImageBitmap|null=null
    previewReady.current=false
    const url=URL.createObjectURL(file),previous=document.activeElement as HTMLElement|null
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const timer=setTimeout(()=>{expired=true;if(live)setError('Media could not be opened. Try another file.')},10000);opening.current=timer
    if(kind==='video'){controller.current=new AbortController();setVideoUrl(url)}
    else Promise.resolve().then(()=>{if(typeof createImageBitmap!=='function')throw new Error('Image cropping is unavailable on this device.');return createImageBitmap(file)}).then(value=>{
      clearTimeout(timer)
      if(!live||expired){value.close();return}
      loaded=value
      if(!value.width||!value.height||value.width*value.height>16_777_216){value.close();loaded=null;throw new Error('Choose an image up to 16 megapixels.')}
      bitmap.current=value;setMedia({url,w:value.width,h:value.height})
    }).catch(cause=>{clearTimeout(timer);if(live)setError(cause instanceof Error?cause.message:'Could not open image.')})
    return()=>{live=false;clearTimeout(timer);controller.current?.abort();loaded?.close();bitmap.current=null;URL.revokeObjectURL(url);if(previous?.isConnected)previous.focus()}
  },[file,kind])
  const cancel=()=>{if(pending.current)return;controller.current?.abort();onCancel()}
  const save=async(original=false)=>{
    if(pending.current||!media)return
    pending.current=true;setBusy(true);setProgress(0);setError('');controller.current=new AbortController()
    const selected={x:crop.x*media.w,y:crop.y*media.h,width:crop.width*media.w,height:crop.height*media.h}
    try{
      if(original)await onOriginal()
      else if(kind==='video'&&video.current)await onSave(await cropVideo(video.current,selected,controller.current.signal,setProgress))
      else if(bitmap.current)await onSave(await cropImage(bitmap.current,selected))
    }catch(cause){if(!(cause instanceof DOMException&&cause.name==='AbortError'))setError(cause instanceof Error?cause.message:'Could not save sticker.')}
    finally{pending.current=false;setBusy(false)}
  }
  const edgeValue=(edge:CropEdge)=>edge==='left'?crop.x:edge==='right'?crop.x+crop.width:edge==='top'?crop.y:crop.y+crop.height
  return createPortal(<div className="image-crop-backdrop"><div className="image-cropper" ref={root} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-busy={busy} onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();cancel()}
    if(event.key==='Tab'){const controls=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  }}>
    <div className="row between"><h3 id={`${id}-title`}>{kind==='video'?'Crop video sticker':'Crop sticker'}</h3><button className="btn ghost" disabled={busy} onClick={cancel}>Cancel</button></div>
    <p className="small muted">Drag the four borders to keep the part you want. Focus a handle and use arrow keys for precise adjustments.</p>
    <div className="crop-stage" ref={stage} style={{aspectRatio:media?`${media.w}/${media.h}`:'1',width:media?`min(calc(100% - 44px), ${Math.min(360,window.innerHeight*0.48*media.w/media.h)}px)`:'calc(100% - 44px)'}}>
      {kind==='video'?<video ref={video} src={videoUrl||undefined} muted playsInline preload="auto" aria-label="Video sticker crop preview" onLoadedData={async event=>{
        if(previewReady.current)return
        previewReady.current=true
        const value=event.currentTarget
        clearTimeout(opening.current)
        const signal=controller.current!.signal
        try {
          const duration=await videoDuration(value,signal)
          if(signal.aborted)return
          if(!value.videoWidth||!value.videoHeight||Math.max(value.videoWidth,value.videoHeight)>1920||!Number.isFinite(duration)||duration<=0||duration>15)throw new Error('Choose a video up to 15 seconds and 1920 pixels.')
          value.currentTime=0;setMedia({url:videoUrl,w:value.videoWidth,h:value.videoHeight});setError('')
        }catch(cause){if(!signal.aborted)setError(cause instanceof Error?cause.message:'Could not open this video.')}
      }} onError={()=>{clearTimeout(opening.current);setError('Could not decode this video. Try another MP4 or WebM.')}} />:media&&<img src={media.url} alt="Sticker crop preview" draggable={false}/>}
      {media&&<div className="crop-mask" aria-hidden="true" style={{clipPath:`polygon(evenodd, 0 0,100% 0,100% 100%,0 100%,0 0, ${crop.x*100}% ${crop.y*100}%,${crop.x*100}% ${(crop.y+crop.height)*100}%,${(crop.x+crop.width)*100}% ${(crop.y+crop.height)*100}%,${(crop.x+crop.width)*100}% ${crop.y*100}%,${crop.x*100}% ${crop.y*100}%)`}}/>}
      {media&&<div className="crop-selection" style={{left:`${crop.x*100}%`,top:`${crop.y*100}%`,width:`${crop.width*100}%`,height:`${crop.height*100}%`}}>
        {EDGES.map(edge=><button type="button" key={edge} className={`crop-handle crop-handle-${edge}`} aria-label={`Resize ${edge} crop border`} disabled={busy}
          onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)}}
          onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const bounds=stage.current!.getBoundingClientRect();const value=edge==='left'||edge==='right'?(event.clientX-bounds.left)/bounds.width:(event.clientY-bounds.top)/bounds.height;setCrop(previous=>resizeCrop(previous,edge,value))}}
          onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
          onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const delta=['ArrowLeft','ArrowUp'].includes(event.key)?-0.01:0.01;setCrop(resizeCrop(crop,edge,edgeValue(edge)+delta*(event.shiftKey?5:1)))}}><span/></button>)}
      </div>}
    </div>
    {!media&&!error&&<p role="status">Opening media…</p>}
    {media&&<div className="crop-secondary"><button className="btn ghost" disabled={busy} onClick={()=>setCrop(FULL)}>Reset crop</button>{kind==='video'&&<button className="btn ghost" disabled={busy} onClick={()=>{const element=video.current;if(element){element.loop=true;if(element.paused)element.play().catch(()=>setError('Could not play this video.'));else element.pause()}}}>Play / pause preview</button>}</div>}
    {kind==='video'&&<p className="tiny muted">Cropped videos are muted and exported on this device. Keep this screen open during export (up to 15 seconds).</p>}
    {busy&&kind==='video'&&<p role="status">Exporting video… {Math.round(progress*100)}%</p>}
    {error&&<p role="alert">{error}</p>}
    <div className="crop-actions"><button className="btn ghost" disabled={busy||!media} onClick={()=>save(true)}>Keep full {kind}</button><button className="btn" disabled={busy||!media} onClick={()=>save()}>{busy?'Saving…':'Crop and add'}</button></div>
  </div></div>,document.body)
}
