import {captureScreen, screenCaptureAvailable} from '../lib/screen-capture'
import {useEffect, useRef, useState} from 'react'
import type {PeerGroup} from '../lib/groups'
import {groupEvents} from '../lib/groups'
import {withSystemUi} from '../lib/platform'

function SharedPlayer({stream, title}: {stream: MediaStream; title: string}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {const el = ref.current!; el.srcObject = stream; return () => {el.srcObject = null}}, [stream])
  return <article className="watch-player"><h3>{title}</h3><video ref={ref} playsInline controls aria-label={title} /><button className="btn primary" onClick={() => {void ref.current?.play().then(() => setPlaying(true)).catch(() => setPlaying(false))}}>{playing ? 'Resume shared playback' : 'Join playback with sound'}</button></article>
}

export default function WatchTogether({group}: {group: PeerGroup}) {
  groupEvents.use()
  const player = useRef<HTMLVideoElement>(null)
  const cleanup = useRef<() => void>(() => {})
  const generation = useRef(0)
  const activePresentation = useRef<MediaStream | null>(null)
  const [source, setSource] = useState<{url: string; name: string} | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const stop = (refresh = true) => {activePresentation.current = null; generation.current++; group.stopPresentation(); cleanup.current(); cleanup.current = () => {}; if(refresh) setRevision(n => n+1); setBusy(false)}
  useEffect(() => () => {generation.current++; group.stopPresentation(); cleanup.current()}, [group])
  useEffect(() => () => {if (source) URL.revokeObjectURL(source.url)}, [source])
  useEffect(() => {
    if (activePresentation.current && !group.presentation) stop()
    activePresentation.current = group.presentation
  }, [group.presentation])
  const screen = async () => {
    setError('')
    if (!screenCaptureAvailable()) {setError('Use a supported desktop browser or the Android APK to start sharing. This browser can still receive shared screens.'); return}
    stop(); const request = generation.current; setBusy(true)
    try {
      const stream = await withSystemUi(() => captureScreen(true))
      if (request !== generation.current) {stream.getTracks().forEach(t => t.stop()); return}
      await group.present(stream, 'Shared screen')
    } catch (e) {if(request === generation.current) setError(e instanceof Error ? e.message : 'Screen sharing failed.')}
    finally {if(request === generation.current) setBusy(false)}
  }
  const broadcast = async () => {
    setError(''); const el = player.current
    if (!el || !source || !el.readyState) {setError('Wait for the media preview to load.'); return}
    stop(false); const request = generation.current; setBusy(true)
    let context: AudioContext | null = null
    let audio: MediaElementAudioSourceNode | null = null
    let frame = 0
    let stream: MediaStream | null = null
    let cleaned = false
    const dispose = () => {
      if (cleaned) return
      cleaned = true; cancelAnimationFrame(frame); el.pause(); audio?.disconnect()
      stream?.getTracks().forEach(t => t.stop())
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
    cleanup.current = dispose
    const current = () => request === generation.current && !cleaned
    try {
      context = new AudioContext()
      await context.resume()
      if (!current()) return
      audio = context.createMediaElementSource(el)
      const output = context.createMediaStreamDestination()
      audio.connect(output); audio.connect(context.destination)
      stream = new MediaStream(output.stream.getAudioTracks())
      if (el.videoWidth) {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 1280/el.videoWidth, 720/el.videoHeight)
        canvas.width = Math.round(el.videoWidth*scale); canvas.height = Math.round(el.videoHeight*scale)
        const paint = canvas.getContext('2d')
        if (!paint || !canvas.captureStream) throw new Error('Live video sharing is unavailable in this browser.')
        let last = -100
        const draw = (time: number) => {if (!current()) return; if(time-last >= 40 && el.readyState >= 2) {paint.drawImage(el,0,0,canvas.width,canvas.height);last=time} frame = requestAnimationFrame(draw)}
        frame = requestAnimationFrame(draw); canvas.captureStream(24).getVideoTracks().forEach(t => stream!.addTrack(t))
      }
      stream.getTracks().forEach(track => track.addEventListener('ended', dispose, {once:true}))
      await el.play()
      if (!current()) {dispose();return}
      await group.present(stream, source.name)
      if (!current() && group.presentation === stream) group.stopPresentation()
    } catch (e) {
      dispose()
      if (request === generation.current) {setRevision(n => n+1);setError(e instanceof Error ? e.message : 'Could not share this media.')}
    } finally {if (request === generation.current) setBusy(false)}
  }

  return <section className="room-watch card"><header><span className="small muted">WATCH & LISTEN</span><h2>One playback. Everyone together.</h2><p className="muted">Choose a local movie or song. Your playback controls the room; friends tap Join playback to hear it. Keep this room open.</p></header>
    {error && <p role="alert">{error}</p>}
    <div className="room-actions"><button className="btn" disabled={busy} onClick={() => void screen()}>Share screen</button><label className="btn">Choose video or music<input type="file" accept="video/*,audio/*" disabled={busy} onChange={e => {const file=e.target.files?.[0]; if (!file) return; if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {setError('Choose a video or audio file.');return} if(file.size>1024*1024*1024) {setError('Choose media smaller than 1 GB.');return} stop(); setSource({url:URL.createObjectURL(file),name:file.name});setError('');e.target.value=''}} /></label></div>
    {source && <div className="watch-player"><h3>{source.name}</h3><video key={source.url+revision} ref={player} src={source.url} controls playsInline preload="metadata" onError={() => setError('This media format cannot play on this device. Try MP4 video or MP3 audio.')} /><button className="btn primary" disabled={busy || !!group.presentation} onClick={() => void broadcast()}>{busy ? 'Preparing playback...' : 'Share this playback'}</button></div>}
    {group.presentation && <button className="btn danger" onClick={() => stop()}>Stop sharing</button>}
    {[...group.shared.entries()].map(([id,item]) => <SharedPlayer key={id+item.stream.id} {...item} />)}
    {!group.shared.size && !group.presentation && <p className="room-empty">No one is sharing yet.</p>}
    <p className="small muted">Screen/audio capture depends on browser support. Protected streaming apps may block capture. The Android APK can share its screen after system permission; mobile browsers may only receive. Android screen sharing sends video; keep your call microphone for conversation. Use headphones during calls. Playback is live and may differ slightly with network delay.</p>
  </section>
}
