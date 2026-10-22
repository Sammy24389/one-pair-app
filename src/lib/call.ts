import {captureScreen, screenCaptureAvailable} from './screen-capture'
import type {Space} from './space'
import {claimMedia, releaseMedia} from './media-lease'
import {identity} from './identity'
import {nativeBridge} from './native'
import {notifyNow, pingPartner} from './notify'
import {isAppHidden, onAppVisibility, withSystemUi} from './platform'
import {settings} from './settings'
import {startRing, stopRing} from './sound'
import {uid, vibrate} from './util'

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'active'

export type CallState = {
  phase: CallPhase
  id: string
  video: boolean
  outgoing: boolean
  startedAt: number
  muted: boolean
  camOff: boolean
  sharingScreen: boolean
  screenBusy: boolean
  facing: 'user' | 'environment'
  local: MediaStream | null
  remote: MediaStream | null
  error: string
}

const IDLE: CallState = {
  phase: 'idle',
  id: '',
  video: false,
  outgoing: false,
  startedAt: 0,
  muted: false,
  camOff: false,
  sharingScreen: false,
  screenBusy: false,
  facing: 'user',
  local: null,
  remote: null,
  error: ''
}

const RING_TIMEOUT = 45_000

/** Ring/accept/end signalling layered on the space's data channel; media flows over the same peer connection. */
export class CallController {
  state: CallState = {...IDLE}
  private space: Space
  private ringTimeout?: ReturnType<typeof setTimeout>
  private pendingRemote: MediaStream | null = null
  private generation = 0
  private acquiring = false
  private disposed = false
  private offVisibility: () => void
  private enablingVideo = false
  private savedCamera: MediaStreamTrack | null = null
  private display: MediaStream | null = null

  constructor(space: Space) {
    this.space = space
    // Ringing in the background uses the native call notification; once the app is in front, ring in-app instead.
    this.offVisibility = onAppVisibility(hidden => {
      if (this.state.phase !== 'incoming') return
      if (hidden) {
        stopRing()
        this.showCallNotification()
      } else {
        nativeBridge?.cancelCall()
        startRing(false)
      }
    })
  }

  get busy() {
    return this.acquiring || this.state.phase !== 'idle'
  }

  private showCallNotification() {
    const name = this.space.peerProfile().name
    if (nativeBridge) nativeBridge.showCall({name, video: this.state.video, tone: settings.get().sounds ? settings.get().notificationTone : 'silent'}).catch(() => notifyNow(name, 'Incoming call'))
    else notifyNow(name, `${this.state.video ? '🎥 Video' : '📞 Voice'} call – open OnePair to answer`)
  }

  /** Keep mic/camera alive if the user leaves the app mid-call (Android foreground service types). */
  private setServiceForCall(active: boolean) {
    if (!nativeBridge) return
    if (active) nativeBridge.startKeepAlive({callAudio: true, callVideo: this.state.video}).catch(() => {})
    else if (settings.get().keepAlive) nativeBridge.startKeepAlive().catch(() => {})
    else nativeBridge.stopKeepAlive().catch(() => {})
  }

  private set(p: Partial<CallState>) {
    this.state = {...this.state, ...p}
    this.space.bump()
  }

  private async getMedia(video: boolean, facing: 'user' | 'environment' = 'user') {
    return navigator.mediaDevices.getUserMedia({
      audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
      video: video ? {facingMode: facing, width: {ideal: 1280}, height: {ideal: 720}, frameRate: {ideal: 30}} : false
    })
  }

