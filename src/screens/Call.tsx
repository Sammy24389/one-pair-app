import {useEffect, useRef, useState} from 'react'
import {Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff} from 'lucide-react'
import {Avatar} from '../components/ui'
import type {Space} from '../lib/space'
import {cx, fmtDuration} from '../lib/util'

const MediaEl = ({stream, muted, className, video}: {stream: MediaStream | null; muted?: boolean; className?: string; video: boolean}) => {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream
  }, [stream])
  return video ? <video ref={ref} className={className} autoPlay playsInline muted={muted} /> : <audio ref={ref} autoPlay muted={muted} />
}

export default function CallOverlay({space}: {space: Space}) {
  const s = space.call.state
  const peer = space.peerProfile()
  const [, tick] = useState(0)
  const [hud, setHud] = useState(true)

  useEffect(() => {
    if (s.phase !== 'active') return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [s.phase])

  // Keep the screen awake during calls where supported.
  useEffect(() => {
    let lock: {release: () => Promise<void>} | null = null
    const nav = navigator as Navigator & {wakeLock?: {request: (t: 'screen') => Promise<{release: () => Promise<void>}>}}
    nav.wakeLock?.request('screen').then(l => (lock = l)).catch(() => {})
    return () => {
      lock?.release().catch(() => {})
    }
  }, [])

  const remoteHasVideo = !!s.remote?.getVideoTracks().some(t => t.readyState === 'live')
  const localHasVideo = !!s.local?.getVideoTracks().length && !s.camOff

  const label =
    s.phase === 'incoming'
      ? `Incoming ${s.video ? 'video' : 'voice'} call`
      : s.phase === 'outgoing'
        ? 'Ringing…'
        : s.remote
          ? fmtDuration((Date.now() - s.startedAt) / 1000)
          : 'Connecting…'

  return (
    <div className="call" onClick={() => remoteHasVideo && setHud(h => !h)}>
      {s.remote && <MediaEl stream={s.remote} video={remoteHasVideo} className="remote" />}
      {localHasVideo && <MediaEl stream={s.local} muted video className={cx('local', s.facing === 'environment' && 'env')} />}

      <div className="info" style={{opacity: hud || !remoteHasVideo ? 1 : 0, transition: 'opacity .3s'}}>
        {!remoteHasVideo && (
          <div className={cx(s.phase !== 'active' && 'pulse')}>
            <Avatar p={peer} size={120} />
          </div>
        )}
        <h1>{peer.name}</h1>
        <div style={{opacity: 0.85}}>{label}</div>
      </div>

      <div className="controls" style={{opacity: hud || !remoteHasVideo ? 1 : 0, transition: 'opacity .3s'}} onClick={e => e.stopPropagation()}>
        {s.phase === 'incoming' ? (
          <>
            <button className="cbtn end" onClick={() => space.call.decline()} aria-label="Decline">
              <PhoneOff />
            </button>
            <button className="cbtn accept" onClick={() => space.call.accept()} aria-label="Accept">
              {s.video ? <Video /> : <Phone />}
            </button>
          </>
        ) : (
          <>
            <button className={cx('cbtn', s.muted && 'on')} onClick={() => space.call.toggleMute()} aria-label="Mute">
              {s.muted ? <MicOff /> : <Mic />}
            </button>
            {s.local?.getVideoTracks().length ? (
              <>
                <button className={cx('cbtn', s.camOff && 'on')} onClick={() => space.call.toggleCamera()} aria-label="Camera">
                  {s.camOff ? <VideoOff /> : <Video />}
                </button>
                <button className="cbtn" onClick={() => space.call.flipCamera()} aria-label="Flip camera">
                  <SwitchCamera />
                </button>
              </>
            ) : (
              s.phase === 'active' && (
                <button className="cbtn" onClick={() => space.call.enableVideo()} aria-label="Turn on video">
                  <Video />
                </button>
              )
            )}
            <button className="cbtn end" onClick={() => space.call.hangup()} aria-label="End call">
              <PhoneOff />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
