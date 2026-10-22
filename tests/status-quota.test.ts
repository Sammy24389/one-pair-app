import 'fake-indexeddb/auto'
import {idbDel, idbGet} from '../src/lib/idb'
import {expect, it} from 'vitest'
import {consumeStatusQuota, nextStatusQuota, statusDay, type StatusQuota} from '../src/lib/status-quota'

it('allows ten uploads and preserves the count after reload or deletion', () => {
  const now = new Date(2026, 9, 21, 12).getTime()
  let ledger: StatusQuota | undefined
  for (let i = 0; i < 10; i++) ledger = nextStatusQuota(ledger, now)
  expect(() => nextStatusQuota(JSON.parse(JSON.stringify(ledger)), now, [])).toThrow('10 statuses today')
  expect(nextStatusQuota(ledger, new Date(2026, 9, 22).getTime()).count).toBe(1)
})

it('seeds from existing uploads once per id and uses local calendar midnight', () => {
  const now = new Date(2026, 9, 21, 23, 59).getTime()
  const post = {id: 'one', from: 'me', text: 'hello', ts: now}
  expect(nextStatusQuota(undefined, now, [post, post]).count).toBe(2)
  expect(statusDay(new Date(2026, 9, 22).getTime())).not.toBe(statusDay(now))
})


it('serializes concurrent tab reservations in IndexedDB and retains the saved count', async () => {
  const owner = 'quota-concurrency-test'
  const now = new Date(2026, 9, 21, 12).getTime()
  await idbDel('kv', `status-daily:${owner}`)
  const results = await Promise.allSettled(Array.from({length: 12}, () => consumeStatusQuota(owner, now, [])))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(10)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(2)
  expect((await idbGet<StatusQuota>('kv', `status-daily:${owner}`))?.count).toBe(10)
  await expect(consumeStatusQuota(owner, now, [])).rejects.toThrow('10 statuses today')
  await idbDel('kv', `status-daily:${owner}`)
})
