import {getMedia, putMedia} from './idb'
import {uid} from './util'
import type {Profile} from './identity'

export const PROFILE_VIDEO_BYTES = 5 * 1024 * 1024
const VIDEO_TYPES = ['video/mp4', 'video/webm']
export const validProfileMedia = (value: unknown): value is NonNullable<Profile['avatarMedia']> => {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return typeof m.id === 'string' && /^[a-z0-9]{16}$/.test(m.id) && typeof m.mime === 'string' && VIDEO_TYPES.includes(m.mime) && typeof m.size === 'number' && Number.isInteger(m.size) && m.size > 0 && m.size <= PROFILE_VIDEO_BYTES
}
export const inspectProfileVideo = (file: Blob): Promise<void> => new Promise((resolve, reject) => {
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)
  let settled = false
  const finish = (error?: Error) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    video.onloadedmetadata = null
    video.onerror = null
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
    error ? reject(error) : resolve()
  }
  const timer = setTimeout(() => finish(new Error('Video could not be read. Choose an MP4 or WebM video.')), 10000)
  video.onloadedmetadata = () => finish(!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 15 ? new Error('Choose a video up to 15 seconds long.') : !video.videoWidth || !video.videoHeight || Math.max(video.videoWidth, video.videoHeight) > 1280 || Math.min(video.videoWidth, video.videoHeight) > 720 ? new Error('Choose a video at 720p or lower.') : undefined)
  video.onerror = () => finish(new Error('This video cannot be played on this device.'))
  video.preload = 'metadata'
  video.src = url
})
export const prepareProfileMedia = async (file: File): Promise<Pick<Profile, 'avatar' | 'avatarMedia'>> => {
  if (file.type.startsWith('image/')) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a supported image up to 10 MB.')
    // Profile photos are small static previews; large animation data stays out of identity storage.
    const bitmap = await createImageBitmap(file)
    try {
      if (!Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height) || bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width * bitmap.height > 16_000_000) throw new Error('Choose a photo up to 16 megapixels.')
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This device could not prepare the photo. Try another image.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare photo.')), 'image/webp', .8))
      if (blob.size > 150000) throw new Error('The profile photo is too large. Choose another image.')
      const avatar = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Could not read profile photo.'))
        reader.readAsDataURL(blob)
      })
      return {avatar, avatarMedia: undefined}
    } finally {bitmap.close()}
  }
  if (!VIDEO_TYPES.includes(file.type) || !file.size || file.size > PROFILE_VIDEO_BYTES) throw new Error('Choose an MP4 or WebM video up to 5 MB.')
  await inspectProfileVideo(file)
  const id = uid(16)
  await putMedia(id, file, file.name)
  return {avatar: undefined, avatarMedia: {id, mime: file.type, size: file.size}}
}
export const profileVideoUrl = async (media: NonNullable<Profile['avatarMedia']>) => {
  if (!validProfileMedia(media)) return null
  const record = await getMedia(media.id)
  if (!record || record.blob.size !== media.size || record.blob.type !== media.mime) return null
  return URL.createObjectURL(record.blob)
}
