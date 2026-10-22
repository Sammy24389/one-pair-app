export type Crop = {x:number; y:number; size:number}
export function squareCrop(width:number, height:number, zoom:number, horizontal:number, vertical:number):Crop {
  if (![width,height,zoom,horizontal,vertical].every(Number.isFinite) || width<=0 || height<=0 || zoom<1 || zoom>4 || horizontal<0 || horizontal>100 || vertical<0 || vertical>100) throw new Error('Invalid crop selection.')
  const size=Math.min(width,height)/zoom
  return {x:(width-size)*horizontal/100,y:(height-size)*vertical/100,size}
}
export type CropRect = {x:number; y:number; width:number; height:number}
export async function cropImage(bitmap:ImageBitmap,crop:Crop | CropRect) {
  if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>16_777_216) throw new Error('Choose an image up to 16 megapixels.')
  const width = 'size' in crop ? crop.size : crop.width, height = 'size' in crop ? crop.size : crop.height
  validateCrop(bitmap.width,bitmap.height,{x:crop.x,y:crop.y,width,height})
  const canvas=document.createElement('canvas'), scale=Math.min(1,512/Math.max(width,height))
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale))
  const context=canvas.getContext('2d'); if(!context) throw new Error('Image editing is unavailable on this device.')
  context.drawImage(bitmap,crop.x,crop.y,width,height,0,0,canvas.width,canvas.height)
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not crop image.')),'image/png'))
}
export function validateCrop(width:number,height:number,crop:CropRect) {
  if (![width,height,crop.x,crop.y,crop.width,crop.height].every(Number.isFinite) || width<=0 || height<=0 || crop.x<0 || crop.y<0 || crop.width<=0 || crop.height<=0 || crop.x+crop.width>width+0.01 || crop.y+crop.height>height+0.01) throw new Error('Invalid crop selection.')
}
export type CropEdge = 'left' | 'right' | 'top' | 'bottom'
export function resizeCrop(crop:CropRect,edge:CropEdge,value:number):CropRect {
  if (!Number.isFinite(value)) return crop
  const next={...crop}, clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
  if(edge==='left'){next.x=clamp(value,0,crop.x+crop.width-0.08);next.width=crop.x+crop.width-next.x}
  if(edge==='right')next.width=clamp(value,crop.x+0.08,1)-crop.x
  if(edge==='top'){next.y=clamp(value,0,crop.y+crop.height-0.08);next.height=crop.y+crop.height-next.y}
  if(edge==='bottom')next.height=clamp(value,crop.y+0.08,1)-crop.y
  return next
}
