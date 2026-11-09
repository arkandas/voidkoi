/** Files shared into the app from another one, kept by the service worker until the page uploads them. */

const DB = 'files-share-target'
const STORE = 'pending'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { autoIncrement: true })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Every waiting file, leaving none behind. */
export async function takeSharedFiles(): Promise<File[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await openDb()
  try {
    return await new Promise<File[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.getAll()
      request.onsuccess = () => store.clear()
      tx.oncomplete = () => resolve((request.result as File[]) ?? [])
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
