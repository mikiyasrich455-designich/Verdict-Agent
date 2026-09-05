// Cache - DISABLED in Vercel (memory cache dies on cold start)
// In local dev, uses in-memory TTL cache

const isServerless = process.env.VERCEL === 'true'

if (!isServerless) {
  // Local dev: use in-memory cache with cleanup
  const cache = new Map()

  export function getCache(key) {
    const entry = cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      cache.delete(key)
      return null
    }
    return entry.data
  }

  export function setCache(key, data, ttlMs = 5 * 60 * 1000) {
    cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    })
  }

  export function clearCache() {
    cache.clear()
  }

  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiresAt) cache.delete(key)
    }
  }, 2 * 60 * 1000)
} else {
  // Serverless: disable cache entirely (no persistence, wastes upstream API credits)
  export function getCache() { return null }
  export function setCache() { /* no-op */ }
  export function clearCache() { /* no-op */ }
}
