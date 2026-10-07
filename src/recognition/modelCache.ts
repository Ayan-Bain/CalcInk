// IndexedDB-backed model cache — adapted from kimseungdae/ink-on (MIT)
const DB_NAME = 'calcink-models'
const DB_VERSION = 1
const STORE = 'onnx-models'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  try {
    const db = await openDB()
    const cached = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(url)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    if (cached) return cached

    const buf = await (await fetch(url)).arrayBuffer()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const req = tx.objectStore(STORE).put(buf, url)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    return buf
  } catch {
    return (await fetch(url)).arrayBuffer()
  }
}
