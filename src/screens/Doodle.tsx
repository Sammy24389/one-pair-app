import {useEffect, useRef, useState} from 'react'
import {Eraser, Send, Trash2, Undo2} from 'lucide-react'
import {TopBar} from '../components/ui'
import {goTab} from '../lib/nav'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import type {Stroke} from '../lib/types'
import {cx, uid} from '../lib/util'

const COLORS = ['#1b1520', '#e8577e', '#ff7a59', '#f5b031', '#3fbf7f', '#1fb5c9', '#4c7dff', '#7c5cff', '#ffffff']
const SIZES = [3, 7, 14]
const W = 900
const H = 1200

const draw = (ctx: CanvasRenderingContext2D, s: Stroke) => {
  const p = s.pts
  if (p.length < 2) return
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2
    const my = (p[i + 1] + p[i + 3]) / 2
    ctx.quadraticCurveTo(p[i], p[i + 1], mx, my)
  }
  ctx.lineTo(p[p.length - 2], p[p.length - 1])
  ctx.stroke()
}

/** Shared canvas: each finished stroke is appended to a CRDT array, so both people can draw at once – even offline. */
export default function Doodle() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const ref = useRef<HTMLCanvasElement>(null)
  const cur = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[1])
  const [size, setSize] = useState(SIZES[1])

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !space) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    for (const s of space.doodle) draw(ctx, s)
  }, [space, v])

  if (!space) return null

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)]
  }

  const down = (e: React.PointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId)
    cur.current = {id: uid(), by: space.me, color, size: size * (W / 360), pts: pos(e)}
  }
  const move = (e: React.PointerEvent) => {
    const s = cur.current
    if (!s) return
    const [x, y] = pos(e)
    const n = s.pts.length
    if (Math.abs(x - s.pts[n - 2]) + Math.abs(y - s.pts[n - 1]) < 3) return
    s.pts.push(x, y)
    const ctx = ref.current!.getContext('2d')!
    draw(ctx, {...s, pts: s.pts.slice(-6)})
  }
  const up = () => {
    const s = cur.current
    cur.current = null
    if (s && s.pts.length >= 4) space.doodle.push([s])
  }

  const undo = () => {
    for (let i = space.doodle.length - 1; i >= 0; i--)
      if (space.doodle.get(i).by === space.me) {
        space.doodle.delete(i, 1)
        return
      }
  }

  const sendToChat = () =>
    ref.current!.toBlob(async b => {
      if (!b) return
      const id = await space.addMedia(b)
      space.addMessage({kind: 'image', mediaId: id, mime: b.type, w: W, h: H})
      goTab('chat')
    }, 'image/webp', 0.9)

  return (
    <div className="screen full">
      <TopBar
        title="Doodle together"
        sub={space.online ? 'Live with ' + space.peerProfile().name : 'Syncs when you are both online'}
        right={
          <button className="icon-btn" onClick={sendToChat} aria-label="Send to chat">
            <Send size={18} />
          </button>
        }
      />
      <canvas ref={ref} width={W} height={H} className="doodle" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="card tight" style={{marginTop: 12}}>
        <div className="row" style={{overflowX: 'auto', paddingBottom: 4}}>
          {COLORS.map(c => (
            <button key={c} className={cx('swatch', c === color && 'on')} style={{background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ccc' : undefined}} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <div className="row between" style={{marginTop: 10}}>
          <div className="row">
            {SIZES.map(s => (
              <button key={s} className={cx('chip', s === size && 'on')} onClick={() => setSize(s)}>
                <span style={{width: s + 2, height: s + 2, borderRadius: '50%', background: 'currentColor', display: 'inline-block'}} />
              </button>
            ))}
            <button className={cx('chip', color === '#ffffff' && 'on')} onClick={() => setColor('#ffffff')} aria-label="Eraser">
              <Eraser size={16} />
            </button>
          </div>
          <div className="row">
            <button className="icon-btn" onClick={undo} aria-label="Undo">
              <Undo2 size={18} />
            </button>
            <button className="icon-btn" onClick={() => confirm('Clear the canvas for both of you?') && space.doodle.delete(0, space.doodle.length)} aria-label="Clear">
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
