import {useSyncExternalStore} from 'react'

/** Minimal observable store, optionally persisted to localStorage. */
export const createStore = <T extends object>(initial: T, persistKey?: string) => {
  let state: T = initial
  if (persistKey) {
    try {
      const raw = localStorage.getItem(persistKey)
      if (raw) state = {...initial, ...JSON.parse(raw)}
    } catch {
      /* corrupted – fall back to defaults */
    }
  }
  const subs = new Set<() => void>()
  const get = () => state
  const set = (patch: Partial<T> | ((s: T) => Partial<T>)) => {
    const p = typeof patch === 'function' ? patch(state) : patch
    state = {...state, ...p}
    if (persistKey) {
      try {
        localStorage.setItem(persistKey, JSON.stringify(state))
      } catch {
        /* quota */
      }
    }
    subs.forEach(f => f())
  }
  const subscribe = (f: () => void) => {
    subs.add(f)
    return () => subs.delete(f)
  }
  function use(): T
  function use<S>(sel: (s: T) => S): S
  function use<S>(sel?: (s: T) => S) {
    return useSyncExternalStore(subscribe, () => (sel ? sel(state) : state))
  }
  return {get, set, subscribe, use}
}
