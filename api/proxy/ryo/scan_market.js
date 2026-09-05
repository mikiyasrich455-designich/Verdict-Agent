import { rateLimit } from '../../lib/rateLimit.js'
import { getCache, setCache } from '../../lib/cache.js'
import { log, error } from '../../lib/logger.js'
import { normalizeScan } from '../../lib/normalizers.js'

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
  const start = Date.now()
  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/scan_market', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = 'ryo:scan_market'
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/scan_market', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('scan_market', {})
    const data = normalizeScan(raw)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/scan_market', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('scan_market', err)
    res.status(500).json({ error: err.message })
  }
}
