import {useEffect, useRef, useState, type ReactNode} from 'react'
import {ChevronLeft, X} from 'lucide-react'
import {back, nav, START_TABS, takeFocus} from '../lib/nav'
import {settings} from '../lib/settings'
import {getMediaUrl, onMediaStored} from '../lib/idb'
import {dismissToast, toasts} from '../lib/notify'
import type {Profile} from '../lib/identity'
import type {ConnState} from '../lib/space'
import {cx} from '../lib/util'
import {profileVideoUrl, validProfileMedia} from '../lib/profile-media'

export const Avatar = ({p, size = 40, conn}: {p: Profile; size?: number; conn?: ConnState}) => {
  const reduceMotion = settings.use(s => s.reduceMotion)
  const [systemMotion, setSystemMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [media, setMedia] = useState<{id: string; url: string} | null>(null)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (reduceMotion || systemMotion) video.pause()
    else void video.play().catch(() => setFailed(true))
  }, [reduceMotion, systemMotion, media?.url])
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const change = () => setSystemMotion(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  const id = validProfileMedia(p.avatarMedia) ? p.avatarMedia.id : ''
  useEffect(() => {
    let live = true
    let owned: string | null = null
    setFailed(false)
    setMedia(null)
    const load = async () => {
      if (!id || !p.avatarMedia) return
      try {
        const url = await profileVideoUrl(p.avatarMedia)
        if (!live) {if (url) URL.revokeObjectURL(url); return}
        if (owned) URL.revokeObjectURL(owned)
        owned = url
        setMedia(url ? {id, url} : null)
      } catch { if (live) setFailed(true) }
    }
    void load()
    const off = onMediaStored(storedId => {if (storedId === id) void load()})
    return () => {live = false; off(); if (owned) URL.revokeObjectURL(owned)}
  }, [id, p.avatarMedia?.mime, p.avatarMedia?.size])
  return <div className="avatar" style={{width: size, height: size, fontSize: size * .5}}>
    {media?.id === id && !failed ? <video ref={videoRef} key={media.url} src={media.url} muted loop autoPlay={!reduceMotion && !systemMotion} playsInline preload="metadata" onError={() => setFailed(true)} onPlay={e => {if (reduceMotion || systemMotion) e.currentTarget.pause()}} style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%'}} /> : p.avatar && !failed && /^data:image\/(?:webp|jpeg|png|gif|avif);base64,/.test(p.avatar) && p.avatar.length <= 250000 ? <img src={p.avatar} alt="" onError={() => setFailed(true)} /> : <span>{p.emoji}</span>}
    {conn && <i className={cx('dot', conn === 'online' && 'on', conn === 'searching' && 'searching')} />}
  </div>
}

export const TopBar = ({title, sub, right, noBack}: {title: ReactNode; sub?: ReactNode; right?: ReactNode; noBack?: boolean}) => (
  <div className="topbar">
    {!noBack && (
      <button className="icon-btn" onClick={back} aria-label="Back">
        <ChevronLeft size={22} />
      </button>
    )}
    <div className="title">
      <h2 className="ellipsis">{title}</h2>
      {sub && <div className="muted small ellipsis">{sub}</div>}
    </div>
    {right}
  </div>
)

export const Sheet = ({open, onClose, children, title}: {open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode}) => {
  if (!open) return null
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog">
        <div className="grab" />
        {title && (
          <div className="row between" style={{marginBottom: 14}}>
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </>
  )
}

export const Switch = ({checked, onChange}: {checked: boolean; onChange: (v: boolean) => void}) => (
  <label className="switch">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span />
  </label>
)

export const Seg = <T extends string>({value, options, onChange}: {value: T; options: [T, ReactNode][]; onChange: (v: T) => void}) => (
  <div className="seg">
    {options.map(([v, label]) => (
      <button key={v} className={cx(v === value && 'on')} onClick={() => onChange(v)}>
        {label}
      </button>
    ))}
  </div>
)

export const useMediaUrl = (id?: string) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (!id) return setUrl(null)
    const load = () => getMediaUrl(id).then(u => live && setUrl(u))
    load()
    const off = onMediaStored(sid => sid === id && load())
    return () => {
      live = false
      off()
    }
  }, [id])
  return url
}

