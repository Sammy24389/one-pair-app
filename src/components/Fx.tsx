import {createStore} from '../lib/store'
import {uid} from '../lib/util'

type Particle = {id: string; emoji: string; left: number; delay: number; rot: number; big?: boolean}

const fx = createStore({items: [] as Particle[]})

/** Floating emoji burst – used for "thinking of you" touches and celebrations. */
export const burst = (emoji: string, count = 14) => {
  const items: Particle[] = [{id: uid(), emoji, left: 50, delay: 0, rot: 0, big: true}]
  for (let i = 0; i < count; i++)
    items.push({id: uid(), emoji, left: 5 + Math.random() * 90, delay: Math.random() * 0.8, rot: Math.random() * 60 - 30})
  fx.set(s => ({items: [...s.items, ...items]}))
  setTimeout(() => fx.set(s => ({items: s.items.filter(p => !items.includes(p))})), 3600)
}

export const FxLayer = () => {
  const items = fx.use(s => s.items)
  if (!items.length) return null
  return (
    <div className="fx-layer" aria-hidden>
      {items.map(p =>
        p.big ? (
          <div key={p.id} className="fx-center">
            {p.emoji}
          </div>
        ) : (
          <div key={p.id} className="fx" style={{left: `${p.left}%`, animationDelay: `${p.delay}s`, ['--rot' as string]: `${p.rot}deg`}}>
            {p.emoji}
          </div>
        )
      )}
    </div>
  )
}
