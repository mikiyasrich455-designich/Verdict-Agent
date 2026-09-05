import { rateLimit } from '../../../lib/rateLimit.js'
import { getCache, setCache } from '../../../lib/cache.js'
import { log, error } from '../../../lib/logger.js'

// ── Helpers ──────────────────────────────────────────────────────

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

async function callAceSerp(query, num = 10) {
  const url = `${process.env.ACEDATA_BASE}/serp/google`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    },
    body: JSON.stringify({ type: 'search', query, number: num }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SERP failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function callAceChat(messages, model = 'grok-4', maxTokens = 4000) {
  const url = `${process.env.ACEDATA_BASE}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.3 }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AceData Chat failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.choices[0].message.content
}

// ── Deep forensic analysis ───────────────────────────────────────

async function deepAnalyze(symbol) {
  const symbolUpper = symbol.toUpperCase()
  const t0 = Date.now()

  console.log(`[DEEP] ${symbolUpper}: Starting parallel data fetch (RYO + 3x SERP)...`)
  const [ryoRaw, serpResults] = await Promise.allSettled([
    callRyoTool('analyze_token', { symbol: symbolUpper }).catch(e => {
      console.log('[DEEP] RYO failed, continuing with SERP only:', e.message)
      return null
    }),
    (async () => {
      const queries = [
        `${symbolUpper} crypto price analysis 2026`,
        `${symbolUpper} latest news developments`,
        `${symbolUpper} token ecosystem update`,
      ]
      const allResults = []
      const results = await Promise.allSettled(
        queries.map(q => callAceSerp(q, 5).catch(e => {
          console.log('[DEEP] SERP failed for query:', q, e.message)
          return null
        }))
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.data?.results) {
          allResults.push(...r.value.data.results.slice(0, 5))
        }
      }
      return allResults.slice(0, 15)
    })(),
  ])

  const dataFetchTime = Date.now() - t0
  console.log(`[DEEP] ${symbolUpper}: Data fetch complete in ${dataFetchTime}ms`)

  const unwrap = (raw) => {
    if (!raw) return {}
    if (raw?.result?.data) return raw.result.data
    if (raw?.data) return raw.data
    return raw
  }

  const ryoData = ryoRaw?.status === 'fulfilled' && ryoRaw?.value ? unwrap(ryoRaw.value) : {}
  const serpData = serpResults?.status === 'fulfilled' && serpResults?.value ? serpResults.value : []

  const asset = ryoData.asset || {}
  const market = ryoData.market || {}
  const perf = ryoData.performance || {}
  const tech = ryoData.technical_analysis || {}
  const intel = ryoData.intelligence || {}

  const serpText = serpData?.map(r => {
    const title = r.title || r.snippet || ''
    const snippet = r.snippet || ''
    const url = r.url || ''
    return `- ${title}\n  ${snippet}\n  Source: ${url}`
  }).join('\n\n') || 'No search results available.'

  const prompt = `You are a TOP-TIER crypto research analyst conducting a FORENSIC deep-dive analysis.

SYMBOL: ${symbolUpper}
NAME: ${asset.name || symbolUpper}
CURRENT PRICE: $${(market.price_usd || 0).toLocaleString()}
24H CHANGE: ${perf.change_24h_pct || 0}%
7D CHANGE: ${perf.change_7d_pct || 0}%
30D MOMENTUM: ${perf.momentum_30d_pct || 0}%
MARKET CAP: $${(market.market_cap_usd / 1e6).toFixed(1)}M
24H VOLUME: $${(market.volume_24h_usd / 1e6).toFixed(1)}M

TECHNICAL INDICATORS:
- RSI(14): ${tech.rsi_14 || 'N/A'}
- ATR(14): ${tech.atr_14_pct || 'N/A'}%
- TREND: ${tech.trend || 'N/A'}
- SUPPORT/RESISTANCE: ${tech.support_resistance || 'N/A'}

ON-CHAIN INTELLIGENCE:
- Catalysts: ${(intel.catalysts || []).map(c => typeof c === 'string' ? c : c.title || c.event).join('; ') || 'None detected'}
- Risks: ${(intel.risks || []).map(r => typeof r === 'string' ? r : r.title || r.description).join('; ') || 'None detected'}
- Narrative: ${intel.narrative || 'Developing'}

LATEST NEWS & MARKET SENTIMENT (from live search):
${serpText}

YOUR TASK — Provide a COMPREHENSIVE forensic analysis with:

1. VERDICT: BUY / HOLD / AVOID (must be one of these)
2. CONFIDENCE: 0-100 (how strong is your conviction?)
3. OVERALL SUMMARY: 3-4 sentences in plain English, no jargon, explaining the thesis
4. FIVE PILLAR SCORES (0-100 each) with DETAILED reasoning:
   - technical: Technical analysis score + reasoning (2-3 sentences)
   - market: Market context score + reasoning (2-3 sentences)
   - risk: Risk assessment score + reasoning (2-3 sentences)
   - catalyst: Catalyst density score + reasoning (2-3 sentences)
   - sentiment: Market sentiment score + reasoning (2-3 sentences)
5. BULL CASE: 3-5 specific reasons with evidence
6. BEAR CASE: 3-5 specific reasons with evidence
7. KEY LEVELS: Support, resistance, stop-loss, target prices if applicable
8. FINAL THESIS: 2-3 sentence conclusion summarizing the investment case

IMPORTANT RULES:
- Be specific. Use actual numbers, dates, events from the data.
- Don't hedge. Give a clear verdict with conviction.
- If data is insufficient, say so and base analysis on available evidence.
- Bull score + Bear score should roughly equal 100 (±15 allowed)
- Verdict must match: BUY if bull>bear+15, AVOID if bear>bull+15, else HOLD
- All reasoning must be grounded in the provided data (RYO + SERP results)`

  console.log(`[DEEP] ${symbolUpper}: Calling Grok for analysis...`)
  const tGrokStart = Date.now()
  const response = await callAceChat([
    { role: 'system', content: 'You are a world-class crypto research analyst. Always respond with valid JSON. Be thorough, specific, and evidence-based.' },
    { role: 'user', content: prompt },
  ], 'grok-4', 4000)
  const grokTime = Date.now() - tGrokStart
  console.log(`[DEEP] ${symbolUpper}: Grok response received in ${grokTime}ms`)

  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Analysis response did not contain valid JSON')
  }

  const analysis = JSON.parse(jsonMatch[0])

  return {
    symbol: symbolUpper,
    name: asset.name || symbolUpper,
    priceUsd: market.price_usd || 0,
    change24h: perf.change_24h_pct || 0,
    bullScore: Math.max(0, Math.min(100, analysis.bullScore || 50)),
    bearScore: Math.max(0, Math.min(100, analysis.bearScore || 50)),
    verdict: ['BUY', 'HOLD', 'AVOID'].includes(analysis.verdict) ? analysis.verdict : 'HOLD',
    confidence: Math.max(0, Math.min(100, analysis.confidence || 50)),
    summary: analysis.summary || 'Analysis complete.',
    bullReasons: Array.isArray(analysis.bullReasons) ? analysis.bullReasons.slice(0, 5) : [],
    bearReasons: Array.isArray(analysis.bearReasons) ? analysis.bearReasons.slice(0, 5) : [],
    scores: {
      technical: { score: Math.max(0, Math.min(100, analysis.technicalScore || 50)), reasoning: analysis.technicalReasoning || analysis.technical?.reasoning || 'Technical analysis pending.' },
      market: { score: Math.max(0, Math.min(100, analysis.marketScore || 50)), reasoning: analysis.marketReasoning || analysis.market?.reasoning || 'Market context pending.' },
      risk: { score: Math.max(0, Math.min(100, analysis.riskScore || 50)), reasoning: analysis.riskReasoning || analysis.risk?.reasoning || 'Risk assessment pending.' },
      catalyst: { score: Math.max(0, Math.min(100, analysis.catalystScore || 50)), reasoning: analysis.catalystReasoning || analysis.catalyst?.reasoning || 'Catalyst analysis pending.' },
      sentiment: { score: Math.max(0, Math.min(100, analysis.sentimentScore || 50)), reasoning: analysis.sentimentReasoning || analysis.sentiment?.reasoning || 'Sentiment analysis pending.' },
    },
    keyLevels: analysis.keyLevels || {},
    finalThesis: analysis.finalThesis || analysis.conclusion || '',
    asOf: new Date().toISOString(),
    timing: { dataFetchMs: dataFetchTime, grokMs: grokTime, totalMs: Date.now() - t0 },
  }
}

// ── Handler ──────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const start = Date.now()
  const { symbol } = req.body || {}
  console.log('[VERDICT] Deep analysis started for:', symbol)
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('synthesis', 30, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/verdict', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `synthesis:verdict:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/verdict', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    console.log('[VERDICT] Running deep forensic analysis...')
    const data = await deepAnalyze(symbol)
    console.log(`[VERDICT] Analysis complete: ${data.verdict} ${data.confidence}% (${data.timing?.totalMs}ms)`)
    setCache(cacheKey, data, 10 * 60 * 1000)
    log('POST', '/synthesis/verdict', 200, Date.now() - start)
    res.json({ ...data, elapsedMs: Date.now() - start })
  } catch (err) {
    console.error('[VERDICT ERROR]', err)
    error('verdict', err)
    res.status(500).json({ error: err.message, stack: err.stack })
  }
}
