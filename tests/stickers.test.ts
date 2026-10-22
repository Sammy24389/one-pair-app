import 'fake-indexeddb/auto'
import {Blob as NodeBlob} from 'node:buffer'
import {webcrypto} from 'node:crypto'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {idbDel, idbGet, idbPut, idbUpdate, getMedia, putMedia} from '../src/lib/idb'
import {addSticker, inspectSticker, getStickers, prepareSticker, removeSticker, subscribeStickers, STICKER_COUNT, STICKER_LIBRARY_LIMIT, STICKER_INPUT_LIMIT, STICKER_LIMIT, validateStickerFile, type SavedSticker} from '../src/lib/stickers'

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
  it('rejects SVG, empty, oversized, and disguised files before decoding', async () => {
    await expect(validateStickerFile(new Blob(['<svg/>'], {type:'image/svg+xml'}))).rejects.toThrow('PNG, JPEG, WebP')
    await expect(validateStickerFile(new Blob([], {type:'image/png'}))).rejects.toThrow('10 MB')
    await expect(validateStickerFile(new Blob([new Uint8Array(STICKER_INPUT_LIMIT + 1)], {type:'image/png'}))).rejects.toThrow('10 MB')
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
    await idbPut('kv', key, rows.slice(0,16).map(s => ({...s,blob:new Blob([new Uint8Array(STICKER_LIBRARY_LIMIT / 16)],{type:'image/png'})})))
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

it('notifies an open library after committed saves and removals and supports unsubscription', async () => {
  const listener = vi.fn()
  const off = subscribeStickers(listener)
  const rows = await addSticker(png(), 'Received sticker')
  expect(listener).toHaveBeenLastCalledWith(rows)
  expect(await getStickers()).toEqual(rows)
  await removeSticker(rows[0].id)
  expect(listener).toHaveBeenLastCalledWith([])
  off()
  await addSticker(png(), 'Again')
  expect(listener).toHaveBeenCalledTimes(2)
})

it('preserves GIF and animated WebP/PNG bytes and infers missing file MIME',async()=>{
  const formats = [new Blob(['GIF89a'],{type:'image/gif'}),new Blob(['RIFF0000WEBPANIM',new Uint8Array(4)]),new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),'acTL',new Uint8Array(4)],{type:'image/png'})]
  for (const file of formats) {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({width:512,height:256,close} as unknown as ImageBitmap)
    expect((await inspectSticker(file)).kind).toBe('animated')
    const prepared = await prepareSticker(file)
    expect(prepared.kind).toBe('animated')
    expect(await prepared.blob.arrayBuffer()).toEqual(await file.arrayBuffer())
  }
  expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
  await expect(inspectSticker(new Blob(['GIF89a',new Uint8Array(2*1024*1024)],{type:'image/gif'}))).rejects.toThrow('2 MB')
  await expect(prepareSticker(new Blob(['GIF89a'],{type:'image/gif'}))).rejects.toThrow('512 by 512')
})
it('validates video metadata and releases media URLs on success, failure, and timeout',async()=>{
  vi.useFakeTimers()
  const create = document.createElement.bind(document), videos: HTMLVideoElement[] = []
  vi.spyOn(document,'createElement').mockImplementation(((tag:string)=>{
    const el=create(tag)
    if(tag==='video') {videos.push(el as HTMLVideoElement);Object.defineProperties(el,{videoWidth:{value:512},videoHeight:{value:512},duration:{value:5,configurable:true}})}
    return el
  }) as typeof document.createElement)
  vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
  URL.createObjectURL=vi.fn(()=> 'blob:video');URL.revokeObjectURL=vi.fn()
  const file=new Blob([new Uint8Array(4),'ftypisom'],{type:'video/mp4'})
  const pending=prepareSticker(file);await vi.advanceTimersByTimeAsync(1);videos[0].dispatchEvent(new Event('loadedmetadata'))
  expect(await pending).toEqual({blob:file,w:512,h:512,kind:'video'})
  const invalid=prepareSticker(file);const rejected=expect(invalid).rejects.toThrow('15 seconds');await vi.advanceTimersByTimeAsync(1)
  Object.defineProperty(videos[1],'duration',{value:16});videos[1].dispatchEvent(new Event('loadedmetadata'));await rejected
  const timeout=expect(prepareSticker(file)).rejects.toThrow('could not be opened');await vi.advanceTimersByTimeAsync(10001);await timeout
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  await expect(inspectSticker(new Blob([new Uint8Array(4),'ftyp',new Uint8Array(5*1024*1024)],{type:'video/mp4'}))).rejects.toThrow('5 MB')
  vi.useRealTimers()
})

it('recognizes a generic Android WebP file by its bytes',async()=>{
  const {inspectSticker}=await import('../src/lib/stickers')
  const bytes=new Uint8Array(12);bytes.set([82,73,70,70],0);bytes.set([87,69,66,80],8)
  expect(await inspectSticker(new Blob([bytes],{type:'application/octet-stream'}))).toEqual({kind:'image',mime:'image/webp'})
})

it('probes the end of duration-less recorder WebM before accepting it',async()=>{
  vi.useFakeTimers()
  const create=document.createElement.bind(document);let video:HTMLVideoElement
  vi.spyOn(document,'createElement').mockImplementation(((tag:string)=>{
    const el=create(tag)
    if(tag==='video'){video=el as HTMLVideoElement;Object.defineProperties(el,{videoWidth:{value:512},videoHeight:{value:256},duration:{value:Infinity}})}
    return el
  }) as typeof document.createElement)
  vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{})
  URL.createObjectURL=vi.fn(()=> 'blob:recorder');URL.revokeObjectURL=vi.fn()
  const file=new Blob([new Uint8Array([26,69,223,163,1])],{type:'video/webm'})
  const pending=prepareSticker(file);await vi.advanceTimersByTimeAsync(1)
  video!.dispatchEvent(new Event('loadedmetadata'));expect(video!.currentTime).toBe(1e10)
  video!.currentTime=2;video!.dispatchEvent(new Event('seeked'))
  expect(await pending).toMatchObject({w:512,h:256,kind:'video'});expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  vi.useRealTimers()
})
