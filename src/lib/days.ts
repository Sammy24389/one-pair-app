import type {Space} from './space'
import type {SpecialDay} from './types'
import {daysBetween, parseDateKey, startOfDay, todayKey} from './util'

export type Upcoming = {
  key: string
  title: string
  emoji: string
  date: Date
  inDays: number
  years?: number
  auto?: boolean
  day?: SpecialDay
}

export const nextOccurrence = (d: SpecialDay, from = new Date()) => {
  const base = parseDateKey(d.date)
  if (!d.yearly) return base
  const today = startOfDay(from)
  let next = new Date(today.getFullYear(), base.getMonth(), base.getDate())
  if (next < today) next = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate())
  return next
}

/** Day 1 is the first day (Between-style "D+N" counting). */
export const daysTogether = (since?: string) => (since ? daysBetween(parseDateKey(since), new Date()) + 1 : 0)

const MILESTONES = [50, 100, 200, 300, 365, 500, 700, 777, 1000, 1500, 2000, 2500, 3000, 3333, 4000, 5000, 7500, 10000]

export const upcoming = (space: Space, horizonDays = 400): Upcoming[] => {
  const today = startOfDay(new Date())
  const out: Upcoming[] = []
  for (const d of space.days.values()) {
    if (d.kind === 'memory') continue
    const date = nextOccurrence(d)
    const inDays = daysBetween(today, date)
    if (inDays < 0 || inDays > horizonDays) continue
    const years = d.yearly ? date.getFullYear() - parseDateKey(d.date).getFullYear() : undefined
    out.push({key: d.id, title: d.title, emoji: d.emoji, date, inDays, years, day: d})
  }
  const since = space.meta.get('since') as string | undefined
  if (since) {
    const start = parseDateKey(since)
    const mode = space.meta.get('mode')
    const n = daysTogether(since)
    for (const m of MILESTONES) {
      if (m < n) continue
      const date = new Date(start.getTime())
      date.setDate(date.getDate() + m - 1)
      const inDays = daysBetween(today, date)
      if (inDays <= horizonDays) out.push({key: `m${m}`, title: `${m} days ${mode === 'couple' ? 'together' : 'of friendship'}`, emoji: '✨', date, inDays, auto: true})
      break
    }
    const ann = new Date(today.getFullYear(), start.getMonth(), start.getDate())
    if (ann < today) ann.setFullYear(ann.getFullYear() + 1)
    const years = ann.getFullYear() - start.getFullYear()
    if (years > 0)
      out.push({
        key: 'anniv',
        title: mode === 'couple' ? 'Our anniversary' : 'Friendiversary',
        emoji: mode === 'couple' ? '💞' : '🎊',
        date: ann,
        inDays: daysBetween(today, ann),
        years,
        auto: true
      })
  }
  return out.sort((a, b) => a.inDays - b.inDays)
}

export const inDaysLabel = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`)

/** "On this day" – memories and photos from the same calendar day in earlier years / months. */
export const onThisDay = (space: Space) => {
  const t = new Date()
  const md = todayKey(t).slice(5)
  const memories = [...space.days.values()].filter(d => d.kind === 'memory' && d.date.slice(5) === md && d.date !== todayKey(t))
  const photos = [...space.photos.entries()].filter(([k]) => k.slice(5, 10) === md && !k.startsWith(todayKey(t)))
  return {memories, photos}
}
