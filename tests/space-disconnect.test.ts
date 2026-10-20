import {expect, it, vi} from 'vitest'
import {Space} from '../src/lib/space'

it('ends media capture before leaving the connection when a user reconnects', async () => {
  const events: string[] = []
  const hangup = vi.fn(() => events.push('hangup'))
  const leave = vi.fn(async () => {events.push('leave')})
  const bump = vi.fn()
  const space = Object.assign(Object.create(Space.prototype), {
    call: {hangup}, room: {leave}, peerId: 'peer', conn: 'online', bump
  }) as Space
  await space.disconnect()
  expect(events).toEqual(['hangup','leave'])
  expect(space.peerId).toBeNull()
  expect(space.conn).toBe('offline')
  expect(bump).toHaveBeenCalledOnce()
})