  async start(video: boolean) {
    if (this.disposed || this.acquiring || this.state.phase !== 'idle') return
    if (!this.space.online) {
      const name = this.space.peerProfile().name
      if (settings.get().ntfyEnabled) {
        pingPartner(this.space, `📞 ${identity.get().profile.name || 'Your pair'} is trying to call you`, true)
        this.set({error: `${name} is offline – we sent them a wake-up ping. Try again when they open OnePair.`})
      } else this.set({error: `${name} isn't reachable right now. They need OnePair running (it stays reachable in the background unless swiped away).`})
      return
    }
    if (!claimMedia(this)) {
      this.set({error: 'End your other call before starting this one.'})
      return
    }
    const generation = ++this.generation
    this.acquiring = true
    try {
      const local = await withSystemUi(() => this.getMedia(video))
      if (this.disposed || generation !== this.generation) {
        local.getTracks().forEach(t => t.stop())
        return
      }
      const id = uid()
      this.set({...IDLE, phase: 'outgoing', id, video, outgoing: true, local})
      this.space.sendCallSignal({t: 'ring', id, video})
      startRing(true)
      this.ringTimeout = setTimeout(() => {
        this.space.sendCallSignal({t: 'cancel', id})
        this.finish()
      }, RING_TIMEOUT)
    } catch (e) {
      if (generation === this.generation) releaseMedia(this)
      if (generation === this.generation && !this.disposed) this.set({error: `Couldn't access ${video ? 'camera/microphone' : 'microphone'}: ${(e as Error).message}`})
    } finally {
      if (generation === this.generation) this.acquiring = false
    }
  }

  async accept() {
    if (this.disposed || this.acquiring || this.state.phase !== 'incoming') return
    if (!claimMedia(this)) {
      this.set({error: 'End your other call before answering this one.'})
      return
    }
    const generation = this.generation
    const {id, video} = this.state
    this.acquiring = true
    // The ring timeout must not keep running once answered – it would hang up the live call.
    clearTimeout(this.ringTimeout)
    stopRing()
    nativeBridge?.cancelCall()
    try {
      const local = await withSystemUi(() => this.getMedia(video))
      if (this.disposed || generation !== this.generation || this.state.id !== id) {
        local.getTracks().forEach(t => t.stop())
        return
      }
      this.set({local, phase: 'active', startedAt: Date.now()})
      this.setServiceForCall(true)
      this.space.sendCallSignal({t: 'accept', id})
      this.space.rtc()?.addStream(local)
      if (this.pendingRemote) this.set({remote: this.pendingRemote})
    } catch (e) {
      if (generation !== this.generation || this.disposed) return
      this.space.sendCallSignal({t: 'decline', id})
      this.set({error: (e as Error).message})
      this.finish()
    } finally {
      if (generation === this.generation) this.acquiring = false
    }
  }

  decline() {
    if (this.state.phase !== 'incoming') return
    this.space.sendCallSignal({t: 'decline', id: this.state.id})
    this.finish()
  }

  hangup() {
    if (this.state.phase === 'idle') {
      if (this.acquiring) this.finish()
      return
    }
    this.space.sendCallSignal({t: this.state.phase === 'outgoing' ? 'cancel' : 'end', id: this.state.id})
    this.finish()
  }

  toggleMute() {
    const muted = !this.state.muted
    this.state.local?.getAudioTracks().forEach(t => (t.enabled = !muted))
    this.set({muted})
  }

  toggleCamera() {
    if (this.state.sharingScreen) return
    const camOff = !this.state.camOff
    this.state.local?.getVideoTracks().forEach(t => (t.enabled = !camOff))
    this.set({camOff})
  }

  private flipping = false

