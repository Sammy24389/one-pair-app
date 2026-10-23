export type OpenPigeonMessage = {
  messageGuid: string; session: string; url: string; isLive: boolean
  ldText?: string; caption?: string; subcaption?: string; secondaryCaption?: string
  tertiaryCaption?: string; imageTitle?: string; imageSubtitle?: string; imageBase64?: string
}
export type OpenPigeonSession = {
  id: string; participants: string[]; revision: number; author: string
  message: OpenPigeonMessage; updatedAt: number
}
export const OPENPIGEON_PROTOCOL = 1
export const OPENPIGEON_MAX_SESSIONS = 24
export const OPENPIGEON_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const textKeys = ['ldText', 'caption', 'subcaption', 'secondaryCaption', 'tertiaryCaption', 'imageTitle', 'imageSubtitle'] as const
export const openPigeonDeviceId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value)
export function openPigeonParticipants(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4 && value.every(openPigeonDeviceId) && new Set(value).size === value.length
}
// URLs are opaque OpenPigeon payloads. Never decode, trim, fetch or rewrite them.
export function normalizeOpenPigeonMessage(value: unknown): OpenPigeonMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const m = value as Record<string, unknown>
  if (typeof m.messageGuid !== 'string' || !/^[\x21-\x7e]{1,100}$/.test(m.messageGuid) || typeof m.session !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(m.session) || typeof m.url !== 'string' || !m.url.startsWith('data:?') || new TextEncoder().encode(m.url).byteLength > 90000 || typeof m.isLive !== 'boolean') return null
  const message: OpenPigeonMessage = {messageGuid:m.messageGuid, session:m.session, url:m.url, isLive:m.isLive}
  for (const key of textKeys) {
    if (m[key] === undefined) continue
    if (typeof m[key] !== 'string' || m[key].length > 200) return null
    message[key] = m[key]
  }
  return new TextEncoder().encode(JSON.stringify(message)).byteLength <= 100000 ? message : null
}
export function normalizeOpenPigeonSession(value: unknown, owner: string): OpenPigeonSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const s = value as Record<string, unknown>, message = normalizeOpenPigeonMessage(s.message)
  if (!message || s.id !== message.session || !openPigeonParticipants(s.participants) || !s.participants.includes(owner) || typeof s.author !== 'string' || !s.participants.includes(s.author) || !Number.isSafeInteger(s.revision) || (s.revision as number) < 1 || (s.revision as number) > 100000 || !Number.isSafeInteger(s.updatedAt) || (s.updatedAt as number) <= 0 || (s.updatedAt as number) > Date.now() + 300000) return null
  return {id:message.session, participants:[...s.participants], revision:s.revision as number, author:s.author, message, updatedAt:s.updatedAt as number}
}
