import {useEffect, useRef, useState} from 'react'
import {Delete, Fingerprint} from 'lucide-react'
import {Avatar} from '../components/ui'
import {identity} from '../lib/identity'
import {haptic} from '../lib/platform'
import {biometricPrompt, checkPin, lockState, unlock} from '../lib/security'
import {settings} from '../lib/settings'
import {cx} from '../lib/util'

/**
 * pin – PIN only
 * bio – biometric prompt once on open; cancelling or failing falls back to the PIN (tap the fingerprint to retry)
 */
export default function Lock() {
  const mode = settings.use(s => s.lockMode)
  const pinLen = settings.use(s => s.pinLength)
  const profile = identity.use(i => i.profile)
  const cooldown = lockState.use(l => l.cooldownUntil)
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [hint, setHint] = useState('')
  const autoPrompted = useRef(false)

  const tryBio = async () => {
    if (mode !== 'bio') return
    setHint('')
    if (await biometricPrompt()) unlock()
    else setHint('Biometric not recognised – use your PIN')
  }

  // Prompt automatically exactly once per lock (not on every re-render or resume).
  useEffect(() => {
    if (mode === 'bio' && !autoPrompted.current) {
      autoPrompted.current = true
      tryBio()
    }
  }, [mode])

  useEffect(() => {
    if (cooldown <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const press = async (d: string) => {
    haptic('light')
    if (cooldown > Date.now()) return
    const next = (pin + d).slice(0, pinLen)
    setPin(next)
    if (next.length < pinLen) return
    if (await checkPin(next)) unlock()
    else {
      haptic('heavy')
      setShake(true)
      setTimeout(() => (setShake(false), setPin('')), 420)
    }
  }

  const wait = Math.ceil((cooldown - now) / 1000)

  return (
    <div className="lock">
      <Avatar p={profile} size={72} />
      <div className="center">
        <h2>Welcome back{profile.name ? `, ${profile.name}` : ''}</h2>
        <p className="muted small">{wait > 0 ? `Too many attempts. Try again in ${wait}s` : hint || (mode === 'bio' ? 'Use your fingerprint or face, or enter your PIN' : 'Enter your PIN')}</p>
      </div>
      <div className={cx('pin-dots', shake && 'shake')}>
        {Array.from({length: pinLen}, (_, i) => (
          <i key={i} className={cx(i < pin.length && 'on')} />
        ))}
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button onClick={tryBio} aria-label="Use biometrics" style={{visibility: mode === 'bio' ? 'visible' : 'hidden'}}>
          <Fingerprint size={28} />
        </button>
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPin(p => p.slice(0, -1))} aria-label="Delete">
          <Delete size={24} />
        </button>
      </div>
    </div>
  )
}
