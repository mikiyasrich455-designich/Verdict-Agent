// Studio output cache. A generated clip / card / narration stays attached to
// the token it was made for — leaving the page and coming back shows the same
// media instantly instead of asking for a fresh (paid) generation. Picking a
// new token starts that token's own slot.
// Two tiers on purpose:
//  • in-memory Map for instant same-session recall,
//  • IndexedDB mirror so a HARD REFRESH also restores the previous generation.
// Media data URLs run into megabytes, which blows localStorage quotas —
// IndexedDB handles that size class comfortably.
const store = new Map()
const keyOf = (kind, symbol) => `${kind}:${String(symbol || '').toUpperCase()}`

const DB_NAME = 'verdict-studio'
const STORE_NAME = 'outputs'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000 // a week — older generations expire
let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function persist(entry) {
  openDB().then((db) => {
    if (!db) return
    try {
      db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry)
    } catch {
      // private mode / closed db — the memory tier still covers this session
    }
  })
}

export function recallStudio(kind, symbol) {
  if (!symbol) return null
  return store.get(keyOf(kind, symbol)) || null
}

// Disk-tier recall for mount time: memory first, then IndexedDB. A hit is
// promoted into memory so every later read in the session is instant.
export function recallStudioAsync(kind, symbol) {
  if (!symbol) return Promise.resolve(null)
  const key = keyOf(kind, symbol)
  const mem = store.get(key)
  if (mem) return Promise.resolve(mem)
  return openDB().then((db) => new Promise((resolve) => {
    if (!db) return resolve(null)
    try {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      req.onsuccess = () => {
        const entry = req.result || null
        if (!entry?.at || Date.now() - entry.at > MAX_AGE) return resolve(null)
        store.set(key, entry)
        resolve(entry)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  }))
}

export function rememberStudio(kind, symbol, entry) {
  if (!symbol || !entry) return undefined
  const key = keyOf(kind, symbol)
  const saved = { ...entry, key, at: entry.at || Date.now() }
  store.set(key, saved)
  persist(saved)
  return saved
}
