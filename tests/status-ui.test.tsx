import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import type {Space} from '../src/lib/space'
import type {ReactNode} from 'react'
import * as Y from 'yjs'
import Status from '../src/screens/Status'
import {postStatus, STATUS_LIFETIME, type StatusRecord} from '../src/lib/status'

const mocks = vi.hoisted(() => ({space: null as Space | null, others: [] as Space[], ids: ['one'], pick: vi.fn(), store: vi.fn(), url: null as string | null}))
vi.mock('../src/lib/spaces', () => ({allSpaces: () => [mocks.space!, ...mocks.others], useSpaceIds: () => mocks.ids}))
vi.mock('../src/lib/media', () => ({pickFiles: mocks.pick}))
vi.mock('../src/lib/idb', () => ({putMedia: mocks.store}))
vi.mock('../src/components/ui', () => ({useMediaUrl: () => mocks.url, TopBar: ({title, sub}: {title: ReactNode; sub: ReactNode}) => <header><h1>{title}</h1><p>{sub}</p></header>}))
function makeSpace(peer = 'peer', name = 'Sam') {
  const statuses = new Y.Doc().getMap<StatusRecord>('statuses')
  return {statuses, me: 'me', peer, ready: Promise.resolve(), peerProfile: () => ({name}), subscribe: (listener: () => void) => {
    statuses.observe(listener)
    return () => statuses.unobserve(listener)
  }} as unknown as Space
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
  mocks.space = makeSpace()
  mocks.others = []
  mocks.pick.mockReset()
  mocks.store.mockReset().mockResolvedValue(undefined)
  mocks.url = null
  vi.stubGlobal('URL', {createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn()})
})
afterEach(() => { cleanup(); [mocks.space!, ...mocks.others].forEach(s => s.statuses.doc?.destroy()); vi.useRealTimers(); vi.unstubAllGlobals() })

it('labels the composer accessibly and disables publishing empty or whitespace updates', () => {
  render(<Status />)
  const input = screen.getByRole('textbox', {name: 'Your update'}) as HTMLTextAreaElement
  const share = screen.getByRole('button', {name: 'Share status'}) as HTMLButtonElement
  expect(input.maxLength).toBe(500)
  expect(input.getAttribute('aria-describedby')).toBe('status-count')
  expect(share.disabled).toBe(true)
  expect(screen.getByText('No active statuses. Share the first update.')).toBeTruthy()
  fireEvent.change(input, {target: {value: '   '}})
  expect(share.disabled).toBe(true)
})

it('publishes a trimmed update to the real Yjs map and clears the composer', async () => {
  render(<Status />)
  const input = screen.getByRole('textbox', {name: 'Your update'}) as HTMLTextAreaElement
  fireEvent.change(input, {target: {value: '  Good morning  '}})
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Share status'})) })
  const updates = [...mocks.space!.statuses.values()]
  expect(updates).toHaveLength(1)
  expect(updates[0]).toMatchObject({from: 'me', text: 'Good morning', ts: Date.now()})
  expect(screen.getByText('Good morning')).toBeTruthy()
  expect(input.value).toBe('')
  expect(screen.getByRole('status').textContent).toContain('It will sync when your paired users connect')
})

it('only offers deletion for the local update and preserves the paired person update', () => {
  const own = postStatus(mocks.space!.statuses, 'me', 'Mine')
  const peer = postStatus(mocks.space!.statuses, 'peer', 'From Sam')
  render(<Status />)
  expect(screen.getAllByRole('button', {name: 'Delete'})).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', {name: 'Delete'}))
  expect(mocks.space!.statuses.get(own.id)).toBeUndefined()
  expect(mocks.space!.statuses.get(peer.id)).toEqual(peer)
  expect(screen.queryByText('Mine')).toBeNull()
  expect(screen.getByText('From Sam')).toBeTruthy()
})

