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
  normalizeRiskDesk,
  normalizeDebate,
  normalizeVerdict as normalizeVerdictFromRaw,
  applyLiveData,
  profileFromLive,
  withLiveIdentity,
} from '../lib/normalizers.js'
import { discoverKols } from '../lib/kolDiscovery.js'
import { liveInsights } from './synthesis.js'
import { resolveCaInBody, resolveCaInList } from '../lib/caGuard.js'
import { shortAddr } from '../lib/tokenResolver.js'

const router = Router()

// Swap pasted contract addresses for a live-resolved canonical identity before any
// handler runs — req.tokenIdentity carries the real token (CA wins over ticker).
router.use(resolveCaInBody)

// Cache key that survives ticker collisions: the contract address is the discriminator.
function idKey(req, prefix) {
  const live = req.tokenIdentity
  const sym = String(req.body?.symbol || '').toUpperCase()
  const id = live?.ca || (live?.chain ? `${live.chain}:${sym}` : sym)
  return `${prefix}:${id.toLowerCase()}`
}

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
// Live market data (identity, price, cap, volume, logo, banner, description, exchange)
// always wins; RYO only supplies the qualitative layer.
router.post('/analyze_token', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/analyze_token', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  const live = req.tokenIdentity || null
  try {
    const cacheKey = idKey(req, 'ryo:analyze')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/analyze_token', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // FLAT body — NOT wrapped in {params}
    let data
    try {
      const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
      data = applyLiveData(normalizeProfile(raw, symbol), live)
    } catch (ryoErr) {
      if (!live) throw ryoErr
      error(`analyze_token(${live.ca ? shortAddr(live.ca) : symbol}) AI layer`, ryoErr)
      data = profileFromLive(live)
    }

    // Upgrade the qualitative layer with live search + LLM research grounded in the
    // live contract data — every CA gets real AI analysis, never templates.
    if (live && data?.qualitative === 'derived') {
      try {
        const insights = await liveInsights(live)
        if (insights) {
          data.catalysts = insights.catalysts
          data.risks = insights.risks
          data.sentiment = insights.sentiment
          data.qualitative = 'researched'
        }
      } catch (insightErr) {
        error('analyze_token research upgrade', insightErr)
      }
    }

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
    const cacheKey = idKey(req, 'ryo:verdict')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/analyze_verdict', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = withLiveIdentity(normalizeVerdictFromRaw(raw, symbol), req.tokenIdentity)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/analyze_verdict', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('analyze_verdict', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/ryo/compare_tokens — accepts {symbols: ["SOL","0x…","WIF"]}
// Each entry is resolved to its canonical identity first, then analyzed.
router.post('/compare_tokens', resolveCaInList, async (req, res) => {
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

  const identities = req.tokenIdentities || symbols.map((s) => ({ symbol: s, live: null }))

  try {
    const cacheKey = `ryo:compare:${identities.map((i) => (i.ca || i.symbol).toLowerCase()).join(',')}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/compare_tokens', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // Call analyze_token per symbol; identities[] stays index-aligned with results.
    const paired = await Promise.all(
      identities.slice(0, 4).map(async (identity) => {
        try {
          return { identity, raw: await callRyoTool('analyze_token', { symbol: identity.symbol.toUpperCase() }) }
        } catch {
          return null
        }
      })
    )

    const valid = paired.filter(Boolean)
    const data = normalizeCompare(valid.map((p) => p.raw), valid.map((p) => p.identity))
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

// POST /api/proxy/ryo/narrative — Real KOL discovery via search + LLM
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
    const cacheKey = idKey(req, 'ryo:narrative')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/narrative', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // Use real KOL discovery instead of mock normalizeNarrative
    const data = await discoverKols(symbol)
    data.symbol = symbol.toUpperCase()

    const out = withLiveIdentity(data, req.tokenIdentity)
    setCache(cacheKey, out, 5 * 60 * 1000)
    log('POST', '/ryo/narrative', 200, Date.now() - start)
    res.json(out)
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
    const cacheKey = idKey(req, 'ryo:risk')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/risk', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = withLiveIdentity(normalizeRiskDesk(raw, limits, req.tokenIdentity), req.tokenIdentity)
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
    const cacheKey = idKey(req, 'ryo:debate')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/debate', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = withLiveIdentity(normalizeDebate(raw), req.tokenIdentity)
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
    const cacheKey = idKey(req, 'ryo:script')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/script', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const { normalizeStudioScript } = await import('../lib/normalizers.js')
    const data = withLiveIdentity(normalizeStudioScript(raw), req.tokenIdentity)
    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/ryo/script', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('script', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
