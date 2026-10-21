import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import type {ReactNode} from 'react'
import * as Y from 'yjs'
import Status from '../src/screens/Status'
import {postStatus, STATUS_LIFETIME, type StatusRecord} from '../src/lib/status'

const mocks = vi.hoisted(() => ({space: null as null | {
  statuses: Y.Map<StatusRecord>; me: string; peer: string; peerProfile: () => {name: string}
}}))
vi.mock('../src/lib/spaces', () => ({useActiveSpace: () => mocks.space, useSpaceVersion: () => 0}))
vi.mock('../src/components/ui', () => ({TopBar: ({title, sub}: {title: ReactNode; sub: ReactNode}) => <header><h1>{title}</h1><p>{sub}</p></header>}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
  mocks.space = {statuses: new Y.Doc().getMap<StatusRecord>('statuses'), me: 'me', peer: 'peer', peerProfile: () => ({name: 'Sam'})}
})
afterEach(() => { cleanup(); mocks.space?.statuses.doc?.destroy(); vi.useRealTimers() })

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

it('publishes a trimmed update to the real Yjs map and clears the composer', () => {
  render(<Status />)
  const input = screen.getByRole('textbox', {name: 'Your update'}) as HTMLTextAreaElement
  fireEvent.change(input, {target: {value: '  Good morning  '}})
  fireEvent.click(screen.getByRole('button', {name: 'Share status'}))
  const updates = [...mocks.space!.statuses.values()]
  expect(updates).toHaveLength(1)
  expect(updates[0]).toMatchObject({from: 'me', text: 'Good morning', ts: Date.now()})
  expect(screen.getByText('Good morning')).toBeTruthy()
  expect(input.value).toBe('')
  expect(screen.getByRole('status').textContent).toContain('It will sync when your pair connects')
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

it('shows the active-limit error and keeps the draft for correction', () => {
  for (let i = 0; i < 5; i++) postStatus(mocks.space!.statuses, 'me', `Update ${i}`)
  render(<Status />)
  const input = screen.getByRole('textbox', {name: 'Your update'}) as HTMLTextAreaElement
  fireEvent.change(input, {target: {value: 'One too many'}})
  fireEvent.click(screen.getByRole('button', {name: 'Share status'}))
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
