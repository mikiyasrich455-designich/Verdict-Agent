// Sovereign KOL Sentiment & Social Intelligence Engine — real posts from live search,
// synthesized into the console's narrative metrics. Noise/shills are filtered; alpha and
// on-chain/structural commentary is weighted up. Output matches the console schema.
import { callLLM, callSearch, QWEN_MODELS } from './llm.js'

function extractJson(text) {
  if (!text) return null
  let t = String(text).trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch { /* fall through */ }
    try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { /* fall through */ }
  }
  return null
}

function platformOf(url) {
  const u = String(url || '').toLowerCase()
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('reddit.com')) return 'reddit'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('instagram.com')) return 'instagram'
  return 'web'
}

// Derive a real creator handle from the post URL (deterministic — not invented).
function handleFromUrl(url) {
  const u = String(url || '')
  const x = u.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/)
  if (x && !['status', 'search', 'home', 'explore', 'i'].includes(x[1])) return `@${x[1]}`
  const yt = u.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/) || u.match(/youtube\.com\/(?:user|channel)\/([A-Za-z0-9_.-]+)/)
  if (yt) return `@${yt[1]}`
  const rd = u.match(/reddit\.com\/user\/([A-Za-z0-9_-]+)/) || u.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/)
  if (rd) return `u/${rd[1]}`
  return ''
}

