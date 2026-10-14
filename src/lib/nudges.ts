/**
 * Nudge engine – designed around Self-Determination Theory rather than engagement-at-all-costs:
 *  • Autonomy: user picks intensity (off / gentle / balanced), quiet hours, and can snooze any card.
 *  • Competence: every nudge suggests one tiny, concrete action that takes < 30 seconds.
 *  • Relatedness: framed around the other person ("Sam answered…"), never around app metrics.
 * Plus guard-rails: no guilt or loss-framing, hard daily caps, per-nudge cool-downs, adaptive timing
 * based on each person's own rhythm (median gap + usual active hour), and silence when you're already talking.
 */
import {LOW_MOODS} from './content'
import {inDaysLabel, onThisDay, upcoming} from './days'
import {scheduleNotifications} from './notify'
import {settings} from './settings'
import type {Space} from './space'
import type {Route} from './nav'
import {createStore} from './store'
import {DAY, todayKey} from './util'

export type NudgeAction = 'chat' | 'daily' | 'photo' | 'moments' | 'touch' | 'mood' | 'play' | 'notes'

export type Nudge = {
  id: string
  emoji: string
  title: string
  body: string
  action: NudgeAction
  cta: string
  priority: number // 0..100
  notifyAt?: Date // when it would be worth a system notification
  focus?: string // element/item the destination screen should scroll to and highlight
}

/** Where a nudge (card tap or notification tap) takes the user. */
export const nudgeRoute = (n: Nudge, pairId: string): Route => {
  const base = {pairId, focus: n.focus}
  switch (n.action) {
    case 'chat':
      return {...base, tab: 'chat'}
    case 'daily':
      return {...base, tab: 'home', sub: 'daily', focus: 'answer'}
    case 'photo':
      return {...base, tab: 'home', sub: 'photo'}
    case 'moments':
      return {...base, tab: 'moments'}
    case 'touch':
      return {...base, tab: 'home', focus: 'touch'}
    case 'mood':
      return {...base, tab: 'home', focus: 'mood'}
    case 'play':
      return {...base, tab: 'play', sub: 'game-ttt'}
    case 'notes':
      return {...base, tab: 'more', sub: 'notes'}
  }
}

const snoozes = createStore({until: {} as Record<string, number>}, 'onepair.nudgeSnooze')

export const snoozeNudge = (id: string, days = 3) =>
  snoozes.set(s => ({until: {...s.until, [id]: Date.now() + days * DAY}}))

const isSnoozed = (id: string) => (snoozes.get().until[id] ?? 0) > Date.now()

/** Median gap (ms) between this user's messaging days over the last 60 days, and their most common active hour. */
const rhythm = (space: Space) => {
  const me = space.me
  const cutoff = Date.now() - 60 * DAY
  const days = new Set<string>()
  const hours = new Array(24).fill(0)
  let last = 0
  for (let i = space.messages.length - 1; i >= 0; i--) {
    const m = space.messages.get(i)
    if (m.ts < cutoff) break
    if (m.from !== me) continue
    last ||= m.ts
    days.add(todayKey(new Date(m.ts)))
    hours[new Date(m.ts).getHours()]++
  }
  const sorted = [...days].sort()
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime())
  gaps.sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : DAY
  const peak = hours.some(Boolean) ? hours.indexOf(Math.max(...hours)) : 19
  return {median, peak, last}
}

const inQuiet = (h: number) => {
  const {quietStart: a, quietEnd: b} = settings.get()
  return a > b ? h >= a || h < b : h >= a && h < b
}

/** Move a date out of quiet hours to the next allowed hour. */
const respectQuiet = (d: Date) => {
  const out = new Date(d)
  for (let i = 0; i < 24 && inQuiet(out.getHours()); i++) out.setHours(out.getHours() + 1, 0, 0, 0)
  return out
}

const atHour = (dayOffset: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d
}

