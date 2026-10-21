import {settings} from './settings'
import {createStore} from './store'

export type Tab = 'home' | 'chat' | 'moments' | 'play' | 'more'
export type Sub =
  | 'settings'
  | 'map'
  | 'gallery'
  | 'lists'
  | 'notes'
  | 'doodle'
  | 'pair'
  | 'profile'
  | 'daily'
  | 'photo'
  | 'game-ttt'
  | 'game-wyr'
  | 'game-tod'
  | 'game-tot'
  | 'links'
  | 'security'
  | 'appearance'
  | 'connection'
  | 'about'
  | 'mood'
  | 'status'
  | 'groups'

/** Pages a user can pick as the one OnePair opens on. */
export const START_TABS: Tab[] = ['home', 'chat', 'moments', 'play']

/** `focus` is a one-shot hint for the destination screen (e.g. a message id to scroll to and highlight). */
export const nav = createStore({tab: settings.get().startTab as Tab, stack: [] as Sub[], focus: ''})

// history.go() is async: count the pops we caused so their popstate events don't eat a newly pushed screen.
let selfPops = 0

export const goTab = (tab: Tab) => {
  const depth = nav.get().stack.length
  if (depth) {
    selfPops += depth
    history.go(-depth)
  }
  nav.set({tab, stack: []})
}

export const push = (sub: Sub) => {
  history.pushState({sub}, '')
  nav.set(s => ({stack: [...s.stack, sub]}))
}

/** Android back: close the top screen, then return to the start page, then let the app minimise. */
export const back = () => {
  const start = settings.get().startTab as Tab
  if (nav.get().stack.length) history.back()
  else if (nav.get().tab !== start) nav.set({tab: start})
  else return false
  return true
}

window.addEventListener('popstate', () => {
  if (selfPops > 0) {
    selfPops--
    return
  }
  nav.set(s => ({stack: s.stack.slice(0, -1)}))
})

// ---------- Deep links (notifications, toasts) ----------

export type Route = {pairId?: string; tab?: Tab; sub?: Sub; focus?: string}

export const openRoute = (r: Route) => {
  if (r.pairId) settings.set({activePairId: r.pairId})
  goTab(r.tab ?? (settings.get().startTab as Tab))
  if (r.sub) push(r.sub)
  nav.set({focus: r.focus ?? ''})
}

/** Screens call this once to read and clear their focus target. */
export const takeFocus = () => {
  const f = nav.get().focus
  if (f) nav.set({focus: ''})
  return f
}
