import { Router } from 'express'
import fetch from 'node-fetch'
import { rateLimit } from '../lib/rateLimit.js'
import { getCache, setCache } from '../lib/cache.js'
import { log, error } from '../lib/logger.js'
import {
  normalizeVerdict,
  normalizeDebate,
  normalizeNarrative,
  normalizeRiskDesk,
  unwrapRyo,
} from '../lib/normalizers.js'

const router = Router()

// ── RYO call helper ──────────────────────────────────────────────
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

// ── AceData SERP search helper ───────────────────────────────────
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

// ── AceData Chat helper (Grok) ───────────────────────────────────
async function callAceChat(messages, model = 'grok-4', maxTokens = 4000) {
  const url = `${process.env.ACEDATA_BASE}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AceData Chat failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// ── Deep forensic analysis: SERP + RYO + Grok (PARALLEL) ──────────
async function deepAnalyze(symbol) {
  const symbolUpper = symbol.toUpperCase()
  const t0 = Date.now()

  // PARALLEL: RYO + 3x SERP queries all at once (was sequential = 9-15s)
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

  const ryoData = ryoRaw?.status === 'fulfilled' && ryoRaw?.value ? unwrapRyo(ryoRaw.value) : {}
  const serpData = serpResults?.status === 'fulfilled' && serpResults?.value ? serpResults.value : []

  // Build comprehensive prompt with RYO + SERP data
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

  // Call Grok for deep analysis
  console.log(`[DEEP] ${symbolUpper}: Calling Grok for analysis...`)
  const tGrokStart = Date.now()
  const response = await callAceChat([
    { role: 'system', content: 'You are a world-class crypto research analyst. Always respond with valid JSON. Be thorough, specific, and evidence-based.' },
    { role: 'user', content: prompt },
  ], 'grok-4', 4000)
  const grokTime = Date.now() - tGrokStart
  console.log(`[DEEP] ${symbolUpper}: Grok response received in ${grokTime}ms`)

  // Parse JSON from response
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Analysis response did not contain valid JSON')
  }

  const analysis = JSON.parse(jsonMatch[0])

  // Validate and return
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
      technical: {
        score: Math.max(0, Math.min(100, analysis.technicalScore || 50)),
        reasoning: analysis.technicalReasoning || analysis.technical?.reasoning || 'Technical analysis pending.',
      },
      market: {
        score: Math.max(0, Math.min(100, analysis.marketScore || 50)),
        reasoning: analysis.marketReasoning || analysis.market?.reasoning || 'Market context pending.',
      },
      risk: {
        score: Math.max(0, Math.min(100, analysis.riskScore || 50)),
        reasoning: analysis.riskReasoning || analysis.risk?.reasoning || 'Risk assessment pending.',
      },
      catalyst: {
        score: Math.max(0, Math.min(100, analysis.catalystScore || 50)),
        reasoning: analysis.catalystReasoning || analysis.catalyst?.reasoning || 'Catalyst analysis pending.',
      },
      sentiment: {
        score: Math.max(0, Math.min(100, analysis.sentimentScore || 50)),
        reasoning: analysis.sentimentReasoning || analysis.sentiment?.reasoning || 'Sentiment analysis pending.',
      },
    },
    keyLevels: analysis.keyLevels || {},
    finalThesis: analysis.finalThesis || analysis.conclusion || '',
    asOf: new Date().toISOString(),
    timing: {
      dataFetchMs: dataFetchTime,
      grokMs: grokTime,
      totalMs: Date.now() - t0,
    },
  }
}

// ── Generate detailed script from deep research ──────────────────
async function generateDetailedScript(symbol, verdictData) {
  const symbolUpper = symbol.toUpperCase()

  // Build research prompt for long-form script
  const prompt = `Write a DETAILED, PROFESSIONAL voiceover script for a crypto analysis video about ${symbolUpper}.

VERDICT DATA:
- Symbol: ${symbolUpper}
- Name: ${verdictData.name || symbolUpper}
- Price: $${(verdictData.priceUsd || 0).toLocaleString()}
- 24H Change: ${verdictData.change24h || 0}%
- Verdict: ${verdictData.verdict}
- Confidence: ${verdictData.confidence}%
- Bull Score: ${verdictData.bullScore}%
- Bear Score: ${verdictData.bearScore}%

PILLARS:
${Object.entries(verdictData.scores || {}).map(([k, v]) => `- ${k.toUpperCase()}: ${v.score}/100 — ${v.reasoning}`).join('\n')}

BULL CASE:
${(verdictData.bullReasons || []).map(r => `- ${r}`).join('\n')}

BEAR CASE:
${(verdictData.bearReasons || []).map(r => `- ${r}`).join('\n')}

SUMMARY: ${verdictData.summary}

SCRIPT REQUIREMENTS:
1. LENGTH: 300-500 words (approximately 2-3 minutes spoken)
2. TONE: Professional, authoritative, data-driven. No hype, no fear-mongering.
3. STRUCTURE:
   - OPENING (30-40 words): Hook with current price action and verdict
   - MARKET CONTEXT (60-80 words): Where does this asset sit in the market?
   - BULL ARGUMENTS (80-100 words): Detailed case for going long
   - BEAR ARGUMENTS (80-100 words): Detailed risks and concerns
   - KEY LEVELS (40-50 words): Support, resistance, entry zones
   - CONCLUSION (40-50 words): Final verdict with conviction statement
4. STYLE:
   - Use specific numbers from the data
   - Reference technical indicators by name (RSI, ATR, etc.)
   - Mention catalysts and risks by name
   - No generic filler — every sentence must add value
   - Sound like a seasoned institutional analyst, not a YouTuber
5. END with: "This is not financial advice. Trade the evidence, not the noise."

Write the complete script now. No placeholders, no [pause], no instructions. Just the spoken text.`

  const response = await callAceChat([
    { role: 'system', content: 'You are a professional financial content writer. Write clear, engaging, data-driven scripts for financial analysis videos. Always deliver complete scripts with no placeholders.' },
    { role: 'user', content: prompt },
  ], 'grok-4', 3000)

  // Clean up the response — remove markdown if present
  let script = response
    .replace(/^```[\s]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()

  // Ensure it ends with the required disclaimer
  if (!script.toLowerCase().includes('not financial advice')) {
    script += '\n\nThis is not financial advice. Trade the evidence, not the noise.'
  }

  return script
}

