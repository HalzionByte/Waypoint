/**
 * A minimal promise wrapper over IndexedDB.
 *
 * Why IndexedDB and not localStorage: landmark photos are stored as Blobs and
 * localStorage caps out around 5 MB of strings. IndexedDB stores Blobs
 * natively and has room to grow, which is the difference between a demo where
 * photo upload works and one where it throws QuotaExceededError.
 *
 * Everything is namespaced per-origin, so a judge's browser keeps its data
 * between reloads without any server involved.
 */

const DB_NAME = 'waypoint'
const DB_VERSION = 1

export const STORES = {
  meta: 'meta',
  routes: 'routes',
  landmarks: 'landmarks',
  publicLandmarks: 'publicLandmarks',
  reports: 'reports',
  photos: 'photos',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so WayPoint cannot store anything.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta)
      }
      if (!db.objectStoreNames.contains(STORES.routes)) {
        const store = db.createObjectStore(STORES.routes, { keyPath: 'id' })
        store.createIndex('owner_id', 'owner_id')
      }
      if (!db.objectStoreNames.contains(STORES.landmarks)) {
        const store = db.createObjectStore(STORES.landmarks, { keyPath: 'id' })
        store.createIndex('route_id', 'route_id')
      }
      if (!db.objectStoreNames.contains(STORES.publicLandmarks)) {
        db.createObjectStore(STORES.publicLandmarks, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.reports)) {
        const store = db.createObjectStore(STORES.reports, { keyPath: 'id' })
        store.createIndex('landmark_id', 'landmark_id')
      }
      if (!db.objectStoreNames.contains(STORES.photos)) {
        db.createObjectStore(STORES.photos)
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // Another tab upgrading the schema would otherwise leave this one
      // blocking forever instead of letting the new version through.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
    request.onblocked = () =>
      reject(new Error('Another WayPoint tab is open. Close it and reload this page.'))
  })

  // A failed open must not be cached, or every later call rejects with the
  // original error even after the user fixes the cause.
  dbPromise.catch(() => {
    dbPromise = null
  })

  return dbPromise
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = work(tx.objectStore(store))

        if (!request) {
          // No request means the caller only cares that the tx committed.
          tx.oncomplete = () => resolve(undefined)
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
          return
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return run<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>) as Promise<T | undefined>
}

export function idbPut<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<IDBValidKey> {
  return run<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key)) as Promise<IDBValidKey>
}

export function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  return run<void>(store, 'readwrite', (s) => {
    s.delete(key)
  }) as Promise<void>
}

/** Read every store at once, so a page load is one round of parallel reads. */
export function idbSnapshot<T extends Partial<Record<StoreName, unknown>>>(): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const names = Object.values(STORES) as StoreName[]
        const tx = db.transaction(names, 'readonly')
        const out: Record<string, unknown> = {}

        names.forEach((name) => {
          const request = tx.objectStore(name).getAll()
          request.onsuccess = () => {
            out[name] = request.result
          }
        })
        tx.oncomplete = () => resolve(out as T)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
      }),
  )
}

/** Delete the whole database. Used by the "reset demo" affordance. */
export function idbWipe(): Promise<void> {
  dbPromise = null
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