  /**
   * Switch front/back camera. Most phones can't open a second camera while the first is held,
   * so the current track is stopped *before* opening the other one, then swapped into the call.
   */
  async flipCamera() {
    const {local, facing} = this.state
    const old = local?.getVideoTracks()[0]
    if (this.disposed || !local || !old || this.flipping || this.enablingVideo || this.state.sharingScreen || this.state.screenBusy) return
    const generation = this.generation
    const current = () => !this.disposed && generation === this.generation
    this.flipping = true
    const next = facing === 'user' ? 'environment' : 'user'
    const open = async (f: 'user' | 'environment') => {
      const constraints: MediaTrackConstraints[] = [{facingMode: {exact: f}}, {facingMode: f}]
      // Fallback: pick a camera by label when facingMode isn't honoured.
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
      const byLabel = cams.find(c => (f === 'environment' ? /back|rear|environment/i : /front|user|face/i).test(c.label))
      if (byLabel) constraints.push({deviceId: {exact: byLabel.deviceId}})
      const other = cams.find(c => c.deviceId && c.deviceId !== old.getSettings().deviceId)
      if (other) constraints.push({deviceId: {exact: other.deviceId}})
      for (const video of constraints) {
        if (!current()) return null
        try {
          const stream = await navigator.mediaDevices.getUserMedia({video})
          if (!current()) {
            stream.getTracks().forEach(t => t.stop())
            return null
          }
          return stream.getVideoTracks()[0]
        } catch {
          /* try next */
        }
      }
      return null
    }
    let track: MediaStreamTrack | null = null
    try {
      old.stop()
      track = (await open(next)) ?? (current() ? await open(facing) : null)
      if (!current()) {
        track?.stop()
        return
      }
      if (!track) throw new Error('No camera available')
      track.enabled = !this.state.camOff
      await Promise.all(this.space.rtc()?.replaceTrack(old, track) ?? [])
      if (!current()) {
        track.stop()
        return
      }
      local.removeTrack(old)
      local.addTrack(track)
      const actual = track.getSettings().facingMode
      this.set({facing: actual === 'environment' || actual === 'user' ? actual : next, local: new MediaStream(local.getTracks())})
    } catch (e) {
      track?.stop()
      if (current()) this.set({error: `Couldn't switch camera: ${(e as Error).message}`})
    } finally {
      if (current()) this.flipping = false
    }
  }

