// Simple in-memory TTL cache.
// On Vercel serverless it just lives for the warm-instance lifetime (harmless).
// NOTE: exports must be top-level (conditional exports = syntax error).

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
