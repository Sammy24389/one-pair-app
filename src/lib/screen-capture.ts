import type {PluginListenerHandle} from '@capacitor/core'
import {nativeBridge} from './native'

let nativeCaptureBusy = false

export const screenCaptureAvailable = () => !!nativeBridge || !!(globalThis.isSecureContext && navigator.mediaDevices?.getDisplayMedia)

export async function captureScreen(audio = false): Promise<MediaStream> {
  if (!nativeBridge) {
    if (!screenCaptureAvailable()) throw new Error('Screen sharing requires a supported browser over HTTPS. Mobile browsers may only receive shared screens; use the Android APK to share from Android.')
    return navigator.mediaDevices.getDisplayMedia({video: {width: {ideal:1280}, height: {ideal:720}, frameRate: {ideal:15,max:30}}, audio})
  }
  if (nativeCaptureBusy) throw new Error('Stop the screen share already running on this device first.')
  const canvas = document.createElement('canvas')
  if (!canvas.captureStream) throw new Error('Update Android System WebView to enable screen sharing.')
  const paint = canvas.getContext('2d')
  if (!paint) throw new Error('Screen rendering is unavailable on this device.')
  nativeCaptureBusy = true
  const listeners: PluginListenerHandle[] = []
  let closed = false, rendering = false, stoppedReason = '', stream: MediaStream | null = null
  let originalStop: (() => void) | null = null
  let image: HTMLImageElement | null = null
  const close = (stopNative: boolean, notifyTrack = false) => {
    if (closed) return
    closed = true
    listeners.splice(0).forEach(listener => {void listener.remove().catch(() => {})})
    if (image) {image.onload = null; image.onerror = null; image.src = ''; image = null}
    originalStop?.()
    if (notifyTrack) stream?.getVideoTracks()[0]?.dispatchEvent(new Event('ended'))
    canvas.width = canvas.height = 1
    if (stopNative) void nativeBridge!.stopScreenCapture().catch(() => {}).finally(() => {nativeCaptureBusy=false})
    else nativeCaptureBusy=false
  }
  try {
    listeners.push(await nativeBridge.addListener('screenCaptureStopped', event => {
      stoppedReason = event.reason || 'Screen sharing stopped.'; close(false, true)
    }))
    listeners.push(await nativeBridge.addListener('screenFrame', frame => {
      if (closed || rendering || typeof frame.data !== 'string' || frame.data.length > 360000 || !validSize(frame.width,frame.height)) return
      rendering = true
      const next = new Image(); image = next
      next.onload = () => {
        try {
          if (!closed && next.naturalWidth === frame.width && next.naturalHeight === frame.height) {
            if (canvas.width !== frame.width || canvas.height !== frame.height) {canvas.width=frame.width;canvas.height=frame.height}
            paint.drawImage(next,0,0,canvas.width,canvas.height)
            ;(stream?.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame?.()
          }
        } catch {close(true,true)} finally {rendering=false;image=null;next.onload=null;next.onerror=null}
      }
      next.onerror = () => {rendering=false;image=null;next.onload=null;next.onerror=null}
      next.src = `data:image/jpeg;base64,${frame.data}`
    }))
    const size = await nativeBridge.startScreenCapture()
    if (closed) throw new Error(stoppedReason || 'Screen sharing was cancelled.')
    if (!validSize(size.width,size.height)) throw new Error('Invalid screen capture dimensions.')
    canvas.width=size.width;canvas.height=size.height
    stream=canvas.captureStream(10)
    const track=stream.getVideoTracks()[0]
    if (!track) throw new Error('Screen capture produced no video track.')
    originalStop=track.stop.bind(track)
    track.stop=()=>close(true)
    return stream
  } catch (error) {
    close(true)
    throw error
  }
}

function validSize(width: number,height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && Math.max(width,height)<=1280 && Math.min(width,height)<=720 && width*height<=921600
}
