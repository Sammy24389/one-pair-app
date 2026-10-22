import {idbUpdate} from './idb'
import type {StatusRecord} from './status'

export const STATUS_DAILY_LIMIT = 10
export type StatusQuota = {day: string; count: number}

export function statusDay(now: number) {
  const date = new Date(now)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

export function nextStatusQuota(current: StatusQuota | undefined, now: number, existing: StatusRecord[] = []): StatusQuota {
  const day = statusDay(now)
  const previous = current?.day === day && Number.isSafeInteger(current.count) ? current.count : 0
  const published = new Set(existing.filter(s => statusDay(s.ts) === day).map(s => s.id)).size
  const count = Math.max(previous, published)
  if (count >= STATUS_DAILY_LIMIT) throw new Error('You have shared 10 statuses today. You can share again tomorrow. Deleting a status does not reset the daily limit.')
  return {day, count: count + 1}
}

export function consumeStatusQuota(owner: string, now: number, existing: StatusRecord[]) {
  return idbUpdate<StatusQuota>('kv', `status-daily:${owner}`, current => nextStatusQuota(current, now, existing))
}
