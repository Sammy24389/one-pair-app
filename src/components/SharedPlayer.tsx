import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

export default function SharedPlayer({stream, title}: {stream: MediaStream; title: string}) {
  const anchor = useRef<HTMLDivElement>(null)
  const [host] = useState(() => document.createElement('div'))
  const returnFocus = useRef<HTMLElement | null>(null)
  const open = () => {returnFocus.current = document.activeElement as HTMLElement | null;setCinema(true)}
  const video = useRef<HTMLVideoElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [cinema, setCinema] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const element = video.current
    const resume = !!element && !element.paused
    const parent = cinema ? document.body : anchor.current
    parent?.appendChild(host)
    if (resume) void element.play().catch(() => setError('Tap Resume shared playback to continue.'))
  }, [cinema, host])
  useEffect(() => () => {host.remove()}, [host])
  useEffect(() => {
    const element = video.current!
    element.srcObject = stream
    return () => {element.srcObject = null}
  }, [stream])
  useEffect(() => {
    if (!cinema) return
    const previous = returnFocus.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();setCinema(false)}
      if (event.key !== 'Tab') return
      const items = panel.current?.querySelectorAll<HTMLElement>('button,video[controls]')
      if (!items?.length) return
      const first = items[0], last = items[items.length-1]
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus()}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',key,true)
    return () => {document.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;previous?.focus()}
  }, [cinema])
  const join = async () => {
    if (cinema) {try {await video.current?.play()} catch {setError('Tap play to try again.')} return}
    setError('')
    try {await video.current?.play();setPlaying(true);open()}
    catch {setError('Playback could not start. Tap play to try again or ask your friend to restart sharing.')}
  }
  const content = <article ref={panel} className={`watch-player shared-player${cinema ? ' is-cinema' : ''}`} role={cinema ? 'dialog' : undefined} aria-modal={cinema ? true : undefined} aria-label={cinema ? `Watching ${title}` : undefined}>
    <header className="shared-player-heading"><h3>{title}</h3>{cinema && <button className="btn" onClick={() => setCinema(false)}>Back to room</button>}</header>
    <video ref={video} playsInline controls aria-label={title} onPlay={() => setPlaying(true)} onError={() => setError('This shared media cannot play. Ask your friend to restart sharing.')} />
    {error && <p role="alert">{error}</p>}
    <div className="shared-player-actions"><button className="btn primary" onClick={() => void join()}>{playing ? 'Resume shared playback' : 'Join playback with sound'}</button>{!cinema && <button className="btn" onClick={open}>Open video view</button>}</div>
  </article>
  return <><div ref={anchor} />{createPortal(content,host)}</>
}
