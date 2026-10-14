import type {Space} from './space'
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

  constructor(space: Space) {
    this.space = space
    // Ringing in the background uses the native call notification; once the app is in front, ring in-app instead.
    onAppVisibility(hidden => {
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

  private showCallNotification() {
    const name = this.space.peerProfile().name
    if (nativeBridge) nativeBridge.showCall({name, video: this.state.video}).catch(() => notifyNow(name, 'Incoming call'))
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
    if (this.state.phase !== 'idle') return
    if (!this.space.online) {
      const name = this.space.peerProfile().name
      if (settings.get().ntfyEnabled) {
        pingPartner(this.space, `📞 ${identity.get().profile.name || 'Your pair'} is trying to call you`, true)
        this.set({error: `${name} is offline – we sent them a wake-up ping. Try again when they open OnePair.`})
      } else this.set({error: `${name} isn't reachable right now. They need OnePair running (it stays reachable in the background unless swiped away).`})
      return
    }
    try {
      const local = await withSystemUi(() => this.getMedia(video))
      const id = uid()
      this.set({...IDLE, phase: 'outgoing', id, video, outgoing: true, local})
      this.space.sendCallSignal({t: 'ring', id, video})
      startRing(true)
      this.ringTimeout = setTimeout(() => {
        this.space.sendCallSignal({t: 'cancel', id})
        this.finish()
      }, RING_TIMEOUT)
    } catch (e) {
      this.set({error: `Couldn't access ${video ? 'camera/microphone' : 'microphone'}: ${(e as Error).message}`})
    }
  }

  async accept() {
    if (this.state.phase !== 'incoming') return
    // The ring timeout must not keep running once answered – it would hang up the live call.
    clearTimeout(this.ringTimeout)
    stopRing()
    nativeBridge?.cancelCall()
    try {
      const local = await withSystemUi(() => this.getMedia(this.state.video))
      this.set({local, phase: 'active', startedAt: Date.now()})
      this.setServiceForCall(true)
      this.space.sendCallSignal({t: 'accept', id: this.state.id})
      this.space.rtc()?.addStream(local)
      if (this.pendingRemote) this.set({remote: this.pendingRemote})
    } catch (e) {
      this.space.sendCallSignal({t: 'decline', id: this.state.id})
      this.set({...IDLE, error: (e as Error).message})
    }
  }

  decline() {
    if (this.state.phase !== 'incoming') return
    this.space.sendCallSignal({t: 'decline', id: this.state.id})
    this.finish()
  }

  hangup() {
    if (this.state.phase === 'idle') return
    this.space.sendCallSignal({t: this.state.phase === 'outgoing' ? 'cancel' : 'end', id: this.state.id})
    this.finish()
  }

  toggleMute() {
    const muted = !this.state.muted
    this.state.local?.getAudioTracks().forEach(t => (t.enabled = !muted))
    this.set({muted})
  }

  toggleCamera() {
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
    if (!local || !old || this.flipping) return
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
        try {
          return (await navigator.mediaDevices.getUserMedia({video})).getVideoTracks()[0]
        } catch {
          /* try next */
        }
      }
      return null
    }
    try {
      old.stop()
      const track = (await open(next)) ?? (await open(facing))
      if (!track) throw new Error('No camera available')
      track.enabled = !this.state.camOff
      await Promise.all(this.space.rtc()?.replaceTrack(old, track) ?? [])
      local.removeTrack(old)
      local.addTrack(track)
      const actual = track.getSettings().facingMode
      this.set({facing: actual === 'environment' || actual === 'user' ? actual : next, local: new MediaStream(local.getTracks())})
    } catch (e) {
      this.set({error: `Couldn't switch camera: ${(e as Error).message}`})
    } finally {
      this.flipping = false
    }
  }

  /** Upgrade an audio call to video mid-call. */
  async enableVideo() {
    const {local} = this.state
    if (!local || local.getVideoTracks().length) return
    try {
      const cam = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}})
      const track = cam.getVideoTracks()[0]
      local.addTrack(track)
      this.space.rtc()?.addTrack(track, local)
      this.set({video: true, camOff: false, local: new MediaStream(local.getTracks())})
    } catch {
      /* camera denied */
    }
  }

  onSignal(msg: Record<string, string | boolean | number>) {
    const {t, id} = msg as {t: string; id: string}
    switch (t) {
      case 'ring':
        if (this.state.phase !== 'idle') {
          this.space.sendCallSignal({t: 'busy', id})
          return
        }
        this.pendingRemote = null
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
    if (this.state.phase === 'active') this.set({remote: stream})
    else this.pendingRemote = stream
  }

  onPeerLeft() {
    if (this.state.phase !== 'idle') this.finish()
  }

  private finish() {
    clearTimeout(this.ringTimeout)
    stopRing()
    nativeBridge?.cancelCall()
    const s = this.state
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
}
