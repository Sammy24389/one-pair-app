import {settings} from './settings'

// All sounds are synthesized with WebAudio – no audio assets to ship.
let ctx: AudioContext | null = null
const ac = () => (ctx ??= new AudioContext())

const tone = (freq: number, start: number, dur: number, gain = 0.12, type: OscillatorType = 'sine') => {
  const c = ac()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.05)
}

export const playPop = () => {
  if (!settings.get().sounds) return
  try {
    tone(880, 0, 0.12, 0.06)
    tone(1320, 0.06, 0.14, 0.05)
  } catch {
    /* audio blocked */
  }
}

export const playHeart = () => {
  if (!settings.get().sounds) return
  try {
    tone(523, 0, 0.18, 0.07, 'triangle')
    tone(659, 0.12, 0.22, 0.07, 'triangle')
    tone(784, 0.24, 0.3, 0.07, 'triangle')
  } catch {
    /* audio blocked */
  }
}

let ringTimer: ReturnType<typeof setInterval> | null = null

export const startRing = (outgoing: boolean) => {
  stopRing()
  const once = () => {
    try {
      if (outgoing) {
        tone(440, 0, 0.9, 0.05)
        tone(480, 0, 0.9, 0.05)
      } else {
        ;[0, 0.18, 0.36].forEach((t, i) => tone([659, 784, 988][i], t, 0.25, 0.1, 'triangle'))
        ;[0.9, 1.08, 1.26].forEach((t, i) => tone([659, 784, 988][i], t, 0.25, 0.1, 'triangle'))
      }
    } catch {
      /* audio blocked */
    }
  }
  once()
  ringTimer = setInterval(once, outgoing ? 3000 : 2600)
}

export const stopRing = () => {
  if (ringTimer) clearInterval(ringTimer)
  ringTimer = null
}
