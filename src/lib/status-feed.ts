import {activeStatuses, postStatus, pruneStatuses, removeStatus, STATUS_ACTIVE_LIMIT, validateStatusMedia, type StatusRecord, type StatusMedia} from './status'
import type {Space} from './space'
import {uid} from './util'
import {idbDel, putMedia} from './idb'
import {consumeStatusQuota} from './status-quota'

export function statusFeed(spaces: Space[], now = Date.now()) {
  const seen = new Set<string>()
  return spaces.flatMap(space => activeStatuses(space.statuses, [space.me, space.peer], now).map(status => ({
    status, own: status.from === space.me, name: status.from === space.me ? 'You' : space.peerProfile().name || 'Your pair'
  }))).sort((a, b) => b.status.ts - a.status.ts || a.status.id.localeCompare(b.status.id)).filter(({status}) => {
    const key = `${status.from}:${status.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function checkStatusCapacity(spaces: Space[], now = Date.now()) {
  if (!spaces.length) throw new Error('Pair with someone before sharing a status.')
  if (spaces.some(s => activeStatuses(s.statuses, [s.me], now).length >= STATUS_ACTIVE_LIMIT)) {
    throw new Error('You can keep up to 20 active statuses. Wait for an older update to expire.')
  }
}

export async function shareStatus(spaces: Space[], text: string, file?: File) {
  await Promise.all(spaces.map(s => s.ready))
  checkStatusCapacity(spaces)
  const id = uid()
  let media: StatusMedia | undefined
  if (file) {
    media = {kind: file.type.startsWith('image/') ? 'image' : 'video', mediaId: `status-${id}`, mime: file.type, size: file.size}
    validateStatusMedia(media)
  }
  // Validate before binary storage or publishing to any pair.
  const draft = new Map<string, StatusRecord>()
  postStatus(draft, spaces[0].me, text, Date.now(), media, id)
  if (file && media) await putMedia(media.mediaId, file)
  const now = Date.now()
  try {
    checkStatusCapacity(spaces, now)
    await consumeStatusQuota(spaces[0].me, now, statusFeed(spaces, now).filter(x => x.own).map(x => x.status))
  } catch (error) {
    if (media) await idbDel('media', media.mediaId).catch(() => {})
    throw error
  }
  spaces.forEach(s => postStatus(s.statuses, s.me, text, now, media, id))
}

export function deleteSharedStatus(spaces: Space[], id: string) {
  spaces.forEach(s => removeStatus(s.statuses, s.me, id))
}

export function pruneOwnStatuses(spaces: Space[], now: number) {
  spaces.forEach(s => pruneStatuses(s.statuses, s.me, now))
}
