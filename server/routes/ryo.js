import { Router } from 'express'
import fetch from 'node-fetch'
import { rateLimit } from '../lib/rateLimit.js'
import { getCache, setCache } from '../lib/cache.js'
import { log, error } from '../lib/logger.js'
import {
  normalizeOverview,
  normalizeScan,
  normalizeProfile,
  normalizeCompare,
  normalizeSentimentShift,
  normalizeNarrative,
  normalizeRiskDesk,
  normalizeDebate,
  normalizeVerdict as normalizeVerdictFromRaw,
} from '../lib/normalizers.js'

const router = Router()

// RYO MCP tool call helper — reads env lazily, sends FLAT body (no {params} wrapping)
async function callRyoTool(toolName, body = {}) {
  const url = `${process.env.RYO_MCP_BASE}/tools/${toolName}/call`
  console.log(`[RYO] Calling ${url} with key=${process.env.RYO_MCP_KEY?.slice(0,8)}...`)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RYO_MCP_KEY}`,
      },
      body: JSON.stringify(body),
    })
  } catch (fetchErr) {
    console.error(`[RYO] Fetch error for ${toolName}:`, fetchErr.message)
    throw new Error(`RYO fetch failed: ${fetchErr.message}`)
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`[RYO] ${toolName} HTTP ${res.status}: ${text.slice(0, 200)}`)
    throw new Error(`RYO ${toolName} failed: ${res.status} ${text}`)
  }

  return res.json()
}

// POST /api/proxy/ryo/market_overview
router.post('/market_overview', async (req, res) => {
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
})

// POST /api/proxy/ryo/scan_market
router.post('/scan_market', async (req, res) => {
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
})

// POST /api/proxy/ryo/analyze_token  → returns normalized profile shape
router.post('/analyze_token', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/analyze_token', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:analyze:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/analyze_token', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // FLAT body — NOT wrapped in {params}
    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeProfile(raw, symbol)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/analyze_token', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('analyze_token', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/analyze_verdict  → returns normalized verdict shape
router.post('/analyze_verdict', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/analyze_verdict', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:verdict:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/analyze_verdict', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeVerdictFromRaw(raw, symbol)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/analyze_verdict', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('analyze_verdict', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/compare_tokens — accepts {symbols: ["SOL","AVAX"]}
// Calls analyze_token per symbol (reuses cache) → normalized compare shape
router.post('/compare_tokens', async (req, res) => {
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

    // Call analyze_token for each symbol (each call is cached individually)
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
})

// POST /api/proxy/ryo/sentiment_shift
router.post('/sentiment_shift', async (req, res) => {
  const start = Date.now()
  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/sentiment_shift', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = 'ryo:sentiment_shift'
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/sentiment_shift', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // Requires {time_window: "7d"}
    const raw = await callRyoTool('monitor_market_sentiment_shift', { time_window: '7d' })
    const data = normalizeSentimentShift(raw)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/sentiment_shift', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('sentiment_shift', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/narrative — RYO analyze_token → normalized narrative
router.post('/narrative', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/narrative', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:narrative:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/narrative', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeNarrative(raw, symbol)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/narrative', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('narrative', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/risk — RYO analyze_token → normalized risk desk
router.post('/risk', async (req, res) => {
  const start = Date.now()
  const { symbol, limits } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/risk', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:risk:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/risk', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeRiskDesk(raw, limits)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/risk', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('risk', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/debate — RYO analyze_token → normalized debate
router.post('/debate', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/debate', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:debate:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/debate', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeDebate(raw)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/debate', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('debate', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/script — RYO analyze_token → normalized studio script
router.post('/script', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/script', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ryo:script:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/script', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const { normalizeStudioScript } = await import('../lib/normalizers.js')
    const data = normalizeStudioScript(raw)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/script', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('script', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
