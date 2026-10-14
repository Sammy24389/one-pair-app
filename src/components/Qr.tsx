import {useEffect, useRef, useState} from 'react'
import {X} from 'lucide-react'
import {normalizeCode, isValidCode} from '../lib/util'

const PREFIX = 'ONEPAIR:'

export const qrPayload = (code: string) => PREFIX + code

/** Accepts "ONEPAIR:XXXX-XXXX-XXXX" or a bare code; returns a normalized code or null. */
export const parseQr = (raw: string) => {
  const code = normalizeCode(raw.trim().toUpperCase().startsWith(PREFIX) ? raw.trim().slice(PREFIX.length) : raw)
  return isValidCode(code) ? code : null
}

export const QrCode = ({value, size = 220}: {value: string; size?: number}) => {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    import('qrcode').then(QR =>
      QR.toString(value, {type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: {dark: '#1b1520', light: '#ffffff'}}).then(s => live && setSvg(s))
    )
    return () => {
      live = false
    }
  }, [value])
  return <div className="qr" style={{width: size, height: size}} dangerouslySetInnerHTML={{__html: svg}} aria-label="Pairing QR code" role="img" />
}

type Detector = {detect: (src: CanvasImageSource) => Promise<{rawValue: string}[]>}

/** Camera QR scanner: native BarcodeDetector when available, jsQR fallback otherwise. */
export const QrScanner = ({onCode, onClose}: {onCode: (code: string) => void; onClose: () => void}) => {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', {willReadFrequently: true})!

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment', width: {ideal: 1280}}})
        if (stopped) return stream.getTracks().forEach(t => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const BD = (window as unknown as {BarcodeDetector?: new (o: {formats: string[]}) => Detector}).BarcodeDetector
        let detector: Detector | null = null
        try {
          if (BD) detector = new BD({formats: ['qr_code']})
        } catch {
          detector = null
        }
        let jsQR = detector ? null : (await import('jsqr')).default
        let last = 0
        const tick = async (t: number) => {
          if (stopped) return
          if (t - last > 180 && v.videoWidth) {
            last = t
            let raw: string | null = null
            if (detector) {
              try {
                raw = (await detector.detect(v))[0]?.rawValue ?? null
              } catch {
                // Native detector present but broken on this device – switch to the JS decoder.
                detector = null
                jsQR = (await import('jsqr')).default
              }
            } else if (jsQR) {
              const scale = Math.min(1, 640 / v.videoWidth)
              canvas.width = v.videoWidth * scale
              canvas.height = v.videoHeight * scale
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              raw = jsQR(img.data, img.width, img.height, {inversionAttempts: 'dontInvert'})?.data ?? null
            }
            const code = raw ? parseQr(raw) : null
            if (code) {
              navigator.vibrate?.(40)
              onCode(code)
              return
            }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        setError(`Camera unavailable: ${(e as Error).message}`)
      }
    }
    start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onCode])

  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      <div className="scan-frame" />
      <div className="scan-hint">{error || "Point at your pair's QR code"}</div>
      <button className="icon-btn x" onClick={onClose} aria-label="Close scanner">
        <X />
      </button>
    </div>
  )
}
