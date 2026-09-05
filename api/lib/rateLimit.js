// Simple token bucket rate limiter
const buckets = new Map()

export function rateLimit(key, maxRequests = 60, windowMs = 60 * 1000) {
  const now = Date.now()
  let bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    bucket = { tokens: maxRequests, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  if (bucket.tokens <= 0) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }

  bucket.tokens--
  return { allowed: true }
}

// Cleanup old buckets every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets.entries()) {
    if (now > bucket.resetAt) buckets.delete(key)
  }
}, 5 * 60 * 1000)
