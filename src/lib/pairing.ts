import {joinRoom, type MessageAction, type Room} from 'trystero'
import {ecdhSecret, exportPub, fingerprintEmoji, hkdf, hkdfHex, newEcdh, open, seal, sha256Hex} from './crypto'
import {addPair, identity, type Mode, type Profile} from './identity'
import {ensureNotifyPermission, toast} from './notify'
import {iceServers, settings} from './settings'
import {APP_ID} from './space'
import {fromB64, toB64} from './util'
import {getSpace} from './spaces'

export type PairingPhase = 'connecting' | 'waiting' | 'request' | 'confirm' | 'done' | 'declined' | 'error'

export type PairingView = {
  phase: PairingPhase
  peer?: Profile & {device: string}
  emoji?: string[]
  pairId?: string
  error?: string
}

type Hello = {device: string; name: string; emoji: string; pub: string}

/**
 * Serverless pairing over a rendezvous room derived from the host's code.
 * 1. guest → host: hello (profile + ECDH pub)
 * 2. host  → guest: key (profile + ECDH pub) – both screens now show the same emoji fingerprint
 * 3. host accepts → welcome: pair secret sealed with the ECDH-derived key
 */
export class PairingSession {
  view: PairingView = {phase: 'connecting'}
  private room: Room | null = null
  private kp!: CryptoKeyPair
  private pub = ''
  private peerHello: Hello | null = null
  private peerPid: string | null = null
  private onChange: (v: PairingView) => void
  private role: 'host' | 'guest'
  private code: string
  private mode: Mode
  private since: string
  private act!: {
    welcome: MessageAction<{sealed: string}>
    decline: MessageAction<string>
  }

  constructor(opts: {role: 'host' | 'guest'; code: string; mode?: Mode; since?: string; onChange: (v: PairingView) => void}) {
    this.role = opts.role
    this.code = opts.code
    this.mode = opts.mode ?? 'friends'
    this.since = opts.since ?? ''
    this.onChange = opts.onChange
  }

  setMode(mode: Mode, since: string) {
    this.mode = mode
    this.since = since
  }

  private set(v: Partial<PairingView>) {
    this.view = {...this.view, ...v}
    this.onChange(this.view)
  }

  async start() {
    this.kp = await newEcdh()
    this.pub = await exportPub(this.kp)
    const roomId = await sha256Hex(`pair|${this.code}`)
    const room = joinRoom({appId: APP_ID, password: `pair:${this.code}`, rtcConfig: {iceServers: iceServers()}}, roomId)
    this.room = room
    const me = identity.get()
    const myHello: Hello = {device: me.deviceId, name: me.profile.name, emoji: me.profile.emoji, pub: this.pub}

    const hello = room.makeAction<Hello>('hello')
    const key = room.makeAction<Hello>('key')
    const welcome = room.makeAction<{sealed: string}>('welcome')
    const decline = room.makeAction<string>('decline')
    this.act = {welcome, decline}

    this.set({phase: 'waiting'})

    if (this.role === 'guest') {
      room.onPeerJoin = pid => {
        this.peerPid = pid
        hello.send(myHello, {target: pid})
      }
      key.onMessage = async (h, {peerId}) => {
        this.peerHello = h
        this.peerPid = peerId
        this.set({phase: 'confirm', peer: {name: h.name, emoji: h.emoji, device: h.device}, emoji: await fingerprintEmoji(this.pub, h.pub)})
      }
      welcome.onMessage = async ({sealed}) => {
        try {
          if (!this.peerHello) throw new Error('No key exchange')
          const k = await hkdf(await ecdhSecret(this.kp, this.peerHello.pub), 'pairing')
          const payload = JSON.parse(new TextDecoder().decode(await open(k, sealed))) as {secret: string; mode: Mode; since: string}
          const pairId = await this.storePair(payload.secret, this.peerHello)
          const space = getSpace(pairId)
          await space?.ready
          this.set({phase: 'done', pairId})
          this.leave(1500)
        } catch (e) {
          this.set({phase: 'error', error: (e as Error).message})
        }
      }
      decline.onMessage = () => this.set({phase: 'declined'})
    } else {
      hello.onMessage = async (h, {peerId}) => {
        if (this.view.phase !== 'waiting') return // one request at a time
        this.peerHello = h
        this.peerPid = peerId
        key.send(myHello, {target: peerId})
        this.set({phase: 'request', peer: {name: h.name, emoji: h.emoji, device: h.device}, emoji: await fingerprintEmoji(this.pub, h.pub)})
      }
      room.onPeerLeave = pid => {
        if (pid === this.peerPid && this.view.phase === 'request') {
          this.peerHello = null
          this.set({phase: 'waiting', peer: undefined, emoji: undefined})
        }
      }
    }
  }

  /**
   * Host accepts the pending request. Passing `restorePairId` re-uses an existing space so a reinstalled
   * device gets the full shared history synced back from this one.
   */
  async accept(restorePairId?: string) {
    const h = this.peerHello
    if (!h || !this.peerPid || this.role !== 'host') return
    const pairs = identity.get().pairs
    const existing = pairs.find(p => p.id === restorePairId) ?? pairs.find(p => p.peerDevice === h.device)
    const secret = existing?.secret ?? toB64(crypto.getRandomValues(new Uint8Array(32)))
    const k = await hkdf(await ecdhSecret(this.kp, h.pub), 'pairing')
    const sealed = await seal(k, new TextEncoder().encode(JSON.stringify({secret, mode: this.mode, since: this.since})))
    await this.act.welcome.send({sealed}, {target: this.peerPid})
    const pairId = await this.storePair(secret, h)
    const space = getSpace(pairId)
    await space?.ready
    if (space && !space.meta.get('mode')) {
      space.doc.transact(() => {
        space.meta.set('mode', this.mode)
        if (this.since) space.meta.set('since', this.since)
      })
    }
    this.set({phase: 'done', pairId})
    this.leave(3000)
  }

  reject() {
    if (this.peerPid) this.act.decline.send('no', {target: this.peerPid})
    this.peerHello = null
    this.set({phase: 'waiting', peer: undefined, emoji: undefined})
  }

  private async storePair(secret: string, h: Hello) {
    const id = await hkdfHex(fromB64(secret), 'id', 16)
    addPair({id, secret, peerDevice: h.device, peerName: h.name, createdAt: Date.now()})
    // Done here rather than in the UI: on first pairing the Pair screen unmounts as soon as the pair exists.
    settings.set({activePairId: id})
    toast({title: 'Paired! 🎉', body: `You and ${h.name || 'your pair'} are connected`, icon: '💞'})
    ensureNotifyPermission()
    return id
  }

  leave(delay = 0) {
    const r = this.room
    this.room = null
    setTimeout(() => r?.leave(), delay)
  }
}