export const MediaImg = ({id, className, style, onClick}: {id: string; className?: string; style?: React.CSSProperties; onClick?: () => void}) => {
  const url = useMediaUrl(id)
  if (!url) return <div className={className} style={{...style, minHeight: 120, display: 'grid', placeItems: 'center'}}><div className="spinner" /></div>
  return <img src={url} className={className} style={style} onClick={onClick} alt="" loading="lazy" decoding="async" />
}

export const Empty = ({emoji, title, children}: {emoji: string; title: string; children?: ReactNode}) => (
  <div className="empty">
    <div className="e">{emoji}</div>
    <h3>{title}</h3>
    {children && <div className="small" style={{marginTop: 6}}>{children}</div>}
  </div>
)

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🐱', '🐶', '🐻', '🐰', '🦄', '🐸', '🐧', '🌸', '🌻', '🌙', '⭐', '🔥', '🍓', '🍑', '🍒', '🧁', '🎧', '🎮', '🏀', '🎸', '💜', '💙', '💚', '🧡', '👑', '🦋', '🐢', '👻']

export const EmojiPicker = ({value, onChange, list = EMOJIS}: {value: string; onChange: (e: string) => void; list?: string[]}) => (
  <div className="emoji-picker">
    {list.map(e => (
      <button key={e} className={cx(e === value && 'on')} onClick={() => onChange(e)}>
        {e}
      </button>
    ))}
  </div>
)

export const Toasts = () => {
  const list = toasts.use(s => s.list)
  return (
    <div className="toasts">
      {list.map(t => (
        <div
          key={t.id}
          className="toast"
          onClick={() => {
            t.action?.()
            dismissToast(t.id)
          }}
        >
          {t.icon && <span style={{fontSize: 24}}>{t.icon}</span>}
          <div className="grow">
            <div style={{fontWeight: 650}}>{t.title}</div>
            {t.body && <div className="small muted ellipsis">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export const Viewer = ({id, mime, onClose}: {id: string; mime?: string; onClose: () => void}) => {
  const url = useMediaUrl(id)
  return (
    <div className="viewer" onClick={onClose}>
      {url && (mime?.startsWith('video') ? <video src={url} controls autoPlay playsInline onClick={e => e.stopPropagation()} /> : <img src={url} alt="" />)}
      <button className="icon-btn x" onClick={onClose} aria-label="Close">
        <X />
      </button>
    </div>
  )
}

/** Scroll an element into view and pulse it so the user sees what a notification pointed at. */
export const flashEl = (el: Element | null) => {
  if (!el) return false
  el.scrollIntoView({block: 'center', behavior: 'smooth'})
  el.classList.remove('flash')
  void (el as HTMLElement).offsetWidth // restart the animation
  el.classList.add('flash')
  ;(el as HTMLElement).dataset.flashed = String(Date.now()) // lets tests verify the highlight after it fades
  setTimeout(() => el.classList.remove('flash'), 2400)
  return true
}

/**
 * Run `handle` for the pending deep-link focus (from a notification or nudge). Return true when handled –
 * the focus is then cleared; return false to leave it for the screen it belongs to.
 */
export const useFocusTarget = (handle: (focus: string) => boolean, deps: unknown[] = []) => {
  const focus = nav.use(s => s.focus)
  const ref = useRef(handle)
  ref.current = handle
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => ref.current(focus) && takeFocus(), 180)
    return () => clearTimeout(t)
    // `deps` lets a screen retry once its data (e.g. older messages) has rendered.
  }, [focus, ...deps])
}

const START_LABELS: Record<string, [string, string]> = {home: ['🏠', 'Home'], chat: ['💬', 'Chat'], moments: ['💗', 'Moments'], play: ['🎮', 'Play']}

/** Choose which page OnePair opens on (applies from the next launch; also used as the Back-button home). */
export const StartPagePicker = () => {
  const start = settings.use(s => s.startTab)
  return (
    <div className="grid4">
      {START_TABS.map(t => (
        <button key={t} className={cx('chip', start === t && 'on')} style={{flexDirection: 'column', padding: '10px 4px', justifyContent: 'center'}} onClick={() => settings.set({startTab: t as typeof start})}>
          <span style={{fontSize: 20}}>{START_LABELS[t][0]}</span>
          {START_LABELS[t][1]}
        </button>
      ))}
    </div>
  )
}
