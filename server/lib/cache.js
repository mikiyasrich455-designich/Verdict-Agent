// In-memory cache with TTL
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

// Periodic cleanup every 2 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key)
  }
}, 2 * 60 * 1000)
