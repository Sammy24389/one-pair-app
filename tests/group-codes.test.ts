import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {joinRoom, type Room} from 'trystero'
import {hostGroupCode, redeemGroupCode, stopGroupCode, validateGroupCode, GROUP_CODE_LIFETIME} from '../src/lib/group-codes'
import {sha256} from '../src/lib/crypto'
vi.mock('trystero', () => ({joinRoom: vi.fn()}))
vi.mock('../src/lib/settings', () => ({iceServers: () => []}))
vi.mock('../src/lib/crypto', () => ({sha256: vi.fn(async () => new Uint8Array(32)), sha256Hex: async (value:string) => 'hash:' + value, hmacHex: async (_key:unknown,value:string) => value, timingSafeEqual: (a:string,b:string) => a===b}))
vi.mock('../src/lib/util', async () => {const actual=await vi.importActual<typeof import('../src/lib/util')>('../src/lib/util');return {...actual,uid: () => 'a'.repeat(24),randomCode: () => 'ABCD-EFGH-JKMP'}})
function newRoom() {
  const action={send:vi.fn(async (_payload:string,_options?:unknown) => {}),onMessage:(_payload:string) => {}}
  return {action,makeAction:vi.fn(() => action),leave:vi.fn(async () => {}),onPeerJoin:(_id:string)=>{},onPeerLeave:(_id:string)=>{}}
}
const rooms: ReturnType<typeof newRoom>[]=[]
beforeEach(() => {vi.useFakeTimers();rooms.length=0;vi.mocked(sha256).mockResolvedValue(new Uint8Array(32));vi.mocked(joinRoom).mockImplementation(()=>{const room=newRoom();rooms.push(room);return room as unknown as Room})})
afterEach(() => {stopGroupCode('room123456');stopGroupCode('pending123456');vi.clearAllTimers();vi.useRealTimers();vi.clearAllMocks()})
it('accepts a complete human code and rejects truncated, overlong or invalid codes', () => {
  expect(validateGroupCode('abcd efgh jkmp')).toBe('ABCD-EFGH-JKMP')
  for(const code of ['ABCD','ABCD-EFGH-JKMP-AAAA','<script>','UUUU-UUUU-UUUU']) expect(()=>validateGroupCode(code)).toThrow()
  expect(joinRoom).not.toHaveBeenCalled()
})
it('shares a bounded invitation, reuses its code and closes automatically on expiry', async () => {
  const host=await hostGroupCode('room123456','PADI-GROUP:private-invite')
  expect(host.code).toBe('ABCD-EFGH-JKMP')
  expect((await hostGroupCode('room123456','PADI-GROUP:private-invite'))).toBe(host)
  expect(rooms).toHaveLength(1)
  rooms[0].onPeerJoin('friend');rooms[0].onPeerJoin('friend')
  expect(rooms[0].action.send).toHaveBeenCalledExactlyOnceWith('PADI-GROUP:private-invite',{target:'friend'})
  await vi.advanceTimersByTimeAsync(GROUP_CODE_LIFETIME)
  expect(rooms[0].leave).toHaveBeenCalledOnce()
  rooms[0].onPeerJoin('late');expect(rooms[0].action.send).toHaveBeenCalledOnce()
})
it('joins using the same code room and tears down guest signaling after receiving an invitation', async () => {
  const host=await hostGroupCode('room123456','PADI-GROUP:private-invite')
  const joining=redeemGroupCode(host.code)
  await vi.advanceTimersByTimeAsync(0)
  expect(rooms).toHaveLength(2)
  expect(vi.mocked(joinRoom).mock.calls[0][1]).toBe(vi.mocked(joinRoom).mock.calls[1][1])
  rooms[1].action.onMessage('PADI-GROUP:private-invite')
  await expect(joining).resolves.toBe('PADI-GROUP:private-invite')
  expect(rooms[1].leave).toHaveBeenCalledOnce()
  expect(rooms[0].leave).not.toHaveBeenCalled()
})
it('times out invalid/unavailable invitations and never accepts oversized peer payloads', async () => {
  const pending=redeemGroupCode('ABCD-EFGH-JKMP').catch(error=>error as Error)
  await vi.advanceTimersByTimeAsync(0)
  rooms[0].action.onMessage('wrong');rooms[0].action.onMessage('PADI-GROUP:'+'x'.repeat(1601))
  await vi.advanceTimersByTimeAsync(25000)
  expect(((await pending) as Error).message).toContain('Room not found')
  expect(rooms[0].leave).toHaveBeenCalledOnce()
})
it('cancels a pending invitation without leaking a room and coalesces duplicate setup', async () => {
  let release!:(value:Uint8Array<ArrayBuffer>)=>void
  vi.mocked(sha256).mockReturnValueOnce(new Promise<Uint8Array<ArrayBuffer>>(resolve=>{release=resolve}))
  const pending=hostGroupCode('pending123456','PADI-GROUP:private-invite')
  expect(hostGroupCode('pending123456','PADI-GROUP:private-invite')).toBe(pending)
  const result=pending.catch(error=>error as Error)
  stopGroupCode('pending123456');release(new Uint8Array(32))
  expect(((await result) as Error).message).toContain('closed')
  expect(rooms[0].leave).toHaveBeenCalledOnce()
})
it('rejects reflected challenge proofs and frees the admission slot', async () => {
  await hostGroupCode('room123456','PADI-GROUP:private-invite')
  const handshake=vi.mocked(joinRoom).mock.calls[0][2]!.onPeerHandshake!
  const sent:Record<string,string>[]=[]
  const send=vi.fn(async (value:unknown)=>{sent.push(value as Record<string,string>)})
  let step=0
  const receive=vi.fn(async()=>({data:++step===1?{nonce:'a'.repeat(24)}:sent[1]}))
  await expect(handshake('attacker',send,receive,true)).rejects.toThrow('verification')
  const legitimate=vi.fn().mockResolvedValueOnce({data:{nonce:'b'.repeat(24)}}).mockResolvedValueOnce({data:{mac:'responder|'+'a'.repeat(24)+'|'+'b'.repeat(24)}})
  await expect(handshake('friend',send,legitimate,true)).resolves.toBeUndefined()
})

it('aborts guest discovery and ignores an invitation arriving after cancellation', async () => {
  const controller = new AbortController()
  const result = redeemGroupCode('ABCD-EFGH-JKMP', controller.signal).catch(error => error as Error)
  await vi.advanceTimersByTimeAsync(0)
  controller.abort()
  rooms[0].action.onMessage('PADI-GROUP:late-invite')
  expect(((await result) as Error).message).toContain('cancelled')
  expect(rooms[0].leave).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
