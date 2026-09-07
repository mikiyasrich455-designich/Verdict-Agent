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
import { stanceKey, stanceLabel, stanceFromScores, stanceFromDiff, STANCE_RULES, DYOR_SHORT } from '../lib/stance.js'
import { assessMemecoinRisk, riskPromptBlock } from '../lib/memeRisk.js'

const router = Router()

// Swap pasted contract addresses for live-resolved tickers before any handler runs
router.use(resolveCaInBody)

// ── RYO call helper ──────────────────────────────────────────────
async function callRyoTool(toolName, body = {}, timeoutMs = 20000) {
  const url = `${process.env.RYO_MCP_BASE}/tools/${toolName}/call`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RYO_MCP_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RYO ${toolName} failed: ${res.status} ${text}`)
  }

  return res.json()
}

// ── Stage budget: a slow source is abandoned, never fatal ─────────
// Deep analysis used to wait up to 45s per search + 55s per model call, so one
// hung upstream turned into a 100s+ page and an "operation was aborted" error.
// Every stage now has a ceiling and a usable fallback value.
function withBudget(promise, ms, fallback) {
  let timer
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms) })
  return Promise.race([promise.catch(() => fallback), guard]).finally(() => clearTimeout(timer))
}

// PARALLEL gather: RYO profile + 3 live searches at once, all inside one budget.
async function gatherDeepData(symbolUpper) {
  const [ryoRaw, serpRaw] = await Promise.allSettled([
    callRyoTool('analyze_token', { symbol: symbolUpper }, 11000),
    (async () => {
      const queries = [
        `${symbolUpper} crypto price analysis 2026`,
        `${symbolUpper} latest news developments`,
        `${symbolUpper} token ecosystem update`,
      ]
      const allResults = []
      const results = await Promise.allSettled(
        queries.map(q => callSearch(q, 5, 20000).catch(e => {
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

  if (ryoRaw.status === 'rejected') {
    console.log('[DEEP] RYO failed, continuing with SERP only:', ryoRaw.reason?.message)
  }
  const ryoData = ryoRaw.status === 'fulfilled' && ryoRaw.value ? unwrapRyo(ryoRaw.value) : {}
  const serpData = serpRaw.status === 'fulfilled' && Array.isArray(serpRaw.value) ? serpRaw.value : []
  return { ryoData, serpData }
}

// ── Deep forensic analysis: SERP + RYO + LLM (PARALLEL) ──────────
async function deepAnalyze(symbol, live = null) {
  const symbolUpper = symbol.toUpperCase()
  const t0 = Date.now()

  // PARALLEL + BUDGETED: RYO and the three live searches run together and the
  // whole gather stage is capped — one slow source can never stall the verdict.
  console.log(`[DEEP] ${symbolUpper}: Starting parallel data fetch (RYO + 3x SERP)...`)
  const { ryoData, serpData } = await withBudget(
    gatherDeepData(symbolUpper),
    26000,
    { ryoData: {}, serpData: [] },
  )

  const dataFetchTime = Date.now() - t0
  console.log(`[DEEP] ${symbolUpper}: Data fetch complete in ${dataFetchTime}ms`)

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

  // Structural memecoin risk read — computed from live liquidity, pool age, tape,
  // wallets and volatility. Injected so the model reasons from real risk numbers.
  const riskAssessment = live ? assessMemecoinRisk(live) : null

  const priceUsd = livePrice > 0 ? livePrice : (market.price_usd || 0)
  const change24h = Number.isFinite(liveChange) ? liveChange : (perf.change_24h_pct || 0)
  const marketCapUsd = liveCap > 0 ? liveCap : (market.market_cap_usd || 0)
  const volume24hUsd = liveVol > 0 ? liveVol : (market.volume_24h_usd || 0)
  // The research desk's own tape, shown to the model as an independent second
  // quote so a >3x divergence is reasoned about as a data-quality risk.
  const ryoPrice = Number(market.price_usd) || 0
  const ryoChange = Number.isFinite(Number(perf.change_24h_pct)) ? Number(perf.change_24h_pct) : null

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
24H CHANGE: ${Number.isFinite(change24h) ? change24h : 'n/a'}%
${ryoPrice > 0 ? `RESEARCH-DESK CROSS QUOTE: $${ryoPrice.toLocaleString()} (${ryoChange !== null ? `${ryoChange}%` : 'n/a'} 24h) — an independent desk tape for the same symbol. If it diverges from the contract-bound quote above by more than 3x, trust the contract-bound quote and flag the divergence as a data-quality risk in bearReasons.\n` : ''}7D CHANGE: ${perf.change_7d_pct || 0}%
30D MOMENTUM: ${perf.momentum_30d_pct || 0}%
MARKET CAP: $${(marketCapUsd / 1e6).toFixed(1)}M
24H VOLUME: $${(volume24hUsd / 1e6).toFixed(1)}M
${liveLiq > 0 ? `LIQUIDITY: $${(liveLiq / 1e6).toFixed(1)}M\n` : ''}${live?.buys24h != null ? `24H TAPE: ${live.buys24h || 0} buys / ${live.sells24h || 0} sells\n` : ''}${live?.pairAgeDays != null ? `POOL AGE: ${Number(live.pairAgeDays).toFixed(0)} days\n` : ''}
${riskAssessment ? `\n${riskPromptBlock(riskAssessment)}\n` : ''}
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
  "verdict": "POSITIVE" | "NEUTRAL" | "CAUTION",
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
- When the STRUCTURAL MEMECOIN RISK READ above is present, reason from it explicitly: liquidity depth, token/pair age, tape flow, wallet participation and volatility must drive the "risk" pillar, the stance and the bearReasons. Disclose data gaps instead of assuming they are fine.
- bullScore + bearScore ≈ 100 (±15). Stance: POSITIVE if bull>bear+15, CAUTION if bear>bull+15, else NEUTRAL.
- Ground all reasoning in the provided market data and web results.
- End "finalThesis" by handing the decision back to the reader: remind them to do their own research.

${STANCE_RULES}`

  // Reasoning pass — capped. A slow or hung model must never become a dead page.
  console.log(`[DEEP] ${symbolUpper}: Calling reasoning model for analysis...`)
  const tLlmStart = Date.now()
  let analysis = null
  try {
    const response = await callLLM([
      { role: 'system', content: 'You are a world-class crypto research analyst. Respond with ONLY one valid JSON object, no markdown fences, no commentary. Be thorough, specific, and evidence-based.' },
      { role: 'user', content: prompt },
    ], QWEN_MODELS.reason, 2000, { timeoutMs: 34000 })
    analysis = extractJson(response)
  } catch (e) {
    console.log('[DEEP] reasoning pass failed:', e.message)
  }

  // One cheap, fast retry — lighter model, JSON mode, short leash.
  if (!analysis) {
    console.log('[DEEP] No parseable JSON yet, retrying once on the fast model...')
    try {
      const retry = await callLLM([
        { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
        { role: 'user', content: prompt + '\n\nREMINDER: Return ONLY the JSON object with the exact keys specified.' },
      ], QWEN_MODELS.chat, 1600, { timeoutMs: 30000, json: true, temperature: 0.2 })
      analysis = extractJson(retry)
    } catch (e) {
      console.log('[DEEP] retry pass failed:', e.message)
    }
  }

  // Last resort: score the live numbers we already hold. The page always renders.
  const degraded = !analysis
  if (degraded) {
    console.log(`[DEEP] ${symbolUpper}: falling back to the live-data verdict`)
    analysis = liveDataFallback({ priceUsd, change24h, perf, tech, marketCapUsd, volume24hUsd, liquidityUsd: liveLiq })
  }
  const llmTime = Date.now() - tLlmStart
  console.log(`[DEEP] ${symbolUpper}: Reasoning response received in ${llmTime}ms${degraded ? ' (degraded)' : ''}`)

  // Validate and return (accepts nested {score,reasoning} or flat xxxScore/xxxReasoning keys)
  return {
    symbol: symbolUpper,
    name: asset.name || symbolUpper,
    priceUsd,
    change24h,
    bullScore: clampScore(firstNum(analysis.bullScore, analysis.bull_score)),
    bearScore: clampScore(firstNum(analysis.bearScore, analysis.bear_score)),
    verdict: stanceKey(analysis.verdict),
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
    riskAssessment: riskAssessment ? {
      grade: riskAssessment.grade,
      gradeNote: riskAssessment.gradeNote,
      riskScore: riskAssessment.riskScore,
      positivityScore: riskAssessment.positivityScore,
      metrics: riskAssessment.metrics,
      dataGaps: riskAssessment.dataGaps,
    } : null,
    degraded,
    asOf: new Date().toISOString(),
    timing: {
      dataFetchMs: dataFetchTime,
      llmMs: llmTime,
      totalMs: Date.now() - t0,
    },
  }
}

// ── Deterministic last-resort verdict ────────────────────────────
// If neither reasoning pass answers inside the budget we still hold live market
// numbers. Score from them honestly instead of failing the page.
function usd(n) {
  const v = Number(n) || 0
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (v >= 1) return `$${v.toFixed(2)}`
  return `$${v.toPrecision(3)}`
}

function liveDataFallback({ priceUsd, change24h, perf, tech, marketCapUsd, volume24hUsd, liquidityUsd }) {
  const ch = Number(change24h) || 0
  const mom = Number(perf?.momentum_30d_pct) || 0
  const rsi = Number(tech?.rsi_14)
  const hasRsi = Number.isFinite(rsi) && rsi > 0
  const cap = Number(marketCapUsd) || 0
  const vol = Number(volume24hUsd) || 0
  const liq = Number(liquidityUsd) || 0
  const turnover = cap > 0 ? vol / cap : 0
  const p = Number(priceUsd) || 0

  let bull = 50
  bull += Math.max(-18, Math.min(18, ch * 1.2))
  bull += Math.max(-12, Math.min(12, mom * 0.25))
  if (hasRsi) bull += rsi < 30 ? 8 : rsi > 70 ? -8 : 2
  bull += turnover > 0.15 ? 6 : turnover > 0 && turnover < 0.02 ? -6 : 0
  if (liq > 0 && liq < 100000) bull -= 10

  const bullScore = clampScore(bull)
  const bearScore = clampScore(100 - bullScore)
  const verdict = stanceFromScores(bullScore, bearScore)

  return {
    verdict,
    confidence: clampScore(38 + Math.min(14, Math.abs(ch) * 0.6)),
    bullScore,
    bearScore,
    summary: `Live tape read: ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch).toFixed(2)}% over 24h with ${usd(vol)} traded against a ${usd(cap)} cap. The reasoning pass did not answer inside the time budget, so this verdict is scored strictly from the market numbers above.`,
    bullReasons: [
      ch >= 0 ? `Price is holding a ${ch.toFixed(2)}% gain over 24h.` : `Sellers are in control: ${ch.toFixed(2)}% over 24h.`,
      turnover > 0.08 ? `Turnover is active at ${(turnover * 100).toFixed(1)}% of market cap.` : `Turnover is thin at ${(turnover * 100).toFixed(1)}% of market cap.`,
      hasRsi ? `RSI(14) sits at ${rsi.toFixed(0)}.` : 'No reliable RSI reading on this feed.',
    ],
    bearReasons: [
      liq > 0 && liq < 250000 ? `Liquidity is light at ${usd(liq)} — exits can slip.` : `Liquidity reads ${liq > 0 ? usd(liq) : 'unavailable'} on this feed.`,
      mom < 0 ? `30-day momentum is negative at ${mom.toFixed(2)}%.` : `30-day momentum is ${mom.toFixed(2)}%.`,
      'This run is a data-only score: the qualitative layer did not return in time.',
    ],
    technical: {
      score: clampScore(hasRsi ? (rsi < 30 ? 65 : rsi > 70 ? 35 : 52) : 50),
      reasoning: `Scored from RSI(14) ${hasRsi ? rsi.toFixed(0) : 'n/a'} and a ${ch.toFixed(2)}% 24h move.`,
    },
    market: {
      score: clampScore(50 + Math.max(-20, Math.min(20, turnover * 100))),
      reasoning: `${usd(vol)} of 24h volume against a ${usd(cap)} cap (${(turnover * 100).toFixed(1)}% turnover).`,
    },
    risk: {
      score: clampScore(liq > 0 && liq < 250000 ? 70 : 50),
      reasoning: liq > 0 ? `Depth of ${usd(liq)} drives this risk read.` : 'No depth reading available — treated as elevated risk.',
    },
    catalyst: { score: 50, reasoning: 'No catalyst data in this run; scored neutral rather than guessed.' },
    sentiment: {
      score: clampScore(50 + Math.max(-20, Math.min(20, ch))),
      reasoning: `Tape-derived only: ${ch.toFixed(2)}% over 24h.`,
    },
    keyLevels: p > 0
      ? { support: usd(p * 0.92), resistance: usd(p * 1.1), stopLoss: usd(p * 0.88), target: usd(p * 1.18) }
      : {},
    finalThesis: `Data-only read: ${verdict} at ${bullScore}/${bearScore} bull-bear. Re-run for the full forensic read with news and reasoning. ${DYOR_SHORT}`,
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

function numShort(v) {
  const n = Number(v) || 0
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return `${n.toFixed(0)}`
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
  ], QWEN_MODELS.reason, 1200, { timeoutMs: 40000 })

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
    // Hard outer ceiling: even if a stage hangs past its own budget the caller
    // gets a clean message, never a raw "operation was aborted".
    const data = await withBudget(deepAnalyze(symbol, req.tokenIdentity), 115000, null)
    if (!data) {
      log('POST', '/synthesis/verdict', 504, Date.now() - start)
      return res.status(504).json({
        error: 'The research pass ran past its time budget. Try again — the first hit warms the cache.',
      })
    }

    console.log(`[VERDICT] Analysis complete: ${data.verdict} ${data.confidence}% (${data.timing?.totalMs}ms${data.degraded ? ', degraded' : ''})`)
    // A degraded (data-only) verdict is a one-shot answer, never a cache entry —
    // the next request must get another chance at the full reasoning pass.
    if (!data.degraded) setCache(cacheKey, data, 30 * 60 * 1000)
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

const BULL_ROLE = `You are the BULL advocate on a professional crypto research desk. Your only job is to build the strongest evidence-based case that the POSITIVITY around this token outweighs its risks. Argue strictly from the evidence pack provided: cite prices, volume, liquidity, tape flow, pool age, wallet participation, catalysts and headlines. Surface upside the others miss and treat risks as manageable only when the evidence supports it. You never instruct anyone to buy, hold or sell anything — you argue a research case and leave the decision to the reader. Never name data providers, APIs or models. Plain text only, no markdown.`

const BEAR_ROLE = `You are the BEAR advocate on a professional crypto research desk. Your only job is to build the strongest evidence-based case that the RISKS around this token dominate its positives. Argue strictly from the evidence pack provided: cite liquidity depth, sell pressure, wallet concentration and participation, token/pair age, volatility, valuation and risk headlines. Stress-test the positive claims and expose what the bulls ignore. You never instruct anyone to buy, hold or sell anything — you argue a research case and leave the decision to the reader. Never name data providers, APIs or models. Plain text only, no markdown.`

const JUDGE_ROLE = `You are the neutral JUDGE of a crypto research desk council. You never take sides in advance. You weigh the bull and bear arguments strictly against the evidence pack: claims grounded in specific numbers outrank rhetoric. You score each advocate 0-100 for evidentiary grounding and issue one research stance — POSITIVE (evidence leans constructive), NEUTRAL (evidence is two-sided) or CAUTION (evidence leans toward meaningful risk) — with a confidence score. You never instruct anyone to buy, hold, sell or avoid anything, and every ruling reminds the reader to do their own research. Never name data providers, APIs or models.`

// Evidence packs are expensive (RYO + 2 grounded searches). Cache them briefly so a
// council reload or a second agent hitting the same token doesn't pay the full cost.
const evidenceCache = new Map()
const EVIDENCE_TTL = 10 * 60 * 1000

async function buildEvidencePack(symbol, live) {
  const sym = String(symbol || '').toUpperCase()
  const name = live?.name || sym

  const cached = evidenceCache.get(sym)
  if (cached && Date.now() - cached.at < EVIDENCE_TTL) return cached.pack

  const [ryoRes, newsRes, riskRes] = await Promise.allSettled([
    callRyoTool('analyze_token', { symbol: sym }),
    callSearch(`${name} ${sym} crypto token latest news price`, 6, 18000),
    callSearch(`${name} ${sym} crypto token risk liquidity concerns`, 6, 18000),
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
    if (Number.isFinite(Number(live.cgRank))) lines.push(`- Global rank: #${Number(live.cgRank)}`)
    if (Number.isFinite(Number(live.watchers))) lines.push(`- Watchlist followers: ${numShort(live.watchers)}`)
    const circ = Number(live.circulatingSupply) || 0
    const total = Number(live.totalSupply) || 0
    if (circ > 0 && total >= circ) {
      lines.push(`- Supply: ${numShort(circ)} circulating of ${numShort(total)} total (${((circ / total) * 100).toFixed(1)}% in circulation)`)
    }
    if (live.pairName || live.exchange) {
      lines.push(`- Displayed market: ${[live.pairName, live.exchange].filter(Boolean).join(' on ')}`)
    }
    // Structural memecoin risk read so both advocates argue over real risk numbers.
    const riskBlock = riskPromptBlock(assessMemecoinRisk(live))
    if (riskBlock) {
      lines.push('')
      lines.push(riskBlock)
    }
  }

  let aboutShown = false
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
        aboutShown = !!desc
      }
    }
  }
  if (!aboutShown) {
    // The resolved global listing carries verified project copy — the council
    // must never argue about a token it knows nothing about.
    const desc = typeof live?.description === 'string' ? live.description.replace(/\s+/g, ' ').trim().slice(0, 400) : ''
    const cats = Array.isArray(live?.categories) ? live.categories.filter(Boolean).slice(0, 6).join(', ') : ''
    if (desc || cats) {
      lines.push('')
      lines.push('PROJECT CONTEXT:')
      if (desc) lines.push(`- About: ${desc}`)
      if (cats) lines.push(`- Categories: ${cats}`)
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

  const pack = lines.join('\n')
  if (evidenceCache.size > 60) evidenceCache.clear()
  evidenceCache.set(sym, { at: Date.now(), pack })
  return pack
}

async function runCouncil(symbol, live) {
  const sym = String(symbol || '').toUpperCase()
  const name = live?.name || sym
  const evidence = await buildEvidencePack(symbol, live)

  // Round 1 — independent opening cases (parallel, hard 25s ceiling each)
  const [bullOpenRes, bearOpenRes] = await Promise.all([
    callLLM([
      { role: 'system', content: BULL_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nDeliver your opening case that the POSITIVITY around ${name} outweighs its risks. 90-130 words. Cite specific numbers from the pack — liquidity depth, pool age, tape flow, wallet participation, price movement.` },
    ], QWEN_MODELS.bull, 500, { timeoutMs: 25000 }).catch(() => ''),
    callLLM([
      { role: 'system', content: BEAR_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nDeliver your opening case that the RISKS around ${name} dominate its positives. 90-130 words. Cite specific numbers from the pack — liquidity depth, pool age, tape flow, wallet participation, price movement.` },
    ], QWEN_MODELS.bear, 500, { timeoutMs: 25000 }).catch(() => ''),
  ])
  const bullOpen = String(bullOpenRes || '').trim() || `The pack shows ${name} trading at $${Number(live?.priceUsd || 0)} with live tape flow and an active pool — the structural positives deserve weight.`
  const bearOpen = String(bearOpenRes || '').trim() || `The pack shows thin liquidity and uncertain flow for ${name} — the structural risks outweigh the positives until depth improves.`

  // Round 2 — cross-examination (parallel, each reads the other's opening)
  const [bullCrossRes, bearCrossRes] = await Promise.all([
    callLLM([
      { role: 'system', content: BULL_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nThe BEAR advocate opened with:\n"${bearOpen}"\n\nCross-examine it. Dismantle its two weakest points with evidence from the pack and defend your thesis. 70-100 words.` },
    ], QWEN_MODELS.bull, 400, { timeoutMs: 22000 }).catch(() => ''),
    callLLM([
      { role: 'system', content: BEAR_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nThe BULL advocate opened with:\n"${bullOpen}"\n\nCross-examine it. Dismantle its two weakest points with evidence from the pack and defend your thesis. 70-100 words.` },
    ], QWEN_MODELS.bear, 400, { timeoutMs: 22000 }).catch(() => ''),
  ])
  const bullCross = String(bullCrossRes || '').trim() || bullOpen
  const bearCross = String(bearCrossRes || '').trim() || bearOpen

  // Round 3 — rebuttals (parallel, each answers the cross-examination it took)
  const [bullRebutRes, bearRebutRes] = await Promise.all([
    callLLM([
      { role: 'system', content: BULL_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nThe BEAR advocate cross-examined your opening like this:\n"${bearCross}"\n\nRebut it directly. Concede what the evidence genuinely concedes, refute the rest with numbers from the pack. 70-100 words.` },
    ], QWEN_MODELS.bull, 400, { timeoutMs: 20000 }).catch(() => ''),
    callLLM([
      { role: 'system', content: BEAR_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nThe BULL advocate cross-examined your opening like this:\n"${bullCross}"\n\nRebut it directly. Concede what the evidence genuinely concedes, refute the rest with numbers from the pack. 70-100 words.` },
    ], QWEN_MODELS.bear, 400, { timeoutMs: 20000 }).catch(() => ''),
  ])
  const bullRebut = String(bullRebutRes || '').trim() || bullCross
  const bearRebut = String(bearRebutRes || '').trim() || bearCross

  // Round 4 — closing statements (parallel, each sees the full six-message transcript)
  const debateSoFar = [
    `BULL OPENING: ${bullOpen}`,
    `BEAR OPENING: ${bearOpen}`,
    `BULL CROSS-EXAMINATION: ${bullCross}`,
    `BEAR CROSS-EXAMINATION: ${bearCross}`,
    `BULL REBUTTAL: ${bullRebut}`,
    `BEAR REBUTTAL: ${bearRebut}`,
  ].join('\n')
  const [bullCloseRes, bearCloseRes] = await Promise.all([
    callLLM([
      { role: 'system', content: BULL_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nFULL DEBATE SO FAR:\n${debateSoFar}\n\nDeliver your closing statement. Name the two strongest surviving points for the positive side after four rounds of scrutiny. 60-90 words.` },
    ], QWEN_MODELS.bull, 350, { timeoutMs: 18000 }).catch(() => ''),
    callLLM([
      { role: 'system', content: BEAR_ROLE },
      { role: 'user', content: `EVIDENCE PACK:\n${evidence}\n\nFULL DEBATE SO FAR:\n${debateSoFar}\n\nDeliver your closing statement. Name the two strongest surviving points for the risk side after four rounds of scrutiny. 60-90 words.` },
    ], QWEN_MODELS.bear, 350, { timeoutMs: 18000 }).catch(() => ''),
  ])
  const bullClose = String(bullCloseRes || '').trim() || bullRebut
  const bearClose = String(bearCloseRes || '').trim() || bearRebut

  // Judge rules over the complete eight-entry transcript
  const judgePrompt = `FULL TRANSCRIPT:
BULL OPENING: ${bullOpen}
BEAR OPENING: ${bearOpen}
BULL CROSS-EXAMINATION: ${bullCross}
BEAR CROSS-EXAMINATION: ${bearCross}
BULL REBUTTAL: ${bullRebut}
BEAR REBUTTAL: ${bearRebut}
BULL CLOSING: ${bullClose}
BEAR CLOSING: ${bearClose}

EVIDENCE PACK:
${evidence}

Score how well each side grounded its claims in the evidence (0-100 each), then rule. The two scores MUST differ by at least 5 points — a perfect tie is not a ruling; decide which side earned the edge. Respond with ONLY a valid JSON object:
{"bullScore": <0-100>, "bearScore": <0-100>, "verdict": "POSITIVE"|"NEUTRAL"|"CAUTION", "confidence": <0-100>, "text": "<3-5 sentence ruling citing the decisive evidence and ending with a reminder that the reader must do their own research. Never name data providers, APIs or models. Never instruct anyone to buy, hold, sell or avoid anything.>"}`

  let judge = extractJson(await callLLM([
    { role: 'system', content: JUDGE_ROLE },
    { role: 'user', content: judgePrompt },
  ], QWEN_MODELS.judge, 600, { timeoutMs: 35000 }).catch(() => ''))
  if (!judge) {
    judge = extractJson(await callLLM([
      { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
      { role: 'user', content: judgePrompt },
    ], QWEN_MODELS.judge, 600, { timeoutMs: 25000 }).catch(() => ''))
  }

  // The judge must separate the two sides. If the judge pass never returned
  // scores, score from the live tape instead of printing a flat 50/50 tie —
  // and if the scores still land equal, break the tie with the ruling's lean.
  const chJudge = Number(live?.change24h) || 0
  const judgeScored = firstNum(judge?.bullScore) !== undefined && firstNum(judge?.bearScore) !== undefined
  let bull100 = judgeScored
    ? clampScore(firstNum(judge.bullScore))
    : clampScore(50 + Math.max(-18, Math.min(18, chJudge * 1.2)))
  let bear100 = judgeScored ? clampScore(firstNum(judge.bearScore)) : clampScore(100 - bull100)
  if (bull100 === bear100) {
    const lean = judge?.verdict ? stanceKey(judge.verdict) : (chJudge >= 0 ? 'POSITIVE' : 'CAUTION')
    if (lean === 'POSITIVE') { bull100 = clampScore(bull100 + 6); bear100 = clampScore(bear100 - 6) }
    else if (lean === 'CAUTION') { bear100 = clampScore(bear100 + 6); bull100 = clampScore(bull100 - 6) }
    else { bull100 = clampScore(bull100 + (chJudge >= 0 ? 4 : -4)); bear100 = 100 - bull100 }
  }
  const bull01 = +(bull100 / 100).toFixed(2)
  const bear01 = +(bear100 / 100).toFixed(2)
  const diff = +(bull01 - bear01).toFixed(2)
  const threshold = 0.15
  const verdict = judge?.verdict ? stanceKey(judge.verdict) : stanceFromDiff(bull01, bear01, threshold)
  const confidence = clampScore(firstNum(judge?.confidence, 50 + Math.abs(diff) * 100))
  let judgeText = String(judge?.text || '').trim() ||
    `The council weighed both sides on the live evidence. The bull scored ${bull100} and the bear ${bear100}. The ruling is ${stanceLabel(verdict)}.`
  if (!/own research|not financial advice/i.test(judgeText)) judgeText += ` ${DYOR_SHORT}`

  return {
    symbol: sym,
    name,
    messages: [
      { role: 'bull', text: bullOpen },
      { role: 'bear', text: bearOpen },
      { role: 'bull', text: bullCross },
      { role: 'bear', text: bearCross },
      { role: 'bull', text: bullRebut },
      { role: 'bear', text: bearRebut },
      { role: 'bull', text: bullClose },
      { role: 'bear', text: bearClose },
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

    // Use real KOL discovery instead of fake normalizeNarrative.
    // Pass the live token identity so news can be fact-checked against real numbers.
    const data = await discoverKols(symbol, req.tokenIdentity)
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
    // Cache the RAW upstream payload, not the shaped result — limits change per request,
    // so slider moves must re-normalize instantly instead of hitting the network again.
    const cacheKey = `synthesis:risk:raw:${symbol.toLowerCase()}`
    let raw = getCache(cacheKey)
    if (!raw) {
      raw = await callRyoTool('analyze_token', { symbol: symbol.toUpperCase() })
      setCache(cacheKey, raw, 5 * 60 * 1000)
    }
    const data = normalizeRiskDesk(raw, limits)

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

    // Fast studio path: one quick LLM pass over the already-resolved live market data
    // (no RYO / SERP / deep reasoning) so Image/Video/Voice studios open in a few seconds.
    const live = req.tokenIdentity || {}
    const sym = symbol.toUpperCase()
    const priceUsd = Number(live.priceUsd) || 0
    const change24h = Number(live.change24h) || 0
    const cap = Number(live.marketCap) || 0
    const vol = Number(live.volume24h) || 0

    console.log('[SCRIPT] Fast studio script (single LLM pass over live data)...')
    const scriptRes = await callLLM([
      { role: 'system', content: 'You are a professional crypto studio writer. Output ONLY valid JSON — no markdown, no code fences, no prose.' },
      { role: 'user', content: `Write a short, evidence-grounded market analysis for a video about ${sym}. Use ONLY the live data below. Lead with a research stance, then the bull case vs the bear case, weighing positives against risks. Never instruct anyone to buy, hold, sell or avoid anything. No hype, no fear.\n\nNAME: ${live.name || sym}\nPRICE: $${priceUsd.toLocaleString()}\n24H CHANGE: ${change24h.toFixed(2)}%\nMARKET CAP: $${(cap / 1e6).toFixed(1)}M\n24H VOLUME: $${(vol / 1e6).toFixed(1)}M\n\nRespond with ONLY JSON:\n{"verdict":"POSITIVE"|"NEUTRAL"|"CAUTION","confidence":<0-100>,"bullScore":<0-100>,"bearScore":<0-100>,"script":"<150-220 word spoken script ending with a reminder to do your own research>"}` },
    ], QWEN_MODELS.script, 1800)

    const j = extractJson(scriptRes) || {}
    const verdict = stanceKey(j.verdict)
    const confidence = clampScore(firstNum(j.confidence, 60))
    const bullScore = clampScore(firstNum(j.bullScore, 50))
    const bearScore = clampScore(firstNum(j.bearScore, 50))

    let scriptText = String(j.script || '')
      .replace(/^```[\s]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    if (!scriptText) {
      const dir = change24h >= 0 ? 'up' : 'down'
      scriptText = `${live.name || sym} is trading at $${priceUsd.toLocaleString()}, ${dir} ${change24h.toFixed(2)}% over 24 hours, with a market cap near $${(cap / 1e6).toFixed(1)}M. The bull case rests on momentum, while the bear case weighs mean-reversion risk. Balance growth potential against risk.`
    }
    if (!/own research|not financial advice/i.test(scriptText)) {
      scriptText += '\n\nThis is not financial advice. Do your own research — trade the evidence, not the noise.'
    }

    const data = {
      symbol: sym,
      name: live.name || sym,
      verdict,
      confidence,
      bullScore,
      bearScore,
      script: scriptText,
      tone: verdict === 'POSITIVE' ? 'confident and steady' : verdict === 'CAUTION' ? 'firm and cautionary' : 'measured and calm',
      duration: Math.max(30, Math.round(scriptText.length / 3)),
      wordCount: scriptText.split(/\s+/).length,
      artDirection: {
        POSITIVE: { palette: ['#5b93ff', '#34d399', '#0ea5e9'], motif: 'Golden bull ascending through a storm of candlesticks, heroic, premium fintech lighting' },
        NEUTRAL: { palette: ['#5b93ff', '#a78bfa', '#64748b'], motif: 'Balanced scales of light suspended above a glowing market grid, calm, cinematic' },
        CAUTION: { palette: ['#f87171', '#5b93ff', '#334155'], motif: 'Red bear chains wrapped around a fracturing coin, dramatic shadows, warning mood' },
      }[verdict],
      asOf: new Date().toISOString(),
    }

    setCache(cacheKey, data, 15 * 60 * 1000)
    log('POST', '/synthesis/script', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    console.error('[SCRIPT ERROR]', err)
    error('script', err)
    res.status(500).json({ error: err.message, stack: err.stack })
  }
})

// ── Final recommendation: one master pass over every other agent ──
// The client gathers each agent in parallel and hands the payloads here, so this
// route never re-fetches: it compresses what arrived and makes ONE model call.
function stanceTone(stance) {
  const s = stanceKey(stance)
  if (s === 'POSITIVE') return 'up'
  if (s === 'CAUTION') return 'down'
  return 'flat'
}

const clip = (v, n = 320) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)
const list = (v, n = 3, len = 300) => (Array.isArray(v) ? v.slice(0, n).map((x) => clip(typeof x === 'string' ? x : x?.t || x?.label || JSON.stringify(x), 120)).filter(Boolean).join(' | ').slice(0, len) : '')

function digestAgents(a = {}) {
  const out = []

  const v = a.verdict
  if (v && typeof v === 'object') {
    out.push(`DEEP ANALYSIS — ${v.verdict || 'n/a'} at ${v.confidence ?? '?'}% conviction; bull ${v.bullScore ?? '?'} vs bear ${v.bearScore ?? '?'}.`)
    if (v.summary) out.push(`  Read: ${clip(v.summary)}`)
    const pillars = Object.entries(v.scores || {})
      .map(([k, p]) => `${k} ${p?.score ?? '?'}/100`)
      .join(', ')
    if (pillars) out.push(`  Pillars: ${pillars}`)
    const bull = list(v.bullReasons)
    const bear = list(v.bearReasons)
    if (bull) out.push(`  Strongest bull points: ${bull}`)
    if (bear) out.push(`  Strongest bear points: ${bear}`)
    if (v.finalThesis) out.push(`  Thesis: ${clip(v.finalThesis)}`)
  }

  const c = a.council
  if (c?.judge) {
    const j = c.judge
    const pct = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * (Number(x) <= 1 ? 100 : 1)) : '?')
    out.push(`COUNCIL RULING — ${j.verdict || 'n/a'} at ${j.confidence ?? '?'}% confidence; bull ${pct(j.bullScore)} vs bear ${pct(j.bearScore)} on evidentiary grounding.`)
    if (j.text) out.push(`  Ruling: ${clip(j.text, 380)}`)
  }

  const n = a.narrative
  if (n && typeof n === 'object') {
    out.push(`NARRATIVE RADAR — ${n.voices_tracked ?? 0} voices tracked, ${n.bullish_voices ?? 0} bullish / ${n.bearish_voices ?? 0} bearish, convergence: ${n.convergence_status || 'n/a'}.`)
    if (n.narrative_headline) out.push(`  Headline: ${clip(n.narrative_headline)}`)
    if (n.sentiment_summary_text) out.push(`  Sentiment: ${clip(n.sentiment_summary_text)}`)
  }

  const r = a.risk
  if (r && typeof r === 'object') {
    const gates = (Array.isArray(r.signals) ? r.signals : [])
      .map((s) => `${s?.label}: ${s?.pass ? 'pass' : 'fail'}`)
      .join(', ')
    out.push(`RISK DESK — ${r.qualified ? 'qualified' : 'NOT qualified'} under the user's limits. ${gates}`)
    if (r.plan) out.push(`  Plan: entry ${r.plan.entry}, stop ${r.plan.stop}, target ${r.plan.target}, size $${r.plan.sizeUsd}.`)
  }

  const o = a.overview
  if (o && typeof o === 'object') {
    const regime = o.regime || o.market_regime || o.bias
    if (regime || o.breadth || o.fearGreed !== undefined) {
      out.push(`MARKET REGIME — ${clip(JSON.stringify({ regime, breadth: o.breadth, fearGreed: o.fearGreed, btc: o.btc, eth: o.eth }), 300)}`)
    }
  }

  const s = a.sentiment
  if (s && typeof s === 'object') {
    out.push(`SENTIMENT SHIFT — ${clip(JSON.stringify(s.rotation || s.shifts || s, 300) || 'no shift data')}`)
  }

  return out
}

// ── Deterministic desk fallback ─────────────────────────────────
// If the master judge pass never returns parseable JSON we still hold every
// agent's payload in hand. Reconcile it arithmetically — scores from the
// council judge or the deep verdict, one read per agent that reported — so
// the final desk always renders instead of failing the page.
const DESK_NAMES = {
  'DEEP ANALYSIS': 'Deep Analysis',
  'COUNCIL RULING': 'Bull vs Bear',
  'NARRATIVE RADAR': 'Narrative Radar',
  'RISK DESK': 'Risk Desk',
  'MARKET REGIME': 'Market Regime',
  'SENTIMENT SHIFT': 'Sentiment Shift',
}

function deskFallback({ agents, digest, sym, name, priceUsd, change24h, gathered }) {
  const v = agents.verdict && typeof agents.verdict === 'object' ? agents.verdict : {}
  const j = agents.council?.judge || null
  const to100 = (x) => (Number.isFinite(Number(x)) ? Number(x) * (Number(x) <= 1 ? 100 : 1) : undefined)
  const ch = Number(change24h) || 0

  let bull = firstNum(to100(v.bullScore), to100(j?.bullScore))
  let bear = firstNum(to100(v.bearScore), to100(j?.bearScore))
  if (bull === undefined) bull = 50 + Math.max(-18, Math.min(18, ch * 1.2))
  if (bear === undefined) bear = 100 - bull
  let bullScore = clampScore(bull)
  let bearScore = clampScore(bear)
  if (bullScore === bearScore) {
    bullScore = clampScore(bullScore + (ch >= 0 ? 4 : -4))
    bearScore = 100 - bullScore
  }
  const stance = stanceFromScores(bullScore, bearScore)

  const agentDigests = digest
    .filter((line) => /^[A-Z][A-Z &]+— /.test(line))
    .map((line) => {
      const idx = line.indexOf(' — ')
      const head = line.slice(0, idx).trim()
      return {
        agent: DESK_NAMES[head] || head,
        read: clip(line.slice(idx + 3), 300),
        weight: 'medium',
      }
    })

  const bullReasons = firstArr(v.bullReasons).slice(0, 3).map((x) => clip(x, 220)).filter(Boolean)
  const bearReasons = firstArr(v.bearReasons).slice(0, 3).map((x) => clip(x, 220)).filter(Boolean)
  const kl = v.keyLevels || {}

  return {
    symbol: sym,
    name,
    priceUsd: priceUsd || null,
    change24h: Number.isFinite(change24h) ? change24h : null,
    stance,
    tone: stanceTone(stance),
    conviction: clampScore(38 + Math.min(30, Math.abs(bullScore - bearScore))),
    bullScore,
    bearScore,
    headline: `${name}: the desk scores the bull case ${bullScore} against the bear case ${bearScore}.`,
    thesis: `Reconciled arithmetically from ${gathered.length || digest.length} desk feeds while the qualitative judge pass was unavailable. Bull ${bullScore} vs bear ${bearScore} sets the house stance at ${stanceLabel(stance)}. Agent reads: ${agentDigests.map((d) => `${d.agent} — ${d.read}`).join(' ')} ${DYOR_SHORT}`.slice(0, 1400),
    keyPoints: [
      ...bullReasons.map((t) => ({ t, w: 'bull' })),
      ...bearReasons.map((t) => ({ t, w: 'bear' })),
    ].slice(0, 6),
    agentDigests,
    risks: bearReasons,
    catalysts: bullReasons,
    levels: {
      support: clip(kl.support, 60) || '—',
      resistance: clip(kl.resistance, 60) || '—',
      invalidation: clip(kl.stopLoss, 220) || '—',
    },
    timeframe: 'next 1-2 weeks',
    sizeNote: 'A disciplined desk frames exposure as a fraction of capital it can lose outright, sized against the invalidation level above.',
    agentsUsed: gathered.length || digest.length,
    degraded: true,
    asOf: new Date().toISOString(),
  }
}

router.post('/final', async (req, res) => {
  const start = Date.now()
  const { symbol } = req.body
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  // Own bucket: the final reconcile must never starve behind the other agents.
  const limit = rateLimit('final', 20, 60000)
  if (!limit.allowed) {
    log('POST', '/synthesis/final', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const sym = symbol.toUpperCase()
    const live = req.tokenIdentity || {}
    const cacheKey = `synthesis:final:${(live.ca || sym).toLowerCase()}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/synthesis/final', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const agents = req.body?.agents && typeof req.body.agents === 'object' ? req.body.agents : {}
    const gathered = Object.keys(agents).filter((k) => agents[k] && typeof agents[k] === 'object')
    const digest = digestAgents(agents)

    // Fall back to whatever the other agents already warmed in cache.
    if (!digest.length) {
      const warm = {
        verdict: getCache(`synthesis:verdict:${sym.toLowerCase()}`),
        council: getCache(councilKey(req, 'synthesis:council')),
        narrative: getCache(`synthesis:narrative:${sym.toLowerCase()}`),
      }
      digest.push(...digestAgents(warm))
    }
    if (!digest.length) throw new Error('No agent output available to synthesize yet')

    const priceUsd = Number(live.priceUsd) || Number(agents.verdict?.priceUsd) || 0
    const change24h = Number(live.change24h)
    const name = live.name || agents.verdict?.name || agents.council?.name || sym

    const prompt = `You are the MASTER DESK ANALYST — the senior crypto strategist who has read every other analyst's work and now delivers the house view on one token.

TOKEN: ${name} (${sym})${live.ca ? ` — contract ${live.ca} on ${live.chainLabel || live.chain || 'resolved chain'}` : ''}
LIVE PRICE: $${priceUsd}${Number.isFinite(change24h) ? ` (${change24h.toFixed(2)}% over 24h)` : ''}

EVERY AGENT'S OUTPUT, VERBATIM:
${digest.join('\n')}

YOUR JOB: reconcile all of it into ONE professional recommendation. Where agents disagree, say so and explain which evidence you weight more and why.

HARD RULES:
- NEVER say "buy", "don't buy", "sell", "go long", "go short", "invest" or any direct instruction to transact. You are an analyst framing a stance, not a signal service.
- Pick exactly ONE research stance: POSITIVE (positives outweigh the risks) / NEUTRAL (the two sides genuinely balance) / CAUTION (risks outweigh the positives).
- You are the JUDGE of the bull case and the bear case. Score each side 0-100 on the strength of its evidence ("bullScore", "bearScore"). The two scores MUST differ by at least 5 points — a tie is not a ruling. Let the gap between them drive your stance and your conviction.
- Be concrete: cite the actual numbers the agents produced.
- Never name data providers, APIs, tools or models behind any of this.
- Write like a seasoned institutional strategist: calm, specific, no hype, no fear.
- End "thesis" by handing the decision back to the reader: they must do their own research.
${STANCE_RULES}

Respond with ONLY one valid JSON object (no markdown, no fences):
{
  "stance": "POSITIVE" | "NEUTRAL" | "CAUTION",
  "conviction": <0-100>,
  "bullScore": <0-100 integer, your judge score for the bull case>,
  "bearScore": <0-100 integer, your judge score for the bear case>,
  "headline": "<max 12 words, the one-line house view>",
  "thesis": "<3-5 sentences reconciling every agent, naming the disagreement and your weighting>",
  "keyPoints": [ {"t": "<one concrete point>", "w": "bull"|"bear"|"neutral"} ],
  "agentDigests": [ {"agent": "<agent name>", "read": "<one sentence: what that agent concluded>", "weight": "high"|"medium"|"low"} ],
  "risks": ["<specific risk>"],
  "catalysts": ["<specific catalyst>"],
  "levels": { "support": "<price or zone>", "resistance": "<price or zone>", "invalidation": "<what would break the stance>" },
  "timeframe": "<the horizon this stance applies to>",
  "sizeNote": "<one sentence on how a disciplined desk would frame exposure without telling anyone to transact>"
}
4-6 keyPoints, one agentDigest for EVERY agent that appears in the input above (never skip one that reported), 2-4 risks, 2-4 catalysts.`

    let parsed = extractJson(await callLLM([
      { role: 'system', content: 'You are a senior crypto desk strategist. You output ONLY one valid JSON object. No markdown, no code fences, no commentary, and never a direct instruction to buy or sell.' },
      { role: 'user', content: prompt },
    ], QWEN_MODELS.main, 1800, { timeoutMs: 50000 }).catch(() => ''))

    if (!parsed) {
      parsed = extractJson(await callLLM([
        { role: 'system', content: 'You output ONLY valid JSON. No markdown, no code fences, no prose.' },
        { role: 'user', content: prompt + '\n\nREMINDER: Return ONLY the JSON object with the exact keys specified.' },
      ], QWEN_MODELS.main, 1500, { timeoutMs: 35000 }).catch(() => ''))
    }
    // If the judge pass returns nothing parseable, reconcile from the payloads
    // we already hold instead of failing the page — the desk always renders.
    if (!parsed) {
      const data = deskFallback({ agents, digest, sym, name, priceUsd, change24h, gathered })
      setCache(cacheKey, data, 60 * 1000)
      log('POST', '/synthesis/final', 200, Date.now() - start, '(degraded)')
      return res.json(data)
    }

    const stance = stanceKey(parsed.stance)
    // Judge scores for both sides. If the model omits them, inherit from the
    // council judge or the deep verdict — never print a flat 50/50 tie.
    const to100 = (x) => (Number.isFinite(Number(x)) ? Number(x) * (Number(x) <= 1 ? 100 : 1) : undefined)
    const cj = agents.council?.judge || null
    let bullScore = clampScore(firstNum(to100(parsed.bullScore), to100(cj?.bullScore), to100(agents.verdict?.bullScore)))
    let bearScore = clampScore(firstNum(to100(parsed.bearScore), to100(cj?.bearScore), to100(agents.verdict?.bearScore)))
    if (bullScore === bearScore) {
      if (stance === 'POSITIVE') { bullScore = clampScore(bullScore + 6); bearScore = clampScore(bearScore - 6) }
      else if (stance === 'CAUTION') { bearScore = clampScore(bearScore + 6); bullScore = clampScore(bullScore - 6) }
      else { bullScore = clampScore(bullScore + ((change24h || 0) >= 0 ? 4 : -4)); bearScore = 100 - bullScore }
    }
    let thesis = clip(parsed.thesis, 1400) || ''
    if (thesis && !/own research|not financial advice/i.test(thesis)) thesis += ` ${DYOR_SHORT}`

    const data = {
      symbol: sym,
      name,
      priceUsd: priceUsd || null,
      change24h: Number.isFinite(change24h) ? change24h : null,
      stance,
      tone: stanceTone(stance),
      conviction: clampScore(firstNum(parsed.conviction)),
      bullScore,
      bearScore,
      headline: clip(parsed.headline, 160) || `${name}: the desk is in wait-and-weigh mode.`,
      thesis,
      keyPoints: firstArr(parsed.keyPoints).slice(0, 6).map((k) => ({
        t: clip(typeof k === 'string' ? k : k?.t, 260),
        w: ['bull', 'bear', 'neutral'].includes(String(k?.w || '').toLowerCase()) ? String(k.w).toLowerCase() : 'neutral',
      })).filter((k) => k.t),
      agentDigests: firstArr(parsed.agentDigests).slice(0, 8).map((d) => ({
        agent: clip(typeof d === 'string' ? d : d?.agent, 40) || 'Desk agent',
        read: clip(d?.read, 300),
        weight: ['high', 'medium', 'low'].includes(String(d?.weight || '').toLowerCase()) ? String(d.weight).toLowerCase() : 'medium',
      })).filter((d) => d.read),
      risks: firstArr(parsed.risks).slice(0, 4).map((x) => clip(x, 220)).filter(Boolean),
      catalysts: firstArr(parsed.catalysts).slice(0, 4).map((x) => clip(x, 220)).filter(Boolean),
      levels: {
        support: clip(parsed.levels?.support, 60) || '—',
        resistance: clip(parsed.levels?.resistance, 60) || '—',
        invalidation: clip(parsed.levels?.invalidation, 220) || '—',
      },
      timeframe: clip(parsed.timeframe, 80) || 'next 1-2 weeks',
      sizeNote: clip(parsed.sizeNote, 400) || 'A disciplined desk frames exposure as a fraction of capital it can lose outright, sized against the invalidation level above.',
      agentsUsed: gathered.length || digest.length,
      asOf: new Date().toISOString(),
    }

    setCache(cacheKey, data, 10 * 60 * 1000)
    log('POST', '/synthesis/final', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    console.error('[FINAL ERROR]', err)
    error('final', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
