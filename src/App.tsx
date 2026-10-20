import {lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore} from 'react'
import {Gamepad2, Heart, House, LayoutGrid, MessageCircle} from 'lucide-react'
import {FxLayer} from './components/Fx'
import {Toasts, useMediaUrl} from './components/ui'
import {dailyImageUrl, GRADIENTS} from './lib/content'
import {identity} from './lib/identity'
import {goTab, nav, type Sub, type Tab} from './lib/nav'
import {isNative, isSystemUiActive, onAppVisibility} from './lib/platform'
import {lockState} from './lib/security'
import {settings} from './lib/settings'
import {allSpaces, useActiveSpace, useSpaceIds, useSpaceVersion} from './lib/spaces'
import {cx, todayKey} from './lib/util'
import Home from './screens/Home'
import Lock from './screens/Lock'
import Onboarding from './screens/Onboarding'

const Chat = lazy(() => import('./screens/Chat'))
const Moments = lazy(() => import('./screens/Moments'))
const Play = lazy(() => import('./screens/Play'))
const More = lazy(() => import('./screens/More'))
const Settings = lazy(() => import('./screens/Settings'))
const Pair = lazy(() => import('./screens/Pair'))
const MapScreen = lazy(() => import('./screens/MapScreen'))
const Gallery = lazy(() => import('./screens/Gallery'))
const Lists = lazy(() => import('./screens/Lists'))
const Notes = lazy(() => import('./screens/Notes'))
const Doodle = lazy(() => import('./screens/Doodle'))
const Daily = lazy(() => import('./screens/Daily'))
const PhotoOfDay = lazy(() => import('./screens/PhotoOfDay'))
const Games = lazy(() => import('./screens/Games'))
const CallOverlay = lazy(() => import('./screens/Call'))

