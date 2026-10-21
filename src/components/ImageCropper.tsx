import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {cropImage,squareCrop} from '../lib/image-crop'
import '../styles/image-cropper.css'

export default function ImageCropper({file,onSave,onOriginal,onCancel}:{file:File;onSave:(blob:Blob)=>Promise<void>;onOriginal:()=>Promise<void>;onCancel:()=>void}) {
  const id=useId(),root=useRef<HTMLDivElement>(null),bitmap=useRef<ImageBitmap|null>(null),pending=useRef(false)
  const [image,setImage]=useState<{url:string;w:number;h:number}>(),[zoom,setZoom]=useState(1),[horizontal,setHorizontal]=useState(50),[vertical,setVertical]=useState(50),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{
    let live=true,expired=false,loaded:ImageBitmap|null=null,url=''
    const timer=setTimeout(()=>{expired=true;if(live)setError('Image decoding timed out. Try another image.')},10000)
    const previous=document.activeElement as HTMLElement|null
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    Promise.resolve().then(()=>{if(typeof createImageBitmap!=='function')throw new Error('Image cropping is unavailable on this device.');return createImageBitmap(file)}).then(value=>{
      clearTimeout(timer)
      if(!live||expired){value.close();return}
      loaded=value
      if(!value.width || !value.height || value.width*value.height>16_777_216){value.close();loaded=null;throw new Error('Choose an image up to 16 megapixels.')}
      bitmap.current=value;url=URL.createObjectURL(file);setImage({url,w:value.width,h:value.height})
    }).catch(cause=>{clearTimeout(timer);if(live)setError(cause instanceof Error?cause.message:'Could not open image.')})
    return()=>{live=false;clearTimeout(timer);loaded?.close();bitmap.current=null;if(url)URL.revokeObjectURL(url);if(previous?.isConnected)previous.focus()}
  },[file])
  const crop=image?squareCrop(image.w,image.h,zoom,horizontal,vertical):null
  const save=async(original=false)=>{
    if(pending.current)return
    pending.current=true;setBusy(true);setError('')
    try{if(original)await onOriginal();else if(bitmap.current&&crop)await onSave(await cropImage(bitmap.current,crop))}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save sticker.')}
    finally{pending.current=false;setBusy(false)}
  }
  return createPortal(<div className="image-crop-backdrop"><div className="image-cropper" ref={root} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-busy={busy} onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();if(!busy)onCancel()}
    if(event.key==='Tab'){const buttons=root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!buttons?.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  }}>
    <div className="row between"><h3 id={`${id}-title`}>Crop sticker</h3><button className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button></div>
    <p className="small muted">Adjust the square crop. Your original image stays unchanged.</p>
    {image&&crop?<div className="crop-preview"><img src={image.url} alt="Sticker crop preview" draggable={false} style={{width:`${image.w/crop.size*100}%`,height:`${image.h/crop.size*100}%`,left:`${-crop.x/crop.size*100}%`,top:`${-crop.y/crop.size*100}%`}}/></div>:!error&&<p role="status">Opening image...</p>}
    {image&&<><label htmlFor={`${id}-zoom`}>Zoom</label><input id={`${id}-zoom`} type="range" min="1" max="4" step="0.05" value={zoom} disabled={busy} onChange={e=>setZoom(Number(e.target.value))}/><label htmlFor={`${id}-horizontal`}>Horizontal crop position</label><input id={`${id}-horizontal`} type="range" min="0" max="100" value={horizontal} disabled={busy} onChange={e=>setHorizontal(Number(e.target.value))}/><label htmlFor={`${id}-vertical`}>Vertical crop position</label><input id={`${id}-vertical`} type="range" min="0" max="100" value={vertical} disabled={busy} onChange={e=>setVertical(Number(e.target.value))}/></>}
    {error&&<p role="alert">{error}</p>}
    <div className="crop-actions"><button className="btn ghost" disabled={busy||!image} onClick={()=>save(true)}>Keep full image</button><button className="btn" disabled={busy||!image} onClick={()=>save()}>{busy?'Saving...':'Crop and add'}</button></div>
  </div></div>,document.body)
}
