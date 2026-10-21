import {afterEach, describe, expect, it, vi} from 'vitest'
import {createReachability, type RecoveryTarget} from '../src/lib/reachability'

afterEach(() => vi.useRealTimers())
const target = (changes: Partial<RecoveryTarget> = {}): RecoveryTarget => ({id: 'pair', online: false, busy: false, reconnect: vi.fn(async () => {}), ...changes})

describe('bounded peer recovery', () => {
  it('retries failures with jitter and stops after six attempts', async () => {
    vi.useFakeTimers()
    const peer = target({reconnect: vi.fn(async () => { throw new Error('offline peer') })})
    const recovery = createReachability({targets: () => [peer], networkOnline: () => true, random: () => 0})
    recovery.wake()
    await vi.advanceTimersByTimeAsync(250)
    expect(peer.reconnect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(peer.reconnect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(peer.reconnect).toHaveBeenCalledTimes(2)
    await vi.runAllTimersAsync()
    expect(peer.reconnect).toHaveBeenCalledTimes(6)
    recovery.wake()
    await vi.advanceTimersByTimeAsync(250)
    expect(peer.reconnect).toHaveBeenCalledTimes(7)
    recovery.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses while offline and resumes on a fresh network event', async () => {
    vi.useFakeTimers()
    let online = false
    const peer = target()
    const recovery = createReachability({targets: () => [peer], networkOnline: () => online})
    recovery.wake()
    await vi.runAllTimersAsync()
    expect(peer.reconnect).not.toHaveBeenCalled()
    online = true
    recovery.wake()
    await vi.advanceTimersByTimeAsync(250)
    expect(peer.reconnect).toHaveBeenCalledOnce()
    online = false
    recovery.offline()
    await vi.runAllTimersAsync()
    expect(peer.reconnect).toHaveBeenCalledOnce()
    recovery.dispose()
  })

  it('skips healthy peers and every stage of a call', async () => {
    vi.useFakeTimers()
    const healthy = target({online: true})
    const call = target({id: 'call', busy: true})
    const missing = target({id: 'missing'})
    const recovery = createReachability({targets: () => [healthy, call, missing], networkOnline: () => true})
    recovery.wake()
    await vi.advanceTimersByTimeAsync(250)
    expect(healthy.reconnect).not.toHaveBeenCalled()
    expect(call.reconnect).not.toHaveBeenCalled()
    expect(missing.reconnect).toHaveBeenCalledOnce()
    missing.online = true
    await vi.runAllTimersAsync()
    expect(missing.reconnect).toHaveBeenCalledOnce()
    recovery.dispose()
  })

  it('coalesces repeated resume events and cleans pending timers on disposal', async () => {
    vi.useFakeTimers()
    const peer = target()
    const recovery = createReachability({targets: () => [peer], networkOnline: () => true})
    recovery.wake(); recovery.wake(); recovery.wake()
    await vi.advanceTimersByTimeAsync(250)
    expect(peer.reconnect).toHaveBeenCalledOnce()
    recovery.dispose()
    recovery.wake()
    await vi.runAllTimersAsync()
    expect(peer.reconnect).toHaveBeenCalledOnce()
  })

  it('does not overlap in-flight recovery when more wake events arrive', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    const peer = target({reconnect: vi.fn(() => new Promise<void>(resolve => { finish = resolve }))})
    const recovery = createReachability({targets: () => [peer], networkOnline: () => true})
    recovery.wake()
    await vi.advanceTimersByTimeAsync(250)
    recovery.wake(); recovery.wake()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(peer.reconnect).toHaveBeenCalledOnce()
    finish()
    await vi.advanceTimersByTimeAsync(250)
    expect(peer.reconnect).toHaveBeenCalledTimes(2)
    recovery.dispose()
    finish()
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })
})
