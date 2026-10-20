import 'fake-indexeddb/auto'
import {Blob as NodeBlob} from 'node:buffer'
import {webcrypto} from 'node:crypto'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {idbDel, idbGet, idbPut, idbUpdate, getMedia, putMedia} from '../src/lib/idb'
import {addSticker, getStickers, prepareSticker, removeSticker, STICKER_COUNT, STICKER_INPUT_LIMIT, STICKER_LIMIT, validateStickerFile, type SavedSticker} from '../src/lib/stickers'

const key = 'onepair.stickers.v1'
const png = (seed = 1) => new Blob([new Uint8Array([137,80,78,71,13,10,26,10,seed])], {type: 'image/png'})
let encoded: Blob
let close: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('crypto', webcrypto)
  close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({width: 1024, height: 512, close}))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage: vi.fn()} as unknown as CanvasRenderingContext2D)
  encoded = png()
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(encoded))
  await idbDel('kv', key)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('sticker validation and preparation', () => {
  it('rejects SVG, GIF, empty, oversized, and disguised files before decoding', async () => {
    await expect(validateStickerFile(new Blob(['<svg/>'], {type:'image/svg+xml'}))).rejects.toThrow('PNG, JPEG, or WebP')
    await expect(validateStickerFile(new Blob(['GIF89a'], {type:'image/gif'}))).rejects.toThrow('PNG, JPEG, or WebP')
    await expect(validateStickerFile(new Blob([], {type:'image/png'}))).rejects.toThrow('2 MB')
    await expect(validateStickerFile(new Blob([new Uint8Array(STICKER_INPUT_LIMIT + 1)], {type:'image/png'}))).rejects.toThrow('2 MB')
    await expect(validateStickerFile(new Blob(['not png'], {type:'image/png'}))).rejects.toThrow('not a valid')
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
  it('checks signatures for each supported format', async () => {
    await expect(validateStickerFile(png())).resolves.toBeUndefined()
    await expect(validateStickerFile(new Blob([new Uint8Array([255,216,255,1])], {type:'image/jpeg'}))).resolves.toBeUndefined()
    await expect(validateStickerFile(new Blob(['RIFF1234WEBP'], {type:'image/webp'}))).resolves.toBeUndefined()
    await expect(validateStickerFile(new Blob(['RIFF1234XXXX'], {type:'image/webp'}))).rejects.toThrow('not a valid')
  })
  it('rescales to 512 pixels and releases decoded image memory', async () => {
    const result = await prepareSticker(png())
    expect(result).toEqual({blob: encoded, w:512, h:256})
    expect(close).toHaveBeenCalledOnce()
  })
  it('releases oversized decoded images and rejects oversized output', async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({width:8192,height:8192,close} as unknown as ImageBitmap)
    await expect(prepareSticker(png())).rejects.toThrow('16 megapixels')
    expect(close).toHaveBeenCalledOnce()
    encoded = new Blob([new Uint8Array(STICKER_LIMIT + 1)], {type:'image/png'})
    await expect(prepareSticker(png())).rejects.toThrow('too detailed')
    expect(close).toHaveBeenCalledTimes(2)
  })
  it('reports undecodable images and encoding failure', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('decode'))
    await expect(prepareSticker(png())).rejects.toThrow('could not be opened')
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(callback => callback(null))
    await expect(prepareSticker(png())).rejects.toThrow('Could not prepare')
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('sticker persistence', () => {
  it('persists, deduplicates and removes library entries while retaining sent media', async () => {
    const rows = await addSticker(png(), 'wave.png')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('wave')
    expect(await addSticker(png(), 'duplicate.png')).toHaveLength(1)
    expect((await getStickers())[0].id).toBe(rows[0].id)
    await putMedia('sent-sticker', encoded, 'wave')
    await removeSticker(rows[0].id)
    expect(await getStickers()).toEqual([])
    expect((await getMedia('sent-sticker'))?.blob.size).toBe(encoded.size)
  })
  it('enforces count and total storage budgets without overwriting the library', async () => {
    const rows: SavedSticker[] = Array.from({length:STICKER_COUNT}, (_,i) => ({id:String(i),name:'existing',blob:png(i),w:1,h:1}))
    await idbPut('kv', key, rows)
    await expect(addSticker(png())).rejects.toThrow('library is full')
    expect(await getStickers()).toHaveLength(STICKER_COUNT)
    await idbPut('kv', key, rows.slice(0,16).map(s => ({...s,blob:new Blob([new Uint8Array(STICKER_LIMIT)],{type:'image/png'})})))
    await expect(addSticker(png())).rejects.toThrow('library is full')
    expect(await getStickers()).toHaveLength(16)
  })
  it('serializes simultaneous updates and preserves the previous record after abort', async () => {
    await Promise.all(Array.from({length:10}, () => idbUpdate<number>('kv', 'counter', n => (n ?? 0) + 1)))
    expect(await idbGet('kv','counter')).toBe(10)
    await expect(idbUpdate('kv','counter', () => {throw new Error('limit')})).rejects.toThrow('limit')
    expect(await idbGet('kv','counter')).toBe(10)
    await idbDel('kv','counter')
  })
})
