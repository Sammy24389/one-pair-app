import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import StickerPicker from '../src/components/StickerPicker'
import type {SavedSticker} from '../src/lib/stickers'
const mocks = vi.hoisted(() => ({get: vi.fn(), add: vi.fn(), remove: vi.fn(), pick: vi.fn()}))
vi.mock('../src/lib/stickers', () => ({getStickers: mocks.get, addSticker: mocks.add, removeSticker: mocks.remove, STICKER_ACCEPT: 'image/png,image/jpeg,image/webp'}))
vi.mock('../src/lib/media', () => ({pickFiles: mocks.pick}))
const sticker: SavedSticker = {id: 'one', name: 'Happy cat', blob: new Blob(['image'], {type: 'image/webp'}), w: 64, h: 64}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return {promise, resolve, reject}
}
function setup(onSend = vi.fn(async (_sticker: SavedSticker) => {})) {
  const onClose = vi.fn(), onEmoji = vi.fn()
  const view = render(<StickerPicker onSend={onSend} onClose={onClose} onEmoji={onEmoji} />)
  return {...view, onSend, onClose, onEmoji}
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.get.mockResolvedValue([])
  mocks.pick.mockResolvedValue([])
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:sticker-preview')
    static revokeObjectURL = vi.fn()
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows loading before an empty library and enables image import afterward', async () => {
  const pending = deferred<SavedSticker[]>()
  mocks.get.mockReturnValueOnce(pending.promise)
  setup()
  expect(screen.getByRole('status').textContent).toContain('Loading stickers')
  expect((screen.getByRole('button', {name: 'Add image sticker'}) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { pending.resolve([]) })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText(/Your saved stickers will appear here/)).toBeTruthy()
  expect((screen.getByRole('button', {name: 'Add image sticker'}) as HTMLButtonElement).disabled).toBe(false)
})
it('imports an image into the library and releases its preview URL on unmount', async () => {
  const file = new File(['png'], 'cat.png', {type: 'image/png'})
  mocks.pick.mockResolvedValueOnce([file])
  mocks.add.mockResolvedValueOnce([sticker])
  const view = setup()
  await screen.findByText(/Your saved stickers will appear here/)
  fireEvent.click(screen.getByRole('button', {name: 'Add image sticker'}))
  const preview = await screen.findByAltText('Happy cat')
  expect(preview.getAttribute('src')).toBe('blob:sticker-preview')
  expect(mocks.pick).toHaveBeenCalledWith('image/png,image/jpeg,image/webp')
  expect(mocks.add).toHaveBeenCalledWith(file, 'cat.png')
  expect(URL.createObjectURL).toHaveBeenCalledWith(sticker.blob)
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:sticker-preview')
})
it('shows invalid import errors and enables retry', async () => {
  mocks.pick.mockResolvedValueOnce([new File(['bad'], 'bad.txt')])
  mocks.add.mockRejectedValueOnce(new Error('Choose a PNG, JPEG, or WebP image.'))
  setup()
  await screen.findByText(/Your saved stickers will appear here/)
  fireEvent.click(screen.getByRole('button', {name: 'Add image sticker'}))
  expect((await screen.findByRole('alert')).textContent).toBe('Choose a PNG, JPEG, or WebP image.')
  expect((screen.getByRole('button', {name: 'Add image sticker'}) as HTMLButtonElement).disabled).toBe(false)
})
it('sends only once while awaiting delivery and allows retry after failure', async () => {
  mocks.get.mockResolvedValueOnce([sticker])
  const pending = deferred<void>()
  const send = vi.fn(() => pending.promise)
  setup(send)
  const button = await screen.findByRole('button', {name: 'Send Happy cat'})
  fireEvent.click(button)
  fireEvent.click(button)
  expect(send).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledWith(sticker)
  expect((button as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { pending.reject(new Error('Could not send sticker. Try again.')) })
  expect(screen.getByRole('alert').textContent).toBe('Could not send sticker. Try again.')
  expect((button as HTMLButtonElement).disabled).toBe(false)
  send.mockResolvedValueOnce()
  fireEvent.click(button)
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
})
it('removes a managed sticker without sending it', async () => {
  mocks.get.mockResolvedValueOnce([sticker])
  mocks.remove.mockResolvedValueOnce([])
  const {onSend} = setup()
  fireEvent.click(await screen.findByRole('button', {name: 'Manage'}))
  const send = screen.getByRole('button', {name: 'Send Happy cat'}) as HTMLButtonElement
  expect(send.disabled).toBe(true)
  fireEvent.click(send)
  fireEvent.click(screen.getByRole('button', {name: 'Remove Happy cat'}))
  await screen.findByText(/Your saved stickers will appear here/)
  expect(mocks.remove).toHaveBeenCalledWith('one')
  expect(onSend).not.toHaveBeenCalled()
})
it('surfaces removal storage failures and restores management controls', async () => {
  mocks.get.mockResolvedValueOnce([sticker])
  mocks.remove.mockRejectedValueOnce(new Error('Storage unavailable'))
  setup()
  fireEvent.click(await screen.findByRole('button', {name: 'Manage'}))
  fireEvent.click(screen.getByRole('button', {name: 'Remove Happy cat'}))
  expect((await screen.findByRole('alert')).textContent).toBe('Storage unavailable')
  expect((screen.getByRole('button', {name: 'Remove Happy cat'}) as HTMLButtonElement).disabled).toBe(false)
  expect((screen.getByRole('button', {name: 'Done'}) as HTMLButtonElement).disabled).toBe(false)
})
it('shows library storage read errors and closes with Escape', async () => {
  mocks.get.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
  const {onClose} = setup()
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load stickers')
  fireEvent.keyDown(screen.getByRole('region', {name: 'Sticker library'}), {key: 'Escape'})
  expect(onClose).toHaveBeenCalledOnce()
})
