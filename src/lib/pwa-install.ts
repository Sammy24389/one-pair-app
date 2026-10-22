import {createStore} from './store'
import {isNative} from './platform'

type InstallEvent = Event & {prompt(): Promise<void>; userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>}
const dismissalKey = 'onepair.install-dismissed'
const standalone = () => !!window.matchMedia?.('(display-mode: standalone)').matches || !!(navigator as Navigator & {standalone?: boolean}).standalone
export const isIosBrowser = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const dismissed = () => {try {return localStorage.getItem(dismissalKey) === '1'} catch {return false}}
export const pwaInstall = createStore({installed: isNative || standalone(), available: false, dismissed: dismissed(), expanded: false, busy: false, message: ''})
let pending: InstallEvent | null = null

window.addEventListener('beforeinstallprompt', event => {
  if (isNative || standalone()) return
  event.preventDefault()
  pending = event as InstallEvent
  pwaInstall.set({available: true, installed: false})
})
window.addEventListener('appinstalled', () => {
  pending = null
  pwaInstall.set({installed: true, available: false, busy: false, expanded: false})
})
window.matchMedia?.('(display-mode: standalone)').addEventListener('change', () => {
  pwaInstall.set({installed: isNative || standalone()})
})

export function dismissInstall() {
  try {localStorage.setItem(dismissalKey, '1')} catch { /* Session dismissal still works when storage is unavailable. */ }
  pwaInstall.set({dismissed: true, expanded: false, message: ''})
}

export function openInstallHelp() {
  if (isNative || standalone()) return
  pwaInstall.set({expanded: true, message: ''})
}

/** Must be called directly from a user gesture, before awaiting any other work. */
export async function installPwa() {
  if (isNative || standalone() || pwaInstall.get().busy) return
  const event = pending
  if (!event) {openInstallHelp(); return}
  pending = null
  pwaInstall.set({busy: true, available: false, message: ''})
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') dismissInstall()
    else pwaInstall.set({expanded: true, message: 'Installation was cancelled. You can keep using OnePair here or try again from your browser menu.'})
  } catch {
    pwaInstall.set({expanded: true, message: 'The browser could not open installation. Follow the steps below or continue in your browser.'})
  } finally {pwaInstall.set({busy: false})}
}
