import {idbGet, idbUpdate} from './idb'

export const STICKER_INPUT_LIMIT = 2 * 1024 * 1024
export const STICKER_LIMIT = 512 * 1024
export const STICKER_COUNT = 32
export const STICKER_LIBRARY_LIMIT = 8 * 1024 * 1024
const KEY = 'onepair.stickers.v1'
export const STICKER_ACCEPT = 'image/png,image/jpeg,image/webp'
export type SavedSticker = {id: string; name: string; blob: Blob; w: number; h: number}

export const validateStickerFile = async (file: Blob) => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.')
  if (!file.size || file.size > STICKER_INPUT_LIMIT) throw new Error('Choose an image smaller than 2 MB.')
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const valid = file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
    : file.type === 'image/jpeg' ? b[0] === 255 && b[1] === 216 && b[2] === 255
      : String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
  if (!valid) throw new Error('This file is not a valid PNG, JPEG, or WebP image.')
}

export const prepareSticker = async (file: Blob) => {
  await validateStickerFile(file)
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) }
  catch { throw new Error('This image could not be opened. Try another image.') }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16_777_216) throw new Error('Choose an image up to 16 megapixels.')
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
  return idbUpdate<SavedSticker[]>('kv', KEY, (current = []) => {
    if (current.some(s => s.id === id)) return current
    if (current.length >= STICKER_COUNT) throw new Error('Your library is full. Remove a sticker before adding another.')
    if (current.reduce((n, s) => n + s.blob.size, 0) + sticker.blob.size > STICKER_LIBRARY_LIMIT) throw new Error('Your sticker library is full. Remove a sticker to free space.')
    return [...current, sticker]
  })
}

export const removeSticker = (id: string) => idbUpdate<SavedSticker[]>('kv', KEY, (current = []) => current.filter(s => s.id !== id))
