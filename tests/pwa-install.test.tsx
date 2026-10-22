import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import InstallPrompt, {InstallSettingsRow} from '../src/components/InstallPrompt'
import {dismissInstall, installPwa, openInstallHelp, pwaInstall} from '../src/lib/pwa-install'

const environment = vi.hoisted(() => ({native: false}))
vi.mock('../src/lib/platform', () => ({get isNative() {return environment.native}}))
let standalone = false
beforeEach(() => {
  localStorage.clear()
  environment.native = false
  standalone = false
  vi.stubGlobal('matchMedia', () => ({matches: standalone, addEventListener: vi.fn()}))
  window.dispatchEvent(new Event('appinstalled'))
  pwaInstall.set({installed: false, available: false, dismissed: false, expanded: false, busy: false, message: ''})
})
afterEach(() => {cleanup(); vi.unstubAllGlobals()})
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn(async () => {})
  const event = new Event('beforeinstallprompt', {cancelable: true})
  Object.assign(event, {prompt, userChoice: Promise.resolve({outcome})})
  act(() => {window.dispatchEvent(event)})
  return {prompt, event}
}

it('leaves browser access optional and opens manual guidance without an install event', () => {
  render(<InstallPrompt />)
  expect(screen.getByRole('button', {name: 'Continue in browser'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'How to install'}))
  expect(screen.getByText(/Open your browser menu/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name: 'Continue in browser'}))
  expect(screen.queryByRole('complementary')).toBeNull()
  expect(localStorage.getItem('onepair.install-dismissed')).toBe('1')
})

it('uses the actual deferred event exactly once after a user click and waits for install confirmation', async () => {
  render(<InstallPrompt />)
  const {prompt, event} = offer()
  expect(event.defaultPrevented).toBe(true)
  expect(prompt).not.toHaveBeenCalled()
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Install OnePair'}))})
  expect(prompt).toHaveBeenCalledOnce()
  expect(pwaInstall.get().installed).toBe(false)
  expect(pwaInstall.get().dismissed).toBe(true)
  await act(async () => {await installPwa()})
  expect(prompt).toHaveBeenCalledOnce()
  act(() => {window.dispatchEvent(new Event('appinstalled'))})
  expect(pwaInstall.get().installed).toBe(true)
})

it('shows cancellation or failure guidance and permits future browser offers', async () => {
  render(<InstallPrompt />)
  offer('dismissed')
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Install OnePair'}))})
  expect(screen.getByRole('status').textContent).toContain('cancelled')
  const {prompt} = offer()
  prompt.mockRejectedValueOnce(new Error('blocked'))
  await act(async () => {fireEvent.click(screen.getByRole('button', {name: 'Install OnePair'}))})
  expect(screen.getByRole('status').textContent).toContain('could not open installation')
  expect(pwaInstall.get().busy).toBe(false)
})

it('reopens persisted dismissal from Settings without forcing an installer', () => {
  dismissInstall()
  render(<><InstallSettingsRow /><InstallPrompt /></>)
  expect(screen.queryByRole('complementary')).toBeNull()
  fireEvent.click(screen.getByRole('button', {name: 'Install app'}))
  expect(screen.getByRole('complementary', {name: 'Install OnePair'})).toBeTruthy()
  expect(screen.getByText(/Open your browser menu/)).toBeTruthy()
})

it('provides iPhone manual instructions and hides when suppressed or installed', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone Safari')
  openInstallHelp()
  const view = render(<InstallPrompt />)
  expect(screen.getByText('Open this page in Safari.')).toBeTruthy()
  expect(screen.getByText(/Tap Share, then Add to Home Screen/)).toBeTruthy()
  view.rerender(<InstallPrompt suppressed />)
  expect(screen.queryByRole('complementary')).toBeNull()
  act(() => {pwaInstall.set({installed: true})})
  view.rerender(<InstallPrompt />)
  expect(screen.queryByRole('complementary')).toBeNull()
})

it.each(['native', 'standalone'])('does not intercept installation or launch the chooser in %s mode', async mode => {
  environment.native = mode === 'native'
  standalone = mode === 'standalone'
  const {prompt, event} = offer()
  expect(event.defaultPrevented).toBe(false)
  await installPwa()
  expect(prompt).not.toHaveBeenCalled()
  openInstallHelp()
  expect(pwaInstall.get().expanded).toBe(false)
})
