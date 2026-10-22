import {afterEach, expect, it, vi} from 'vitest'
import * as Y from 'yjs'
import type {Space} from '../src/lib/space'
import {shareStatus, statusFeed, deleteSharedStatus} from '../src/lib/status-feed'
import {postStatus, type StatusRecord} from '../src/lib/status'

const storage = vi.hoisted(() => ({put: vi.fn(async () => {}), del: vi.fn(async () => {}), quota: undefined as {day: string; count: number} | undefined}))
vi.mock('../src/lib/idb', () => ({putMedia: storage.put, idbDel: storage.del, idbUpdate: async (_store: string, _key: string, fn: (current: typeof storage.quota) => typeof storage.quota) => {storage.quota = fn(storage.quota); return storage.quota}}))
const docs: Y.Doc[] = []
function space(peer: string) {
  const doc = new Y.Doc(); docs.push(doc)
  return {me:'me',peer,statuses:doc.getMap<StatusRecord>('statuses'),ready:Promise.resolve(),peerProfile:() => ({name:peer})} as unknown as Space
}
afterEach(() => { docs.forEach(d => d.destroy()); docs.length=0; storage.put.mockClear(); storage.del.mockClear(); storage.quota = undefined })

it('publishes matching records to all current pairs, deduplicates own copies and does not relay peer posts', async () => {
  const sam=space('sam'), lee=space('lee')
  postStatus(sam.statuses,'sam','Sam private')
  postStatus(lee.statuses,'lee','Lee private')
  await shareStatus([sam,lee],'Shared with both')
  expect(statusFeed([sam,lee]).map(x=>x.status.text).sort()).toEqual(['Lee private','Sam private','Shared with both'])
  expect([...sam.statuses.values()].some(x=>x.from==='lee')).toBe(false)
  expect([...lee.statuses.values()].some(x=>x.from==='sam')).toBe(false)
  const own=statusFeed([sam,lee]).find(x=>x.own)!.status
  deleteSharedStatus([sam,lee],own.id)
  expect(statusFeed([sam,lee])).toHaveLength(2)
})

it('checks capacity for every recipient before writing to any pair or storing media', async () => {
  const sam=space('sam'), lee=space('lee')
  for(let i=0;i<20;i++) postStatus(lee.statuses,'me',`Existing ${i}`)
  await expect(shareStatus([sam,lee],'',new File(['photo'],'photo.png',{type:'image/png'}))).rejects.toThrow('20 active')
  expect(sam.statuses.size).toBe(0)
  expect(storage.put).not.toHaveBeenCalled()
})

it('rejects unsupported files before storing or publishing, and requires an existing pair', async () => {
  const sam=space('sam')
  await expect(shareStatus([sam],'',new File(['x'],'x.svg',{type:'image/svg+xml'}))).rejects.toThrow('10 MB')
  await expect(shareStatus([],'Hi')).rejects.toThrow('Pair with someone')
  expect(sam.statuses.size).toBe(0)
  expect(storage.put).not.toHaveBeenCalled()
})

it('stores one video for all pairs and synchronizes its reference through real Yjs updates', async () => {
  const sam=space('sam'), lee=space('lee')
  await shareStatus([sam,lee],'Clip',new File(['video'],'clip.webm',{type:'video/webm'}))
  expect(storage.put).toHaveBeenCalledTimes(1)
  const remote=new Y.Doc(); docs.push(remote)
  Y.applyUpdate(remote,Y.encodeStateAsUpdate(sam.doc ?? sam.statuses.doc!))
  expect([...remote.getMap('statuses').values()]).toEqual([...lee.statuses.values()])
  expect([...sam.statuses.values()][0]).toMatchObject({kind:'video',mime:'video/webm',size:5})
})


it('does not refund deleted daily uploads and removes unpublished media when quota rejects', async () => {
  const sam = space('sam')
  for (let i = 0; i < 10; i++) {
    await shareStatus([sam], `Update ${i}`)
    deleteSharedStatus([sam], [...sam.statuses.values()][0].id)
  }
  await expect(shareStatus([sam], '', new File(['photo'], 'photo.png', {type: 'image/png'}))).rejects.toThrow('10 statuses today')
  expect(sam.statuses.size).toBe(0)
  expect(storage.del).toHaveBeenCalledWith('media', expect.stringMatching(/^status-/))
})
