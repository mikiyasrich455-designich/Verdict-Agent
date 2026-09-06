// KOL Discovery via Qwen live search + grounded LLM — real data from X, YouTube, News
import { callLLM, callSearch } from './llm.js'

// ── Robust JSON extraction from LLM output ───────────────────────
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

// ── Discover real KOLs from X, YouTube, News ─────────────────────
export async function discoverKols(symbol) {
  const symbolUpper = symbol.toUpperCase()
  console.log(`[KOLS] Discovering real KOLs for ${symbolUpper}...`)

  // 4 SERP queries targeting X, YouTube, and news
  const queries = [
    `site:x.com ${symbolUpper} crypto`,
    `${symbolUpper} crypto twitter thread opinion`,
    `${symbolUpper} crypto news`,
    `${symbolUpper} crypto YouTube analysis`,
  ]

  const allResults = []
  const serpRes = await Promise.allSettled(
    queries.map(q => callSearch(q, 6).catch(e => {
      console.log('[KOLS] SERP failed for query:', q, e.message)
      return null
    }))
  )

  for (const r of serpRes) {
    // Live search returns { organic: [...] } (top level) or { data: { organic: [...] } }
    const organic = r.status === 'fulfilled' ? (r.value?.organic || r.value?.data?.organic) : null
    if (organic && Array.isArray(organic)) {
      allResults.push(...organic.slice(0, 6).map(item => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.snippet || '',
        position: item.position || 0,
      })))
    }
  }

  // Deduplicate by URL
  const seen = new Set()
  const unique = allResults.filter(r => {
    if (!r.url || seen.has(r.url)) return false
    seen.add(r.url)
    return true
  }).slice(0, 20)

  if (!unique.length) {
    console.log('[KOLS] No SERP results found for', symbolUpper)
    return { kols: [], news: [], total: 0, bullish: 0, converged: false }
  }

  // Build allowed URL set for strict grounding validation
  const allowedUrls = new Set(unique.map(r => r.url))

  // LLM extraction with STRICT grounding rule
  const prompt = `You are a KOL (Key Opinion Leader) extraction engine.

SYMBOL: ${symbolUpper}

TASK: Extract KOL voices from these search results. Return ONLY valid JSON with NO markdown, NO code fences.

SEARCH RESULTS (use ONLY these URLs — never invent URLs not listed below):
${unique.map(r => `- Title: ${r.title}\n  URL: ${r.url}\n  Snippet: ${r.snippet}`).join('\n')}

STRICT RULES:
1. You MUST copy URLs EXACTLY as provided above — never modify, shorten, or fabricate URLs.
2. Every KOL must link to a URL from the list above.
3. Platform detection: x.com/twitter.com → "x", youtube.com/youtu.be → "youtube", reddit.com → "reddit", tiktok.com → "tiktok", instagram.com → "instagram", otherwise "web".
4. Only include KOLs with meaningful commentary about ${symbolUpper}.

RESPONSE FORMAT (exact keys):
{
  "kols": [
    {
      "handle": "@username or Channel Name",
      "name": "Display Name or 'Unknown'",
      "platform": "x|youtube|reddit|tiktok|instagram|web",
      "url": "EXACT URL FROM LIST ABOVE",
      "quote": "Brief excerpt or summary of their ${symbolUpper} commentary (keep under 150 chars)",
      "stance": "bullish|bearish|neutral",
      "conviction": 65
    }
  ],
  "news": [
    {
      "title": "News headline from search results",
      "source": "Source name (e.g., 'CoinDesk', 'The Block')",
      "url": "EXACT URL FROM LIST ABOVE",
      "age": "e.g., '2h', '1d' (estimate from snippet if mentioned)"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown, no code fences, no explanation.`

  let response
  try {
    response = await callLLM([
      { role: 'system', content: 'You are a precise data extraction engine. Return ONLY valid JSON. No markdown, no code fences, no prose.' },
      { role: 'user', content: prompt },
    ], undefined, 4000)
  } catch (e) {
    console.log('[KOLS] LLM extraction failed:', e.message)
    response = null
  }

  let extracted = extractJson(response)

  // Validate URLs are from allowed set (security/grounding check)
  if (extracted?.kols) {
    extracted.kols = extracted.kols.filter(k => {
      if (!k.url || !allowedUrls.has(k.url)) {
        console.log('[KOLS] Discarding KOL with ungrounded URL:', k.handle, k.url)
        return false
      }
      return true
    })
  }

  if (extracted?.news) {
    extracted.news = extracted.news.filter(n => {
      if (!n.url || !allowedUrls.has(n.url)) {
        console.log('[KOLS] Discarding news with ungrounded URL:', n.title)
        return false
      }
      return true
    })
  }

  const kols = extracted?.kols || []
  const news = extracted?.news || []
  const bullish = kols.filter(k => k.stance === 'bullish').length
  const total = kols.length
  const converged = total > 0 && bullish >= Math.ceil(total / 2)

  console.log(`[KOLS] Discovered ${total} KOLs (${bullish} bullish) and ${news.length} news items for ${symbolUpper}`)

  return { kols, news, total, bullish, converged }
}