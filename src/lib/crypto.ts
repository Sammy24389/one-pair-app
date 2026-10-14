import {fromB64, toB64, toHex} from './util'

const enc = new TextEncoder()
const subtle = crypto.subtle

export const sha256 = async (data: string | Uint8Array) =>
  new Uint8Array(await subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : (data as BufferSource)))

export const sha256Hex = async (data: string | Uint8Array) => toHex(await sha256(data))

/** HKDF-SHA256 → `len` bytes. */
export const hkdf = async (secret: Uint8Array, info: string, len = 32) => {
  const key = await subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    {name: 'HKDF', hash: 'SHA-256', salt: enc.encode('onepair/v1'), info: enc.encode(info)},
    key,
    len * 8
  )
  return new Uint8Array(bits)
}

export const hkdfHex = async (secret: Uint8Array, info: string, len = 32) => toHex(await hkdf(secret, info, len))

// ---- ECDH (P-256) for pairing ----

export const newEcdh = () => subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveBits'])

export const exportPub = async (kp: CryptoKeyPair) => toB64(await subtle.exportKey('raw', kp.publicKey))

export const ecdhSecret = async (kp: CryptoKeyPair, peerPubB64: string) => {
  const peer = await subtle.importKey('raw', fromB64(peerPubB64) as BufferSource, {name: 'ECDH', namedCurve: 'P-256'}, false, [])
  return new Uint8Array(await subtle.deriveBits({name: 'ECDH', public: peer}, kp.privateKey, 256))
}

// ---- AES-GCM ----

const aesKey = (raw: Uint8Array) => subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])

export const seal = async (keyBytes: Uint8Array, plain: Uint8Array) => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await subtle.encrypt({name: 'AES-GCM', iv}, await aesKey(keyBytes), plain as BufferSource))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return toB64(out)
}

export const open = async (keyBytes: Uint8Array, sealedB64: string) => {
  const buf = fromB64(sealedB64)
  const pt = await subtle.decrypt({name: 'AES-GCM', iv: buf.subarray(0, 12)}, await aesKey(keyBytes), buf.subarray(12))
  return new Uint8Array(pt)
}

// ---- HMAC for peer admission handshake ----

export const hmacHex = async (keyBytes: Uint8Array, msg: string) => {
  const key = await subtle.importKey('raw', keyBytes as BufferSource, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign'])
  return toHex(await subtle.sign('HMAC', key, enc.encode(msg)))
}

export const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// ---- PIN hashing ----

export const pbkdf2Hex = async (pin: string, saltHex: string, iterations = 210_000) => {
  const key = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(saltHex), iterations}, key, 256)
  return toHex(bits)
}

// ---- Short authentication string shown on both screens during pairing ----

const EMOJI = [
  '🐶', '🐱', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🐦', '🦄', '🐝', '🦋', '🐢', '🐙',
  '🌵', '🌻', '🍀', '🍄', '🌙', '⭐', '🔥', '🌈', '☂️', '❄️', '🍎', '🍋', '🍉', '🍒', '🥑', '🍩',
  '🎈', '🎁', '🎸', '🎧', '📷', '🔑', '⚓', '🚀', '⛵', '🚲', '🏀', '🎲', '🧩', '💎', '🔔', '📚',
  '🧸', '🪁', '🛸', '🗿', '🍕', '🧁', '🍿', '☕', '🌊', '⛰️', '🏝️', '🎃', '🕯️', '🪐', '🧭', '🎯'
]

export const fingerprintEmoji = async (pubA: string, pubB: string) => {
  const [x, y] = [pubA, pubB].sort()
  const h = await sha256(x + '|' + y)
  return Array.from(h.subarray(0, 5), b => EMOJI[b & 63])
}
