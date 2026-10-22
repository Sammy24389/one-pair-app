import {useEffect, useRef, useState} from 'react'
import {ChevronDown, GripVertical, Maximize2, MonitorUp, Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff} from 'lucide-react'
import {useFloatingCall} from '../components/useFloatingCall'
import {Avatar} from '../components/ui'
import type {Space} from '../lib/space'
import {cx, fmtDuration} from '../lib/util'
import '../styles/call-pip.css'

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
  const floating = useFloatingCall(root, minimized && !locked)

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
    root.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [minimized, locked])

  const remoteHasVideo = !!s.remote?.getVideoTracks().some(t => t.readyState === 'live')
  const localHasVideo = !!s.local?.getVideoTracks().length && (s.sharingScreen || !s.camOff)
  const label = s.phase === 'incoming'
    ? `Incoming ${s.video ? 'video' : 'voice'} call`
    : s.phase === 'outgoing' ? 'Ringing…'
      : s.remote ? fmtDuration((Date.now() - s.startedAt) / 1000) : 'Connecting…'

  return (
    <div ref={root} className={cx('call', minimized && 'is-minimized', minimized && 'call-pip', localHasVideo && 'has-local-video')}
      style={floating.style}
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
      <div className="call-pip-heading" hidden={!minimized}>
        <button className="call-drag-handle" disabled={!minimized} aria-label="Move call window" title="Drag to move. Use arrow keys to reposition; Home to reset." {...floating.handle}>
          <GripVertical size={16} /><span><b>{peer.name}</b><small>{label}</small></span>
        </button>
        <button className="call-pip-expand" disabled={!minimized} onClick={onRestore} aria-label="Return to call"><Maximize2 size={18} /></button>
      </div>
      {/* These elements stay mounted when the call collapses, so remote audio keeps playing. */}
      <div className="call-media" aria-hidden="true">
        {s.remote && <MediaEl key="remote" stream={s.remote} video={remoteHasVideo} className="remote" />}
        {localHasVideo && <MediaEl key="local" stream={s.local} muted video className={cx('local', (s.sharingScreen || s.facing === 'environment') && 'env')} />}
      </div>
      {minimized && !remoteHasVideo && <div className="call-pip-placeholder"><Avatar p={peer} size={44} /><span>{peer.name}</span></div>}
      {minimized ? (
        <div className="call-pip-controls">
          <button className={cx('cbtn', s.muted && 'on')} onClick={() => space.call.toggleMute()} aria-label={s.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={s.muted}>
            {s.muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          {s.sharingScreen && <button className="cbtn on" disabled={s.screenBusy} onClick={() => void space.call.stopScreenShare()} aria-label="Stop screen sharing"><MonitorUp size={20} /></button>}
          {!s.sharingScreen && !!s.local?.getVideoTracks().length && <button className={cx('cbtn', s.camOff && 'on')} onClick={() => space.call.toggleCamera()} aria-label={s.camOff ? 'Turn on camera' : 'Turn off camera'} aria-pressed={!s.camOff}>{s.camOff ? <VideoOff size={20} /> : <Video size={20} />}</button>}
          <button className="cbtn end" onClick={() => space.call.hangup()} aria-label="End call"><PhoneOff size={20} /></button>
        </div>
      ) : (
        <>
          {s.phase !== 'incoming' && <button className="call-minimize" onClick={onMinimize} aria-label="Minimize call"><ChevronDown size={20} />Keep chatting</button>}
          <div className="info">
            {!remoteHasVideo && <div className={cx(s.phase !== 'active' && 'pulse')}><Avatar p={peer} size={120} /></div>}
            <h1>{peer.name}</h1><div>{label}{s.sharingScreen ? " · Sharing screen" : ""}</div>
            {s.error && <p role="alert" style={{maxWidth: 420, fontSize: 14}}>{s.error}</p>}
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
                {!s.sharingScreen && s.local?.getVideoTracks().length ? (
                  <>
                    <button className={cx('cbtn', s.camOff && 'on')} onClick={() => space.call.toggleCamera()} aria-label={s.camOff ? 'Turn on camera' : 'Turn off camera'} aria-pressed={!s.camOff}>{s.camOff ? <VideoOff /> : <Video />}</button>
                    <button className="cbtn" onClick={() => space.call.flipCamera()} aria-label="Flip camera"><SwitchCamera /></button>
                  </>
                ) : !s.sharingScreen && s.phase === 'active' && <button className="cbtn" onClick={() => space.call.enableVideo()} aria-label="Turn on video"><Video /></button>}
                {s.phase === 'active' && <button className={cx('cbtn', s.sharingScreen && 'on')} disabled={s.screenBusy} onClick={() => s.sharingScreen ? void space.call.stopScreenShare() : void space.call.shareScreen()} aria-label={s.sharingScreen ? 'Stop screen sharing' : 'Share screen'} title={s.sharingScreen ? 'Stop screen sharing' : 'Share screen'} aria-pressed={s.sharingScreen}><MonitorUp /></button>}
                <button className="cbtn end" onClick={() => space.call.hangup()} aria-label="End call"><PhoneOff /></button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
