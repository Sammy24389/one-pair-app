import {afterEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {GroupsCallOverlay} from '../src/screens/Groups'
const fixture = vi.hoisted(() => ({group: {record: {title: 'Friends'}, joining: false, local: null as unknown, remote: new Map<string, unknown>(), peers: new Map(), leaveCall: vi.fn()}}))
vi.mock('../src/lib/groups', () => ({activeGroupCall: () => fixture.group, groupEvents: {use: () => {}}, groupRegistry: {use: () => ({records: []})}}))
vi.mock('../src/components/ui', () => ({TopBar: () => null}))
vi.mock('../src/lib/identity', () => ({identity: {get: () => ({deviceId: 'me'})}}))
afterEach(cleanup)
it('keeps remote playback mounted when minimized and locked', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  fixture.group.local = {getAudioTracks: () => [], getVideoTracks: () => []}
  const remote = {}; fixture.group.remote.set('friend', remote)
  const view = render(<GroupsCallOverlay />)
  const videos = view.container.querySelectorAll('video')
  expect(videos).toHaveLength(2)
  expect(videos[1].srcObject).toBe(remote)
  fireEvent.click(screen.getByRole('button', {name: 'Minimize'}))
  expect(view.container.querySelectorAll('video')[1]).toBe(videos[1])
  view.rerender(<GroupsCallOverlay locked />)
  expect(view.container.querySelectorAll('video')[1]).toBe(videos[1])
  expect(view.container.firstElementChild?.getAttribute('inert')).toBe('')
  expect(view.container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
})

it('keeps all four participant videos visible in a bottom-right grid while chatting', () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  fixture.group.remote.clear()
  fixture.group.local = {getAudioTracks: () => [], getVideoTracks: () => []}
  for (const id of ['Alex', 'Sam', 'Pat']) {
    fixture.group.remote.set(id, {getVideoTracks: () => [{enabled: true, readyState: 'live'}]})
    fixture.group.peers.set(id, {name: id})
  }
  const view = render(<GroupsCallOverlay />)
  const videos = [...view.container.querySelectorAll('video')]
  expect(videos).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', {name: 'Minimize'}))
  expect(view.container.firstElementChild?.classList.contains('call-pip')).toBe(true)
  expect([...view.container.querySelectorAll('video')]).toEqual(videos)
  expect(view.container.querySelector('.group-call-grid')?.getAttribute('style')).toBeNull()
  for (const name of ['You', 'Alex', 'Sam', 'Pat']) expect(screen.getByText(name)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Expand'}))
  expect([...view.container.querySelectorAll('video')]).toEqual(videos)
})