  /** Screen capture replaces only outgoing video; microphone and peer audio stay connected. */
  async shareScreen() {
    if (this.disposed || this.state.phase !== 'active' || this.state.screenBusy || this.state.sharingScreen || this.enablingVideo || this.flipping) return
    if (!screenCaptureAvailable()) {
      this.set({error: 'Screen sharing is unavailable in this browser. Use a supported desktop browser over HTTPS or the Android APK.'})
      return
    }
    const local = this.state.local
    if (!local) return
    const generation = this.generation
    const current = () => !this.disposed && generation === this.generation && this.state.phase === 'active'
    this.set({screenBusy: true, error: ''})
    let display: MediaStream | null = null
    try {
      display = await withSystemUi(() => captureScreen(false))
      if (!current()) {display.getTracks().forEach(track => track.stop()); return}
      const track = display.getVideoTracks()[0]
      if (!track) throw new Error('No screen was selected.')
      const camera = local.getVideoTracks()[0]
      if (camera) await Promise.all(this.space.rtc()?.replaceTrack(camera, track) ?? [])
      else await Promise.all(this.space.rtc()?.addTrack(track, local) ?? [])
      if (!current()) {display.getTracks().forEach(track => track.stop()); return}
      this.savedCamera = camera ?? null
      if (camera) {camera.enabled = false; local.removeTrack(camera)}
      local.addTrack(track)
      this.display = display
      track.onended = () => {void this.stopScreenShare()}
      this.set({sharingScreen: true, local: new MediaStream(local.getTracks())})
    } catch (error) {
      display?.getTracks().forEach(track => track.stop())
      if (current()) this.set({error: error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError' ? 'Screen sharing was cancelled or permission was denied.' : `Could not share screen: ${error instanceof Error ? error.message : 'Please try again.'}`})
    } finally {if (current()) {this.set({screenBusy: false}); if (this.display?.getVideoTracks()[0]?.readyState === 'ended') void this.stopScreenShare()}}
  }

  async stopScreenShare() {
    if (!this.state.sharingScreen || this.state.screenBusy || !this.display || !this.state.local) return
    const generation = this.generation
    const local = this.state.local
    const track = this.display.getVideoTracks()[0]
    const camera = this.savedCamera
    this.set({screenBusy: true})
    try {
      if (camera && camera.readyState !== 'ended') await Promise.all(this.space.rtc()?.replaceTrack(track, camera) ?? [])
      else this.space.rtc()?.removeTrack(track)
      if (this.disposed || generation !== this.generation) return
      local.removeTrack(track)
      if (camera && camera.readyState !== 'ended') {camera.enabled = !this.state.camOff; local.addTrack(camera)}
      track.onended = null
      this.display.getTracks().forEach(item => item.stop())
      this.display = null
      this.savedCamera = null
      this.set({sharingScreen: false, local: new MediaStream(local.getTracks())})
    } catch {
      if (generation === this.generation) {
        this.set({error: 'The call ended because the camera could not be restored after screen sharing.'})
        this.hangup()
      }
    } finally {if (generation === this.generation && !this.disposed) this.set({screenBusy: false})}
  }

  /** Upgrade an audio call to video mid-call. */
  async enableVideo() {
    const {local} = this.state
    if (this.disposed || !local || local.getVideoTracks().length || this.enablingVideo || this.flipping || this.state.screenBusy) return
    const generation = this.generation
    this.enablingVideo = true
    try {
      const cam = await withSystemUi(() => navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}}))
      if (this.disposed || generation !== this.generation) {
        cam.getTracks().forEach(t => t.stop())
        return
      }
      const track = cam.getVideoTracks()[0]
      local.addTrack(track)
      this.space.rtc()?.addTrack(track, local)
      this.set({video: true, camOff: false, local: new MediaStream(local.getTracks())})
    } catch {
      /* camera denied */
    } finally {
      if (generation === this.generation) this.enablingVideo = false
    }
  }

  onSignal(msg: Record<string, string | boolean | number>) {
    if (this.disposed) return
    const {t, id} = msg as {t: string; id: string}
    switch (t) {
      case 'ring':
        if (this.state.phase !== 'idle' || this.acquiring) {
          this.space.sendCallSignal({t: 'busy', id})
          return
        }
        this.pendingRemote = null
        this.generation++
        this.set({...IDLE, phase: 'incoming', id, video: !!msg.video})
        if (isAppHidden()) this.showCallNotification()
        else {
          startRing(false)
          vibrate([400, 200, 400, 200, 400])
        }
        this.ringTimeout = setTimeout(() => this.finish(), RING_TIMEOUT + 2000)
        break
      case 'accept':
        if (this.state.phase !== 'outgoing' || id !== this.state.id) return
        clearTimeout(this.ringTimeout)
        stopRing()
        this.set({phase: 'active', startedAt: Date.now()})
        this.setServiceForCall(true)
        if (this.state.local) this.space.rtc()?.addStream(this.state.local)
        break
      case 'decline':
      case 'busy':
        if (id !== this.state.id) return
        this.set({error: t === 'busy' ? 'Busy on another call' : 'Call declined'})
        this.finish()
        break
      case 'cancel':
      case 'end':
        if (id !== this.state.id) return
        this.finish()
        break
    }
  }

  onRemoteStream(stream: MediaStream) {
    if (this.disposed) return
    if (this.state.phase === 'active') this.set({remote: stream})
    else this.pendingRemote = stream
  }

  onPeerLeft() {
    if (this.state.phase !== 'idle' || this.acquiring) this.finish()
  }

  private finish() {
    releaseMedia(this)
    this.generation++
    this.acquiring = false
    this.flipping = false
    this.enablingVideo = false
    clearTimeout(this.ringTimeout)
    stopRing()
    nativeBridge?.cancelCall()
    const s = this.state
    this.display?.getTracks().forEach(track => {track.onended = null; track.stop()})
    this.display = null
    this.savedCamera?.stop()
    this.savedCamera = null
    if (s.phase === 'active') this.setServiceForCall(false)
    // Missed incoming call while away → leave a normal notification behind.
    if (s.phase === 'incoming' && isAppHidden()) notifyNow(this.space.peerProfile().name, `Missed ${s.video ? 'video' : 'voice'} call`, {pairId: this.space.pair.id, tab: 'chat'})
    if (s.local) {
      try {
        this.space.rtc()?.removeStream(s.local)
      } catch {
        /* already gone */
      }
      s.local.getTracks().forEach(t => t.stop())
    }
    // The caller writes the call log entry so it is recorded exactly once.
    if (s.outgoing && s.id) {
      const dur = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0
      this.space.addMessage({kind: 'call', call: {video: s.video, dur, missed: !s.startedAt}})
    }
    this.pendingRemote = null
    this.set({...IDLE, error: s.error})
  }

  clearError() {
    this.set({error: ''})
  }

  dispose() {
    if (this.disposed) return
    this.offVisibility()
    this.hangup()
    this.disposed = true
  }
}
