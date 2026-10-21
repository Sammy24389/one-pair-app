export type Crop = {x:number; y:number; size:number}
export function squareCrop(width:number, height:number, zoom:number, horizontal:number, vertical:number):Crop {
  if (![width,height,zoom,horizontal,vertical].every(Number.isFinite) || width<=0 || height<=0 || zoom<1 || zoom>4 || horizontal<0 || horizontal>100 || vertical<0 || vertical>100) throw new Error('Invalid crop selection.')
  const size=Math.min(width,height)/zoom
  return {x:(width-size)*horizontal/100,y:(height-size)*vertical/100,size}
}
export async function cropImage(bitmap:ImageBitmap,crop:Crop) {
  if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>16_777_216) throw new Error('Choose an image up to 16 megapixels.')
  if (![crop.x,crop.y,crop.size].every(Number.isFinite) || crop.x<0 || crop.y<0 || crop.size<=0 || crop.x+crop.size>bitmap.width+0.01 || crop.y+crop.size>bitmap.height+0.01) throw new Error('Invalid crop selection.')
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=Math.min(512,Math.max(1,Math.round(crop.size)))
  const context=canvas.getContext('2d'); if(!context) throw new Error('Image editing is unavailable on this device.')
  context.drawImage(bitmap,crop.x,crop.y,crop.size,crop.size,0,0,canvas.width,canvas.height)
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not crop image.')),'image/png'))
}