export const computeNudges = (space: Space): Nudge[] => {
  const level = settings.get().nudgeLevel
  if (level === 'off') return []
  const out: Nudge[] = []
  const peer = space.peerProfile().name || 'your pair'
  const mode = (space.meta.get('mode') as 'friends' | 'couple') ?? 'friends'
  const me = space.me
  const today = todayKey()
  const {median, peak, last} = rhythm(space)

  // 1. Reciprocity: partner answered today's question, I haven't (curiosity + fairness, highly motivating, zero guilt).
  const daily = space.daily.get(today)
  if (daily?.answers[space.peer] && !daily.answers[me])
    out.push({
      id: `daily-${today}`,
      emoji: '💭',
      title: `${peer} answered today's question`,
      body: 'Answer yours to reveal theirs.',
      action: 'daily',
      cta: 'Answer',
      priority: 80,
      notifyAt: respectQuiet(new Date(Date.now() + 2 * 3600_000))
    })

  // 2. Photo of the day reciprocity (Locket-style).
  const theirPhoto = space.photos.get(`${today}|${space.peer}`)
  if (theirPhoto && !space.photos.get(`${today}|${me}`))
    out.push({
      id: `photo-${today}`,
      emoji: '📸',
      title: `${peer} shared a moment today`,
      body: 'Send one back – anything you are looking at right now.',
      action: 'photo',
      cta: 'Snap',
      priority: 70
    })

  // 3. Special days ahead.
  for (const u of upcoming(space, 7)) {
    if (![0, 1, 3, 7].includes(u.inDays)) continue
    out.push({
      id: `day-${u.key}-${u.inDays}`,
      emoji: u.emoji,
      title: `${u.title} ${inDaysLabel(u.inDays).toLowerCase()}`,
      body: u.inDays === 0 ? 'Send a little note to mark it ✨' : u.inDays <= 1 ? 'A small plan or message goes a long way.' : 'Plenty of time to plan something sweet.',
      action: u.inDays === 0 ? 'chat' : 'moments',
      focus: u.inDays === 0 ? undefined : `day-${u.key}`,
      cta: u.inDays === 0 ? 'Celebrate' : 'Plan',
      priority: u.inDays === 0 ? 95 : u.inDays === 1 ? 85 : 50,
      notifyAt: respectQuiet(atHour(Math.max(0, u.inDays === 0 ? 0 : u.inDays - (u.inDays >= 3 ? 3 : 1)), 10))
    })
  }

  // 4. Empathy: partner shared a low mood recently.
  const pm = space.moods.get(space.peer)
  if (pm && LOW_MOODS.has(pm.label) && Date.now() - pm.ts < 8 * 3600_000)
    out.push({
      id: `mood-${pm.ts}`,
      emoji: pm.emoji,
      title: `${peer} is feeling ${pm.label.toLowerCase()}`,
      body: mode === 'couple' ? 'A hug or a kind word might help.' : 'Maybe check in with a quick message?',
      action: 'touch',
      cta: 'Send care',
      priority: 90
    })

  // 5. Gentle reconnect – only if the silence is unusual *for you*, and you're not mid-conversation.
  const threshold = Math.max(median * 1.5, 20 * 3600_000)
  if (level === 'balanced' && last && Date.now() - last > threshold && !space.online)
    out.push({
      id: `reconnect-${today}`,
      emoji: '👋',
      title: `Say hi to ${peer}?`,
      body: 'A single tap counts – send a quick "thinking of you".',
      action: 'touch',
      cta: 'Tap',
      priority: 45,
      notifyAt: respectQuiet(atHour(new Date().getHours() < peak ? 0 : 1, peak))
    })

  // 6. Nostalgia: on this day.
  const otd = onThisDay(space)
  if (otd.memories.length || otd.photos.length)
    out.push({
      id: `otd-${today}`,
      emoji: '🕰️',
      title: 'On this day',
      body: otd.memories[0]?.title ?? 'You shared a moment on this date before.',
      action: 'moments',
      cta: 'Look back',
      priority: 55,
      notifyAt: level === 'balanced' ? respectQuiet(atHour(0, Math.max(peak, 11))) : undefined
    })

  // 7. Letters that became openable.
  for (const n of space.notes.values())
    if (n.from !== me && !n.opened && n.revealAt && n.revealAt <= Date.now())
      out.push({id: `note-${n.id}`, emoji: '💌', title: 'A sealed letter is ready', body: n.title ?? 'Open it now', action: 'notes', focus: `note-${n.id}`, cta: 'Open', priority: 75})

  // 8. Game turn waiting.
  const ttt = space.games.get('ttt') as {turn?: string; winner?: string} | undefined
  if (ttt && ttt.turn === me && !ttt.winner)
    out.push({id: 'ttt-turn', emoji: '🎮', title: 'Your move!', body: `${peer} is waiting in tic-tac-toe.`, action: 'play', cta: 'Play', priority: 40})

  return out.filter(n => !isSnoozed(n.id)).sort((a, b) => b.priority - a.priority)
}

/** Plan system notifications across all spaces with hard caps; re-run whenever the app opens or goes to background. */
export const planNotifications = (spaces: Space[]) => {
  const level = settings.get().nudgeLevel
  const cap = level === 'off' ? 0 : level === 'gentle' ? 1 : 2
  const minPriority = level === 'gentle' ? 60 : 40
  const candidates = spaces
    .flatMap(s => computeNudges(s).map(n => ({...n, route: nudgeRoute(n, s.pair.id)})))
    .filter(n => n.notifyAt && n.notifyAt.getTime() > Date.now() + 60_000 && n.priority >= minPriority)
    .sort((a, b) => b.priority - a.priority)
  // at most `cap` per calendar day
  const perDay = new Map<string, number>()
  const chosen = candidates.filter(n => {
    const k = todayKey(n.notifyAt!)
    const c = perDay.get(k) ?? 0
    if (c >= cap) return false
    perDay.set(k, c + 1)
    return true
  })
  return scheduleNotifications(chosen.map(n => ({at: n.notifyAt!, title: `${n.emoji} ${n.title}`, body: n.body, route: n.route})))
}
