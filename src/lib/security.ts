import {pbkdf2Hex, timingSafeEqual} from './crypto'
import {isNative, isSystemUiActive, onAppVisibility, withSystemUi} from './platform'
import {settings} from './settings'
import {createStore} from './store'
import {fromB64, toB64, toHex} from './util'

export const lockState = createStore({locked: settings.get().lockMode !== 'off', failed: 0, cooldownUntil: 0})

export const setPin = async (pin: string) => {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  settings.set({pinSalt: salt, pinHash: await pbkdf2Hex(pin, salt), pinLength: pin.length})
}

export const checkPin = async (pin: string) => {
  const s = settings.get()
  const {cooldownUntil} = lockState.get()
  if (Date.now() < cooldownUntil) return false
  const ok = timingSafeEqual(await pbkdf2Hex(pin, s.pinSalt), s.pinHash)
  if (!ok) {
    const failed = lockState.get().failed + 1
    // Exponential back-off after 5 wrong attempts.
    lockState.set({failed, cooldownUntil: failed >= 5 ? Date.now() + 2 ** (failed - 5) * 30_000 : 0})
  } else lockState.set({failed: 0, cooldownUntil: 0})
  return ok
}

// ---------- Biometrics ----------

export const biometryAvailable = async (): Promise<{ok: boolean; label: string}> => {
  if (isNative) {
    try {
      const {BiometricAuth} = await import('@aparajita/capacitor-biometric-auth')
      const r = await BiometricAuth.checkBiometry()
      return {ok: r.isAvailable, label: r.isAvailable ? 'Fingerprint / Face unlock' : r.reason || 'Not available'}
    } catch {
      return {ok: false, label: 'Not available'}
    }
  }
  const ok =
    !!window.PublicKeyCredential &&
    (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false))
  return {ok, label: ok ? 'Device biometrics (passkey)' : 'Not available in this browser'}
}

/** Web: register a local platform credential that we only use as a user-verification gate. */
export const enrollWebBiometric = async () => {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {name: 'OnePair', id: location.hostname},
      user: {id: crypto.getRandomValues(new Uint8Array(16)), name: 'onepair-lock', displayName: 'OnePair lock'},
      pubKeyCredParams: [
        {type: 'public-key', alg: -7},
        {type: 'public-key', alg: -257}
      ],
      authenticatorSelection: {authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged'},
      timeout: 60000
    }
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Cancelled')
  settings.set({bioCredentialId: toB64(cred.rawId)})
}

let prompting: Promise<boolean> | null = null

/** Shows the biometric prompt (one at a time). Resolves false on cancel/failure so the PIN can be used. */
export const biometricPrompt = (reason = 'Unlock OnePair'): Promise<boolean> =>
  (prompting ??= withSystemUi(() => doBiometric(reason)).finally(() => (prompting = null)))

const doBiometric = async (reason: string): Promise<boolean> => {
  try {
    if (isNative) {
      const {BiometricAuth} = await import('@aparajita/capacitor-biometric-auth')
      await BiometricAuth.authenticate({
        reason,
        androidTitle: 'OnePair',
        androidSubtitle: reason,
        allowDeviceCredential: false,
        cancelTitle: 'Use PIN'
      })
      return true
    }
    const id = settings.get().bioCredentialId
    if (!id) return false
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{type: 'public-key', id: fromB64(id) as BufferSource}],
        userVerification: 'required',
        timeout: 60000
      }
    })
    return !!res
  } catch {
    return false
  }
}

// ---------- Auto-lock ----------

let hiddenAt = 0

export const initAutoLock = () => {
  onAppVisibility(h => {
    const s = settings.get()
    if (s.lockMode === 'off' || isSystemUiActive()) return
    if (h) hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > s.autoLockSec * 1000) lockState.set({locked: true})
    if (!h) hiddenAt = 0
  })
}

export const lockNow = () => settings.get().lockMode !== 'off' && lockState.set({locked: true})
export const unlock = () => lockState.set({locked: false, failed: 0})
