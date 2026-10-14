import {isNative, withSystemUi} from './platform'
import type {Space} from './space'
import {createStore} from './store'
import {haversineKm} from './util'

type Fix = {lat: number; lng: number; acc: number}

export const getPosition = (): Promise<Fix> => withSystemUi(getPositionRaw)

const getPositionRaw = async (): Promise<Fix> => {
  if (isNative) {
    const {Geolocation} = await import('@capacitor/geolocation')
    const p = await Geolocation.getCurrentPosition({enableHighAccuracy: true, timeout: 15000})
    return {lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy}
  }
  return new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(
      p => res({lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy}),
      rej,
      {enableHighAccuracy: true, timeout: 15000}
    )
  )
}

// Live sharing (while the app is open). Writes are throttled by distance and time to keep the doc small.
export const liveShare = createStore({active: {} as Record<string, boolean>}, 'onepair.liveShare')

const watchers = new Map<string, () => void>()

export const startLiveShare = async (space: Space) => {
  stopWatch(space.pair.id)
  liveShare.set(s => ({active: {...s.active, [space.pair.id]: true}}))
  let lastWrite = 0
  let lastFix: Fix | null = null
  const write = (f: Fix) => {
    const moved = lastFix ? haversineKm(lastFix, f) * 1000 : Infinity
    if (moved < 40 && Date.now() - lastWrite < 120_000) return
    lastWrite = Date.now()
    lastFix = f
    space.locations.set(space.me, {...f, ts: Date.now(), sharing: true})
  }
  if (isNative) {
    const {Geolocation} = await import('@capacitor/geolocation')
    const id = await Geolocation.watchPosition({enableHighAccuracy: true}, p => {
      if (p) write({lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy})
    })
    watchers.set(space.pair.id, () => Geolocation.clearWatch({id}))
  } else {
    const id = navigator.geolocation.watchPosition(
      p => write({lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy}),
      () => {},
      {enableHighAccuracy: true}
    )
    watchers.set(space.pair.id, () => navigator.geolocation.clearWatch(id))
  }
}

const stopWatch = (id: string) => {
  watchers.get(id)?.()
  watchers.delete(id)
}

export const stopLiveShare = (space: Space) => {
  stopWatch(space.pair.id)
  liveShare.set(s => ({active: {...s.active, [space.pair.id]: false}}))
  const cur = space.locations.get(space.me)
  if (cur) space.locations.set(space.me, {...cur, sharing: false})
}

export const fmtDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`)