it('shows the active-limit error and keeps the draft for correction', async () => {
  for (let i = 0; i < 5; i++) postStatus(mocks.space!.statuses, 'me', `Update ${i}`)
  render(<Status />)
  const input = screen.getByRole('textbox', {name: 'Your update'}) as HTMLTextAreaElement
  fireEvent.change(input, {target: {value: 'One too many'}})
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Share status'})) })
  expect(screen.getByRole('alert').textContent).toContain('5 active statuses')
  expect(input.value).toBe('One too many')
  expect(mocks.space!.statuses.size).toBe(5)
})

it('expires updates on the open screen and cleans up the refresh timer', () => {
  postStatus(mocks.space!.statuses, 'me', 'Almost expired', Date.now() - STATUS_LIFETIME + 500)
  const view = render(<Status />)
  expect(screen.getByText('Almost expired')).toBeTruthy()
  act(() => { vi.advanceTimersByTime(1000) })
  expect(screen.queryByText('Almost expired')).toBeNull()
  expect(mocks.space!.statuses.size).toBe(0)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('shows every paired person and deduplicates own shared posts', () => {
  const other = makeSpace('lee', 'Lee')
  mocks.others = [other]
  postStatus(mocks.space!.statuses, 'peer', 'Sam update')
  postStatus(other.statuses, 'lee', 'Lee update')
  const own = postStatus(mocks.space!.statuses, 'me', 'Shared once')
  other.statuses.set(own.id, own)
  render(<Status />)
  expect(screen.getByText('Sam update')).toBeTruthy()
  expect(screen.getByText('Lee update')).toBeTruthy()
  expect(screen.getAllByText('Shared once')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', {name: 'Delete'}))
  expect(other.statuses.get(own.id)).toBeUndefined()
})

it('shares a photo without a caption to every current pair and clears its preview', async () => {
  mocks.others = [makeSpace('lee', 'Lee')]
  const file = new File(['photo'], 'photo.png', {type: 'image/png'})
  mocks.pick.mockResolvedValue([file])
  render(<Status />)
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Add photo or video'})) })
  expect(screen.getByAltText('Selected photo preview')).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Share status'})) })
  const first = [...mocks.space!.statuses.values()][0]
  expect(first).toMatchObject({kind: 'image', text: '', mime: 'image/png', size: 5})
  expect([...mocks.others[0].statuses.values()]).toEqual([first])
  expect(mocks.store).toHaveBeenCalledTimes(1)
  expect(screen.queryByAltText('Selected photo preview')).toBeNull()
  expect(screen.getByText(/Waiting for media/)).toBeTruthy()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
})

it('preserves the draft after storage failure, rejects invalid files and handles cancelled selection', async () => {
  mocks.pick.mockResolvedValueOnce([]).mockResolvedValueOnce([new File(['bad'], 'bad.svg', {type: 'image/svg+xml'})]).mockResolvedValueOnce([new File(['video'], 'clip.mp4', {type: 'video/mp4'})])
  render(<Status />)
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Add photo or video'})) })
  expect(screen.queryByRole('alert')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Add photo or video'})) })
  expect(screen.getByRole('alert').textContent).toContain('10 MB')
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Add photo or video'})) })
  expect(screen.getByLabelText('Selected video preview')).toBeTruthy()
  mocks.store.mockRejectedValueOnce(new Error('Storage full'))
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Share status'})) })
  expect(screen.getByRole('alert').textContent).toBe('Storage full')
  expect(mocks.space!.statuses.size).toBe(0)
  expect(screen.getByLabelText('Selected video preview')).toBeTruthy()
})

it('plays received videos with controls without autoplay and exposes a playback retry', () => {
  mocks.url = 'blob:received'
  postStatus(mocks.space!.statuses, 'peer', '', Date.now(), {kind: 'video', mediaId: 'video', mime: 'video/mp4', size: 5})
  render(<Status />)
  const video = screen.getByLabelText('Status video') as HTMLVideoElement
  expect(video.controls).toBe(true)
  expect(video.autoplay).toBe(false)
  fireEvent.error(video)
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Retry media'}))
  expect(screen.getByLabelText('Status video')).toBeTruthy()
})
