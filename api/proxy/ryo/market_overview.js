import { rateLimit } from '../../lib/rateLimit.js'
import { getCache, setCache } from '../../lib/cache.js'
import { log, error } from '../../lib/logger.js'
import { normalizeOverview } from '../../lib/normalizers.js'

async function callRyoTool(toolName, body = {}) {
  const url = `${process.env.RYO_MCP_BASE}/tools/${toolName}/call`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RYO_MCP_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RYO ${toolName} failed: ${res.status} ${text}`)
  }

  return res.json()
}

export default async function handler(req, res) {
  // CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  const start = Date.now()
  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/market_overview', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = 'ryo:market_overview'
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/market_overview', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('market_overview', {})
    const data = normalizeOverview(raw)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/market_overview', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('market_overview', err)
    res.status(500).json({ error: err.message })
  }
}
