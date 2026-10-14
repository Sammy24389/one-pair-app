import {burst} from './components/Fx'
import {TOUCHES} from './lib/content'
import {identity} from './lib/identity'
import {back, nav, openRoute, type Route} from './lib/nav'
import {planNotifications} from './lib/nudges'
import {nativeBridge} from './lib/native'
import {initChannels, notifyNow, pingPartner, toast} from './lib/notify'
import {hapticPattern, isAppHidden, isNative, onAppVisibility} from './lib/platform'
import {initAutoLock} from './lib/security'
import {settings} from './lib/settings'
import {allSpaces, onSpaceCreated, reconnectAll, syncSpaces} from './lib/spaces'
import {playHeart, playPop} from './lib/sound'
import type {Msg} from './lib/types'

const describe = (m: Msg) => {
  switch (m.kind) {
    case 'text':
      return m.text ?? ''
    case 'image':
      return '📷 Photo'
    case 'video':
      return '🎬 Video'
    case 'audio':
      return '🎤 Voice message'
    case 'file':
      return `📎 ${m.name ?? 'File'}`
    case 'location':
      return '📍 Location'
    case 'sticker':
      return m.text ?? ''
    case 'touch':
      return `${TOUCHES[m.text ?? '']?.emoji ?? '💫'} ${TOUCHES[m.text ?? '']?.label ?? ''}`
    case 'call':
      return m.call?.missed ? '📞 Missed call' : '📞 Call'
    default:
      return m.text ?? ''
  }
}

const viewingChat = (pairId: string) =>
  !isAppHidden() && nav.get().tab === 'chat' && !nav.get().stack.length && settings.get().activePairId === pairId

export const bootstrap = () => {
  initAutoLock()
  initChannels()

  onSpaceCreated(space => {
    // Incoming messages → in-app toast or system notification.
    space.onIncoming(m => {
      if (m.from === space.me) return
      const name = space.peerProfile().name
      const fresh = Date.now() - m.ts < 60_000
      if (m.kind === 'touch' && fresh) {
        const t = TOUCHES[m.text ?? '']
        if (t && !isAppHidden()) {
          burst(t.emoji)
          playHeart()
          hapticPattern(t.vib)
        }
      }
      if (viewingChat(space.pair.id)) {
        if (m.kind !== 'touch') playPop()
        return
      }
      // Tapping opens this pair's chat scrolled to (and highlighting) the message.
      const route: Route = {pairId: space.pair.id, tab: 'chat', focus: m.id}
      if (isAppHidden()) {
        if (fresh) notifyNow(name, describe(m), route)
      } else if (fresh && m.kind !== 'touch') {
        toast({
          title: name,
          body: describe(m),
          icon: space.peerProfile().emoji,
          action: () => openRoute(route)
        })
        playPop()
      }
    })

    // Wake-up ping (ntfy) when we write something while the partner is offline.
    space.messages.observe(ev => {
      if (!ev.transaction.local) return
      const added = ev.changes.added.size
      if (added && !space.online) pingPartner(space, `${identity.get().profile.name || 'Your pair'} sent you something`)
    })
  })

  syncSpaces()

  // Presence: battery + visibility, shared live with the partner.
  const sharePresence = async () => {
    const p: {visible: boolean; tz: string; battery?: number; charging?: boolean} = {
      visible: !isAppHidden(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
    try {
      const b = await (navigator as Navigator & {getBattery?: () => Promise<{level: number; charging: boolean}>}).getBattery?.()
      if (b) {
        p.battery = Math.round(b.level * 100)
        p.charging = b.charging
      }
    } catch {
      /* unsupported */
    }
    allSpaces().forEach(s => {
      s.setPresence(p)
      if (isAppHidden()) s.lastSeen.set(s.me, Date.now())
    })
  }
  onAppVisibility(h => {
    sharePresence()
    if (h) planNotifications(allSpaces())
    else allSpaces().forEach(s => s.conn !== 'online' && s.reconnect())
  })
  setInterval(sharePresence, 120_000)
  setTimeout(sharePresence, 3000)

  window.addEventListener('online', reconnectAll)

  if (nativeBridge) {
    const bridge = nativeBridge
    // Stay reachable in the background (foreground service) whenever there's at least one pair.
    const syncKeepAlive = () => {
      const want = settings.get().keepAlive && identity.get().pairs.length > 0
      const inCall = allSpaces().some(s => s.call.state.phase === 'active')
      if (inCall) return
      ;(want ? bridge.startKeepAlive() : bridge.stopKeepAlive()).catch(() => {})
    }
    syncKeepAlive()
    settings.subscribe(syncKeepAlive)
    identity.subscribe(syncKeepAlive)
    onAppVisibility(h => !h && syncKeepAlive())

    // Tapped message/missed-call notifications open the relevant screen.
    bridge.addListener('openRoute', ({route}) => {
      try {
        openRoute(JSON.parse(route))
      } catch {
        /* malformed */
      }
    })

    // Answer / Decline buttons on the incoming-call notification.
    bridge.addListener('callAction', ({action}) => {
      const ringing = allSpaces().find(s => s.call.state.phase === 'incoming')
      if (!ringing) return
      settings.set({activePairId: ringing.pair.id})
      if (action === 'answer') ringing.call.accept()
      else if (action === 'decline') ringing.call.decline()
    })
  }

  if (isNative) {
    import('@capacitor/app').then(({App}) => {
      App.addListener('backButton', () => {
        if (!back()) App.minimizeApp()
      })
    })
    import('@capacitor/local-notifications').then(({LocalNotifications}) =>
      LocalNotifications.addListener('localNotificationActionPerformed', ({notification}) => {
        const route = (notification.extra as {route?: string} | undefined)?.route
        if (route) openRoute(JSON.parse(route))
      })
    )
  }
}
