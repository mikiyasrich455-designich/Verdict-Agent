import { Router } from 'express'
import fetch from 'node-fetch'
import { rateLimit } from '../lib/rateLimit.js'
import { getCache, setCache } from '../lib/cache.js'
import { log, error } from '../lib/logger.js'
import {
  normalizeVerdict,
  normalizeDebate,
  normalizeRiskDesk,
  unwrapRyo,
} from '../lib/normalizers.js'
import { discoverKols } from '../lib/kolDiscovery.js'
import { resolveCaInBody } from '../lib/caGuard.js'
import { callLLM, callSearch, QWEN_MODELS } from '../lib/llm.js'

const router = Router()

// Swap pasted contract addresses for live-resolved tickers before any handler runs
router.use(resolveCaInBody)

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

// ── Deep forensic analysis: SERP + RYO + LLM (PARALLEL) ──────────
async function deepAnalyze(symbol, live = null) {
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
        queries.map(q => callSearch(q, 5).catch(e => {
          console.log('[DEEP] SERP failed for query:', q, e.message)
          return null
        }))
      )
      for (const r of results) {
        // Live search returns { organic: [...] } (top level) or { data: { organic: [...] } }
      const organic = r.status === 'fulfilled' ? (r.value?.organic || r.value?.data?.organic) : null
        if (organic && Array.isArray(organic)) {
          allResults.push(...organic.slice(0, 5).map(item => ({
            title: item.title || '',
            url: item.link || '',
            snippet: item.snippet || '',
            position: item.position || 0
          })))
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

  // Live resolver numbers win over RYO's qualitative layer — this is what makes BTC,
  // SOL and native coins show real price/cap/volume instead of a zero-fallback.
  const livePrice = Number(live?.priceUsd) || 0
  const liveChange = Number(live?.change24h)
  const liveCap = Number(live?.marketCap) || 0
  const liveVol = Number(live?.volume24h) || 0
  const liveLiq = Number(live?.liquidityUsd) || 0

  const priceUsd = livePrice > 0 ? livePrice : (market.price_usd || 0)
  const change24h = Number.isFinite(liveChange) ? liveChange : (perf.change_24h_pct || 0)
  const marketCapUsd = liveCap > 0 ? liveCap : (market.market_cap_usd || 0)
  const volume24hUsd = liveVol > 0 ? liveVol : (market.volume_24h_usd || 0)

  const serpText = serpData?.map(r => {
    const title = r.title || r.snippet || ''
    const snippet = r.snippet || ''
    const url = r.url || ''
    return `- ${title}\n  ${snippet}\n  Source: ${url}`
  }).join('\n\n') || 'No search results available.'

  const prompt = `You are a TOP-TIER crypto research analyst conducting a FORENSIC deep-dive analysis.

SYMBOL: ${symbolUpper}
NAME: ${asset.name || symbolUpper}
${live?.ca ? `EXACT TOKEN IDENTITY: contract ${live.ca} on ${live.chainLabel || live.chain || 'resolved chain'}. Analyze ONLY this exact token — never substitute another coin, ticker or chain.` : 'IDENTITY: resolve strictly by the SYMBOL above — never substitute another coin, ticker or chain.'}
CURRENT PRICE: $${priceUsd.toLocaleString()}
24H CHANGE: ${change24h}%
7D CHANGE: ${perf.change_7d_pct || 0}%
30D MOMENTUM: ${perf.momentum_30d_pct || 0}%
MARKET CAP: $${(marketCapUsd / 1e6).toFixed(1)}M
24H VOLUME: $${(volume24hUsd / 1e6).toFixed(1)}M
${liveLiq > 0 ? `LIQUIDITY: $${(liveLiq / 1e6).toFixed(1)}M\n` : ''}${live?.buys24h != null ? `24H TAPE: ${live.buys24h || 0} buys / ${live.sells24h || 0} sells\n` : ''}${live?.pairAgeDays != null ? `POOL AGE: ${Number(live.pairAgeDays).toFixed(0)} days\n` : ''}

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

YOUR TASK — Respond with ONLY a single valid JSON object (no markdown, no code fences, no prose before or after) using EXACTLY these keys:

{
  "verdict": "BUY" | "HOLD" | "AVOID",
  "confidence": <0-100 integer>,
  "bullScore": <0-100 integer>,
  "bearScore": <0-100 integer>,
  "summary": "<3-4 sentences plain-English thesis>",
  "bullReasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "bearReasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "technical": { "score": <0-100>, "reasoning": "<2-3 sentences>" },
  "market":    { "score": <0-100>, "reasoning": "<2-3 sentences>" },
  "risk":      { "score": <0-100>, "reasoning": "<2-3 sentences>" },
  "catalyst":  { "score": <0-100>, "reasoning": "<2-3 sentences>" },
  "sentiment": { "score": <0-100>, "reasoning": "<2-3 sentences>" },
  "keyLevels": { "support": "<value>", "resistance": "<value>", "stopLoss": "<value>", "target": "<value>" },
  "finalThesis": "<2-3 sentence conclusion>"
}

IMPORTANT RULES:
- Output MUST be valid JSON parseable by JSON.parse. Double-quote all keys and string values. No trailing commas. No comments.
- Use the EXACT key names above (verdict, confidence, bullScore, bearScore, summary, bullReasons, bearReasons, technical, market, risk, catalyst, sentiment, keyLevels, finalThesis). Do NOT rename them.
- bullReasons and bearReasons MUST each have 3-5 concrete, evidence-based strings (not empty).
- Each pillar object MUST have both "score" (number) and "reasoning" (non-empty string).
- Be specific. Use actual numbers, dates, events from the data. Don't hedge.
- bullScore + bearScore ≈ 100 (±15). Verdict: BUY if bull>bear+15, AVOID if bear>bull+15, else HOLD.
- Ground all reasoning in the provided market data and web results. Never name the data providers, tools or models behind the inputs — write as an analyst, not an integration log.`

  // Call the reasoning model for deep analysis
  console.log(`[DEEP] ${symbolUpper}: Calling reasoning model for analysis...`)
  const tLlmStart = Date.now()
  let response = await callLLM([
    { role: 'system', content: 'You are a world-class crypto research analyst. Respond with ONLY one valid JSON object, no markdown fences, no commentary. Be thorough, specific, and evidence-based.' },
    { role: 'user', content: prompt },
  ], undefined, 4000)
  let analysis = extractJson(response)

  // Retry once if the model did not return parseable JSON
  if (!analysis) {
    console.log('[DEEP] Response was not valid JSON, retrying once...')
    response = await callLLM([
      { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
      { role: 'user', content: prompt + '\n\nREMINDER: Return ONLY the JSON object with the exact keys specified.' },
    ], undefined, 4000)
    analysis = extractJson(response)
  }
  if (!analysis) {
    throw new Error('Analysis response did not contain valid JSON')
  }
  const llmTime = Date.now() - tLlmStart
  console.log(`[DEEP] ${symbolUpper}: Reasoning response received in ${llmTime}ms`)

  // Validate and return (accepts nested {score,reasoning} or flat xxxScore/xxxReasoning keys)
  return {
    symbol: symbolUpper,
    name: asset.name || symbolUpper,
    priceUsd,
    change24h,
    bullScore: clampScore(firstNum(analysis.bullScore, analysis.bull_score)),
    bearScore: clampScore(firstNum(analysis.bearScore, analysis.bear_score)),
    verdict: ['BUY', 'HOLD', 'AVOID'].includes(String(analysis.verdict || '').toUpperCase())
      ? String(analysis.verdict).toUpperCase()
      : 'HOLD',
    confidence: clampScore(firstNum(analysis.confidence)),
    summary: analysis.summary || analysis.overview || analysis.overall_summary || 'Analysis complete.',
    bullReasons: firstArr(analysis.bullReasons, analysis.bull_case, analysis.bull, analysis.bullPoints).slice(0, 5),
    bearReasons: firstArr(analysis.bearReasons, analysis.bear_case, analysis.bear, analysis.bearPoints).slice(0, 5),
    scores: {
      technical: pickPillar(analysis.technical, analysis.technicalScore, analysis.technicalReasoning, 'Technical analysis pending.'),
      market: pickPillar(analysis.market, analysis.marketScore, analysis.marketReasoning, 'Market context pending.'),
      risk: pickPillar(analysis.risk, analysis.riskScore, analysis.riskReasoning, 'Risk assessment pending.'),
      catalyst: pickPillar(analysis.catalyst, analysis.catalystScore, analysis.catalystReasoning, 'Catalyst analysis pending.'),
      sentiment: pickPillar(analysis.sentiment, analysis.sentimentScore, analysis.sentimentReasoning, 'Sentiment analysis pending.'),
    },
    keyLevels: analysis.keyLevels || analysis.key_levels || analysis.levels || {},
    finalThesis: analysis.finalThesis || analysis.final_thesis || analysis.thesis || analysis.conclusion || '',
    asOf: new Date().toISOString(),
    timing: {
      dataFetchMs: dataFetchTime,
      llmMs: llmTime,
      totalMs: Date.now() - t0,
    },
  }
}

// ── Robust JSON extraction from LLM output ───────────────────────
function extractJson(text) {
  if (!text) return null
  let t = String(text).trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch { /* fall through */ }
    // Last resort: drop a trailing comma that breaks JSON.parse
    try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { /* fall through */ }
  }
  return null
}

function firstNum(...cands) {
  for (const c of cands) {
    if (c !== undefined && c !== null && c !== '' && Number.isFinite(Number(c))) return Number(c)
  }
  return undefined
}

function firstArr(...cands) {
  for (const c of cands) {
    if (Array.isArray(c) && c.length) return c
  }
  return []
}

function clampScore(n) {
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50
}

function pickPillar(nested, flatScore, flatReason, fallbackReason) {
  const src = nested && typeof nested === 'object' ? nested : {}
  const score = firstNum(flatScore, src.score)
  const reasoning = flatReason || src.reasoning || src.text || fallbackReason
  return { score: clampScore(score), reasoning: String(reasoning) }
}

// ── Shared formatting / SERP helpers ─────────────────────────────
function moneyShort(v) {
  const n = Number(v) || 0
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

const cleanName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function serpList(r) {
  const organic = r?.organic || r?.data?.organic
  return Array.isArray(organic) ? organic : []
}

// ── Live qualitative insights: search + LLM grounded in live numbers ──
export async function liveInsights(live) {
  const sym = String(live?.symbol || '').toUpperCase()
  const name = live?.name || sym

  const serp = await callSearch(`${name} ${sym} crypto token news analysis`, 6).catch((e) => {
    console.log('[INSIGHTS] SERP failed:', e.message)
    return null
  })
  const newsText = serpList(serp)
    .slice(0, 6)
    .map((r) => `- ${r.title || ''}: ${r.snippet || ''}`)
    .join('\n')

  const prompt = `You are a crypto research analyst. Ground every sentence in the live market data and web research below. Never name data providers, APIs or models.

TOKEN: ${name} (${sym})${live?.ca ? ` — contract ${live.ca} on ${live.chainLabel || live.chain || 'chain'}` : ''}
LIVE MARKET DATA: price $${Number(live?.priceUsd || 0)} · 24h ${Number(live?.change24h || 0).toFixed(2)}% · cap ${moneyShort(live?.marketCap)} · volume ${moneyShort(live?.volume24h)} · liquidity ${moneyShort(live?.liquidityUsd)} · 24h tape ${live?.buys24h || 0} buys / ${live?.sells24h || 0} sells · pool age ${Number(live?.pairAgeDays || 0).toFixed(0)} days

WEB RESEARCH:
${newsText || 'No search results available — reason from the live market data alone.'}

Respond with ONLY a valid JSON object:
{
  "catalysts": [ {"t": "<one specific catalyst sentence>", "eta": "today|ongoing|<month>", "impact": "high|medium|low"} ],
  "risks": [ {"t": "<one specific risk sentence>", "sev": "critical|high|medium|low"} ],
  "sentiment": { "bull": <0-100>, "bear": <0-100>, "neutral": <0-100> }
}
3-5 catalysts and 3-5 risks, each a concrete sentence citing a number or headline.`

  const text = await callLLM([
    { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
    { role: 'user', content: prompt },
  ], undefined, 2000)

  const parsed = extractJson(text)
  if (!parsed) return null
  const catalysts = (Array.isArray(parsed.catalysts) ? parsed.catalysts : [])
    .filter((c) => c && typeof c.t === 'string' && c.t.trim())
    .slice(0, 5)
    .map((c) => ({ t: c.t.trim(), eta: String(c.eta || 'ongoing'), impact: String(c.impact || 'medium') }))
  const risks = (Array.isArray(parsed.risks) ? parsed.risks : [])
    .filter((r) => r && typeof r.t === 'string' && r.t.trim())
    .slice(0, 5)
    .map((r) => ({ t: r.t.trim(), sev: String(r.sev || 'medium') }))
  if (!catalysts.length || !risks.length) return null
  const s = parsed.sentiment || {}
  const bull = clampScore(firstNum(s.bull))
  const bear = clampScore(firstNum(s.bear))
  return { catalysts, risks, sentiment: { bull, bear, neutral: Math.max(0, 100 - bull - bear) } }
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

  const response = await callLLM([
    { role: 'system', content: 'You are a professional financial content writer. Write clear, engaging, data-driven scripts for financial analysis videos. Always deliver complete scripts with no placeholders.' },
    { role: 'user', content: prompt },
  ], undefined, 3000)

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

// POST /api/proxy/synthesis/verdict → Deep forensic analysis (research + RYO + Qwen)
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
    const data = await deepAnalyze(symbol, req.tokenIdentity)

    console.log(`[VERDICT] Analysis complete: ${data.verdict} ${data.confidence}% (${data.timing?.totalMs}ms)`)
    setCache(cacheKey, data, 30 * 60 * 1000)
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

// ── Council: evidence-grounded adversarial analysis ──────────────
function councilKey(req, prefix) {
  const live = req.tokenIdentity || null
  const sym = String(req.body?.symbol || '').toUpperCase()
  const id = live?.ca || (live?.chain ? `${live.chain}:${sym}` : sym)
  return `${prefix}:${id.toLowerCase()}`
}

const BULL_ROLE = `You are the BULL advocate on a professional crypto trading desk. Your only job is to build the strongest evidence-based case for commitment (long exposure) in the token under review. Argue strictly from the evidence pack provided: cite prices, volume, liquidity, tape flow, pool age, catalysts and headlines. Surface upside the others miss and treat risks as priced-in or manageable only when the evidence supports it. Never name data providers, APIs or models. Plain text only, no markdown.`

const BEAR_ROLE = `You are the BEAR advocate on a professional crypto trading desk. Your only job is to build the strongest evidence-based case for caution (reducing or avoiding exposure) in the token under review. Argue strictly from the evidence pack provided: cite liquidity depth, sell pressure, wallet concentration, valuation, pool age and risk headlines. Stress-test bullish claims and expose what the bulls ignore. Never name data providers, APIs or models. Plain text only, no markdown.`

const JUDGE_ROLE = `You are the neutral JUDGE of a crypto trading desk council. You never take sides in advance. You weigh the bull and bear arguments strictly against the evidence pack: claims grounded in specific numbers outrank rhetoric. You score each advocate 0-100 for evidentiary grounding and issue one ruling (BUY, HOLD or AVOID) with a confidence score. Never name data providers, APIs or models.`

async function buildEvidencePack(symbol, live) {
  const sym = String(symbol || '').toUpperCase()
  const name = live?.name || sym

  const [ryoRes, newsRes, riskRes] = await Promise.allSettled([
    callRyoTool('analyze_token', { symbol: sym }),
    callSearch(`${name} ${sym} crypto token latest news price`, 6),
    callSearch(`${name} ${sym} crypto token risk liquidity concerns`, 6),
  ])

  const lines = []
  lines.push(`TOKEN: ${name} (${sym})${live?.ca ? ` — contract ${live.ca} on ${live.chainLabel || live.chain || 'chain'}` : ''}`)

  if (live) {
    lines.push('')
    lines.push('LIVE MARKET DATA:')
    lines.push(`- Price: $${Number(live.priceUsd || 0)}`)
    lines.push(`- 24h change: ${Number(live.change24h || 0).toFixed(2)}%`)
    lines.push(`- Market cap: ${moneyShort(live.marketCap)} · FDV: ${moneyShort(live.fdv)}`)
    lines.push(`- 24h volume: ${moneyShort(live.volume24h)} · Liquidity: ${moneyShort(live.liquidityUsd)}`)
    lines.push(`- 24h tape: ${live.buys24h || 0} buys / ${live.sells24h || 0} sells (${live.uniqueBuyers24h || 0} buyers / ${live.uniqueSellers24h || 0} wallets)`)
    lines.push(`- Pool age: ${Number(live.pairAgeDays || 0).toFixed(0)} days`)
    if (Number.isFinite(Number(live.athChangePct))) lines.push(`- Distance from ATH: ${Number(live.athChangePct).toFixed(1)}%`)
  }

  if (ryoRes.status === 'fulfilled') {
    const u = unwrapRyo(ryoRes.value) || {}
    const ryoTrusted = !live?.ca || (cleanName(u.symbol) === cleanName(sym) && (!u.name || cleanName(u.name) === cleanName(name)))
    if (ryoTrusted) {
      const desc = typeof u.description === 'string' ? u.description.slice(0, 400) : ''
      const cats = Array.isArray(u.categories) ? u.categories.join(', ') : ''
      if (desc || cats) {
        lines.push('')
        lines.push('RESEARCH DESK LAYER:')
        if (desc) lines.push(`- About: ${desc}`)
        if (cats) lines.push(`- Categories: ${cats}`)
      }
    }
  }

  const news = newsRes.status === 'fulfilled' ? serpList(newsRes.value).slice(0, 6) : []
  const risk = riskRes.status === 'fulfilled' ? serpList(riskRes.value).slice(0, 6) : []
  if (news.length || risk.length) {
    lines.push('')
    lines.push('WEB INTELLIGENCE:')
    news.forEach((r) => lines.push(`- [news] ${r.title || ''} — ${r.snippet || ''}`))
    risk.forEach((r) => lines.push(`- [risk] ${r.title || ''} — ${r.snippet || ''}`))
  }

  return lines.join('\n')
}

async function runCouncil(symbol, live) {
  const sym = String(symbol || '').toUpperCase()
  const name = live?.name || sym
  const evidence = await buildEvidencePack(symbol, live)

  // Round 1 — independent opening cases (parallel)
  const [bullOpenRes, bearOpenRes] = await Promise.all([
    callLLM([
      { role: 'system', content: BULL_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nDeliver your opening case for commitment. 120-180 words. Cite specific numbers from the pack.` },
    ], QWEN_MODELS.bull, 1400).catch(() => ''),
    callLLM([
      { role: 'system', content: BEAR_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nDeliver your opening case for caution. 120-180 words. Cite specific numbers from the pack.` },
    ], QWEN_MODELS.bear, 1400).catch(() => ''),
  ])
  const bullOpen = String(bullOpenRes || '').trim() || `The pack shows ${name} trading at $${Number(live?.priceUsd || 0)} with live tape flow and an active pool — structure supports commitment.`
  const bearOpen = String(bearOpenRes || '').trim() || `The pack shows thin liquidity and uncertain flow for ${name} — caution is warranted until depth improves.`

  // Round 2 — cross-examination (parallel, each reads the other's opening)
  const [bullRebutRes, bearRebutRes] = await Promise.all([
    callLLM([
      { role: 'system', content: BULL_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nThe BEAR advocate opened with:\n"${bearOpen}"\n\nCross-examine it. Dismantle its two weakest points with evidence from the pack and defend your thesis. 100-150 words.` },
    ], QWEN_MODELS.bull, 1200).catch(() => ''),
    callLLM([
      { role: 'system', content: BEAR_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nThe BULL advocate opened with:\n"${bullOpen}"\n\nCross-examine it. Dismantle its two weakest points with evidence from the pack and defend your thesis. 100-150 words.` },
    ], QWEN_MODELS.bear, 1200).catch(() => ''),
  ])
  const bullRebut = String(bullRebutRes || '').trim() || bullOpen
  const bearRebut = String(bearRebutRes || '').trim() || bearOpen

  // Round 3 — judge rules over the full transcript
  const judgePrompt = `FULL TRANSCRIPT:
BULL OPENING: ${bullOpen}
BEAR OPENING: ${bearOpen}
BULL CROSS-EXAMINATION: ${bullRebut}
BEAR CROSS-EXAMINATION: ${bearRebut}

EVIDENCE PACK:
${evidence}

Score how well each side grounded its claims in the evidence (0-100 each), then rule. Respond with ONLY a valid JSON object:
{"bullScore": <0-100>, "bearScore": <0-100>, "verdict": "BUY"|"HOLD"|"AVOID", "confidence": <0-100>, "text": "<3-5 sentence ruling citing the decisive evidence. Never name data providers, APIs or models.>"}`

  let judge = extractJson(await callLLM([
    { role: 'system', content: JUDGE_ROLE },
    { role: 'user', content: judgePrompt },
  ], QWEN_MODELS.judge, 1600).catch(() => ''))
  if (!judge) {
    judge = extractJson(await callLLM([
      { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
      { role: 'user', content: judgePrompt },
    ], QWEN_MODELS.judge, 1600).catch(() => ''))
  }

  const bull100 = clampScore(firstNum(judge?.bullScore))
  const bear100 = clampScore(firstNum(judge?.bearScore))
  const bull01 = +(bull100 / 100).toFixed(2)
  const bear01 = +(bear100 / 100).toFixed(2)
  const diff = +(bull01 - bear01).toFixed(2)
  const threshold = 0.15
  let verdict = String(judge?.verdict || '').toUpperCase()
  if (!['BUY', 'HOLD', 'AVOID'].includes(verdict)) {
    verdict = diff > threshold ? 'BUY' : diff < -threshold ? 'AVOID' : 'HOLD'
  }
  const confidence = clampScore(firstNum(judge?.confidence, 50 + Math.abs(diff) * 100))
  const judgeText = String(judge?.text || '').trim() ||
    `The council weighed both sides on the live evidence. The bull scored ${bull100} and the bear ${bear100}. The ruling is ${verdict}.`

  return {
    symbol: sym,
    name,
    messages: [
      { role: 'bull', text: bullOpen },
      { role: 'bear', text: bearOpen },
      { role: 'bull', text: bullRebut },
      { role: 'bear', text: bearRebut },
    ],
    judge: { bullScore: bull01, bearScore: bear01, diff, threshold, verdict, confidence, text: judgeText },
    verdictData: {
      symbol: sym,
      name,
      verdict,
      confidence,
      priceUsd: live?.priceUsd ?? null,
      change24h: live?.change24h ?? null,
      asOf: new Date().toISOString(),
    },
  }
}

// POST /api/proxy/synthesis/council → Evidence-grounded Bull vs Bear vs Judge
router.post('/council', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  const limit = rateLimit('synthesis', 30, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/council', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = councilKey(req, 'synthesis:council')
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/council', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const live = req.tokenIdentity || null
    console.log('[COUNCIL] Running adversarial council for:', symbol, live?.ca || '')
    const data = await runCouncil(symbol, live)
    setCache(cacheKey, data, 30 * 60 * 1000)
    log('POST', '/synthesis/council', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('council', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/synthesis/narrative → Real KOL discovery via search + LLM
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

    // Use real KOL discovery instead of fake normalizeNarrative
    const data = await discoverKols(symbol)
    data.symbol = symbol.toUpperCase()

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

// POST /api/proxy/synthesis/script → Single LLM call: analysis + script (no double call)
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

    // Reuse the already-computed deep verdict when present so Studio opens fast;
    // otherwise run the parallel research once and cache it for the verdict too.
    const verdictCacheKey = `synthesis:verdict:${symbol.toLowerCase()}`
    let verdictData = getCache(verdictCacheKey)
    if (verdictData) {
      console.log('[SCRIPT] Reusing cached verdict (fast path)')
    } else {
      console.log('[SCRIPT] Running parallel analysis (RYO + SERP)...')
      verdictData = await deepAnalyze(symbol, req.tokenIdentity)
      setCache(verdictCacheKey, verdictData, 30 * 60 * 1000)
    }

    // Build script prompt from verdict data
    const scriptPrompt = `Write a DETAILED, PROFESSIONAL voiceover script for a crypto analysis video about ${symbol.toUpperCase()}.
${req.tokenIdentity?.ca ? `EXACT TOKEN IDENTITY: contract ${req.tokenIdentity.ca} on ${req.tokenIdentity.chainLabel || req.tokenIdentity.chain || 'resolved chain'}. Speak ONLY about this exact token — never substitute another coin, ticker or chain.\n` : 'SPEAK ONLY about the exact token above — never substitute another coin, ticker or chain.\n'}
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

    console.log('[SCRIPT] Generating script via fast writer model...')
    const script = await callLLM([
      { role: 'system', content: 'You are a professional financial content writer. Write clear, engaging, data-driven scripts. Always deliver complete scripts with no placeholders.' },
      { role: 'user', content: scriptPrompt },
    ], QWEN_MODELS.script, 3000)

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
      duration: Math.max(90, Math.round(scriptText.length / 3)),
      wordCount: scriptText.split(/\s+/).length,
      artDirection: {
        BUY: { palette: ['#5b93ff', '#34d399', '#0ea5e9'], motif: 'Golden bull ascending through a storm of candlesticks, heroic, premium fintech lighting' },
        HOLD: { palette: ['#5b93ff', '#a78bfa', '#64748b'], motif: 'Balanced scales of light suspended above a glowing market grid, calm, cinematic' },
        AVOID: { palette: ['#f87171', '#5b93ff', '#334155'], motif: 'Red bear chains wrapped around a fracturing coin, dramatic shadows, warning mood' },
      }[verdictData.verdict],
      asOf: new Date().toISOString(),
    }

    setCache(cacheKey, data, 30 * 60 * 1000)
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
