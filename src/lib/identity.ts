import {createStore} from './store'
import {randomCode, uid} from './util'

export type Mode = 'friends' | 'couple'

export type Profile = {name: string; emoji: string; avatar?: string; avatarMedia?: {id: string; mime: string; size: number}}

export type PairRecord = {
  id: string // public pair id (derived from secret), also the Yjs doc name
  secret: string // base64 32-byte shared secret – never leaves the two devices
  peerDevice: string
  peerName: string
  createdAt: number
}

type Identity = {
  deviceId: string
  code: string
  profile: Profile
  pairs: PairRecord[]
  onboarded: boolean
  defaultMode: Mode // chosen at onboarding; pre-selects the mode when sharing a code
}

export const identity = createStore<Identity>(
  {
    deviceId: uid(16),
    code: randomCode(),
    profile: {name: '', emoji: '🙂'},
    pairs: [],
    onboarded: false,
    defaultMode: 'friends'
  },
  'onepair.identity'
)

// Persist generated ids on first run.
if (!localStorage.getItem('onepair.identity')) identity.set({})

export const regenerateCode = () => identity.set({code: randomCode()})

export const addPair = (p: PairRecord) =>
  identity.set(s => ({pairs: [...s.pairs.filter(x => x.id !== p.id), p]}))

export const removePair = (id: string) => identity.set(s => ({pairs: s.pairs.filter(p => p.id !== id)}))
