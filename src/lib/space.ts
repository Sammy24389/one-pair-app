import * as Y from 'yjs'
import {IndexeddbPersistence} from 'y-indexeddb'
import {joinRoom, type Room, type MessageAction} from 'trystero'
import {hkdf, hkdfHex, hmacHex, timingSafeEqual} from './crypto'
import {identity, type PairRecord, type Profile} from './identity'
import {validProfileMedia} from './profile-media'
import {iceServers} from './settings'
import {getMedia, hasMedia, putMedia} from './idb'
import {fromB64, todayKey, toHex, uid} from './util'
import {CallController} from './call'
import {activeStatuses, type StatusRecord} from './status'
import type {
  DailyEntry,
  DailyPhoto,
  ListItem,
  Loc,
  Mood,
  Msg,
  Note,
  Presence,
  SpaceMeta,
  SpecialDay,
  Stroke
} from './types'

export const APP_ID = 'onepair-p2p-v1'

export type ConnState = 'offline' | 'searching' | 'online'

type Listener = () => void
type IncomingListener = (m: Msg) => void

export class Space {
  pair: PairRecord
  readonly doc = new Y.Doc()
  readonly persistence: IndexeddbPersistence
  readonly ready: Promise<void>
  readonly call: CallController

  // shared collections
  readonly meta = this.doc.getMap<unknown>('meta')
  readonly profiles = this.doc.getMap<Profile & {ts: number}>('profiles')
  readonly messages = this.doc.getArray<Msg>('messages')
  readonly reactions = this.doc.getMap<Record<string, string>>('reactions')
  readonly deleted = this.doc.getMap<boolean>('deleted')
  readonly reads = this.doc.getMap<number>('reads')
  readonly lastSeen = this.doc.getMap<number>('lastSeen')
  readonly days = this.doc.getMap<SpecialDay>('days')
  readonly lists = this.doc.getMap<ListItem>('lists')
  readonly notes = this.doc.getMap<Note>('notes')
  readonly moods = this.doc.getMap<Mood>('moods')
  readonly statuses = this.doc.getMap<StatusRecord>('statuses')
  readonly moodLog = this.doc.getArray<Mood & {by: string}>('moodLog')
  readonly daily = this.doc.getMap<DailyEntry>('daily')
  readonly photos = this.doc.getMap<DailyPhoto>('photos')
  readonly games = this.doc.getMap<unknown>('games')
  readonly doodle = this.doc.getArray<Stroke>('doodle')
  readonly locations = this.doc.getMap<Loc>('locations')

  // live (non-persisted) state
  conn: ConnState = 'offline'
  peerId: string | null = null
  peerTyping = false
  peerPresence: Presence = {}
  transfers = new Map<string, number>() // mediaId -> progress 0..1
  version = 0

  private room: Room | null = null
  private connectionGeneration = 0
  private connecting: Promise<void> | null = null
  private reconnecting: Promise<void> | null = null
  private disposed = false
  private secret: Uint8Array
  private listeners = new Set<Listener>()
  private incoming = new Set<IncomingListener>()
  private act!: {
    sv: MessageAction<Uint8Array>
    up: MessageAction<Uint8Array>
    media: MessageAction<Uint8Array>
    need: MessageAction<string[]>
    typing: MessageAction<boolean>
    presence: MessageAction<Presence>
    call: MessageAction<Record<string, string | boolean | number>>
  }
  private typingTimer?: ReturnType<typeof setTimeout>
  private needTimer?: ReturnType<typeof setTimeout>
  private requested = new Set<string>()
  private myPresence: Presence = {}

