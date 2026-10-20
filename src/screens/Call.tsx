import {useEffect, useRef, useState} from 'react'
import {ChevronDown, Maximize2, Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff} from 'lucide-react'
import {Avatar} from '../components/ui'
import type {Space} from '../lib/space'
import {cx, fmtDuration} from '../lib/util'

const MediaEl = ({stream, muted, className, video}: {stream: MediaStream | null; muted?: boolean; className?: string; video: boolean}) => {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream
  }, [stream, video])
  return video ? <video ref={ref} className={className} autoPlay playsInline muted={muted} /> : <audio ref={ref} autoPlay muted={muted} />
}

export default function CallOverlay({space, minimized, onMinimize, onRestore, locked = false}: {
  space: Space
  minimized: boolean
  locked?: boolean
  onMinimize: () => void
  onRestore: () => void
}) {
  const s = space.call.state
  const peer = space.peerProfile()
  const [, tick] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (s.phase !== 'active') return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [s.phase])

  useEffect(() => {
    let lock: {release: () => Promise<void>} | null = null
    let live = true
    navigator.wakeLock?.request('screen').then(l => {
      if (live) lock = l
      else l.release().catch(() => {})
    }).catch(() => {})
    return () => {
      live = false
      lock?.release().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (minimized && locked) return
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [minimized, locked])

  const remoteHasVideo = !!s.remote?.getVideoTracks().some(t => t.readyState === 'live')
  const localHasVideo = !!s.local?.getVideoTracks().length && !s.camOff
  const label = s.phase === 'incoming'
    ? `Incoming ${s.video ? 'video' : 'voice'} call`
    : s.phase === 'outgoing' ? 'Ringing…'
      : s.remote ? fmtDuration((Date.now() - s.startedAt) / 1000) : 'Connecting…'

  return (
    <div ref={root} className={cx('call', minimized && 'is-minimized')}
      inert={minimized && locked} aria-hidden={minimized && locked ? true : undefined}
      role={minimized ? 'region' : 'dialog'} aria-label={`Call with ${peer.name}`} aria-modal={minimized ? undefined : true}
      onKeyDown={e => {
        if (minimized) return
        if (e.key === 'Escape' && s.phase !== 'incoming') {
          e.preventDefault()
          onMinimize()
        }
        if (e.key !== 'Tab') return
        const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!buttons?.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }}>
      {/* These elements stay mounted when the call collapses, so remote audio keeps playing. */}
      <div className="call-media" aria-hidden="true">
        {s.remote && <MediaEl key="remote" stream={s.remote} video={remoteHasVideo} className="remote" />}
        {localHasVideo && <MediaEl key="local" stream={s.local} muted video className={cx('local', s.facing === 'environment' && 'env')} />}
      </div>
      {minimized ? (
        <>
          <button className="call-return" onClick={onRestore} aria-label="Return to call">
            <Phone size={20} />
            <span className="grow"><b className="ellipsis">{peer.name}</b><span className="small">{label} · Return to call</span></span>
            <Maximize2 size={18} />
          </button>
          <button className={cx('cbtn', s.muted && 'on')} onClick={() => space.call.toggleMute()} aria-label={s.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={s.muted}>
            {s.muted ? <MicOff /> : <Mic />}
          </button>
          <button className="cbtn end" onClick={() => space.call.hangup()} aria-label="End call"><PhoneOff /></button>
        </>
      ) : (
        <>
          {s.phase !== 'incoming' && <button className="call-minimize" onClick={onMinimize} aria-label="Minimize call"><ChevronDown size={20} />Keep chatting</button>}
          <div className="info">
            {!remoteHasVideo && <div className={cx(s.phase !== 'active' && 'pulse')}><Avatar p={peer} size={120} /></div>}
            <h1>{peer.name}</h1><div>{label}</div>
          </div>
          <div className="controls">
            {s.phase === 'incoming' ? (
              <>
                <button className="cbtn end" onClick={() => space.call.decline()} aria-label="Decline"><PhoneOff /></button>
                <button className="cbtn accept" onClick={() => space.call.accept()} aria-label="Accept">{s.video ? <Video /> : <Phone />}</button>
              </>
            ) : (
              <>
                <button className={cx('cbtn', s.muted && 'on')} onClick={() => space.call.toggleMute()} aria-label={s.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={s.muted}>{s.muted ? <MicOff /> : <Mic />}</button>
                {s.local?.getVideoTracks().length ? (
                  <>
                    <button className={cx('cbtn', s.camOff && 'on')} onClick={() => space.call.toggleCamera()} aria-label={s.camOff ? 'Turn on camera' : 'Turn off camera'} aria-pressed={!s.camOff}>{s.camOff ? <VideoOff /> : <Video />}</button>
                    <button className="cbtn" onClick={() => space.call.flipCamera()} aria-label="Flip camera"><SwitchCamera /></button>
                  </>
                ) : s.phase === 'active' && <button className="cbtn" onClick={() => space.call.enableVideo()} aria-label="Turn on video"><Video /></button>}
                <button className="cbtn end" onClick={() => space.call.hangup()} aria-label="End call"><PhoneOff /></button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
