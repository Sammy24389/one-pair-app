export const uid = (len = 12): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  const abc = '0123456789abcdefghijklmnopqrstuvwxyz'
  let s = ''
  for (const b of bytes) s += abc[b % 36]
  return s
}

// Crockford base32 without ambiguous chars – used for human-typed pairing codes.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const randomCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let s = ''
  for (const b of bytes) s += B32[b & 31]
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

export const normalizeCode = (raw: string): string => {
  const clean = raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
    .split('')
    .filter(c => B32.includes(c))
    .join('')
    .slice(0, 12)
  return clean.length === 12 ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}` : clean
}

export const isValidCode = (code: string) => /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code)

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')

export const fromHex = (hex: string) => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))

export const DAY = 86_400_000

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY)

export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})

export const fmtDay = (ts: number) => {
  const d = new Date(ts)
  const diff = daysBetween(d, new Date())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString([], {weekday: 'long'})
  return d.toLocaleDateString([], {month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'})
}

export const fmtAgo = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`

export const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/** Deterministic pick from a list for a given day so both devices see the same item. */
export const pickForDay = <T,>(list: T[], salt: string, day = todayKey()): T => {
  let h = 2166136261
  for (const c of salt + day) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return list[(h >>> 0) % list.length]
}

export const haversineKm = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi

export const throttle = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...a: A) => {
    const now = Date.now()
    clearTimeout(timer)
    if (now - last >= ms) {
      last = now
      fn(...a)
    } else {
      timer = setTimeout(() => {
        last = Date.now()
        fn(...a)
      }, ms - (now - last))
    }
  }
}

export const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
