import {nativeBridge} from './native'
import {withSystemUi} from './platform'

/** Downscale + re-encode photos before sending: fast transfers, small storage. */
export const compressImage = async (file: Blob, max = 1600, quality = 0.82): Promise<{blob: Blob; w: number; h: number}> => {
  if (file.type === 'image/gif') {
    const bmp = await createImageBitmap(file)
    return {blob: file, w: bmp.width, h: bmp.height}
  }
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/webp', quality))
  return {blob, w, h}
}

export const avatarFromFile = async (file: Blob) => {
  const {blob} = await compressImage(file, 160, 0.8)
  return new Promise<string>(res => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(blob)
  })
}

export const pickFiles = (accept: string, multiple = false, capture?: 'user' | 'environment') =>
  withSystemUi(() => pickFilesRaw(accept, multiple, capture))

const pickFilesRaw = (accept: string, multiple: boolean, capture?: 'user' | 'environment') =>
  new Promise<File[]>(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    if (capture) input.setAttribute('capture', capture)
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.addEventListener('cancel', () => resolve([]))
    // Fallback for WebViews that don't fire "cancel": resolve empty when focus returns without a selection.
    const onFocus = () => setTimeout(() => !input.files?.length && resolve([]), 1500)
    window.addEventListener('focus', onFocus, {once: true})
    input.click()
  })

const blobToB64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).slice((r.result as string).indexOf(',') + 1))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })

/** Save a file to the device. Android's WebView ignores <a download> for blob: URLs, so go through the native picker there. */
export const saveBlob = (blob: Blob, name: string): Promise<boolean> =>
  withSystemUi(async () => {
    if (nativeBridge) {
      const {saved} = await nativeBridge.saveFile({name, mime: blob.type || 'application/octet-stream', data: await blobToB64(blob)})
      return saved
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return true
  })

export class VoiceRecorder {
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  startedAt = 0

  async start() {
    this.stream = await withSystemUi(() => navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}))
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) ?? ''
    this.rec = new MediaRecorder(this.stream, mime ? {mimeType: mime, audioBitsPerSecond: 32000} : undefined)
    this.chunks = []
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data)
    this.rec.start(250)
    this.startedAt = Date.now()
  }

  stop(): Promise<{blob: Blob; dur: number} | null> {
    return new Promise(resolve => {
      if (!this.rec) return resolve(null)
      const dur = (Date.now() - this.startedAt) / 1000
      this.rec.onstop = () => {
        this.stream?.getTracks().forEach(t => t.stop())
        resolve(dur < 0.6 ? null : {blob: new Blob(this.chunks, {type: this.rec!.mimeType}), dur})
      }
      this.rec.stop()
    })
  }

  cancel() {
    this.rec?.stop()
    this.stream?.getTracks().forEach(t => t.stop())
    this.rec = null
  }
}
