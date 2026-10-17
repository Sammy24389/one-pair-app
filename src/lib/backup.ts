import {hkdfHex, open, pbkdf2Hex, seal} from './crypto'
import {addPair, identity, type PairRecord, type Profile} from './identity'
import {saveBlob} from './media'
import {settings} from './settings'
import type {Space} from './space'
import {getSpace} from './spaces'
import {fromB64, fromHex, todayKey, toB64} from './util'

/** Password-encrypted backup of one pair (secret + shared document). Media re-syncs from the partner. */
export const exportBackup = async (space: Space, pass: string) => {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)))
  const key = fromHex(await pbkdf2Hex(pass, salt))
  const payload = JSON.stringify({pair: space.pair, profile: identity.get().profile, deviceId: identity.get().deviceId, doc: toB64(space.exportUpdate())})
  const data = await seal(key, new TextEncoder().encode(payload))
  const blob = new Blob([JSON.stringify({app: 'onepair', v: 1, salt, data})], {type: 'application/json'})
  return saveBlob(blob, `onepair-backup-${todayKey()}.json`)
}

export const importBackup = async (file: File, pass: string) => {
  const {app, salt, data} = JSON.parse(await file.text())
  if (app !== 'onepair') throw new Error('Not a OnePair backup')
  const key = fromHex(await pbkdf2Hex(pass, salt))
  const {pair, profile, deviceId, doc} = JSON.parse(new TextDecoder().decode(await open(key, data))) as {
    pair: PairRecord
    profile?: Profile
    deviceId?: string
    doc: string
  }
  if ((await hkdfHex(fromB64(pair.secret), 'id', 16)) !== pair.id) throw new Error('Backup corrupted')
  // On a fresh install, adopt the original device id so the partner's phone still recognises us.
  const fresh = identity.get().pairs.length === 0
  if (fresh && deviceId) identity.set({deviceId, ...(profile ? {profile, onboarded: true} : {})})
  addPair(pair)
  const sp = getSpace(pair.id)
  await sp?.ready
  sp?.importUpdate(fromB64(doc))
  if (fresh) sp?.reconnect()
  settings.set({activePairId: pair.id})
}
