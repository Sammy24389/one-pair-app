import {memo, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {
  Camera,
  CornerUpLeft,
  Copy,
  File as FileIcon,
  Image as ImageIcon,
  MapPin,
  Mic,
  Pause,
  Phone,
  Play,
  Plus,
  Send,
  Smile,
  Trash2,
  Video,
  X
} from 'lucide-react'
import {useWallpaperCss} from '../App'
import {Avatar, flashEl, MediaImg, Sheet, useFocusTarget, useMediaUrl, Viewer} from '../components/ui'
import {TOUCHES} from '../lib/content'
import StickerPicker from '../components/StickerPicker'
import {addSticker} from '../lib/stickers'
import {getMedia} from '../lib/idb'
import {getPosition} from '../lib/location'
import {compressImage, pickFiles, saveBlob, VoiceRecorder} from '../lib/media'
import {toast} from '../lib/notify'
import {haptic, isAppHidden, onAppVisibility} from '../lib/platform'
import {nativeBridge} from '../lib/native'
import {settings} from '../lib/settings'
import type {Space} from '../lib/space'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import type {Msg} from '../lib/types'
import {cx, fmtAgo, fmtBytes, fmtDay, fmtDuration, fmtTime, URL_RE} from '../lib/util'

const PAGE = 60
const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥']
const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\s){1,8}$/u

const Linkified = ({text}: {text: string}) => {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    parts.push(text.slice(last, m.index))
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer">
        {m[0]}
      </a>
    )
    last = m.index! + m[0].length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

const LinkCard = ({url}: {url: string}) => {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* keep raw */
  }
  return (
    <a className="link-card" href={url} target="_blank" rel="noopener noreferrer">
      <span className="fav">{host[0]?.toUpperCase()}</span>
      <span className="grow" style={{minWidth: 0}}>
        <div className="small ellipsis" style={{fontWeight: 650}}>{host}</div>
        <div className="tiny ellipsis" style={{opacity: 0.75}}>{url}</div>
      </span>
    </a>
  )
}

const AudioMsg = ({id, dur}: {id: string; dur?: number}) => {
  const url = useMediaUrl(id)
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  return (
    <div className="audio-msg">
      <button
        className="icon-btn"
        style={{width: 36, height: 36, background: 'rgba(127,127,127,.2)', color: 'inherit'}}
        disabled={!url}
        onClick={() => (playing ? ref.current?.pause() : ref.current?.play())}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {url ? playing ? <Pause size={16} /> : <Play size={16} /> : <span className="spinner" style={{width: 14, height: 14}} />}
      </button>
      <div className="bar">
        <i style={{width: `${dur ? Math.min(100, (t / dur) * 100) : 0}%`}} />
      </div>
      <span className="tiny">{fmtDuration(playing ? t : dur ?? 0)}</span>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => (setPlaying(false), setT(0))}
          onTimeUpdate={e => setT(e.currentTarget.currentTime)}
        />
      )}
    </div>
  )
}

const FileMsg = ({m}: {m: Msg}) => {
  const url = useMediaUrl(m.mediaId)
  return (
    <a
      className="link-card"
      href={url ?? undefined}
      download={m.name}
      style={{marginTop: 0, minWidth: 200}}
      onClick={async e => {
        if (!nativeBridge || !m.mediaId) return
        e.preventDefault()
        const rec = await getMedia(m.mediaId)
        if (rec && (await saveBlob(rec.blob, m.name ?? rec.name ?? `onepair-${m.id}`))) toast({title: 'Saved'})
      }}
    >
      <span className="fav">
        <FileIcon size={16} />
      </span>
      <span className="grow" style={{minWidth: 0}}>
        <div className="small ellipsis" style={{fontWeight: 650}}>{m.name}</div>
        <div className="tiny">{url ? fmtBytes(m.size ?? 0) : 'Waiting for transfer…'}</div>
      </span>
    </a>
  )
}

