// Tiny promise wrapper around IndexedDB for binary media and misc blobs.
const DB_NAME = 'onepair-blobs'
const STORES = ['media', 'kv'] as const
type StoreName = (typeof STORES)[number]

let dbp: Promise<IDBDatabase> | null = null

const db = () =>
  (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => STORES.forEach(s => req.result.objectStoreNames.contains(s) || req.result.createObjectStore(s))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))

const tx = async <R,>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<R>) => {
  const d = await db()
  return new Promise<R>((resolve, reject) => {
    const r = fn(d.transaction(store, mode).objectStore(store))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export const idbGet = <T,>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', s => s.get(key))
export const idbPut = (store: StoreName, key: string, val: unknown) => tx(store, 'readwrite', s => s.put(val, key))
export const idbDel = (store: StoreName, key: string) => tx(store, 'readwrite', s => s.delete(key))
export const idbKeys = (store: StoreName) => tx<IDBValidKey[]>(store, 'readonly', s => s.getAllKeys()) as Promise<string[]>

export type MediaRecord = {blob: Blob; mime: string; name?: string}

const urlCache = new Map<string, string>()

const stored = new Set<(id: string) => void>()

/** Subscribe to media arriving (e.g. a transfer from the partner finishing). */
export const onMediaStored = (f: (id: string) => void) => {
  stored.add(f)
  return () => {
    stored.delete(f)
  }
}

export const putMedia = async (id: string, blob: Blob, name?: string) => {
  await idbPut('media', id, {blob, mime: blob.type, name} satisfies MediaRecord)
  stored.forEach(f => f(id))
}

export const hasMedia = async (id: string) => (await idbGet<MediaRecord>('media', id)) !== undefined

export const getMediaUrl = async (id: string) => {
  const hit = urlCache.get(id)
  if (hit) return hit
  const rec = await idbGet<MediaRecord>('media', id)
  if (!rec) return null
  const url = URL.createObjectURL(rec.blob)
  urlCache.set(id, url)
  return url
}

export const getMedia = (id: string) => idbGet<MediaRecord>('media', id)
