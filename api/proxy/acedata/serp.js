import { rateLimit } from '../../api/lib/rateLimit.js'
import { getCache, setCache } from '../../api/lib/cache.js'
import { log, error } from '../../api/lib/logger.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const start = Date.now()

  // Lazy env read
  const ACEDATA_BASE = process.env.ACEDATA_BASE
  const ACEDATA_KEY = process.env.ACEDATA_KEY

  const { query, num = 10 } = req.body || {}
  if (!query) {
    return res.status(400).json({ error: 'query required' })
  }

  const limit = rateLimit('acedata', 100, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/serp', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ace:serp:${query}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/acedata/serp', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const url = `${ACEDATA_BASE}/serp/google`
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACEDATA_KEY}`,
      },
      body: JSON.stringify({ type: 'search', query, number: num }),
    })

    if (!fetchRes.ok) {
      const text = await fetchRes.text()
      throw new Error(`SERP failed: ${fetchRes.status} ${text}`)
    }

    const data = await fetchRes.json()
    setCache(cacheKey, data, 10 * 60 * 1000)
    log('POST', '/acedata/serp', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('serp', err)
    res.status(500).json({ error: err.message })
  }
}
