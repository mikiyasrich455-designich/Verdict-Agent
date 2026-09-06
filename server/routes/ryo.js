import { Router } from 'express'
import fetch from 'node-fetch'
import { rateLimit } from '../lib/rateLimit.js'
import { getCache, setCache } from '../lib/cache.js'
import { log, error } from '../lib/logger.js'
import {
  normalizeOverview,
  normalizeScan,
  normalizeProfile,
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
import { callLLM, extractJsonLite, QWEN_MODELS } from '../lib/llm.js'
import { unwrapRyo } from '../lib/normalizers.js'

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

// POST /api/proxy/ryo/compare_tokens — accepts {symbols: ["SOL","0x…","WIF"]}, MAX 3.
// Real comparison: live resolver data + RYO qualitative layer feed the Qwen top agent,
// which produces the ranking, winner and per-token verdict — no deterministic JS.
const moneyShort = (v) => {
  const n = Number(v) || 0
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
const clampScore = (n) => Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50

router.post('/compare_tokens', resolveCaInList, async (req, res) => {
  const start = Date.now()
  const { symbols } = req.body
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return res.status(400).json({ error: 'symbols array required' })
  }
  if (symbols.length > 3) {
    return res.status(400).json({ error: 'Compare supports a maximum of 3 tokens' })
  }

  const limit = rateLimit('ryo', 60, 60000)
  if (!limit.allowed) {
    log('POST', '/ryo/compare_tokens', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  const identities = (req.tokenIdentities || []).filter(Boolean)

  try {
    const cacheKey = `ryo:compare:${identities.map((i) => (i.ca || i.symbol).toLowerCase()).join(',')}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/ryo/compare_tokens', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // Resolve real market data per token + RYO qualitative layer (best-effort).
    const packed = await Promise.all(identities.map(async (entry) => {
      const live = entry.live || {}
      let ryo = null
      try {
        ryo = unwrapRyo(await callRyoTool('analyze_token', { symbol: entry.symbol.toUpperCase() }))
      } catch {
        ryo = null
      }
      return { ...entry, live, ryo: ryo || {} }
    }))

    const evidenceText = packed.map((p) => {
      const l = p.live || {}
      const r = p.ryo || {}
      const tech = r.technical_analysis || {}
      const intel = r.intelligence || {}
      const lines = []
      lines.push(`TOKEN: ${l.name || p.symbol} (${String(p.symbol || '').toUpperCase()})`)
      if (l.ca) lines.push(`Contract: ${l.ca} on ${l.chainLabel || l.chain || 'resolved chain'}`)
      lines.push(`Price $${Number(l.priceUsd || 0)} · 24h ${Number(l.change24h || 0).toFixed(2)}% · Cap ${moneyShort(l.marketCap)} · Volume ${moneyShort(l.volume24h)} · Liquidity ${moneyShort(l.liquidityUsd)}`)
      if (l.buys24h != null) lines.push(`24h tape: ${l.buys24h || 0} buys / ${l.sells24h || 0} sells`)
      if (l.pairAgeDays != null) lines.push(`Pool age: ${Number(l.pairAgeDays).toFixed(0)} days`)
      if (tech.rsi_14 != null) lines.push(`RSI(14): ${tech.rsi_14}`)
      if (tech.trend) lines.push(`Trend: ${tech.trend}`)
      if (Array.isArray(intel.catalysts) && intel.catalysts.length) {
        lines.push(`Catalysts: ${intel.catalysts.map((c) => (typeof c === 'string' ? c : (c.title || c.event))).filter(Boolean).join('; ')}`)
      }
      if (Array.isArray(intel.risks) && intel.risks.length) {
        lines.push(`Risks: ${intel.risks.map((r) => (typeof r === 'string' ? r : (r.title || r.description))).filter(Boolean).join('; ')}`)
      }
      return lines.join('\n')
    }).join('\n\n')

    const prompt = `You are a top-tier crypto comparison agent on a professional trading desk. Compare the tokens below using ONLY the live evidence provided. Rank them by strongest risk-adjusted case, pick ONE winner, and give each token an evidence-grounded verdict and 0-100 pillar scores.

${evidenceText}

Respond with ONLY a valid JSON object (no markdown, no code fences, no prose):
{
  "winner": "<SYMBOL>",
  "narrative": "<4-6 sentence plain-English comparison thesis citing real numbers and a clear ranking>",
  "tokens": [
    {
      "symbol": "<SYMBOL>",
      "verdict": "BUY" | "HOLD" | "AVOID",
      "confidence": <0-100 integer>,
      "scores": { "technical": <0-100>, "market": <0-100>, "risk": <0-100>, "catalyst": <0-100>, "sentiment": <0-100> },
      "reason": "<2 sentences explaining this token's rank and conviction>"
    }
  ]
}
RULES:
- Every token that appears in the evidence MUST appear in "tokens".
- Never invent numbers; only cite values present in the evidence.
- Never name data providers, APIs or models.`

    let parsed = null
    try {
      parsed = extractJsonLite(await callLLM([
        { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
        { role: 'user', content: prompt },
      ], QWEN_MODELS.main, 3000))
    } catch (llmErr) {
      error('compare_tokens LLM', llmErr)
    }

    if (!parsed) {
      throw new Error('Comparison agent returned no valid result')
    }

    const winner = String((parsed.winner || (parsed.tokens && parsed.tokens[0]?.symbol) || '')).toUpperCase()
    const bySymbol = new Map(packed.map((p) => [String(p.symbol).toUpperCase(), p]))

    const tokens = (Array.isArray(parsed.tokens) ? parsed.tokens : [])
      .filter(Boolean)
      .map((t) => {
        const sym = String(t.symbol || '').toUpperCase()
        const p = bySymbol.get(sym) || {}
        const live = p.live || {}
        const scores = typeof t.scores === 'object' && t.scores ? t.scores : {}
        const pillar = (k) => clampScore(Number(scores[k]))
        const volatility = clampScore((Math.abs(Number(live.change24h) || 0) / 3) * 25)
        return {
          symbol: sym,
          name: live.name || p.symbol || sym,
          ca: live.ca || p.ca || null,
          chain: live.chain || p.chain || null,
          priceUsd: Number(live.priceUsd) || 0,
          change24h: Number(live.change24h) || 0,
          marketCap: Number(live.marketCap) || 0,
          volume24h: Number(live.volume24h) || 0,
          volatility,
          verdict: ['BUY', 'HOLD', 'AVOID'].includes(String(t.verdict || '').toUpperCase()) ? String(t.verdict).toUpperCase() : 'HOLD',
          confidence: clampScore(Number(t.confidence)),
          scores: {
            technical: pillar('technical'),
            market: pillar('market'),
            risk: pillar('risk'),
            catalyst: pillar('catalyst'),
            sentiment: pillar('sentiment'),
          },
          reason: String(t.reason || ''),
        }
      })

    const data = {
      winner,
      narrative: String(parsed.narrative || ''),
      tokens,
      asOf: new Date().toISOString(),
    }
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
