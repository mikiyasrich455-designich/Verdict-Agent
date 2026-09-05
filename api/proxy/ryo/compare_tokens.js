import { rateLimit } from '../../lib/rateLimit.js'
import { getCache, setCache } from '../../lib/cache.js'
import { log, error } from '../../lib/logger.js'
import { normalizeCompare } from '../../lib/normalizers.js'

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
  const { symbols } = req.body
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols array required' })
  }

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/compare_tokens', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:compare:${symbols.join(',').toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/compare_tokens', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const analyses = await Promise.all(
      symbols.slice(0, 4).map(async (sym) => {
        try {
          return await callRyoTool('analyze_token', { symbol: sym.toUpperCase() })
        } catch {
          return null
        }
      })
    )

    const valid = analyses.filter(Boolean)
    const data = normalizeCompare(valid)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/compare_tokens', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('compare_tokens', err)
    res.status(500).json({ error: err.message })
  }
}