const StickerMsg = ({m}: {m: Msg}) => {
  const url = useMediaUrl(m.mediaId)
  if (!url) return <div className="sticker-message" role="status">Waiting for sticker…</div>
  return <img className="sticker-message" src={url} alt={m.name || 'Sticker'} loading="lazy" decoding="async" />
}

const VideoMsg = ({id}: {id: string}) => {
  const url = useMediaUrl(id)
  if (!url) return <div style={{width: 200, height: 140, display: 'grid', placeItems: 'center'}}><div className="spinner" /></div>
  return <video src={url} controls playsInline preload="metadata" />
}

type BubbleProps = {
  m: Msg
  mine: boolean
  gap: boolean
  reacts?: Record<string, string>
  deleted: boolean
  reply?: Msg
  progress?: number
  seen: boolean
  peerName: string
  onLong: (m: Msg) => void
  onView: (m: Msg) => void
  onReact: (m: Msg) => void
}

const Bubble = memo(function Bubble({m, mine, gap, reacts, deleted, reply, progress, seen, peerName, onLong, onView, onReact}: BubbleProps) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTap = useRef(0)
  const press = {
    onPointerDown: () => (timer.current = setTimeout(() => onLong(m), 420)),
    onPointerUp: () => clearTimeout(timer.current),
    onPointerLeave: () => clearTimeout(timer.current),
    onPointerMove: () => clearTimeout(timer.current),
    onContextMenu: (e: React.MouseEvent) => (e.preventDefault(), onLong(m)),
    onClick: () => {
      if (Date.now() - lastTap.current < 280) onReact(m)
      lastTap.current = Date.now()
    }
  }

  if (m.kind === 'touch') {
    const t = TOUCHES[m.text ?? '']
    return (
      <div className="system-msg" data-mid={m.id}>
        <div style={{fontSize: 36}}>{t?.emoji ?? '💫'}</div>
        {mine ? `You: ${t?.label.toLowerCase() ?? ''}` : `${peerName}: ${t?.label.toLowerCase() ?? ''}`} · {fmtTime(m.ts)}
      </div>
    )
  }
  if (m.kind === 'call')
    return (
      <div className="system-msg" data-mid={m.id}>
        {m.call?.video ? '🎥' : '📞'} {m.call?.missed ? (mine ? 'No answer' : 'Missed call') : `${m.call?.video ? 'Video' : 'Voice'} call · ${fmtDuration(m.call?.dur ?? 0)}`} · {fmtTime(m.ts)}
      </div>
    )
  if (m.kind === 'system') return <div className="system-msg" data-mid={m.id}>{m.text}</div>

  const emojiOnly = (m.kind === 'text' && m.text && EMOJI_ONLY.test(m.text)) || (m.kind === 'sticker' && !m.mediaId)
  const firstUrl = m.kind === 'text' ? m.text?.match(URL_RE)?.[0] : undefined
  const isMedia = m.kind === 'image' || m.kind === 'video'

  let body: React.ReactNode
  if (deleted) body = <i style={{opacity: 0.6}}>Message deleted</i>
  else
    switch (m.kind) {
      case 'image':
        body = <MediaImg id={m.mediaId!} style={m.w && m.h ? {aspectRatio: `${m.w}/${m.h}`, maxWidth: 260} : {maxWidth: 260}} onClick={() => onView(m)} />
        break
      case 'sticker':
        body = m.mediaId ? <StickerMsg m={m} /> : m.text
        break
      case 'video':
        body = <VideoMsg id={m.mediaId!} />
        break
      case 'audio':
        body = <AudioMsg id={m.mediaId!} dur={m.dur} />
        break
      case 'file':
        body = <FileMsg m={m} />
        break
      case 'location':
        body = (
          <a className="link-card" style={{marginTop: 0}} href={`https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=16/${m.lat}/${m.lng}`} target="_blank" rel="noopener noreferrer">
            <span className="fav">
              <MapPin size={16} />
            </span>
            <span>
              <div className="small" style={{fontWeight: 650}}>{m.text || 'Shared location'}</div>
              <div className="tiny">{m.lat?.toFixed(4)}, {m.lng?.toFixed(4)}</div>
            </span>
          </a>
        )
        break
      default:
        body = (
          <>
            <Linkified text={m.text ?? ''} />
            {firstUrl && <LinkCard url={firstUrl} />}
          </>
        )
    }

  return (
    <div className={cx('msg', mine ? 'me' : 'them', gap && 'gap')} data-mid={m.id}>
      <div className={cx('bubble', m.kind === 'sticker' && !!m.mediaId && !deleted && 'sticker-bubble', isMedia && !deleted && 'media', emojiOnly && !deleted && 'emoji')} {...press}>
        {reply && !deleted && <div className="reply-quote ellipsis">{reply.kind === 'text' ? reply.text : reply.kind === 'image' ? '📷 Photo' : reply.kind}</div>}
        {body}
        {progress !== undefined && progress < 1 && <div className="progress-ring">{Math.round(progress * 100)}%</div>}
      </div>
      {reacts && Object.keys(reacts).length > 0 && <div className="reacts">{Object.values(reacts).join('')}</div>}
      {gap !== undefined && (
        <div className="meta">
          {fmtTime(m.ts)}
          {mine && seen && ' · Seen'}
        </div>
      )}
    </div>
  )
})

