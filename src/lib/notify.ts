import {nativeBridge} from './native'
import {openRoute, type Route} from './nav'
import {isNative, withSystemUi} from './platform'
import {settings} from './settings'
import type {Space} from './space'
import {createStore} from './store'
import {uid} from './util'

// In-app toasts
export type Toast = {id: string; title: string; body?: string; icon?: string; action?: () => void}
export const toasts = createStore({list: [] as Toast[]})

export const toast = (t: Omit<Toast, 'id'>, ms = 3800) => {
  const id = uid()
  toasts.set(s => ({list: [...s.list.slice(-2), {...t, id}]}))
  setTimeout(() => dismissToast(id), ms)
}
export const dismissToast = (id: string) => toasts.set(s => ({list: s.list.filter(t => t.id !== id)}))

// System notifications

export const ensureNotifyPermission = () => withSystemUi(ensureNotifyPermissionRaw)

const ensureNotifyPermissionRaw = async () => {
  try {
    if (isNative) {
      const {LocalNotifications} = await import('@capacitor/local-notifications')
      const p = await LocalNotifications.checkPermissions()
      if (p.display !== 'granted') await LocalNotifications.requestPermissions()
    } else if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  } catch {
    /* not supported */
  }
}

/** Nudge channel (quiet). Message/call channels are created natively by OnePairNativePlugin. */
export const initChannels = async () => {
  if (!isNative) return
  try {
    const {LocalNotifications} = await import('@capacitor/local-notifications')
    await LocalNotifications.createChannel({id: 'nudges', name: 'Gentle nudges', description: 'Special days, daily question and reminders', importance: 3, visibility: 0, vibration: false})
  } catch {
    /* older plugin / web */
  }
}

let nid = 1
/** Show a notification now. Tapping it opens `route` (e.g. the chat, scrolled to the message). */
export const notifyNow = async (title: string, body: string, route?: Route) => {
  const routeJson = route ? JSON.stringify(route) : undefined
  const prefs = settings.get()
  const tone = !prefs.sounds || prefs.notificationTone === 'silent' ? 'silent' : prefs.notificationTone === 'bell' || prefs.notificationTone === 'soft' ? prefs.notificationTone : 'chime'
  try {
    if (isNative) {
      try {
        // Native path posts immediately (LocalNotifications goes through AlarmManager and can lag ~1 min).
        await nativeBridge!.show({id: nid++ % 900, title, body, route: routeJson, tone})
        return
      } catch {
        /* fall back to the plugin below */
      }
      const {LocalNotifications} = await import('@capacitor/local-notifications')
      const channelId = `fallback_messages_v1_${tone}`
      await LocalNotifications.createChannel({id: channelId, name: `Messages - ${tone}`, importance: tone === 'silent' ? 2 : 4, visibility: 0, vibration: tone !== 'silent', sound: tone === 'silent' ? undefined : `notification_${tone}.wav`})
      await LocalNotifications.schedule({notifications: [{id: nid++ % 900, title, body, channelId, smallIcon: 'ic_stat_heart', iconColor: '#E8577E', group: 'onepair-messages', extra: {route: routeJson}}]})
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, {body, silent: !prefs.sounds || tone === 'silent', icon: 'icon.svg', tag: route?.focus ?? 'onepair'})
      n.onclick = () => {
        window.focus()
        if (route) openRoute(route)
        n.close()
      }
    }
  } catch {
    /* ignore */
  }
}

const NUDGE_IDS = [1001, 1002, 1003]

export const scheduleNotifications = async (items: {at: Date; title: string; body: string; route?: Route}[]) => {
  if (!isNative) return
  try {
    const {LocalNotifications} = await import('@capacitor/local-notifications')
    await LocalNotifications.cancel({notifications: NUDGE_IDS.map(id => ({id}))})
    if (!items.length) return
    await LocalNotifications.schedule({
      notifications: items.slice(0, NUDGE_IDS.length).map((n, i) => ({
        id: NUDGE_IDS[i],
        title: n.title,
        body: n.body,
        schedule: {at: n.at, allowWhileIdle: true},
        channelId: 'nudges',
        smallIcon: 'ic_stat_heart',
        iconColor: '#E8577E',
        extra: {route: n.route ? JSON.stringify(n.route) : undefined}
      }))
    })
  } catch {
    /* permission denied */
  }
}

// ntfy wake-up pings: optional, content-free, only when the partner is offline.

export const ntfyTopicFor = async (space: Space, device: string) => `onepair-${await space.derive(`ntfy:${device}`, 12)}`

const lastPing = new Map<string, number>()

export const pingPartner = async (space: Space, title: string, urgent = false) => {
  const s = settings.get()
  if (!s.ntfyEnabled || space.online) return
  const last = lastPing.get(space.pair.id) ?? 0
  if (!urgent && Date.now() - last < 120_000) return
  lastPing.set(space.pair.id, Date.now())
  try {
    const topic = await ntfyTopicFor(space, space.peer)
    await fetch(`${s.ntfyServer.replace(/\/$/, '')}/${topic}`, {
      method: 'POST',
      body: 'Open OnePair to sync 💫',
      headers: {Title: title, Tags: urgent ? 'telephone_receiver' : 'sparkles', Priority: urgent ? '5' : '4'}
    })
  } catch {
    /* offline */
  }
}
