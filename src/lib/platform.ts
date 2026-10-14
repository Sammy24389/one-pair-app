import {Capacitor} from '@capacitor/core'
import {settings} from './settings'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform()

export const haptic = async (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (!settings.get().haptics) return
  if (isNative) {
    const {Haptics, ImpactStyle} = await import('@capacitor/haptics')
    Haptics.impact({style: style === 'light' ? ImpactStyle.Light : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy}).catch(() => {})
  } else {
    navigator.vibrate?.(style === 'light' ? 8 : style === 'medium' ? 18 : 35)
  }
}

export const hapticPattern = async (pattern: number[]) => {
  if (!settings.get().haptics) return
  if (isNative) {
    const {Haptics} = await import('@capacitor/haptics')
    for (let i = 0; i < pattern.length; i += 2) {
      Haptics.vibrate({duration: pattern[i]}).catch(() => {})
      await new Promise(r => setTimeout(r, pattern[i] + (pattern[i + 1] ?? 0)))
    }
  } else navigator.vibrate?.(pattern)
}

// ---------- App visibility ----------
// Android's WebView does not fire `visibilitychange` when the app is backgrounded, so on native we use
// Capacitor's appStateChange. Everything that cares about foreground/background goes through here.

let hidden = typeof document !== 'undefined' ? document.hidden : false
const visSubs = new Set<(hidden: boolean) => void>()

const setHidden = (h: boolean) => {
  if (h === hidden) return
  hidden = h
  visSubs.forEach(f => f(h))
}

export const isAppHidden = () => hidden

export const onAppVisibility = (f: (hidden: boolean) => void) => {
  visSubs.add(f)
  return () => {
    visSubs.delete(f)
  }
}

document.addEventListener('visibilitychange', () => setHidden(document.hidden))
if (isNative)
  import('@capacitor/app').then(({App}) => {
    App.addListener('appStateChange', ({isActive}) => setHidden(!isActive))
    App.addListener('pause', () => setHidden(true))
    App.addListener('resume', () => setHidden(false))
  })

// ---------- Self-initiated system UI ----------
// Biometric prompts, file/camera pickers and permission dialogs open system activities that briefly
// background the app. These must not count as "the user left" (auto-lock, privacy cover, presence).

let systemUi = 0
let systemUiGraceUntil = 0

export const isSystemUiActive = () => systemUi > 0 || Date.now() < systemUiGraceUntil

export const withSystemUi = async <T,>(fn: () => Promise<T>): Promise<T> => {
  systemUi++
  try {
    return await fn()
  } finally {
    systemUi--
    systemUiGraceUntil = Date.now() + 2000
  }
}

// ---------- On-screen keyboard ----------
// With adjustResize the window shrinks when the keyboard opens. Mark <html data-kb> while it's up.
{
  let tallest = window.innerHeight
  let lastWidth = window.innerWidth
  const update = () => {
    if (window.innerWidth !== lastWidth) {
      // rotation / resize – start over
      lastWidth = window.innerWidth
      tallest = window.innerHeight
    }
    tallest = Math.max(tallest, window.innerHeight)
    const open = tallest - window.innerHeight > 150
    document.documentElement.toggleAttribute('data-kb', open)
  }
  window.addEventListener('resize', update)
  window.visualViewport?.addEventListener('resize', update)
}
