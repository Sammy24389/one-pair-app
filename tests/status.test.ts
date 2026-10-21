import {describe, expect, it} from 'vitest'
import * as Y from 'yjs'
import {activeStatuses, postStatus, pruneStatuses, removeStatus, validStatus, STATUS_LIFETIME, type StatusRecord} from '../src/lib/status'

const now = STATUS_LIFETIME * 2
const create = () => new Y.Doc().getMap<StatusRecord>('statuses')

describe('private pair statuses', () => {
  it('trims updates, expires at exactly 24 hours, and rejects future timestamps', () => {
    const statuses = create()
    const status = postStatus(statuses, 'me', '  Hello  ', now)
    expect(status.text).toBe('Hello')
    expect(activeStatuses(statuses, ['me'], now - 1)).toEqual([])
    expect(activeStatuses(statuses, ['me'], now + STATUS_LIFETIME - 1)).toEqual([status])
    expect(activeStatuses(statuses, ['me'], now + STATUS_LIFETIME)).toEqual([])
  })
  it('rejects empty, oversized, and invalid owner or clock inputs', () => {
    const statuses = create()
    for (const text of ['', '   ', 'x'.repeat(501)]) expect(() => postStatus(statuses, 'me', text, now)).toThrow()
    expect(() => postStatus(statuses, '', 'Hi', now)).toThrow()
    expect(() => postStatus(statuses, 'me', 'Hi', NaN)).toThrow()
    expect(() => postStatus(statuses, 'me', 'x'.repeat(500), now)).not.toThrow()
  })
  it('enforces five active statuses per owner and frees slots after deletion or expiry', () => {
    const statuses = create()
    const first = postStatus(statuses, 'me', 'first', now)
    for (let i = 0; i < 4; i++) postStatus(statuses, 'me', `Update ${i}`, now)
    expect(() => postStatus(statuses, 'me', 'sixth', now)).toThrow('5 active')
    expect(() => postStatus(statuses, 'peer', 'independent', now)).not.toThrow()
    removeStatus(statuses, 'me', first.id)
    expect(() => postStatus(statuses, 'me', 'replacement', now)).not.toThrow()
    expect(() => postStatus(statuses, 'me', 'tomorrow', now + STATUS_LIFETIME)).not.toThrow()
    expect(activeStatuses(statuses, ['me'], now + STATUS_LIFETIME)).toHaveLength(1)
  })
  it('does not delete or prune another owner statuses', () => {
    const statuses = create()
    const peer = postStatus(statuses, 'peer', 'Private pair update', now)
    expect(removeStatus(statuses, 'me', peer.id)).toBe(false)
    pruneStatuses(statuses, 'me', now + STATUS_LIFETIME)
    expect(statuses.get(peer.id)).toEqual(peer)
    expect(removeStatus(statuses, 'peer', peer.id)).toBe(true)
  })
  it('ignores malformed and unknown-owner synchronized values', () => {
    const statuses = create()
    statuses.set('bad', {id: 'bad', from: 'me', text: '', ts: now})
    postStatus(statuses, 'stranger', 'not a pair member', now)
    expect(activeStatuses(statuses, ['me', 'peer'], now)).toEqual([])
    expect(validStatus(null)).toBe(false)
    expect(validStatus({id:'x',from:'me',text:'Hello',ts:Infinity})).toBe(false)
  })
  it('synchronizes an offline update and later deletion through the actual Yjs document', () => {
    const first = new Y.Doc(), second = new Y.Doc()
    const a = first.getMap<StatusRecord>('statuses'), b = second.getMap<StatusRecord>('statuses')
    const status = postStatus(a, 'me', 'Offline update', now)
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
    expect(activeStatuses(b, ['me'], now)).toEqual([status])
    removeStatus(a, 'me', status.id)
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
    expect(activeStatuses(b, ['me'], now)).toEqual([])
  })
})