const Composer = ({space, reply, clearReply}: {space: Space; reply: Msg | null; clearReply: () => void}) => {
  const [text, setText] = useState('')
  const [extra, setExtra] = useState(false)
  const [stickers, setStickers] = useState(false)
  const [rec, setRec] = useState<VoiceRecorder | null>(null)
  const [recT, setRecT] = useState(0)
  const enterToSend = settings.use(s => s.enterToSend)
  const typingRef = useRef(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setRecT((Date.now() - rec.startedAt) / 1000), 200)
    return () => clearInterval(t)
  }, [rec])

  const send = () => {
    const t = text.trim()
    if (!t) return
    space.addMessage({kind: 'text', text: t, replyTo: reply?.id})
    setText('')
    clearReply()
    space.setTyping(false)
    typingRef.current = 0
    haptic('light')
    taRef.current?.focus()
  }

  const onType = (v: string) => {
    setText(v)
    const now = Date.now()
    if (v && now - typingRef.current > 3000) {
      typingRef.current = now
      space.setTyping(true)
    }
    if (!v) space.setTyping(false)
  }

  const sendImages = async (files: File[]) => {
    setExtra(false)
    for (const f of files) {
      if (f.type.startsWith('video')) {
        if (f.size > 200 * 1024 * 1024) {
          toast({title: 'Video too large', body: 'Max 200 MB'})
          continue
        }
        const id = await space.addMedia(f, f.name)
        space.addMessage({kind: 'video', mediaId: id, mime: f.type, size: f.size})
      } else {
        const {blob, w, h} = await compressImage(f)
        const id = await space.addMedia(blob)
        space.addMessage({kind: 'image', mediaId: id, mime: blob.type, w, h, replyTo: reply?.id})
      }
    }
    clearReply()
  }

  const sendFile = async () => {
    setExtra(false)
    const [f] = await pickFiles('*/*')
    if (!f) return
    if (f.size > 200 * 1024 * 1024) return toast({title: 'File too large', body: 'Max 200 MB'})
    const id = await space.addMedia(f, f.name)
    space.addMessage({kind: 'file', mediaId: id, mime: f.type, name: f.name, size: f.size})
  }

  const sendLocation = async () => {
    setExtra(false)
    try {
      const p = await getPosition()
      space.addMessage({kind: 'location', lat: p.lat, lng: p.lng, text: 'My location'})
    } catch (e) {
      toast({title: 'Location unavailable', body: (e as Error).message})
    }
  }

  const startRec = async () => {
    try {
      const r = new VoiceRecorder()
      await r.start()
      setRec(r)
      haptic('medium')
    } catch {
      toast({title: 'Microphone permission needed'})
    }
  }

  const stopRec = async (sendIt: boolean) => {
    const r = rec
    setRec(null)
    setRecT(0)
    if (!r) return
    if (!sendIt) return r.cancel()
    const out = await r.stop()
    if (!out) return
    const id = await space.addMedia(out.blob)
    space.addMessage({kind: 'audio', mediaId: id, mime: out.blob.type, dur: out.dur})
  }

  return (
    <>
      {reply && (
        <div className="reply-bar">
          <CornerUpLeft size={16} color="var(--accent)" />
          <span className="grow ellipsis">{reply.kind === 'text' ? reply.text : reply.kind}</span>
          <button onClick={clearReply} aria-label="Cancel reply">
            <X size={16} />
          </button>
        </div>
      )}
      {extra && (
        <div className="composer-extra">
          <button onClick={async () => sendImages(await pickFiles('image/*,video/*', true))}>
            <span className="ico"><ImageIcon size={22} /></span>Gallery
          </button>
          <button onClick={async () => sendImages(await pickFiles('image/*', false, 'environment'))}>
            <span className="ico"><Camera size={22} /></span>Camera
          </button>
          <button onClick={sendFile}>
            <span className="ico"><FileIcon size={22} /></span>File
          </button>
          <button onClick={sendLocation}>
            <span className="ico"><MapPin size={22} /></span>Location
          </button>
        </div>
      )}
      {stickers && <StickerPicker
        onClose={() => { setStickers(false); taRef.current?.focus() }}
        onEmoji={emoji => {
          space.addMessage({kind: 'sticker', text: emoji, replyTo: reply?.id})
          clearReply(); setStickers(false); taRef.current?.focus()
        }}
        onSend={async sticker => {
          const mediaId = await space.addMedia(sticker.blob, sticker.name)
          space.addMessage({kind: 'sticker', mediaId, name: sticker.name, mime: sticker.blob.type,
            size: sticker.blob.size, w: sticker.w, h: sticker.h, replyTo: reply?.id})
          clearReply(); setStickers(false); taRef.current?.focus()
          haptic('light')
        }}
      />}
      {/* Buttons keep focus on the textarea so the keyboard stays open and nothing jumps under the finger. */}
      <div className="composer" onPointerDown={e => (e.target as HTMLElement).closest('button') && e.preventDefault()}>
        {rec ? (
          <>
            <button className="icon-btn" onClick={() => stopRec(false)} aria-label="Cancel recording">
              <Trash2 size={18} />
            </button>
            <div className="rec-bar">
              <span className="rec-dot" /> Recording {fmtDuration(recT)}
            </div>
            <button className="icon-btn accent" onClick={() => stopRec(true)} aria-label="Send voice message">
              <Send size={18} />
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" onClick={() => (setExtra(e => !e), setStickers(false))} aria-label="Attach">
              {extra ? <X size={20} /> : <Plus size={20} />}
            </button>
            <textarea
              ref={taRef}
              rows={1}
              aria-label="Message"
              placeholder="Message"
              value={text}
              onChange={e => onType(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && (enterToSend || !('ontouchstart' in window))) {
                  e.preventDefault()
                  send()
                }
              }}
              onPaste={e => {
                const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image'))
                if (files.length) {
                  e.preventDefault()
                  sendImages(files)
                }
              }}
              style={{height: Math.min(140, 42 + Math.max(0, text.split('\n').length - 1) * 20)}}
            />
            {!text && (
              <button className="icon-btn plain" onClick={() => (setStickers(s => !s), setExtra(false))} aria-label="Stickers">
                <Smile size={22} />
              </button>
            )}
            {text ? (
              <button className="icon-btn accent" onClick={send} aria-label="Send">
                <Send size={18} />
              </button>
            ) : (
              <button className="icon-btn accent" onClick={startRec} disabled={space.call.state.phase !== 'idle'} title={space.call.state.phase !== 'idle' ? 'Finish the call to record a voice message' : undefined} aria-label="Record voice message">
                <Mic size={18} />
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}

export default function Chat() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [limit, setLimit] = useState(PAGE)
  const [action, setAction] = useState<Msg | null>(null)
  const [reply, setReply] = useState<Msg | null>(null)
  const [view, setView] = useState<Msg | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const wallpaper = useWallpaperCss()
  const theme = settings.use(s => s.theme)

  const all = useMemo(() => {
    if (!space) return []
    const arr = space.messages.toArray()
    for (let i = 1; i < arr.length; i++)
      if (arr[i].ts < arr[i - 1].ts) {
        arr.sort((a, b) => a.ts - b.ts)
        break
      }
    return arr
  }, [space, v])

  const visible = all.slice(-limit)
  const byId = useMemo(() => new Map(all.map(m => [m.id, m])), [all])

  useEffect(() => {
    if (!space) return
    const seen = () => {
      if (isAppHidden()) return
      space.markRead()
      nativeBridge?.clearMessages().catch(() => {}) // the user is looking at the chat – clear its notifications
    }
    seen()
    return onAppVisibility(h => !h && seen())
  }, [space, v])

  // Deep link from a notification/toast: load enough history, scroll to the message and highlight it.
  useFocusTarget(focus => {
    const idx = all.findIndex(m => m.id === focus)
    if (idx < 0) return false
    stick.current = false
    const needed = all.length - idx + 8
    if (needed > limit) {
      setLimit(needed)
      return false // retry after the extra messages render
    }
    return flashEl(bodyRef.current?.querySelector(`[data-mid="${CSS.escape(focus)}"]`) ?? null)
  }, [all.length, limit])

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [visible.length, space?.peerTyping])

  if (!space) return null
  const peer = space.peerProfile()
  const peerRead = space.reads.get(space.peer) ?? 0
  const lastMine = [...visible].reverse().find(m => m.from === space.me && m.kind !== 'touch' && m.kind !== 'call')
  const lastSeen = space.lastSeen.get(space.peer)
  const opaqueTheme = theme !== 'glass' && theme !== 'aurora'

  const onScroll = () => {
    const el = bodyRef.current!
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 60 && limit < all.length) {
      const h = el.scrollHeight
      setLimit(l => l + PAGE)
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - h + el.scrollTop))
    }
  }

  const rows: React.ReactNode[] = []
  let prev: Msg | undefined
  for (const m of visible) {
    if (!prev || fmtDay(prev.ts) !== fmtDay(m.ts)) rows.push(<div key={`d${m.ts}`} className="day-sep">{fmtDay(m.ts)}</div>)
    const gap = !prev || prev.from !== m.from || m.ts - prev.ts > 5 * 60_000
    rows.push(
      <Bubble
        key={m.id}
        m={m}
        mine={m.from === space.me}
        gap={gap}
        reacts={space.reactions.get(m.id)}
        deleted={!!space.deleted.get(m.id)}
        reply={m.replyTo ? byId.get(m.replyTo) : undefined}
        progress={m.mediaId ? space.transfers.get(m.mediaId) : undefined}
        seen={m === lastMine && peerRead >= m.ts}
        peerName={peer.name}
        onLong={setAction}
        onView={setView}
        onReact={mm => (haptic('light'), space.react(mm.id, '❤️'))}
      />
    )
    prev = m
  }

  const status = space.peerTyping ? 'typing…' : space.online ? 'online' : lastSeen ? `last seen ${fmtAgo(lastSeen)}` : space.conn === 'searching' ? 'connecting…' : 'offline'

  return (
    <div className="chat" style={opaqueTheme && wallpaper ? {background: wallpaper} : undefined}>
      <div className="chat-head">
        <Avatar p={peer} size={40} conn={space.conn} />
        <div className="grow">
          <h3 className="ellipsis">{peer.name}</h3>
          <div className="tiny" style={{color: space.peerTyping || space.online ? 'var(--accent)' : 'var(--text-2)'}}>
            {status}
          </div>
        </div>
        <button className="icon-btn plain" onClick={() => space.call.start(false)} aria-label="Voice call">
          <Phone size={20} />
        </button>
        <button className="icon-btn plain" onClick={() => space.call.start(true)} aria-label="Video call">
          <Video size={22} />
        </button>
      </div>

      <div className="chat-body" ref={bodyRef} onScroll={onScroll}>
        {all.length === 0 && (
          <div className="empty" style={{margin: 'auto'}}>
            <div className="e">{peer.emoji}</div>
            <h3>Say hi to {peer.name}</h3>
            <div className="small">Messages travel directly between your phones. If one of you is offline they sync the moment you both open the app.</div>
          </div>
        )}
        {rows}
        {space.peerTyping && (
          <div className="msg them gap">
            <div className="bubble typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {space.call.state.error && (
        <div className="reply-bar" onClick={() => space.call.clearError()}>
          <span className="grow small">{space.call.state.error}</span>
          <X size={16} />
        </div>
      )}

      <Composer space={space} reply={reply} clearReply={() => setReply(null)} />

      <Sheet open={!!action} onClose={() => setAction(null)}>
        {action && (
          <>
            <div className="row" style={{justifyContent: 'space-around', marginBottom: 12}}>
              {REACTIONS.map(r => (
                <button key={r} style={{fontSize: 30}} onClick={() => (space.react(action.id, r), setAction(null))}>
                  {r}
                </button>
              ))}
            </div>
            <button className="list-row" onClick={() => (setReply(action), setAction(null))}>
              <span className="ico"><CornerUpLeft size={18} /></span>Reply
            </button>
            {action.text && (
              <button className="list-row" onClick={() => (navigator.clipboard.writeText(action.text!), setAction(null), toast({title: 'Copied'}))}>
                <span className="ico"><Copy size={18} /></span>Copy
              </button>
            )}
            {action.mediaId && (
              <button
                className="list-row"
                onClick={async () => {
                  const rec = await getMedia(action.mediaId!)
                  setAction(null)
                  if (rec && (await saveBlob(rec.blob, rec.name ?? `onepair-${action.id}`))) toast({title: 'Saved'})
                }}
              >
                <span className="ico"><FileIcon size={18} /></span>Save
              </button>
            )}
            {action.kind === 'sticker' && action.mediaId && !space.deleted.get(action.id) && (
              <button className="list-row" onClick={async () => {
                const message = action
                setAction(null)
                try {
                  const media = await getMedia(message.mediaId!)
                  if (!media) throw new Error('Wait for the sticker to finish downloading.')
                  await addSticker(media.blob, message.name || 'Sticker')
                  toast({title: 'Sticker saved to your library'})
                } catch (e) {
                  toast({title: 'Could not save sticker', body: e instanceof Error ? e.message : 'Try again.'})
                }
              }}><span className="ico"><Plus size={18} /></span>Add to stickers</button>
            )}
            {action.from === space.me && !space.deleted.get(action.id) && (
              <button className="list-row" style={{color: 'var(--bad)'}} onClick={() => (space.deleted.set(action.id, true), setAction(null))}>
                <span className="ico" style={{background: 'color-mix(in oklab, var(--bad) 15%, transparent)', color: 'var(--bad)'}}>
                  <Trash2 size={18} />
                </span>
                Delete for both
              </button>
            )}
          </>
        )}
      </Sheet>

      {view?.mediaId && <Viewer id={view.mediaId} mime={view.mime} onClose={() => setView(null)} />}
    </div>
  )
}
