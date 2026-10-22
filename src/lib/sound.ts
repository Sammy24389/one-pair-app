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

export const playPop = () => playNotificationTone()

export const playNotificationTone = (selection = settings.get().notificationTone, preview = false) => {
  if ((!preview && !settings.get().sounds) || selection === 'silent') return
  try {
    void ac().resume().catch(() => {})
    const notes = selection === 'bell' ? [1046, 1568, 1318] : selection === 'soft' ? [440, 554] : [880, 1320]
    notes.forEach((frequency, i) => tone(frequency, i * .12, .3, .06, selection === 'bell' ? 'triangle' : 'sine'))
  } catch { /* Audio may require a user gesture. */ }
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
        if (settings.get().notificationTone === 'silent' || !settings.get().sounds) return
        playNotificationTone()

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
