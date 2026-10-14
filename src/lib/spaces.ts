import {useSyncExternalStore} from 'react'
import {identity, type PairRecord} from './identity'
import {settings} from './settings'
import {Space} from './space'
import {createStore} from './store'

const spaces = new Map<string, Space>()
const registry = createStore({ids: [] as string[]})
const hooks = new Set<(s: Space) => void>()

/** Register a hook run once for every space (notifications, nudges, …). */
export const onSpaceCreated = (f: (s: Space) => void) => {
  hooks.add(f)
  spaces.forEach(f)
}

const ensure = (p: PairRecord) => {
  let s = spaces.get(p.id)
  if (!s) {
    s = new Space(p)
    spaces.set(p.id, s)
    const space = s
    space.ready.then(() => {
      // Keep our profile in the shared doc up to date.
      const prof = identity.get().profile
      const cur = space.profiles.get(space.me)
      if (!cur || cur.name !== prof.name || cur.emoji !== prof.emoji || cur.avatar !== prof.avatar) space.publishProfile(prof)
      space.connect()
    })
    hooks.forEach(f => f(space))
  }
  return s
}

export const syncSpaces = () => {
  const pairs = identity.get().pairs
  pairs.forEach(p => {
    const s = ensure(p)
    if (s.pair.peerDevice !== p.peerDevice) s.updatePair(p)
  })
  for (const [id, s] of spaces) {
    if (!pairs.some(p => p.id === id)) {
      spaces.delete(id)
      s.destroy()
    }
  }
  const ids = pairs.map(p => p.id)
  registry.set({ids})
  if (!ids.includes(settings.get().activePairId)) settings.set({activePairId: ids[0] ?? ''})
}

identity.subscribe(() => {
  const ids = identity.get().pairs.map(p => p.id).join()
  const stale = identity.get().pairs.some(p => spaces.get(p.id) && spaces.get(p.id)!.pair.peerDevice !== p.peerDevice)
  if (stale || ids !== registry.get().ids.join()) syncSpaces()
  // propagate profile edits
  const prof = identity.get().profile
  spaces.forEach(s => {
    const cur = s.profiles.get(s.me)
    if (cur && (cur.name !== prof.name || cur.emoji !== prof.emoji || cur.avatar !== prof.avatar)) s.publishProfile(prof)
  })
})

export const allSpaces = () => [...spaces.values()]
export const getSpace = (id: string) => spaces.get(id) ?? null

export const useSpaceIds = () => registry.use(s => s.ids)

export const useActiveSpace = () => {
  registry.use(s => s.ids)
  const id = settings.use(s => s.activePairId)
  return spaces.get(id) ?? null
}

/** Re-render whenever the space's shared doc or live state changes. Returns a version number for memo deps. */
export const useSpaceVersion = (space: Space | null) =>
  useSyncExternalStore(
    space ? space.subscribe : noopSub,
    () => (space ? space.version : 0)
  )

const noopSub = () => () => {}

export const reconnectAll = () => spaces.forEach(s => s.reconnect())