  constructor(pair: PairRecord) {
    this.pair = pair
    this.secret = fromB64(pair.secret)
    this.persistence = new IndexeddbPersistence(`onepair-${pair.id}`, this.doc)
    this.ready = this.persistence.whenSynced.then(() => undefined)
    this.call = new CallController(this)

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote' && this.peerId) this.act?.up.send(update, {target: this.peerId}).catch(() => {})
      if (origin === 'remote') this.scheduleNeedCheck()
      this.bump()
    })

    this.messages.observe(ev => {
      if (ev.transaction.origin !== 'remote') return
      ev.changes.added.forEach(item => item.content.getContent().forEach(m => this.incoming.forEach(f => f(m as Msg))))
    })
  }

  get me() {
    return identity.get().deviceId
  }

  get peer() {
    return this.pair.peerDevice
  }

  // ---------- subscriptions ----------

  bump = () => {
    this.version++
    this.listeners.forEach(f => f())
  }

  subscribe = (f: Listener) => {
    this.listeners.add(f)
    return () => {
      this.listeners.delete(f)
    }
  }

  onIncoming(f: IncomingListener) {
    this.incoming.add(f)
    return () => this.incoming.delete(f)
  }

  // ---------- networking ----------

  connect(): Promise<void> {
    if (this.disposed || this.room) return Promise.resolve()
    if (this.connecting) return this.connecting
    const generation = this.connectionGeneration
    const pending = this.openRoom(generation).finally(() => {
      if (this.connecting === pending) this.connecting = null
    })
    this.connecting = pending
    return pending
  }

  private async openRoom(generation: number) {
    await this.ready
    const roomId = await hkdfHex(this.secret, 'room', 20)
    const password = await hkdfHex(this.secret, 'sdp', 32)
    const authKey = await hkdf(this.secret, 'auth')
    if (this.disposed || generation !== this.connectionGeneration) return
    const me = this.me
    const peer = this.peer

    this.conn = 'searching'
    this.bump()

    const room = joinRoom(
      {appId: APP_ID, password, rtcConfig: {iceServers: iceServers()}, maxReceiveBytes: 512 * 1024 ** 2},
      roomId,
      {
        handshakeTimeoutMs: 15000,
        // Mutual challenge-response: only the device holding the pair secret can join.
        onPeerHandshake: async (_pid, send, receive) => {
          const myNonce = toHex(crypto.getRandomValues(new Uint8Array(16)))
          await send({nonce: myNonce, device: me})
          const {data: hello} = await receive()
          const h = hello as {nonce: string; device: string}
          if (!h || h.device !== peer) throw new Error('unknown device')
          await send({mac: await hmacHex(authKey, `${h.nonce}|${me}`)})
          const {data: proof} = await receive()
          const expected = await hmacHex(authKey, `${myNonce}|${peer}`)
          if (!timingSafeEqual((proof as {mac: string}).mac ?? '', expected)) throw new Error('bad proof')
        }
      }
    )
    this.room = room

    this.act = {
      sv: room.makeAction<Uint8Array>('sv'),
      up: room.makeAction<Uint8Array>('up'),
      media: room.makeAction<Uint8Array>('media'),
      need: room.makeAction<string[]>('need'),
      typing: room.makeAction<boolean>('typing'),
      presence: room.makeAction<Presence>('presence'),
      call: room.makeAction<Record<string, string | boolean | number>>('call')
    }

    const bin = (d: unknown) => (d instanceof Uint8Array ? d : new Uint8Array(d as ArrayBuffer))

    this.act.sv.onMessage = (sv, {peerId}) => {
      this.act.up.send(Y.encodeStateAsUpdate(this.doc, bin(sv)), {target: peerId})
    }
    this.act.up.onMessage = up => Y.applyUpdate(this.doc, bin(up), 'remote')

    this.act.media.onReceiveProgress = (p, {metadata}) => {
      const id = (metadata as {id?: string})?.id
      if (id) {
        this.transfers.set(id, p)
        this.bump()
      }
    }
    this.act.media.onMessage = async (data, {metadata}) => {
      const m = metadata as {id: string; mime: string; name?: string}
      const status = activeStatuses(this.statuses, [this.me, this.peer]).find(s => s.mediaId === m?.id)
      if (status && (bin(data).byteLength !== status.size || m.mime !== status.mime)) {
        this.transfers.delete(m.id)
        this.requested.delete(m.id)
        this.bump()
        return
      }
      await putMedia(m.id, new Blob([bin(data) as BlobPart], {type: m.mime}), m.name)
      this.transfers.delete(m.id)
      this.requested.delete(m.id)
      this.bump()
    }
    this.act.need.onMessage = async ids => {
      for (const id of ids.slice(0, 200)) await this.pushMedia(id)
    }
    this.act.typing.onMessage = t => {
      this.peerTyping = t
      clearTimeout(this.typingTimer)
      if (t) this.typingTimer = setTimeout(() => ((this.peerTyping = false), this.bump()), 6000)
      this.bump()
    }
    this.act.presence.onMessage = p => {
      this.peerPresence = p
      this.bump()
    }
    this.act.call.onMessage = msg => this.call.onSignal(msg)

    room.onPeerJoin = peerId => {
      if (this.room !== room) return
      this.peerId = peerId
      this.conn = 'online'
      this.act.sv.send(Y.encodeStateVector(this.doc), {target: peerId})
      this.act.presence.send(this.myPresence, {target: peerId})
      this.scheduleNeedCheck(2500)
      this.bump()
    }
    room.onPeerLeave = peerId => {
      if (this.room !== room || peerId !== this.peerId) return
      this.peerId = null
      this.peerTyping = false
      this.conn = 'searching'
      this.lastSeen.set(this.peer, Date.now())
      this.call.onPeerLeft()
      this.bump()
    }
    room.onPeerStream = stream => { if (this.room === room) this.call.onRemoteStream(stream) }
  }

  /** Called when the partner re-paired from a new install (same space, new device id). */
  updatePair(p: PairRecord) {
    this.pair = p
    this.reconnect()
  }

  async disconnect() {
    this.connectionGeneration++
    this.connecting = null
    clearTimeout(this.needTimer)
    clearTimeout(this.typingTimer)
    this.requested.clear()
    this.call.hangup()
    const r = this.room
    this.room = null
    this.peerId = null
    this.conn = 'offline'
    await r?.leave()
    this.bump()
  }

  reconnect(): Promise<void> {
    if (this.disposed || this.call.busy || this.call.state.phase !== 'idle') return Promise.resolve()
    if (this.reconnecting) return this.reconnecting
    const pending = (async () => {
      await this.disconnect()
      await this.connect()
    })().finally(() => {
      if (this.reconnecting === pending) this.reconnecting = null
    })
    this.reconnecting = pending
    return pending
  }

  get online() {
    return this.conn === 'online' && !!this.peerId
  }

  /** Derive a purpose-bound value from the pair secret (e.g. ntfy topics). */
  derive(info: string, len = 16) {
    return hkdfHex(this.secret, info, len)
  }

  rtc() {
    return this.room
  }

  sendCallSignal(msg: Record<string, string | boolean | number>) {
    if (this.peerId) this.act.call.send(msg, {target: this.peerId}).catch(() => {})
  }

  setTyping(t: boolean) {
    if (this.peerId) this.act.typing.send(t, {target: this.peerId}).catch(() => {})
  }

  setPresence(p: Presence) {
    this.myPresence = {...this.myPresence, ...p}
    if (this.peerId) this.act.presence.send(this.myPresence, {target: this.peerId}).catch(() => {})
  }

  sendTouch(kind: string) {
    this.addMessage({kind: 'touch', text: kind})
  }

  // ---------- media ----------

  private async pushMedia(id: string) {
    if (!this.peerId) return
    const rec = await getMedia(id)
    if (!rec) return
    const buf = new Uint8Array(await rec.blob.arrayBuffer())
    await this.act.media
      .send(buf, {
        target: this.peerId,
        metadata: {id, mime: rec.mime, name: rec.name ?? null},
        onProgress: p => {
          this.transfers.set(id, p)
          if (p >= 1) this.transfers.delete(id)
          this.bump()
        }
      })
      .catch(() => this.transfers.delete(id))
  }

  /** Stores a blob locally and, if the peer is online, streams it to them. */
  async addMedia(blob: Blob, name?: string) {
    const id = uid(16)
    await putMedia(id, blob, name)
    this.pushMedia(id)
    return id
  }

  private collectMediaIds() {
    const ids = new Set<string>()
    for (const m of this.messages) if (m.mediaId && !this.deleted.get(m.id)) ids.add(m.mediaId)
    for (const d of this.days.values()) if (d.mediaId) ids.add(d.mediaId)
    for (const p of this.photos.values()) ids.add(p.mediaId)
    for (const status of activeStatuses(this.statuses, [this.me, this.peer])) {
      if (status.mediaId) ids.add(status.mediaId)
    }
    for (const device of [this.me, this.peer]) {
      const media = this.profiles.get(device)?.avatarMedia
      if (validProfileMedia(media)) ids.add(media.id)
    }
    const wp = this.meta.get('wallpaper')
    if (typeof wp === 'string' && wp) ids.add(wp)
    return ids
  }

  private scheduleNeedCheck(delay = 1500) {
    clearTimeout(this.needTimer)
    this.needTimer = setTimeout(async () => {
      if (!this.peerId) return
      const missing: string[] = []
      for (const id of this.collectMediaIds()) {
        if (this.requested.has(id) || this.transfers.has(id)) continue
        if (!(await hasMedia(id))) missing.push(id)
      }
      if (missing.length) {
        missing.forEach(id => this.requested.add(id))
        this.act.need.send(missing, {target: this.peerId}).catch(() => {})
        // allow re-request later if the transfer never arrives
        setTimeout(() => missing.forEach(id => this.requested.delete(id)), 60_000)
      }
    }, delay)
  }

  // ---------- data helpers ----------

  getMeta(): SpaceMeta {
    return this.meta.toJSON() as SpaceMeta
  }

  addMessage(m: Omit<Msg, 'id' | 'from' | 'ts'> & Partial<Pick<Msg, 'ts'>>) {
    const msg: Msg = {id: uid(), from: this.me, ts: Date.now(), ...m}
    this.messages.push([msg])
    return msg
  }

  markRead() {
    const last = this.messages.length ? this.messages.get(this.messages.length - 1).ts : 0
    if ((this.reads.get(this.me) ?? 0) < last) this.reads.set(this.me, last)
  }

  unreadCount() {
    const r = this.reads.get(this.me) ?? 0
    let n = 0
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages.get(i)
      if (m.ts <= r) break
      if (m.from !== this.me && m.kind !== 'system') n++
    }
    return n
  }

  react(msgId: string, emoji: string | null) {
    const cur = {...(this.reactions.get(msgId) ?? {})}
    if (emoji && cur[this.me] !== emoji) cur[this.me] = emoji
    else delete cur[this.me]
    this.reactions.set(msgId, cur)
  }

  setMood(mood: Mood) {
    this.doc.transact(() => {
      this.moods.set(this.me, mood)
      this.moodLog.push([{...mood, by: this.me}])
      if (this.moodLog.length > 500) this.moodLog.delete(0, this.moodLog.length - 500)
    })
  }

  answerDaily(question: string, text: string) {
    const key = todayKey()
    const cur = this.daily.get(key) ?? {q: question, answers: {}}
    this.daily.set(key, {...cur, answers: {...cur.answers, [this.me]: {text, ts: Date.now()}}})
  }

  myProfile() {
    return this.profiles.get(this.me) ?? {...identity.get().profile, ts: 0}
  }

  peerProfile(): Profile {
    return this.profiles.get(this.peer) ?? {name: this.pair.peerName || 'Partner', emoji: '💫'}
  }

  publishProfile(p: Profile) {
    this.profiles.set(this.me, {...p, ts: Date.now()})
  }

  /** Full encrypted-at-rest-agnostic backup of the shared document. */
  exportUpdate() {
    return Y.encodeStateAsUpdate(this.doc)
  }

  importUpdate(u: Uint8Array) {
    Y.applyUpdate(this.doc, u, 'import')
  }

  async destroy() {
    this.disposed = true
    this.call.dispose()
    await this.disconnect()
    await this.persistence.destroy()
    this.doc.destroy()
  }
}