export async function discoverKols(symbol) {
  const symbolUpper = String(symbol || '').toUpperCase()
  console.log(`[KOLS] Sovereign social sweep for ${symbolUpper}...`)

  const queries = [
    `${symbolUpper} crypto latest posts site:x.com OR site:twitter.com`,
    `${symbolUpper} token reddit discussion site:reddit.com`,
    `${symbolUpper} crypto review site:youtube.com`,
    `${symbolUpper} crypto news today latest`,
    `${symbolUpper} price analysis this week popular`,
  ]

  const raw = []
  const serpRes = await Promise.allSettled(
    queries.map((q) => callSearch(q, 8).catch((e) => {
      console.log('[KOLS] SERP failed for query:', q, e.message)
      return null
    }))
  )

  for (const r of serpRes) {
    const organic = r.status === 'fulfilled' ? (r.value?.organic || r.value?.data?.organic) : null
    if (organic && Array.isArray(organic)) {
      raw.push(...organic.slice(0, 8).map((item) => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.snippet || '',
      })).filter((x) => x.url))
    }
  }

  const seen = new Set()
  const posts = raw.filter((r) => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  }).slice(0, 24)

  if (!posts.length) {
    console.log(`[KOLS] No live posts found for ${symbolUpper}`)
    return emptyResult(symbolUpper)
  }

  const allowedUrls = new Set(posts.map((p) => p.url))
  const bundle = posts.map((p) => {
    const author = handleFromUrl(p.url)
    return `- Title: ${p.title}\n  URL: ${p.url}\n  Author/creator handle (from URL): ${author || 'unknown'}\n  Snippet: ${p.snippet}`
  }).join('\n')

  const prompt = `You are the elite Sovereign KOL Sentiment & Social Intelligence Engine for the Verdict Agent Console. Analyze the live real-time feed of crypto social posts for the token below and synthesize high-impact, actionable market analytics.

TOKEN: ${symbolUpper}

RAW SOCIAL POSTS / SEARCH RESULTS (use ONLY these — never invent handles, URLs, or numbers):
${bundle}

CRITICAL NOISE & SHILL FILTERING RULES:
1. Detect Engagement Farming: penalize hyper-promotional generic phrases ("100x soon!", "Drop your wallets", "To the moon"). Classify those as low-impact "shill noise".
2. Reward Alpha & Technical Analysis: heavily weight posts about structural mechanics, on-chain smart-contract interactions, major wallet distributions, protocol partnerships, or verified developer updates.
3. Quantify Conviction: for high-following accounts, note whether tone is Accumulation, holding steady, or Distribution.

DASHBOARD MAPPING:
- voices_tracked: count of unique, relevant accounts in this sweep.
- bullish_voices: count of unique voices with clear macro upward conviction.
- bearish_voices: count of unique voices with fear, doubt, short bias, or distribution warnings.
- convergence_status: strictly one of [BULLISH CONVERGENCE | BEARISH CONVERGENCE | CONFLICTED | COMPRESSION].

Respond with ONLY valid JSON (no markdown, no code fences, no prose) in this exact shape:
{
  "voices_tracked": 0,
  "bullish_voices": 0,
  "bearish_voices": 0,
  "convergence_status": "STATUS_STRING",
  "narrative_headline": "One clear sentence summarizing what the loudest voices are really saying right now",
  "sentiment_summary_text": "A detailed two-sentence explanation of why the narrative has or has not converged, and what traders should expect next",
  "top_voices_list": [
    { "handle": "@username", "sentiment": "BULLISH", "impact_score": "HIGH", "alpha_takeaway": "Short, punchy summary of the exact technical/structural point this user made", "url": "EXACT URL copied from the RAW SOCIAL POSTS above" }
  ]
}
Every "url" in top_voices_list MUST be copied EXACTLY from the RAW SOCIAL POSTS list above — never invent or shorten it.`

  let response
  try {
    response = await callLLM([
      { role: 'system', content: 'You are a precise data extraction engine. Return ONLY valid JSON. No markdown, no code fences, no prose.' },
      { role: 'user', content: prompt },
    ], QWEN_MODELS.script, 3500)
  } catch (e) {
    console.log('[KOLS] LLM extraction failed:', e.message)
    return emptyResult(symbolUpper)
  }

  const x = extractJson(response)
  if (!x) return emptyResult(symbolUpper)

  const voices = (Array.isArray(x.top_voices_list) ? x.top_voices_list : [])
    .filter((v) => v && (v.handle || v.alpha_takeaway))
    .map((v) => {
      const sentiment = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(String(v.sentiment).toUpperCase())
        ? String(v.sentiment).toUpperCase()
        : 'NEUTRAL'
      const impact = String(v.impact_score || '').toUpperCase() === 'HIGH' ? 'HIGH' : 'MEDIUM'
      const url = allowedUrls.has(v.url) ? String(v.url) : ''
      const handle = (v.handle && String(v.handle) !== '@unknown') ? String(v.handle) : (handleFromUrl(url) || '@unknown')
      return {
        handle,
        sentiment,
        impact_score: impact,
        alpha_takeaway: String(v.alpha_takeaway || 'No structural point extracted.'),
        platform: v.platform || platformOf(url),
        url,
      }
    })

  const voices_tracked = Math.max(Number(x.voices_tracked) || 0, voices.length)
  const bullish_voices = Math.max(0, Number(x.bullish_voices) || 0)
  const bearish_voices = Math.max(0, Number(x.bearish_voices) || 0)
  const convergence_status = String(x.convergence_status || 'COMPRESSION').toUpperCase()

  const data = {
    symbol: symbolUpper,
    voices_tracked,
    bullish_voices,
    bearish_voices,
    convergence_status,
    narrative_headline: String(x.narrative_headline || 'No clear narrative headline emerged this sweep.'),
    sentiment_summary_text: String(x.sentiment_summary_text || 'Insufficient high-signal posts to call convergence this sweep.'),
    top_voices_list: voices,
    news: posts.slice(0, 6).map((p) => ({
      title: p.title,
      source: platformOf(p.url),
      author: handleFromUrl(p.url),
      url: p.url,
      age: 'recent',
    })),
    // Legacy aliases for older UI paths.
    kols: voices.map((v) => ({
      handle: v.handle,
      platform: v.platform || 'web',
      url: v.url || null,
      stance: v.sentiment.toLowerCase(),
      quote: v.alpha_takeaway,
      conviction: v.impact_score === 'HIGH' ? 84 : 58,
      impact: v.impact_score,
    })),
    total: voices_tracked,
    bullish: bullish_voices,
    bearish: bearish_voices,
    converged: convergence_status === 'BULLISH CONVERGENCE' || convergence_status === 'BEARISH CONVERGENCE',
  }

  console.log(`[KOLS] ${voices_tracked} voices (${bullish_voices}B/${bearish_voices}S) · ${convergence_status}`)
  return data
}

function emptyResult(symbolUpper) {
  return {
    symbol: symbolUpper,
    voices_tracked: 0,
    bullish_voices: 0,
    bearish_voices: 0,
    convergence_status: 'COMPRESSION',
    narrative_headline: 'No high-signal social posts surfaced for this token yet.',
    sentiment_summary_text: 'The sweep found insufficient real posts to call a narrative convergence. Re-sweep as fresh posts land.',
    top_voices_list: [],
    news: [],
    kols: [],
    total: 0,
    bullish: 0,
    bearish: 0,
    converged: false,
  }
}