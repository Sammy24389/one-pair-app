import {joinRoom, type Room} from 'trystero'
import {hmacHex, sha256, sha256Hex, timingSafeEqual} from './crypto'
import {iceServers} from './settings'
import {isValidCode, normalizeCode, randomCode, uid} from './util'

export const GROUP_CODE_LIFETIME = 10 * 60 * 1000
export type HostedGroupCode = {code: string; expiresAt: number; close: () => void}
const hosts = new Map<string, HostedGroupCode>()
const starting = new Map<string, Promise<HostedGroupCode>>()
const revisions = new Map<string, number>()

export function validateGroupCode(raw: string) {
  if (raw.length > 32 || !/^[0-9a-z\s-]+$/i.test(raw)) throw new Error('Enter the 12-character room code.')
  const clean = raw.replace(/[\s-]/g, '')
  if (clean.length !== 12) throw new Error('Enter the full 12-character room code.')
  const code = normalizeCode(clean)
  if (!isValidCode(code)) throw new Error('Enter a valid room code.')
  return code
}
async function codeRoom(code: string, onLeave?: (peerId: string) => void) {
  const key = await sha256('group-code-auth|' + code)
  const roomId = await sha256Hex('group-code-room|' + code)
  const password = await sha256Hex('group-code-sdp|' + code)
  const admitted = new Set<string>()
  let pending = 0
  const room = joinRoom({appId: 'onepair-group-codes-v1', password, rtcConfig: {iceServers: iceServers()}, maxReceiveBytes: 4096}, roomId, {
    handshakeTimeoutMs: 10000,
    onPeerHandshake: async (peerId, send, receive, isInitiator) => {
      if (pending + admitted.size >= 3) throw new Error('This invitation is busy. Try again shortly.')
      pending++
      try {
        const nonce = uid(24)
        await send({nonce})
        const hello = (await receive()).data as {nonce?: unknown}
        if (typeof hello?.nonce !== 'string' || !/^[a-z0-9]{24}$/.test(hello.nonce)) throw new Error('Invalid room code handshake.')
        await send({mac: await hmacHex(key, `${isInitiator ? 'initiator' : 'responder'}|${hello.nonce}|${nonce}`)})
        const proof = (await receive()).data as {mac?: unknown}
        if (typeof proof?.mac !== 'string' || !timingSafeEqual(proof.mac, await hmacHex(key, `${isInitiator ? 'responder' : 'initiator'}|${nonce}|${hello.nonce}`))) throw new Error('Room code verification failed.')
        admitted.add(peerId)
      } finally {pending--}
    }
  })
  room.onPeerLeave = peerId => {admitted.delete(peerId); onLeave?.(peerId)}
  return room
}
export function hostGroupCode(groupId: string, invitation: string): Promise<HostedGroupCode> {
  const pending = starting.get(groupId)
  if (pending) return pending
  if (hosts.size + starting.size >= 12 && !hosts.has(groupId)) return Promise.reject(new Error('Too many open room invitations. Close one first.'))
  const revision = revisions.get(groupId) ?? 0
  const task = startHostingCode(groupId, invitation, revision).finally(() => {
    if (starting.get(groupId) === task) starting.delete(groupId)
  })
  starting.set(groupId, task)
  return task
}
async function startHostingCode(groupId: string, invitation: string, revision: number): Promise<HostedGroupCode> {
  if (invitation.length > 1600 || !invitation.startsWith('PADI-GROUP:')) throw new Error('Invalid room invitation.')
  const existing = hosts.get(groupId)
  if (existing && existing.expiresAt > Date.now()) return existing
  existing?.close()
  const code = randomCode()
  const sent = new Set<string>()
  const room = await codeRoom(code, peerId => sent.delete(peerId))
  if ((revisions.get(groupId) ?? 0) !== revision) {await room.leave(); throw new Error('Room invitation was closed.')}
  const action = room.makeAction<string>('welcome')
  let active = true
  const invitationCode: HostedGroupCode = {code, expiresAt: Date.now() + GROUP_CODE_LIFETIME, close: () => {
    if (!active) return
    active = false
    clearTimeout(timer)
    if (hosts.get(groupId) === invitationCode) hosts.delete(groupId)
    void room.leave().catch(() => {})
  }}
  const timer = setTimeout(invitationCode.close, GROUP_CODE_LIFETIME)
  room.onPeerJoin = peerId => {
    if (!active || sent.has(peerId) || Date.now() >= invitationCode.expiresAt) return
    sent.add(peerId)
    void action.send(invitation, {target: peerId}).catch(() => {})
  }
  hosts.set(groupId, invitationCode)
  return invitationCode
}
export function stopGroupCode(groupId: string) {
  revisions.set(groupId, (revisions.get(groupId) ?? 0) + 1)
  starting.delete(groupId)
  hosts.get(groupId)?.close()
}
export async function redeemGroupCode(raw: string, signal?: AbortSignal): Promise<string> {
  const code = validateGroupCode(raw)
  let room: Room | undefined
  let done = false
  return new Promise<string>((resolve, reject) => {
    const finish = (error?: Error, invitation?: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      void room?.leave().catch(() => {})
      if (error) reject(error)
      else resolve(invitation!)
    }
    const cancel = () => finish(new Error('Joining cancelled.'))
    const timer = setTimeout(() => finish(new Error('Room not found. Check the code and keep the inviter online, or ask for a new code.')), 25000)
    if (signal?.aborted) {cancel(); return}
    signal?.addEventListener('abort', cancel, {once: true})
    void codeRoom(code).then(value => {
      room = value
      if (done) {void room.leave().catch(() => {}); return}
      const action = room.makeAction<string>('welcome')
      action.onMessage = invitation => {
        if (typeof invitation === 'string' && invitation.length <= 1600 && invitation.startsWith('PADI-GROUP:')) finish(undefined, invitation)
      }
    }).catch(error => finish(error instanceof Error ? error : new Error('Could not join the room.')))
  })
}
