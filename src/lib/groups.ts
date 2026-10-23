import {lockState} from './security'
import {joinRoom, type Room} from 'trystero'
import {notifyNow, toast} from './notify'
import {playNotificationTone} from './sound'
import {openRoute} from './nav'
import {identity} from './identity'
import {createStore} from './store'
import {hkdfHex, hmacHex, timingSafeEqual} from './crypto'
import {fromB64, toB64, uid} from './util'
import {iceServers, settings} from './settings'
import {nativeBridge} from './native'
import {isAppHidden, withSystemUi} from './platform'
import * as platformState from './platform'
import {normalizeOpenPigeonMessage, normalizeOpenPigeonSession, openPigeonParticipants, OPENPIGEON_PROTOCOL, OPENPIGEON_MAX_SESSIONS, OPENPIGEON_RETENTION_MS, type OpenPigeonMessage, type OpenPigeonSession} from './openpigeon-protocol'
import {idbGet, idbPut, idbDel} from './idb'
import {claimMedia, releaseMedia} from './media-lease'
import {basketballRoundRunning,isTimedBasketball,BASKETBALL_ROUND_MS} from './sports-games'
import {applyPartyMove, createPartyGame, validPartyGame, GAME_PROTOCOL, type GameKind, type PartyGame} from './party-games'

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
const openPigeonListeners = new Set<(group: PeerGroup, session: OpenPigeonSession) => void>()
export function onOpenPigeonMessage(listener: (group: PeerGroup, session: OpenPigeonSession) => void) {
  openPigeonListeners.add(listener)
  return () => {openPigeonListeners.delete(listener)}
}
const androidGames = () => Object.hasOwn(platformState, 'isNative') && Object.hasOwn(platformState, 'platform') && platformState.isNative === true && platformState.platform === 'android'
const eventLimit = (type: unknown) => type === 'party-state' ? 120000 : type === 'pigeon-state' || type === 'pigeon-request' ? 110000 : 60000
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
  id: group.record.id, online: group.connected, busy: !!group.local || group.joining || !!group.presentation, reconnect: () => group.reconnect()
}))
export async function forgetGroup(id: string) {
  const group = instances.get(id)
  await group?.destroy()
  await idbDel('kv', 'group.messages.' + id)
  await idbDel('kv', 'group.openpigeon.' + id)
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
  peers = new Map<string, {device: string; name: string; games?: number; openpigeon?: number}>()
  messages: GroupMessage[] = []
  race: Race | null = null
  openPigeonSessions: OpenPigeonSession[] = []
  private pigeonSeen = new Map<string, string[]>()
  private pigeonStorageError: Error | null = null
  private pigeonPending = new Map<string, {session: string; revision: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>()
  party: PartyGame | null = null
  private partySequence = 0
  private basketballClock: {key:string;start:number;timer:ReturnType<typeof setTimeout>} | null = null
  private connecting: Promise<void> | null = null
  private connectionGeneration = 0
  local: MediaStream | null = null
  remote = new Map<string, MediaStream>()
  callers = new Set<string>()
  shared = new Map<string, {stream: MediaStream; title: string}>()
  presentation: MediaStream | null = null
  private presentationTitle = ''
  private lastCallNotice = 0
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
    if (this.disposed || this.connected || this.local || this.joining || this.presentation) return
    this.rejectOpenPigeonPending('The group is reconnecting. Reopen the latest game and retry.')
    this.stopPresentation(); this.shared.clear(); this.remote.clear()
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
    const pigeonSaved = await idbGet<unknown>('kv', 'group.openpigeon.' + this.record.id)
    if (this.disposed || connectionGeneration !== this.connectionGeneration) return
    this.loadOpenPigeon(pigeonSaved)
    this.merge(Array.isArray(saved) ? saved.filter(validMessage).slice(-300) : [])
    const password = await hkdfHex(fromB64(this.record.secret), 'group-password')
    if (this.disposed || connectionGeneration !== this.connectionGeneration) return
    const room = joinRoom({appId: 'padi-groups-v1', password, rtcConfig: {iceServers: iceServers()}, maxReceiveBytes: 128 * 1024}, this.record.id, {
      handshakeTimeoutMs: 15000,
      onPeerHandshake: async (_id, send, receive) => {
        if (this.disposed || connectionGeneration !== this.connectionGeneration) throw new Error('Group connection changed.')
        if (this.peers.size + this.pending >= 3) throw new Error('Group is full (four devices maximum).')
        this.pending++
        try {
          const nonce = uid(24)
          const device = identity.get().deviceId
          await send({device, name: identity.get().profile.name.slice(0, 60), nonce, games: GAME_PROTOCOL, openpigeon: androidGames() ? OPENPIGEON_PROTOCOL : 0})
          const {data} = await receive()
          const hello = data as {device: string; name: string; nonce: string; games?: number; openpigeon?: number}
          if (!validId(hello?.device) || !validId(hello.nonce) || typeof hello.name !== 'string' || hello.name.length > 60 || hello.device === device || [...this.peers.values()].some(p => p.device === hello.device)) throw new Error('Invalid group participant.')
          await send({mac: await hmacHex(fromB64(this.record.secret), hello.nonce + '|' + device)})
          const proof = (await receive()).data as {mac: string}
          if (typeof proof?.mac !== 'string' || !timingSafeEqual(proof.mac, await hmacHex(fromB64(this.record.secret), nonce + '|' + hello.device))) throw new Error('Invalid group proof.')
          if (this.disposed || connectionGeneration !== this.connectionGeneration) throw new Error('Group was closed.')
          this.peers.set(_id, {device: hello.device, name: hello.name, games: hello.games === GAME_PROTOCOL ? GAME_PROTOCOL : undefined, openpigeon: hello.openpigeon === OPENPIGEON_PROTOCOL ? OPENPIGEON_PROTOCOL : undefined})
        } finally { if (connectionGeneration === this.connectionGeneration) this.pending-- }
      }
    })
    this.room = room
    const action = room.makeAction<string>('event')
    this.send = (event, target) => { try { const raw = JSON.stringify(event); if (new TextEncoder().encode(raw).byteLength > eventLimit(event.type)) throw new Error('Group event is too large.'); void action.send(raw, target ? {target} : undefined).catch(e => this.fail(e)) } catch(e) { this.fail(e) } }
    action.onMessage = (raw, {peerId}) => { if (this.room !== room || typeof raw !== 'string' || raw.length > 120000) return; try { this.receive(JSON.parse(raw), peerId) } catch { /* Ignore malformed peer events. */ } }
    room.onPeerJoin = peerId => {
      if (this.room !== room) return
      if (this.peers.size > 3) { this.peers.delete(peerId); return }
      this.connected = true
      this.sendHistory(peerId)
      if (this.presentation) {try {void Promise.all(room.addStream(this.presentation, {target: peerId, metadata: {padi: 'presentation', title: this.presentationTitle}})).catch(e => this.fail(e))} catch(e) {this.fail(e)}}
      this.send?.({type: 'call', joined: !!this.local}, peerId)
      if (identity.get().deviceId === this.record.owner && this.race) this.send?.({type: 'race', race: this.race}, peerId)
      if (identity.get().deviceId === this.record.owner) {
        this.sendParty(peerId)
        this.pruneOpenPigeon()
        for (const session of this.openPigeonSessions) this.sendOpenPigeon(session,true,peerId)
      }
      bump()
    }
    room.onPeerLeave = peerId => {
      if (this.room !== room) return
      const left = this.peers.get(peerId)
      if (left?.device === this.record.owner) {this.partySequence = -1; this.rejectOpenPigeonPending('The group creator disconnected. Reconnect and retry.')}
      clearTimeout(this.historyTimers.get(peerId)); this.historyTimers.delete(peerId)
      this.peers.delete(peerId); this.callers.delete(peerId); this.remote.delete(peerId); this.shared.delete(peerId); this.rates.delete(peerId)
      this.connected = this.peers.size > 0
      if (left && this.race?.players.includes(left.device)) { this.race = null; if (identity.get().deviceId === this.record.owner) this.send?.({type: 'race', race: null}) }
      bump()
    }
    room.onPeerStream = (stream, peerId, metadata) => {
      if (this.room !== room) return
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.padi === 'presentation' && this.peers.has(peerId)) {
        this.shared.set(peerId, {stream, title: typeof metadata.title === 'string' ? metadata.title.slice(0, 80) : 'Shared media'}); bump(); return
      }
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
    if (!peer || !event || typeof event !== 'object' || JSON.stringify(event).length > eventLimit(event.type)) return
    const now = Date.now(); const rate = this.rates.get(peerId)
    if (!rate || now - rate.at > 10000) this.rates.set(peerId, {at: now, count: 1})
    else if (++rate.count > 60) return
    if (event.type === 'pigeon-state' && peer.device === this.record.owner) {
      const session = normalizeOpenPigeonSession(event.session, this.record.owner)
      if (session && session.participants.includes(identity.get().deviceId) && session.updatedAt >= now - OPENPIGEON_RETENTION_MS) this.acceptOpenPigeonState(session, event.replay === true)
    } else if (event.type === 'pigeon-request' && identity.get().deviceId === this.record.owner) {
      const message = normalizeOpenPigeonMessage(event.message)
      if (!message) return
      try {this.hostOpenPigeon(event.participants, message, peer.device, event.revision)}
      catch (error) {
        const latest = this.openPigeonSessions.find(session => session.id === message.session)
        if (latest) this.sendOpenPigeon(latest,true,peerId)
        this.send?.({type:'pigeon-rejected', messageGuid:message.messageGuid, session:message.session, reason:error instanceof Error ? error.message : 'Game update rejected.'}, peerId)
      }
    } else if (event.type === 'pigeon-rejected' && peer.device === this.record.owner) {
      if (typeof event.messageGuid !== 'string') return
      const pending = this.pigeonPending.get(event.messageGuid)
      if (pending && pending.session === event.session) {clearTimeout(pending.timer); this.pigeonPending.delete(event.messageGuid); pending.reject(new Error(typeof event.reason === 'string' ? event.reason.slice(0,200) : 'Game update rejected.'))}
    } else if (event.type === 'party-state' && peer.device === this.record.owner) {
      if (!Number.isSafeInteger(event.sequence) || (event.sequence as number) < 0 || (event.sequence as number) <= this.partySequence) return
      if (event.game !== null && (!validPartyGame(event.game) || !event.game.players.includes(this.record.owner))) return
      this.party = event.game as PartyGame | null
      this.partySequence = event.sequence as number
    } else if (event.type === 'party-move' && identity.get().deviceId === this.record.owner) {
      if (!this.party || event.gameId !== this.party.id || !this.partyReady() || !event.move || typeof event.move !== 'object' || Array.isArray(event.move)) return
      const next = this.hostPartyMove(peer.device, event.move as Record<string, unknown>, event.version as number)
      if (next) this.publishParty(next)
    } else if (event.type === 'message' && validMessage(event.message)) {
      const message = event.message
      if (message.from !== peer.device || Math.abs(now - message.ts) > 300000) return
      const fresh = !this.messages.some(saved => saved.id === message.id)
      this.merge([message])
      if (fresh) messageListeners.forEach(listener => listener(this, message))
    } else if (event.type === 'history' && Array.isArray(event.messages)) {
      this.merge(event.messages.slice(0, 100).filter(validMessage))
    } else if (event.type === 'presentation-ended') { this.shared.delete(peerId)
    } else if (event.type === 'call' && typeof event.joined === 'boolean') {
      if (event.joined) {
        const newly = !this.callers.has(peerId)
        this.callers.add(peerId)
        if (newly && !this.local && now - this.lastCallNotice > 15000) {
          this.lastCallNotice = now
          const route = {sub: 'groups' as const, focus: this.record.id, tab: 'more' as const}
          const privateNotice = lockState.get().locked || (isAppHidden() && settings.get().privacyBlur)
          const body = privateNotice ? 'Open OnePair to join your group call.' : `${peer.name || 'A friend'} is calling in ${this.record.title}`
          toast({title: 'Incoming group call', body, icon: '📞', action: () => openRoute(route)}, 10000)
          if (isAppHidden()) void notifyNow('Incoming group call', body, route)
          playNotificationTone()
        }
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
  openPigeonReady(participants: string[]) {
    if (this.disposed || !androidGames() || !openPigeonParticipants(participants) || !participants.includes(this.record.owner) || !participants.includes(identity.get().deviceId)) return false
    return participants.every(id => id === identity.get().deviceId || [...this.peers.values()].some(peer => peer.device === id && peer.openpigeon === OPENPIGEON_PROTOCOL))
  }
  async openPigeonMessage(participants: string[], input: OpenPigeonMessage): Promise<void> {
    const message = normalizeOpenPigeonMessage(input)
    if (!message) throw new Error('Invalid or oversized OpenPigeon game message.')
    if (!this.openPigeonReady(participants)) throw new Error('Connect the creator and all selected players using the Android app first.')
    const existing = this.openPigeonSessions.find(session => session.id === message.session)
    if (identity.get().deviceId === this.record.owner) {
      this.hostOpenPigeon(participants, message, identity.get().deviceId, existing?.revision ?? 0)
      await this.saving
      if (this.pigeonStorageError) throw this.pigeonStorageError
      return
    }
    if (!existing) throw new Error('The group creator must start this game first.')
    if (this.pigeonPending.has(message.messageGuid)) throw new Error('This game update is already awaiting confirmation.')
    const owner = [...this.peers].find(([,peer]) => peer.device === this.record.owner)?.[0]
    if (!owner || !this.send) throw new Error('Wait for the group creator to reconnect.')
    return new Promise<void>((resolve,reject) => {
      const timer = setTimeout(() => {this.pigeonPending.delete(message.messageGuid); reject(new Error('The creator did not confirm this game update. Reopen the latest game and retry.'))},12000)
      this.pigeonPending.set(message.messageGuid,{session:message.session,revision:existing.revision + 1,resolve,reject,timer})
      this.send?.({type:'pigeon-request',participants:[...participants],message,revision:existing.revision},owner)
    })
  }
  private hostOpenPigeon(participants: unknown, message: OpenPigeonMessage, author: string, revision: unknown) {
    this.pruneOpenPigeon()
    if (!openPigeonParticipants(participants) || !participants.includes(author) || !this.openPigeonReady(participants)) throw new Error('Connect all selected Android players before updating this game.')
    const existing = this.openPigeonSessions.find(session => session.id === message.session)
    if (!existing && author !== this.record.owner) throw new Error('The group creator must start this game first.')
    if (existing && JSON.stringify(participants) !== JSON.stringify(existing.participants)) throw new Error('The players in this game cannot be changed.')
    if (existing?.message.messageGuid === message.messageGuid && JSON.stringify(existing.message) === JSON.stringify(message)) {
      if (this.pigeonStorageError) this.saveOpenPigeon()
      this.sendOpenPigeon(existing,true)
      return
    }
    if (!Number.isSafeInteger(revision) || revision !== (existing?.revision ?? 0)) throw new Error('This game has changed. Reopen its latest update.')
    if ((existing?.revision ?? 0) >= 100000) throw new Error('Start a new game.')
    if (this.pigeonSeen.get(message.session)?.includes(message.messageGuid)) throw new Error('This game update was already processed.')
    const session: OpenPigeonSession = {id:message.session,participants:[...participants],revision:(existing?.revision ?? 0) + 1,author,message,updatedAt:Date.now()}
    this.acceptOpenPigeonState(session,false)
    this.sendOpenPigeon(session,false)
  }
  private sendOpenPigeon(session: OpenPigeonSession, replay: boolean, target?: string) {
    for (const [peerId,peer] of this.peers) if ((!target || target === peerId) && session.participants.includes(peer.device)) this.send?.({type:'pigeon-state',session,replay},peerId)
  }
  private acceptOpenPigeonState(session: OpenPigeonSession, replay: boolean) {
    const existing = this.openPigeonSessions.find(saved => saved.id === session.id)
    if (existing && (session.revision <= existing.revision || JSON.stringify(existing.participants) !== JSON.stringify(session.participants))) {
      if (session.revision === existing.revision && JSON.stringify(existing) === JSON.stringify(session)) this.confirmOpenPigeon(session)
      return
    }
    if (this.pigeonSeen.get(session.id)?.includes(session.message.messageGuid)) return
    this.openPigeonSessions = [session,...this.openPigeonSessions.filter(saved => saved.id !== session.id)]
    this.pigeonSeen.set(session.id,[...(this.pigeonSeen.get(session.id) ?? []),session.message.messageGuid].slice(-128))
    this.pruneOpenPigeon()
    this.saveOpenPigeon()
    this.confirmOpenPigeon(session)
    if (!replay && session.participants.includes(identity.get().deviceId)) openPigeonListeners.forEach(listener => {try {listener(this,session)} catch { /* Notification failure must not roll back an accepted update. */ }})
    bump()
  }
  private confirmOpenPigeon(session: OpenPigeonSession) {
    const pending = this.pigeonPending.get(session.message.messageGuid)
    if (pending && pending.session === session.id && pending.revision === session.revision && session.author === identity.get().deviceId) {
      clearTimeout(pending.timer); this.pigeonPending.delete(session.message.messageGuid)
      void this.saving.then(() => {if (this.pigeonStorageError) pending.reject(this.pigeonStorageError); else pending.resolve()})
    }
  }
  private pruneOpenPigeon() {
    this.openPigeonSessions = this.openPigeonSessions.filter(session => session.updatedAt >= Date.now() - OPENPIGEON_RETENTION_MS).sort((a,b) => b.updatedAt - a.updatedAt).slice(0,OPENPIGEON_MAX_SESSIONS)
    const active = new Set(this.openPigeonSessions.map(session => session.id))
    for (const id of this.pigeonSeen.keys()) if (!active.has(id)) this.pigeonSeen.delete(id)
  }
  private saveOpenPigeon() {
    const snapshot = {sessions:this.openPigeonSessions,seen:Object.fromEntries(this.pigeonSeen)}
    this.saving = this.saving.catch(() => {}).then(async () => {
      try {await idbPut('kv','group.openpigeon.' + this.record.id,snapshot); this.pigeonStorageError = null}
      catch {this.pigeonStorageError = new Error('This game update could not be saved on your device. Free storage and retry.'); this.fail(this.pigeonStorageError)}
    })
  }
  private loadOpenPigeon(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const stored = value as {sessions?:unknown;seen?:unknown}
    if (!Array.isArray(stored.sessions)) return
    for (const value of stored.sessions.slice(0,OPENPIGEON_MAX_SESSIONS)) {
      const session = normalizeOpenPigeonSession(value,this.record.owner)
      if (!session || session.updatedAt < Date.now() - OPENPIGEON_RETENTION_MS) continue
      const current = this.openPigeonSessions.find(saved => saved.id === session.id)
      if (!current || session.revision > current.revision) this.openPigeonSessions = [...this.openPigeonSessions.filter(saved => saved.id !== session.id),session]
      const seen = stored.seen && typeof stored.seen === 'object' && !Array.isArray(stored.seen) ? (stored.seen as Record<string,unknown>)[session.id] : undefined
      const guids = Array.isArray(seen) ? seen.slice(-128).filter((id): id is string => typeof id === 'string' && /^[\x21-\x7e]{1,100}$/.test(id)) : []
      this.pigeonSeen.set(session.id,[...new Set([...(this.pigeonSeen.get(session.id) ?? []),...guids,session.message.messageGuid])].slice(-128))
    }
    this.pruneOpenPigeon()
    this.saveOpenPigeon()
    bump()
  }
  private rejectOpenPigeonPending(reason: string) {
    for (const pending of this.pigeonPending.values()) {clearTimeout(pending.timer); pending.reject(new Error(reason))}
    this.pigeonPending.clear()
  }
  private clearBasketballClock() {
    if (this.basketballClock) clearTimeout(this.basketballClock.timer)
    this.basketballClock = null
  }
  private publishParty(next: PartyGame) {
    this.party = next; this.partySequence++
    this.syncBasketballClock()
    this.sendParty(); bump()
  }
  private syncBasketballClock() {
    if (!this.party || !basketballRoundRunning(this.party)) {this.clearBasketballClock(); return}
    const key = this.party.id + ':' + this.party.turn
    if (this.basketballClock?.key === key) return
    this.clearBasketballClock()
    const start = performance.now()
    const expire = () => {
      if (this.disposed || !this.party || !basketballRoundRunning(this.party) || this.basketballClock?.key !== key || identity.get().deviceId !== this.record.owner) return
      const remaining = BASKETBALL_ROUND_MS - (performance.now() - start)
      if (remaining > 0) {this.basketballClock.timer = setTimeout(expire, remaining); return}
      const next = applyPartyMove(this.party, this.party.players[this.party.turn], {type:'finish-round',elapsed:BASKETBALL_ROUND_MS}, this.party.version)
      if (next) this.publishParty(next)
      else {this.clearBasketballClock(); this.fail(new Error('The basketball round could not finish. Start a new match.'))}
    }
    this.basketballClock = {key,start,timer:setTimeout(expire,BASKETBALL_ROUND_MS)}
  }
  private hostPartyMove(actor:string, move:Record<string,unknown>, version:number) {
    if (!this.party || this.party.version !== version || this.party.players[this.party.turn] !== actor) return null
    if (isTimedBasketball(this.party) && basketballRoundRunning(this.party)) {
      const clock = this.basketballClock
      if (!clock || clock.key !== this.party.id + ':' + this.party.turn) return null
      const elapsed = Math.floor(performance.now() - clock.start)
      if (move.type === 'finish-round' && elapsed < BASKETBALL_ROUND_MS) return null
      if (elapsed >= BASKETBALL_ROUND_MS) {
        const ended = applyPartyMove(this.party,actor,{type:'finish-round',elapsed:BASKETBALL_ROUND_MS},version)
        if (ended) this.publishParty(ended)
        return null
      }
      move = {...move,elapsed}
    }
    return applyPartyMove(this.party,actor,move,version)
  }
  private sendParty(target?: string) {
    this.send?.({type: 'party-state', sequence: this.partySequence, game: this.party}, target)
  }
  partyCompatible() {
    return !this.party || this.party.data.collectionVersion !== GAME_PROTOCOL || this.party.players.every(id => id === identity.get().deviceId || [...this.peers.values()].some(peer => peer.device === id && peer.games === GAME_PROTOCOL))
  }
  partyReady() {
    const online = new Set([identity.get().deviceId, ...[...this.peers.values()].map(p => p.device)])
    return online.has(this.record.owner) && !!this.party && this.partyCompatible() && this.party.players.every(id => online.has(id))
  }
  startParty(kind: GameKind, players: string[]) {
    if (this.disposed || identity.get().deviceId !== this.record.owner) throw new Error('The group creator starts games.')
    const online = new Set([identity.get().deviceId, ...[...this.peers.values()].map(p => p.device)])
    if (!Array.isArray(players) || !players.includes(this.record.owner) || players.some(id => !online.has(id))) throw new Error('Choose connected players, including the creator.')
    if (players.some(id => id !== identity.get().deviceId && ![...this.peers.values()].some(peer => peer.device === id && peer.games === GAME_PROTOCOL))) throw new Error('All selected players must update the app before starting these games.')
    const next = createPartyGame(kind, players, uid(16))
    this.clearBasketballClock()
    this.party = next
    this.partySequence++
    this.sendParty()
    bump()
  }
  partyMove(move: Record<string, unknown>) {
    if (this.disposed || !this.party || !this.partyReady()) throw new Error('Wait for the creator and all players to reconnect.')
    if (identity.get().deviceId === this.record.owner) {
      const next = this.hostPartyMove(identity.get().deviceId, move, this.party.version)
      if (!next) throw new Error('That move is not allowed. Check the rules and whose turn it is.')
      this.publishParty(next)
    } else {
      const next = applyPartyMove(this.party, identity.get().deviceId, move, this.party.version)
      if (!next) throw new Error('That move is not allowed. Check the rules and whose turn it is.')
      this.send?.({type: 'party-move', gameId: this.party.id, version: this.party.version, move})
    }
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
  async present(stream: MediaStream, title: string) {
    if (!this.room || this.disposed) {stream.getTracks().forEach(track => track.stop()); throw new Error('Connect to the room first.')}
    this.stopPresentation()
    this.presentation = stream; this.presentationTitle = title.slice(0, 80)
    stream.getTracks().forEach(track => track.addEventListener('ended', () => {if (this.presentation === stream) this.stopPresentation()}, {once: true}))
    try {await Promise.all(this.room.addStream(stream, {metadata: {padi: 'presentation', title: this.presentationTitle}})); bump()}
    catch (error) {if (this.presentation === stream) this.stopPresentation(); throw error}
  }
  stopPresentation() {
    const stream = this.presentation; this.presentation = null
    if (stream) {try {this.room?.removeStream(stream)} catch {} stream.getTracks().forEach(track => track.stop()); this.send?.({type: 'presentation-ended'})}
    bump()
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
  async destroy() { this.rejectOpenPigeonPending('The group was closed.'); this.clearBasketballClock(); this.stopPresentation(); this.disposed = true; ++this.connectionGeneration; this.historyTimers.forEach(clearTimeout); this.historyTimers.clear(); this.leaveCall(); await this.room?.leave(); this.room = null; await this.saving }
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
