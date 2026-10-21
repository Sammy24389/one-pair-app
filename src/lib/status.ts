import {uid} from './util'

export const STATUS_LIFETIME = 24 * 60 * 60 * 1000
export const STATUS_TEXT_LIMIT = 500
export const STATUS_ACTIVE_LIMIT = 5
export type StatusRecord = {id: string; from: string; text: string; ts: number}
type StatusMap = {
  values(): IterableIterator<StatusRecord>
  get(id: string): StatusRecord | undefined
  set(id: string, value: StatusRecord): unknown
  delete(id: string): unknown
}

export function validStatus(value: unknown): value is StatusRecord {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<StatusRecord>
  return typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 128 &&
    typeof s.from === 'string' && s.from.length > 0 && s.from.length <= 128 &&
    typeof s.text === 'string' && s.text.trim().length > 0 && s.text.length <= STATUS_TEXT_LIMIT &&
    typeof s.ts === 'number' && Number.isSafeInteger(s.ts) && s.ts >= 0
}

export function activeStatuses(statuses: StatusMap, owners: string[], now = Date.now()) {
  const counts = new Map<string, number>()
  return [...statuses.values()].filter(s => validStatus(s) && owners.includes(s.from) && s.ts <= now && now - s.ts < STATUS_LIFETIME)
    .sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id))
    .filter(s => {
      const count = counts.get(s.from) ?? 0
      counts.set(s.from, count + 1)
      return count < STATUS_ACTIVE_LIMIT
    })
}

export function pruneStatuses(statuses: StatusMap, owner: string, now = Date.now()) {
  for (const s of statuses.values()) {
    if (validStatus(s) && s.from === owner && now - s.ts >= STATUS_LIFETIME) statuses.delete(s.id)
  }
}

export function postStatus(statuses: StatusMap, owner: string, text: string, now = Date.now()) {
  const trimmed = text.trim()
  if (!trimmed || text.length > STATUS_TEXT_LIMIT) throw new Error('Write a status of 1 to 500 characters.')
  if (!owner || owner.length > 128 || !Number.isSafeInteger(now) || now < 0) throw new Error('Status could not be published.')
  pruneStatuses(statuses, owner, now)
  if (activeStatuses(statuses, [owner], now).length >= STATUS_ACTIVE_LIMIT) throw new Error('You can share up to 5 active statuses. Delete one to add another.')
  const status: StatusRecord = {id: uid(), from: owner, text: trimmed, ts: now}
  statuses.set(status.id, status)
  return status
}

export function removeStatus(statuses: StatusMap, owner: string, id: string) {
  const status = statuses.get(id)
  if (!status || status.from !== owner) return false
  statuses.delete(id)
  return true
}