// ── Routes ───────────────────────────────────────────────────────

// POST /api/proxy/synthesis/verdict → Deep forensic analysis (SERP + RYO + Grok)
router.post('/verdict', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
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
    // Include timing in response for frontend progress
    res.json({ ...data, elapsedMs: Date.now() - start })
  } catch (err) {
    console.error('[VERDICT ERROR]', err)
    error('verdict', err)
    res.status(500).json({ error: err.message, stack: err.stack })
  }
})

// POST /api/proxy/synthesis/debate → RYO analyze → debate shape
router.post('/debate', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('synthesis', 30, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/debate', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `synthesis:debate:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/debate', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeDebate(raw)

    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/synthesis/debate', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('debate', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/synthesis/narrative → RYO analyze → narrative shape
router.post('/narrative', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('synthesis', 30, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/narrative', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `synthesis:narrative:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/narrative', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeNarrative(raw, symbol)

    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/synthesis/narrative', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('narrative', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/synthesis/risk → RYO analyze → risk desk shape
router.post('/risk', async (req, res) => {
  const start = Date.now()
  const { symbol, limits } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('synthesis', 30, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/risk', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `synthesis:risk:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/risk', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
    const data = normalizeRiskDesk(raw, limits)

    setCache(cacheKey, data, 5 * 60 * 1000)
    log('POST', '/synthesis/risk', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('risk', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/synthesis/script → Single Grok call: analysis + script (no double call)
router.post('/script', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  console.log('[SCRIPT] Generating script for:', symbol)
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('synthesis', 30, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/script', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `synthesis:script:${symbol.toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/script', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    // Reuse deepAnalyze (now parallel SERP) — single Grok call for analysis
    console.log('[SCRIPT] Running parallel analysis (RYO + SERP)...')
    const verdictData = await deepAnalyze(symbol)

    // Build script prompt from verdict data
    const scriptPrompt = `Write a DETAILED, PROFESSIONAL voiceover script for a crypto analysis video about ${symbol.toUpperCase()}.

VERDICT: ${verdictData.verdict} | CONFIDENCE: ${verdictData.confidence}% | BULL: ${verdictData.bullScore}% | BEAR: ${verdictData.bearScore}%

PILLARS:
${Object.entries(verdictData.scores || {}).map(([k, v]) => `- ${k.toUpperCase()}: ${v.score}/100 — ${v.reasoning}`).join('\n')}

BULL CASE: ${(verdictData.bullReasons || []).map(r => `- ${r}`).join('\n')}
BEAR CASE: ${(verdictData.bearReasons || []).map(r => `- ${r}`).join('\n')}
SUMMARY: ${verdictData.summary}

SCRIPT REQUIREMENTS:
1. LENGTH: 300-500 words (~2-3 min spoken)
2. TONE: Professional, authoritative, data-driven. No hype, no fear-mongering.
3. STRUCTURE: Opening → Market Context → Bull Arguments → Bear Arguments → Key Levels → Conclusion
4. END with: "This is not financial advice. Trade the evidence, not the noise."

Write the complete script now. No placeholders, no [pause]. Just the spoken text.`

    console.log('[SCRIPT] Generating script via Grok...')
    const script = await callAceChat([
      { role: 'system', content: 'You are a professional financial content writer. Write clear, engaging, data-driven scripts. Always deliver complete scripts with no placeholders.' },
      { role: 'user', content: scriptPrompt },
    ], 'grok-4', 3000)

    let scriptText = script
      .replace(/^```[\s]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    if (!scriptText.toLowerCase().includes('not financial advice')) {
      scriptText += '\n\nThis is not financial advice. Trade the evidence, not the noise.'
    }

    const data = {
      symbol: verdictData.symbol,
      name: verdictData.name,
      verdict: verdictData.verdict,
      confidence: verdictData.confidence,
      bullScore: verdictData.bullScore,
      bearScore: verdictData.bearScore,
      script: scriptText,
      tone: verdictData.verdict === 'BUY' ? 'confident and steady' : verdictData.verdict === 'HOLD' ? 'measured and calm' : 'firm and cautionary',
      duration: `~${Math.max(90, Math.round(scriptText.length / 3))}s`,
      wordCount: scriptText.split(/\s+/).length,
      artDirection: {
        BUY: { palette: ['#5b93ff', '#34d399', '#0ea5e9'], motif: 'Golden bull ascending through a storm of candlesticks, heroic, premium fintech lighting' },
        HOLD: { palette: ['#5b93ff', '#a78bfa', '#64748b'], motif: 'Balanced scales of light suspended above a glowing market grid, calm, cinematic' },
        AVOID: { palette: ['#f87171', '#5b93ff', '#334155'], motif: 'Red bear chains wrapped around a fracturing coin, dramatic shadows, warning mood' },
      }[verdictData.verdict],
      asOf: new Date().toISOString(),
    }

    setCache(cacheKey, data, 10 * 60 * 1000)
    log('POST', '/synthesis/script', 200, Date.now() - start)
    console.log('[SCRIPT] Done:', data.wordCount, 'words,', Date.now() - start, 'ms')
    res.json(data)
  } catch (err) {
    console.error('[SCRIPT ERROR]', err)
    error('script', err)
    res.status(500).json({ error: err.message, stack: err.stack })
  }
})

export default router
