import {joinRoom, type Room} from 'trystero'
import {identity} from './identity'
import {createStore} from './store'
import {hkdfHex, hmacHex, timingSafeEqual} from './crypto'
import {fromB64, toB64, uid} from './util'
import {iceServers, settings} from './settings'
import {nativeBridge} from './native'
import {withSystemUi} from './platform'
import {idbGet, idbPut, idbDel} from './idb'
import {claimMedia, releaseMedia} from './media-lease'
import {applyPartyMove, createPartyGame, validPartyGame, type GameKind, type PartyGame} from './party-games'

export type GroupRecord = {id: string; secret: string; title: string; owner: string}
export type GroupMessage = {id: string; from: string; name: string; text: string; ts: number}
export type Race = {players: string[]; turn: number; total: number; version: number; winner: string | null}
export const groupRegistry = createStore<{records: GroupRecord[]}>({records: []}, 'onepair.groups.v1')
export const groupEvents = createStore({version: 0})
const instances = new Map<string, PeerGroup>()
const messageListeners = new Set<(group: PeerGroup, message: GroupMessage) => void>()
export const onGroupMessage = (listener: (group: PeerGroup, message: GroupMessage) => void) => {
  messageListeners.add(listener)
  return () => messageListeners.delete(listener)
}
const bump = () => groupEvents.set(s => ({version: s.version + 1}))
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(v)
export function parseGroupInvitation(raw: string): GroupRecord {
  if (raw.length > 1600 || !raw.startsWith('PADI-GROUP:')) throw new Error('Paste a valid group invitation.')
  let value: GroupRecord
  try { value = JSON.parse(new TextDecoder().decode(fromB64(raw.slice(11)))) } catch { throw new Error('Invalid invitation.') }
  if (!value || !validId(value.id) || !validId(value.owner) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 60 || typeof value.secret !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value.secret)) throw new Error('Invalid invitation.')
  return {id: value.id, owner: value.owner, title: value.title.trim(), secret: value.secret}
}
export const groupInvitation = (r: GroupRecord) => 'PADI-GROUP:' + toB64(new TextEncoder().encode(JSON.stringify(r)))
export function acceptGroupInvitation(raw: string) {
  const record = parseGroupInvitation(raw)
  const existing = groupRegistry.get().records.find(r => r.id === record.id)
  if (existing && existing.secret !== record.secret) throw new Error('This invitation conflicts with your saved group.')
  if (!existing && groupRegistry.get().records.length >= 12) throw new Error('You can save up to 12 groups.')
  if (!existing) groupRegistry.set(s => ({records: [...s.records, record]}))
  return getGroup(record)
}
export function createGroup(title: string) {
  return acceptGroupInvitation(groupInvitation({id: uid(16), secret: toB64(crypto.getRandomValues(new Uint8Array(32))), title: title.trim(), owner: identity.get().deviceId}))
}
export const getGroup = (record: GroupRecord) => {
  let group = instances.get(record.id)
  if (!group) { group = new PeerGroup(record); instances.set(record.id, group); const created = group; void created.connect().catch(e => created.fail(e)) }
  return group
}
export const initializeGroups = () => groupRegistry.get().records.forEach(getGroup)
export const hasGroupCall = () => [...instances.values()].some(g => g.local !== null || g.joining)
export const activeGroupCall = () => [...instances.values()].find(g => g.local !== null || g.joining)
export const groupRecoveryTargets = () => [...instances.values()].map(group => ({
  id: group.record.id, online: group.connected, busy: !!group.local || group.joining, reconnect: () => group.reconnect()
}))
export async function forgetGroup(id: string) {
  const group = instances.get(id)
  await group?.destroy()
  await idbDel('kv', 'group.messages.' + id)
  instances.delete(id)
  groupRegistry.set(s => ({records: s.records.filter(r => r.id !== id)}))
}
export function raceMove(race: Race, actor: string, amount: number, version: number): Race | null {
  if (race.winner || race.version !== version || race.players[race.turn] !== actor || !Number.isInteger(amount) || amount < 1 || amount > 3 || race.total + amount > 21) return null
  const total = race.total + amount
  return {...race, total, version: race.version + 1, turn: (race.turn + 1) % race.players.length, winner: total === 21 ? actor : null}
}
export class PeerGroup {
  room: Room | null = null
  peers = new Map<string, {device: string; name: string}>()
  messages: GroupMessage[] = []
  race: Race | null = null
  party: PartyGame | null = null
  private partySequence = 0
  private connecting: Promise<void> | null = null
  private connectionGeneration = 0
  local: MediaStream | null = null
  remote = new Map<string, MediaStream>()
  callers = new Set<string>()
  joining = false
  error = ''
  connected = false
  private historyTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pending = 0
  private generation = 0
  private disposed = false
  private send: ((event: Record<string, unknown>, target?: string) => void) | null = null
  private rates = new Map<string, {at: number; count: number}>()
  private saving: Promise<unknown> = Promise.resolve()
  constructor(readonly record: GroupRecord) {}
  fail(e: unknown) { this.error = e instanceof Error ? e.message : 'Group connection failed.'; bump() }
  connect(): Promise<void> {
    if (this.disposed || this.room) return Promise.resolve()
    if (this.connecting) return this.connecting
    const generation = ++this.connectionGeneration
    const task = this.openConnection(generation).finally(() => {
      if (this.connecting === task) this.connecting = null
    })
    this.connecting = task
    return task
  }
  async reconnect() {
    if (this.disposed || this.connected || this.local || this.joining) return
    ++this.connectionGeneration
    this.connecting = null
    const room = this.room
    this.room = null
    this.send = null
    this.historyTimers.forEach(clearTimeout)
    this.historyTimers.clear()
    this.peers.clear()
    this.callers.clear()
    this.rates.clear()
    this.pending = 0
    if (identity.get().deviceId !== this.record.owner) this.partySequence = -1
    if (room) await room.leave()
    if (!this.disposed) await this.connect()
  }
  private async openConnection(connectionGeneration: number) {
    const saved = await idbGet<GroupMessage[]>('kv', 'group.messages.' + this.record.id)
    if (this.disposed || connectionGeneration !== this.connectionGeneration) return
    this.merge(Array.isArray(saved) ? saved.filter(validMessage).slice(-300) : [])
    const password = await hkdfHex(fromB64(this.record.secret), 'group-password')
    if (this.disposed || connectionGeneration !== this.connectionGeneration) return
    const room = joinRoom({appId: 'padi-groups-v1', password, rtcConfig: {iceServers: iceServers()}, maxReceiveBytes: 64 * 1024}, this.record.id, {
      handshakeTimeoutMs: 15000,
      onPeerHandshake: async (_id, send, receive) => {
        if (this.disposed || connectionGeneration !== this.connectionGeneration) throw new Error('Group connection changed.')
        if (this.peers.size + this.pending >= 3) throw new Error('Group is full (four devices maximum).')
        this.pending++
        try {
          const nonce = uid(24)
          const device = identity.get().deviceId
          await send({device, name: identity.get().profile.name.slice(0, 60), nonce})
          const {data} = await receive()
          const hello = data as {device: string; name: string; nonce: string}
          if (!validId(hello?.device) || !validId(hello.nonce) || typeof hello.name !== 'string' || hello.name.length > 60 || hello.device === device || [...this.peers.values()].some(p => p.device === hello.device)) throw new Error('Invalid group participant.')
          await send({mac: await hmacHex(fromB64(this.record.secret), hello.nonce + '|' + device)})
          const proof = (await receive()).data as {mac: string}
          if (typeof proof?.mac !== 'string' || !timingSafeEqual(proof.mac, await hmacHex(fromB64(this.record.secret), nonce + '|' + hello.device))) throw new Error('Invalid group proof.')
          if (this.disposed || connectionGeneration !== this.connectionGeneration) throw new Error('Group was closed.')
          this.peers.set(_id, {device: hello.device, name: hello.name})
        } finally { if (connectionGeneration === this.connectionGeneration) this.pending-- }
      }
    })
    this.room = room
    const action = room.makeAction<string>('event')
    this.send = (event, target) => { try { const raw = JSON.stringify(event); if (new TextEncoder().encode(raw).byteLength > 60000) throw new Error('Group event is too large.'); void action.send(raw, target ? {target} : undefined).catch(e => this.fail(e)) } catch(e) { this.fail(e) } }
    action.onMessage = (raw, {peerId}) => { if (this.room !== room || typeof raw !== 'string' || raw.length > 60000) return; try { this.receive(JSON.parse(raw), peerId) } catch { /* Ignore malformed peer events. */ } }
    room.onPeerJoin = peerId => {
      if (this.room !== room) return
      if (this.peers.size > 3) { this.peers.delete(peerId); return }
      this.connected = true
      this.sendHistory(peerId)
      this.send?.({type: 'call', joined: !!this.local}, peerId)
      if (identity.get().deviceId === this.record.owner && this.race) this.send?.({type: 'race', race: this.race}, peerId)
      if (identity.get().deviceId === this.record.owner) this.sendParty(peerId)
      bump()
    }
    room.onPeerLeave = peerId => {
      if (this.room !== room) return
      const left = this.peers.get(peerId)
      if (left?.device === this.record.owner) this.partySequence = -1
      clearTimeout(this.historyTimers.get(peerId)); this.historyTimers.delete(peerId)
      this.peers.delete(peerId); this.callers.delete(peerId); this.remote.delete(peerId); this.rates.delete(peerId)
      this.connected = this.peers.size > 0
      if (left && this.race?.players.includes(left.device)) { this.race = null; if (identity.get().deviceId === this.record.owner) this.send?.({type: 'race', race: null}) }
      bump()
    }
    room.onPeerStream = (stream, peerId) => {
      if (this.room !== room) return
      if (this.local && this.callers.has(peerId) && this.peers.has(peerId)) this.remote.set(peerId, stream)
      bump()
    }
    bump()
  }
  private sendHistory(peerId: string) {
    clearTimeout(this.historyTimers.get(peerId))
    const chunks: GroupMessage[][] = []
    let chunk: GroupMessage[] = []
    for (const message of this.messages.slice(-300)) {
      const next = [...chunk, message]
      if (chunk.length && (chunk.length >= 100 || new TextEncoder().encode(JSON.stringify({type: 'history', messages: next})).byteLength > 48000)) {chunks.push(chunk); chunk = [message]} else chunk = next
    }
    if (chunk.length) chunks.push(chunk)
    const deliver = () => {
      this.historyTimers.delete(peerId)
      if (this.disposed || !this.peers.has(peerId)) return
      for (const messages of chunks.splice(0, 25)) this.send?.({type: 'history', messages}, peerId)
      if (chunks.length) this.historyTimers.set(peerId, setTimeout(deliver, 11000))
    }
    deliver()
  }
  private receive(event: Record<string, unknown>, peerId: string) {
    const peer = this.peers.get(peerId)
    if (!peer || !event || typeof event !== 'object' || JSON.stringify(event).length > 60000) return
    const now = Date.now(); const rate = this.rates.get(peerId)
    if (!rate || now - rate.at > 10000) this.rates.set(peerId, {at: now, count: 1})
    else if (++rate.count > 60) return
    if (event.type === 'party-state' && peer.device === this.record.owner) {
      if (!Number.isSafeInteger(event.sequence) || (event.sequence as number) < 0 || (event.sequence as number) <= this.partySequence) return
      if (event.game !== null && (!validPartyGame(event.game) || !event.game.players.includes(this.record.owner))) return
      this.party = event.game as PartyGame | null
      this.partySequence = event.sequence as number
    } else if (event.type === 'party-move' && identity.get().deviceId === this.record.owner) {
      if (!this.party || event.gameId !== this.party.id || !this.partyReady() || !event.move || typeof event.move !== 'object' || Array.isArray(event.move)) return
      const next = applyPartyMove(this.party, peer.device, event.move as Record<string, unknown>, event.version as number)
      if (next) {this.party = next; this.partySequence++; this.sendParty()}
    } else if (event.type === 'message' && validMessage(event.message)) {
      const message = event.message
      if (message.from !== peer.device || Math.abs(now - message.ts) > 300000) return
      const fresh = !this.messages.some(saved => saved.id === message.id)
      this.merge([message])
      if (fresh) messageListeners.forEach(listener => listener(this, message))
    } else if (event.type === 'history' && Array.isArray(event.messages)) {
      this.merge(event.messages.slice(0, 100).filter(validMessage))
    } else if (event.type === 'call' && typeof event.joined === 'boolean') {
      if (event.joined) {
        const newly = !this.callers.has(peerId)
        this.callers.add(peerId)
        if (this.local && newly) {
          try { void Promise.all(this.room?.addStream(this.local, {target: peerId}) ?? []).catch(e => this.fail(e)) } catch(e) { this.fail(e) }
          this.send?.({type: 'call', joined: true}, peerId)
        }
      } else { this.callers.delete(peerId); this.remote.delete(peerId); if (this.local) this.removeLocalStream(peerId) }
    } else if (event.type === 'race' && peer.device === this.record.owner && validRace(event.race)) this.race = event.race
    else if (event.type === 'move' && identity.get().deviceId === this.record.owner && this.race) {
      const next = raceMove(this.race, peer.device, event.amount as number, event.version as number)
      if (next) { this.race = next; this.send?.({type: 'race', race: next}) }
    }
    bump()
  }
  private merge(messages: GroupMessage[]) {
    const map = new Map(this.messages.map(m => [m.id, m]))
    for (const m of messages) if (!map.has(m.id)) map.set(m.id, m)
    this.messages = [...map.values()].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id)).slice(-300)
    const snapshot = this.messages
    this.saving = this.saving.catch(() => {}).then(() => idbPut('kv', 'group.messages.' + this.record.id, snapshot)).catch(e => this.fail(e))
    bump()
  }
  message(text: string) {
    if (!text.trim() || text.length > 2000) throw new Error('Messages must contain 1 to 2,000 characters.')
    const message: GroupMessage = {id: uid(16), from: identity.get().deviceId, name: identity.get().profile.name.slice(0, 60), text: text.trim(), ts: Date.now()}
    this.merge([message]); this.send?.({type: 'message', message})
  }
  startRace() {
    if (identity.get().deviceId !== this.record.owner) throw new Error('The group creator starts the game.')
    const players = [this.record.owner, ...[...this.peers.values()].map(p => p.device)].sort()
    if (players.length < 2) throw new Error('Connect at least two players first.')
    this.race = {players, turn: 0, total: 0, version: (this.race?.version ?? 0) + 1, winner: null}
    this.send?.({type: 'race', race: this.race}); bump()
  }
  move(amount: number) {
    if (!this.race) return
    if (identity.get().deviceId === this.record.owner) {
      const next = raceMove(this.race, identity.get().deviceId, amount, this.race.version)
      if (next) { this.race = next; this.send?.({type: 'race', race: next}); bump() }
    } else this.send?.({type: 'move', amount, version: this.race.version})
  }
  private sendParty(target?: string) {
    this.send?.({type: 'party-state', sequence: this.partySequence, game: this.party}, target)
  }
  partyReady() {
    const online = new Set([identity.get().deviceId, ...[...this.peers.values()].map(p => p.device)])
    return online.has(this.record.owner) && !!this.party && this.party.players.every(id => online.has(id))
  }
  startParty(kind: GameKind, players: string[]) {
    if (this.disposed || identity.get().deviceId !== this.record.owner) throw new Error('The group creator starts games.')
    const online = new Set([identity.get().deviceId, ...[...this.peers.values()].map(p => p.device)])
    if (!Array.isArray(players) || !players.includes(this.record.owner) || players.some(id => !online.has(id))) throw new Error('Choose connected players, including the creator.')
    this.party = createPartyGame(kind, players, uid(16))
    this.partySequence++
    this.sendParty()
    bump()
  }
  partyMove(move: Record<string, unknown>) {
    if (this.disposed || !this.party || !this.partyReady()) throw new Error('Wait for the creator and all players to reconnect.')
    const next = applyPartyMove(this.party, identity.get().deviceId, move, this.party.version)
    if (!next) throw new Error('That move is not allowed. Check the rules and whose turn it is.')
    if (identity.get().deviceId === this.record.owner) {
      this.party = next
      this.partySequence++
      this.sendParty()
      bump()
    } else this.send?.({type: 'party-move', gameId: this.party.id, version: this.party.version, move})
  }
  async joinCall(video: boolean) {
    if (this.disposed || this.local || this.joining || hasGroupCall() || !this.room) throw new Error('Finish the current call before joining another.')
    if (!claimMedia(this)) throw new Error('Finish your current call first.')
    const generation = ++this.generation; this.joining = true; this.error = ''; bump()
    try {
      const stream = await withSystemUi(() => navigator.mediaDevices.getUserMedia({audio: true, video}))
      if (this.disposed || generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return }
      this.local = stream
      nativeBridge?.startKeepAlive({callAudio: true, callVideo: video}).catch(() => this.fail(new Error('Android background call service could not start. Keep the app visible.')))
      this.send?.({type: 'call', joined: true})
      for (const peerId of this.callers) {
        if (this.disposed || generation !== this.generation) break
        await Promise.all(this.room?.addStream(stream, {target: peerId}) ?? [])
      }
    } catch (e) { if (generation === this.generation) { this.leaveCall(); this.fail(e) } }
    finally { if (generation === this.generation) this.joining = false; bump() }
  }
  private removeLocalStream(peerId?: string) {
    if (!this.local) return
    try { this.room?.removeStream(this.local, peerId ? {target: peerId} : undefined) } catch(e) { this.fail(e) }
  }
  leaveCall() {
    ++this.generation; this.joining = false
    if (this.local) {
      this.removeLocalStream()
      this.local.getTracks().forEach(track => track.stop())
      if (nativeBridge) {
        const operation = settings.get().keepAlive ? nativeBridge.startKeepAlive() : nativeBridge.stopKeepAlive()
        void operation.catch(() => {})
      }
    }
    this.local = null; this.remote.clear(); releaseMedia(this); this.send?.({type: 'call', joined: false}); bump()
  }
  async destroy() { this.disposed = true; ++this.connectionGeneration; this.historyTimers.forEach(clearTimeout); this.historyTimers.clear(); this.leaveCall(); await this.room?.leave(); this.room = null; await this.saving }
}
function validMessage(v: unknown): v is GroupMessage {
  const m = v as GroupMessage
  return !!m && validId(m.id) && validId(m.from) && typeof m.name === 'string' && m.name.length <= 60 && typeof m.text === 'string' && m.text.length > 0 && m.text.length <= 2000 && Number.isSafeInteger(m.ts) && m.ts > 0
}
function validRace(v: unknown): v is Race | null {
  if (v === null) return true
  const r = v as Race
  return !!r && Array.isArray(r.players) && r.players.length >= 2 && r.players.length <= 4 && r.players.every(validId) && new Set(r.players).size === r.players.length && Number.isInteger(r.turn) && r.turn >= 0 && r.turn < r.players.length && Number.isInteger(r.total) && r.total >= 0 && r.total <= 21 && Number.isSafeInteger(r.version) && r.version >= 0 && (r.winner === null || r.players.includes(r.winner))
}
