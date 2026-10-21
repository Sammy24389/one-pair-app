import {idbGet, idbUpdate} from './idb'

export const STICKER_INPUT_LIMIT = 10 * 1024 * 1024
export const STICKER_LIMIT = 512 * 1024
export const STICKER_COUNT = 32
export const STICKER_LIBRARY_LIMIT = 32 * 1024 * 1024
const KEY = 'onepair.stickers.v1'
export const STICKER_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,.webp'
export type StickerKind = 'image' | 'animated' | 'video'
export type SavedSticker = {id: string; name: string; blob: Blob; w: number; h: number; kind?: StickerKind}
const listeners = new Set<(rows: SavedSticker[]) => void>()
export const subscribeStickers = (listener: (rows: SavedSticker[]) => void) => {
  listeners.add(listener)
  return () => {listeners.delete(listener)}
}

const ascii = (b: Uint8Array, a: number, z: number) => String.fromCharCode(...b.slice(a,z))
export const inspectSticker = async (file: Blob): Promise<{kind: StickerKind; mime: string}> => {
  if (!file.size || file.size > STICKER_INPUT_LIMIT) throw new Error('Choose a sticker file smaller than 10 MB.')
  const b = new Uint8Array(await file.arrayBuffer())
  let mime = '', animated = false
  if ([137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)) mime = 'image/png'
  else if (b[0] === 255 && b[1] === 216 && b[2] === 255) mime = 'image/jpeg'
  else if (ascii(b,0,4) === 'RIFF' && ascii(b,8,12) === 'WEBP') mime = 'image/webp'
  else if (['GIF87a','GIF89a'].includes(ascii(b,0,6))) {mime = 'image/gif'; animated = true}
  else if (ascii(b,4,8) === 'ftyp') mime = 'video/mp4'
  else if ([26,69,223,163].every((v,i) => b[i] === v)) mime = 'video/webm'
  if (!mime || (file.type && file.type !== 'application/octet-stream' && file.type !== mime)) throw new Error('This is not a valid PNG, JPEG, WebP, GIF, MP4, or WebM file.')
  if (mime === 'image/png' || mime === 'image/webp') {
    const png = mime === 'image/png', view = new DataView(b.buffer)
    for (let offset = png ? 8 : 12; offset + (png ? 12 : 8) <= b.length;) {
      const length = view.getUint32(offset + (png ? 0 : 4), !png)
      if (length > b.length - offset - (png ? 12 : 8)) break
      const tag = ascii(b,offset + (png ? 4 : 0),offset + (png ? 8 : 4))
      if (['acTL','ANIM','ANMF'].includes(tag)) animated = true
      offset += length + (png ? 12 : 8 + length % 2)
    }
  }
  const kind = mime.startsWith('video/') ? 'video' : animated ? 'animated' : 'image'
  if (kind === 'animated' && file.size > 2 * 1024 * 1024) throw new Error('Animated stickers must be smaller than 2 MB.')
  if (kind === 'video' && file.size > 5 * 1024 * 1024) throw new Error('Video stickers must be smaller than 5 MB.')
  return {kind,mime}
}
export const validateStickerFile = async (file: Blob) => {await inspectSticker(file)}
const videoDimensions = (blob: Blob) => new Promise<{w: number; h: number}>((resolve,reject) => {
  const video = document.createElement('video'), url = URL.createObjectURL(blob)
  const finish = (error?: string) => {
    clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null
    const w = video.videoWidth, h = video.videoHeight
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url)
    if (error) reject(new Error(error)); else resolve({w,h})
  }
  const timer = setTimeout(() => finish('Video could not be opened. Try another MP4 or WebM.'),10000)
  video.preload = 'metadata'; video.muted = true; video.playsInline = true
  video.onloadedmetadata = () => finish(!video.videoWidth || !video.videoHeight || Math.max(video.videoWidth,video.videoHeight) > 720 || !Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 15 ? 'Video stickers must be up to 15 seconds and 720 by 720 pixels.' : undefined)
  video.onerror = () => finish('Video could not be opened. Try another MP4 or WebM.')
  video.src = url
})

const decodeStickerImage = (file: Blob) => new Promise<ImageBitmap>((resolve,reject) => {
  let expired = false
  const timer = setTimeout(() => {expired = true; reject(new Error('Image decoding timed out.'))},10000)
  Promise.resolve().then(() => createImageBitmap(file)).then(bitmap => {
    clearTimeout(timer)
    if (expired) bitmap.close(); else resolve(bitmap)
  },error => {clearTimeout(timer); reject(error)})
})

export const prepareSticker = async (file: Blob) => {
  const {kind,mime} = await inspectSticker(file)
  const source = file.type === mime ? file : file.slice(0,file.size,mime)
  if (kind === 'video') return {blob: source, ...await videoDimensions(source), kind}
  let bitmap: ImageBitmap
  try { bitmap = await decodeStickerImage(source) }
  catch { throw new Error('This image could not be opened. Try another image.') }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_777_216) throw new Error('Choose an image up to 16 megapixels.')
    if (kind === 'animated') {
      if (Math.max(bitmap.width,bitmap.height) > 512) throw new Error('Animated stickers must be up to 512 by 512 pixels.')
      return {blob: source, w: bitmap.width, h: bitmap.height, kind}
    }
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image editing is unavailable in this browser.')
    context.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare this sticker.')), 'image/webp', 0.85))
    if (!['image/png', 'image/webp'].includes(blob.type) || blob.size > STICKER_LIMIT) throw new Error('This sticker is too detailed. Choose a simpler image.')
    return {blob, w, h}
  } finally { bitmap.close() }
}

export const getStickers = async () => (await idbGet<SavedSticker[]>('kv', KEY)) ?? []

export const addSticker = async (file: Blob, name = 'Sticker') => {
  const prepared = await prepareSticker(file)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await prepared.blob.arrayBuffer()))
  const id = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')
  const sticker: SavedSticker = {id, name: name.replace(/\.[^.]+$/, '').slice(0, 40).trim() || 'Sticker', ...prepared}
  const rows = await idbUpdate<SavedSticker[]>('kv', KEY, (current = []) => {
    if (current.some(s => s.id === id)) return current
    if (current.length >= STICKER_COUNT) throw new Error('Your library is full. Remove a sticker before adding another.')
    if (current.reduce((n, s) => n + s.blob.size, 0) + sticker.blob.size > STICKER_LIBRARY_LIMIT) throw new Error('Your sticker library is full. Remove a sticker to free space.')
    return [...current, sticker]
  })
  listeners.forEach(listener => listener(rows))
  return rows
}

export const removeSticker = async (id: string) => {
  const rows = await idbUpdate<SavedSticker[]>('kv', KEY, (current = []) => current.filter(s => s.id !== id))
  listeners.forEach(listener => listener(rows))
  return rows
}