const useDark = () => {
  const scheme = settings.use(s => s.scheme)
  const theme = settings.use(s => s.theme)
  const [sysDark, setSysDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const f = () => setSysDark(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  if (theme === 'amoled' || theme === 'aurora') return true
  return scheme === 'dark' || (scheme === 'system' && sysDark)
}

export const useWallpaperCss = () => {
  const s = settings.use()
  const space = useActiveSpace()
  useSpaceVersion(space)
  const shared = space?.meta.get('wallpaper') as string | undefined
  const mediaId = s.wallpaper === 'custom' ? s.wallpaperValue : s.wallpaper === 'shared' ? shared : undefined
  const url = useMediaUrl(mediaId)
  switch (s.wallpaper) {
    case 'gradient':
      return GRADIENTS[s.wallpaperValue] ?? GRADIENTS.dusk
    case 'daily':
      return `center / cover url(${dailyImageUrl(todayKey())})`
    case 'custom':
    case 'shared':
      return url ? `center / cover url(${url})` : GRADIENTS.dusk
    default:
      return ''
  }
}

const Wallpaper = ({dark}: {dark: boolean}) => {
  const theme = settings.use(s => s.theme)
  const dim = settings.use(s => s.wallpaperDim)
  const blur = settings.use(s => s.wallpaperBlur)
  const css = useWallpaperCss()
  if (theme !== 'glass' && theme !== 'aurora') return null
  const bg = css || (theme === 'aurora' ? GRADIENTS.aurora : GRADIENTS.dusk)
  return (
    <>
      <div className="wallpaper" style={{background: bg, filter: blur ? `blur(${blur}px)` : undefined}} />
      <div className="wallpaper-dim" style={{background: dark ? `rgba(0,0,0,${dim})` : `rgba(255,255,255,${dim})`}} />
    </>
  )
}

const TABS: [Tab, string, typeof House][] = [
  ['home', 'Home', House],
  ['chat', 'Chat', MessageCircle],
  ['moments', 'Moments', Heart],
  ['play', 'Play', Gamepad2],
  ['more', 'More', LayoutGrid]
]

const TabBar = () => {
  const tab = nav.use(s => s.tab)
  const space = useActiveSpace()
  useSpaceVersion(space)
  const unread = space?.unreadCount() ?? 0
  return (
    <nav className="tabbar">
      {TABS.map(([id, label, Icon]) => (
        <button key={id} className={cx('tab', tab === id && 'on')} onClick={() => goTab(id)}>
          <span className="pill">
            <Icon size={22} strokeWidth={tab === id ? 2.4 : 2} />
          </span>
          {label}
          {id === 'chat' && tab !== 'chat' && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
      ))}
    </nav>
  )
}

const SubScreen = ({sub}: {sub: Sub}) => {
  switch (sub) {
    case 'settings':
    case 'appearance':
    case 'security':
    case 'connection':
    case 'profile':
    case 'about':
      return <Settings page={sub} />
    case 'pair':
      return <Pair />
    case 'map':
      return <MapScreen />
    case 'gallery':
    case 'links':
      return <Gallery page={sub} />
    case 'lists':
      return <Lists />
    case 'notes':
      return <Notes />
    case 'doodle':
      return <Doodle />
    case 'daily':
      return <Daily />
    case 'photo':
      return <PhotoOfDay />
    case 'game-ttt':
    case 'game-wyr':
    case 'game-tod':
    case 'game-tot':
      return <Games game={sub} />
    default:
      return null
  }
}

/** Re-render when any space changes (call overlay needs to see calls on every pair). */
const subscribeAll = (f: () => void) => {
  const offs = allSpaces().map(s => s.subscribe(f))
  return () => offs.forEach(o => o())
}
const snapshotAll = () => allSpaces().reduce((n, s) => n + s.version, 0)

const Shell = ({locked}: {locked: boolean}) => {
  // Land on the chosen start page whenever the main UI first appears (launch, or right after first pairing).
  useState(() => nav.get().stack.length === 0 && nav.set({tab: settings.get().startTab}))
  const {tab, stack} = nav.use()
  const sub = stack[stack.length - 1]
  const ids = useSpaceIds()
  const subscribeCalls = useCallback((f: () => void) => subscribeAll(f), [ids])
  useSyncExternalStore(subscribeCalls, snapshotAll)
  const calling = allSpaces().find(s => s.call.state.phase !== 'idle')
  const [minimizedCall, setMinimizedCall] = useState<string | null>(null)
  const callKey = calling ? `${calling.pair.id}:${calling.call.state.id}` : ''
  const minimized = !!calling && calling.call.state.phase !== 'incoming' && minimizedCall === callKey
  // Chat is a normal tab (tab bar visible) so people who open straight into it can see the other pages.
  const fullscreen = !!sub
  return (
    <div className="app">
      <Suspense fallback={null}>
        {calling && <CallOverlay key={callKey} space={calling} minimized={minimized} locked={locked}
          onMinimize={() => setMinimizedCall(callKey)} onRestore={() => setMinimizedCall(null)} />}
      </Suspense>
      <div className="app-content" inert={locked || (!!calling && !minimized)}>
        <Suspense fallback={<div className="screen" />}>
          {sub ? (
            <SubScreen key={sub} sub={sub} />
          ) : tab === 'home' ? (
            <Home />
          ) : tab === 'chat' ? (
            <Chat />
          ) : tab === 'moments' ? (
            <Moments />
          ) : tab === 'play' ? (
            <Play />
          ) : (
            <More />
          )}
        </Suspense>
        {!fullscreen && <TabBar />}
      </div>
    </div>
  )
}

export default function App() {
  const s = settings.use()
  const dark = useDark()
  const onboarded = identity.use(i => i.onboarded)
  const hasPairs = identity.use(i => i.pairs.length > 0)
  const locked = lockState.use(l => l.locked)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = s.theme
    if (dark) el.dataset.dark = ''
    else delete el.dataset.dark
    if (s.reduceMotion) el.dataset.reduceMotion = ''
    else delete el.dataset.reduceMotion
    el.style.setProperty('--accent', s.accent)
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor)
    if (isNative)
      // The native status-bar strip is always dark (#120d14), so its icons must always be light.
      import('@capacitor/status-bar').then(({StatusBar, Style}) => StatusBar.setStyle({style: Style.Dark}).catch(() => {}))
  }, [s.theme, s.accent, dark, s.reduceMotion])

  useEffect(() => {
    if (!s.privacyBlur || s.lockMode === 'off') return
    return onAppVisibility(h => !isSystemUiActive() && setHidden(h))
  }, [s.privacyBlur, s.lockMode])

  return (
    <>
      <Wallpaper dark={dark} />
      {!onboarded ? (
        <Onboarding />
      ) : !hasPairs ? (
        <Suspense fallback={null}>
          <Pair first />
        </Suspense>
      ) : (
        <Shell locked={locked && s.lockMode !== 'off'} />
      )}
      {locked && s.lockMode !== 'off' && <Lock />}
      {hidden && <div className="privacy-cover" />}
      <Toasts />
      <FxLayer />
    </>
  )
}
