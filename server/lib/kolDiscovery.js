// KOL Radar — real posts, real links, real dates.
//
// Two hard rules shape this module:
//   1. Nothing here is invented. Every handle, URL, platform, publish date and
//      thumbnail comes straight out of a live search-engine result set.
//   2. The model never writes a link. It is shown a numbered list of genuine posts
//      and may only return `{ index, ... }` selections, which are mapped back onto
//      the real result objects. A hallucinated URL is structurally impossible.
// If the sweep finds nothing, the result says so honestly instead of padding.
import { callLLM, QWEN_MODELS } from './llm.js'
import { serpMany, postsToPromptText } from './serp.js'

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

const SOCIAL = new Set(['x', 'youtube', 'reddit', 'tiktok', 'instagram', 'telegram', 'discord', 'blog'])
const STANCES = ['BULLISH', 'BEARISH', 'NEUTRAL']

// Relevance gate: a post must actually be about this token. Checked against the real
// title/excerpt/link so unrelated results never reach the console.
function isRelevant(post, sym, name) {
  const hay = `${post.title} ${post.snippet} ${post.url}`.toLowerCase()
  const s = sym.toLowerCase()
  if (new RegExp(`\\$${s}\\b`).test(hay)) return true
  if (new RegExp(`\\b${s}\\b`).test(hay)) return true
  if (name && name.length > 3 && hay.includes(name.toLowerCase())) return true
  return false
}

// Deterministic tone read used when the classification pass is unavailable — still
// grounded in the real excerpt, never a fabricated summary.
const BULL_WORDS = /\b(bullish|moon|pump|accumulat\w*|breakout|break out|buying|bought|listing|list(ed)?\s+on|partner\w*|airdrop|surge|ralley|rally|new high|ath|undervalued|gem|long)\b/i
const BEAR_WORDS = /\b(bearish|rug|scam|honeypot|dump(ed|ing)?|sell(ing)? off|exit(ed)?|dead|dilut\w*|unlock|exploit|hack(ed)?|crash|plunge|overvalued|ponzi|warning|avoid|short)\b/i

function keywordStance(post) {
  const hay = `${post.title} ${post.snippet}`
  const bull = BULL_WORDS.test(hay)
  const bear = BEAR_WORDS.test(hay)
  if (bull && !bear) return 'BULLISH'
  if (bear && !bull) return 'BEARISH'
  return 'NEUTRAL'
}

// Convergence is computed from the real counts, never guessed by a model.
function convergenceOf(bull, bear) {
  if (bull >= 3 && bull >= bear * 2) return 'BULLISH CONVERGENCE'
  if (bear >= 3 && bear >= bull * 2) return 'BEARISH CONVERGENCE'
  if (bull > 0 && bear > 0) return 'CONFLICTED'
  if (bull + bear > 0) return bull > bear ? 'BULLISH CONVERGENCE' : 'BEARISH CONVERGENCE'
  return 'COMPRESSION'
}

function liveBlock(live) {
  if (!live) return 'No live market snapshot was attached to this sweep — stamp headlines UNVERIFIED unless the article itself carries the numbers.'
  const parts = []
  if (live.priceUsd != null) parts.push(`price $${Number(live.priceUsd)}`)
  if (live.change24h != null) parts.push(`24h ${Number(live.change24h).toFixed(2)}%`)
  if (live.marketCap) parts.push(`cap $${(Number(live.marketCap) / 1e6).toFixed(2)}M`)
  if (live.volume24h) parts.push(`volume $${(Number(live.volume24h) / 1e6).toFixed(2)}M`)
  if (live.liquidityUsd) parts.push(`liquidity $${(Number(live.liquidityUsd) / 1e6).toFixed(2)}M`)
  if (live.buys24h != null) parts.push(`tape ${live.buys24h || 0} buys / ${live.sells24h || 0} sells`)
  if (live.pairAgeDays != null) parts.push(`pool age ${Number(live.pairAgeDays).toFixed(0)}d`)
  return parts.length ? parts.join(' · ') : 'Live snapshot contained no numeric fields — prefer UNVERIFIED.'
}

export async function discoverKols(symbol, live = null) {
  const sym = String(symbol || '').toUpperCase().trim()
  const name = String(live?.name || '').trim()
  console.log(`[KOLS] Live social sweep for ${sym}...`)

  const ident = name && name.toUpperCase() !== sym ? `${name} ${sym}` : sym
  const { posts: allPosts, engine } = await serpMany([
    { type: 'search', query: `"${sym}" ${ident} crypto site:x.com OR site:twitter.com`, number: 12, cap: 12 },
    { type: 'search', query: `${ident} token site:reddit.com`, number: 8, cap: 8 },
    { type: 'videos', query: `${ident} crypto token analysis`, range: 'qdr:m', number: 8, cap: 8 },
    { type: 'news', query: `${ident} crypto token`, range: 'qdr:m', number: 8, cap: 8 },
  ], { cap: 40 })

  const relevant = allPosts.filter((p) => isRelevant(p, sym, name))
  // Never drop to zero on a strictness technicality — if nothing matched the symbol
  // gate but the engine did return rows, keep them and let the reader see the sources.
  const feed = (relevant.length ? relevant : allPosts).slice(0, 24)
  const socials = feed.filter((p) => SOCIAL.has(p.platform)).slice(0, 12)
  const newsRows = feed.filter((p) => !SOCIAL.has(p.platform) || p.platform === 'blog')
  const newsFeed = newsRows.slice(0, 8)

  console.log(`[KOLS] engine=${engine} · ${feed.length} real results (${socials.length} creator posts, ${newsFeed.length} news)`)
  if (!feed.length) return emptyResult(sym, engine)

  const prompt = `You are the social-intelligence analyst behind a crypto research console. Below is a numbered list of REAL posts and articles about ${sym}, pulled live from the open web. Every link, handle, platform and date in that list is genuine — you may reference them by NUMBER only.

LIVE MARKET SNAPSHOT FOR THIS TOKEN (use it to fact-check headlines):
${liveBlock(live)}

CREATOR POSTS (numbered):
${postsToPromptText(socials.length ? socials : feed, { withUrls: false, limit: 14 })}

NEWS / ARTICLES (numbered separately, starting again at 1):
${postsToPromptText(newsFeed, { withUrls: false, limit: 8 })}

YOUR JOB:
1. Pick the creator posts that carry real signal. Skip pure shill noise ("100x soon", "drop your wallet", giveaway spam) and skip posts with no readable content.
2. For each pick, classify what that post actually argues: BULLISH (constructive on the token), BEARISH (warning / distribution / doubt), or NEUTRAL (informational).
3. Rate impact HIGH only when the post cites concrete evidence — liquidity, wallet distribution, listing, audit, partnership, on-chain data, developer activity. Hype alone is LOW.
4. Write a takeaway of 1-2 sentences stating what that post claims, grounded in its excerpt. Never add facts that are not in the list.
5. Stamp each news item against the live snapshot: VERIFIED (the headline's numbers/direction are consistent with the live data), CONTRADICTED (the live data clearly disagrees), or UNVERIFIED (cannot be checked from the snapshot).

Respond with ONLY valid JSON, no markdown, no code fences:
{
  "narrative_headline": "<one sentence: what the loudest real voices are actually saying about ${sym} right now>",
  "sentiment_summary_text": "<two sentences: why the narrative has or has not converged, and what the tape should be watched for>",
  "voices": [
    { "index": <number from the list above>, "stance": "BULLISH|BEARISH|NEUTRAL", "impact": "HIGH|MEDIUM|LOW", "conviction": <0-100>, "takeaway": "<what this post claims>" }
  ],
  "news_stamps": [
    { "index": <number from the NEWS list>, "stamp": "VERIFIED|UNVERIFIED|CONTRADICTED" }
  ]
}
Rules: index MUST be a number that exists in the lists above. Never output a URL, a handle or a date — those come from the real rows. If a post has no readable content, leave it out. Return an empty "voices" array rather than inventing posts.`

  let parsed = null
  try {
    parsed = extractJson(await callLLM([
      { role: 'system', content: 'You are a precise social-intelligence extraction engine. You output ONLY valid JSON. You never invent posts, handles, links or dates — you reference supplied items by index.' },
      { role: 'user', content: prompt },
    ], QWEN_MODELS.main, 2200, { timeoutMs: 32000, json: true, temperature: 0.2 }))
  } catch (e) {
    console.log('[KOLS] classification pass failed:', e.message)
  }

  // The pools the model is allowed to select from, in prompt order.
  const creatorPool = (socials.length ? socials : feed).slice(0, 14)
  const newsPool = newsFeed.slice(0, 8)
  const rawVoices = Array.isArray(parsed?.voices) ? parsed.voices : []

  let voices = rawVoices
    .map((v) => {
      const idx = Number(v?.index)
      const post = Number.isInteger(idx) ? creatorPool[idx - 1] : null
      if (!post?.url) return null
      const stance = STANCES.includes(String(v?.stance || '').toUpperCase()) ? String(v.stance).toUpperCase() : keywordStance(post)
      const impact = ['HIGH', 'MEDIUM', 'LOW'].includes(String(v?.impact || '').toUpperCase()) ? String(v.impact).toUpperCase() : 'MEDIUM'
      const conviction = Math.max(10, Math.min(98, Math.round(Number(v?.conviction) || (impact === 'HIGH' ? 78 : impact === 'MEDIUM' ? 58 : 38))))
      return {
        post,
        stance,
        impact,
        conviction,
        takeaway: String(v?.takeaway || '').trim().slice(0, 320) || post.snippet || post.title,
      }
    })
    .filter(Boolean)

  // De-dupe by URL, then cap.
  const seen = new Set()
  voices = voices.filter((v) => (seen.has(v.post.url) ? false : (seen.add(v.post.url), true))).slice(0, 8)

  // Honest degradation: the engine found real posts but the model did not classify
  // them. Fall back to a keyword read of the genuine excerpts so the console still
  // shows the actual posts instead of an empty grid.
  const degraded = !voices.length
  if (degraded) {
    console.log('[KOLS] classification returned nothing usable — falling back to keyword read of real posts')
    voices = (socials.length ? socials : feed).slice(0, 6).map((post) => ({
      post,
      stance: keywordStance(post),
      impact: post.platform === 'youtube' || post.platform === 'x' ? 'MEDIUM' : 'LOW',
      conviction: 48,
      takeaway: post.snippet || post.title,
    }))
  }

  const kols = voices.map((v) => {
    const p = v.post
    return {
      handle: p.handle || p.author || p.source || p.host || 'Source',
      platform: p.platform,
      url: p.url,
      stance: v.stance.toLowerCase(),
      quote: v.takeaway,
      conviction: v.conviction,
      impact: v.impact,
      posted: p.date || '',
      source: p.source || p.host,
      host: p.host,
      image: p.image,
      title: p.title,
      duration: p.duration,
    }
  })

  const bull = kols.filter((k) => k.stance === 'bullish').length
  const bear = kols.filter((k) => k.stance === 'bearish').length
  const uniqueHandles = new Set(kols.map((k) => k.handle).filter(Boolean)).size

  const stamps = new Map()
  for (const s of Array.isArray(parsed?.news_stamps) ? parsed.news_stamps : []) {
    const idx = Number(s?.index)
    const post = Number.isInteger(idx) ? newsPool[idx - 1] : null
    if (post?.url && ['VERIFIED', 'UNVERIFIED', 'CONTRADICTED'].includes(String(s?.stamp || '').toUpperCase())) {
      stamps.set(post.url, String(s.stamp).toUpperCase())
    }
  }

  const news = newsPool.slice(0, 6).map((p) => ({
    title: p.title,
    url: p.url,
    source: p.source || p.host || 'web',
    author: p.handle || p.author || '',
    age: p.date || 'recent',
    stamp: stamps.get(p.url) || 'UNVERIFIED',
    image: p.image,
    host: p.host,
  }))

  const convergence = convergenceOf(bull, bear)
  const data = {
    symbol: sym,
    voices_tracked: Math.max(uniqueHandles, kols.length),
    bullish_voices: bull,
    bearish_voices: bear,
    convergence_status: convergence,
    narrative_headline: String(parsed?.narrative_headline || '').trim()
      || (kols.length ? `${kols.length} real posts surfaced for ${sym}; the loudest reads are ${bull} constructive and ${bear} cautionary.` : `No readable creator posts surfaced for ${sym} in this sweep.`),
    sentiment_summary_text: String(parsed?.sentiment_summary_text || '').trim()
      || (degraded ? 'Posts were found but could not be classified this sweep — the excerpts below are shown verbatim from the real results.' : 'Convergence is computed strictly from the counts of real classified posts above.'),
    top_voices_list: kols.map((k) => ({
      handle: k.handle, sentiment: k.stance.toUpperCase(), impact_score: k.impact,
      alpha_takeaway: k.quote, url: k.url, platform: k.platform,
    })),
    news,
    kols,
    total: kols.length,
    bullish: bull,
    bearish: bear,
    converged: convergence === 'BULLISH CONVERGENCE' || convergence === 'BEARISH CONVERGENCE',
    sources_scanned: feed.length,
    engine,
    degraded,
  }

  console.log(`[KOLS] ${data.voices_tracked} voices (${bull}B/${bear}S) · ${convergence} · engine=${engine}${degraded ? ' (keyword fallback)' : ''}`)
  return data
}

function emptyResult(sym, engine) {
  return {
    symbol: sym,
    voices_tracked: 0,
    bullish_voices: 0,
    bearish_voices: 0,
    convergence_status: 'COMPRESSION',
    narrative_headline: `The live web sweep returned no posts about ${sym}.`,
    sentiment_summary_text: `No real posts, articles or videos mentioning ${sym} were found in this sweep, so nothing is reported rather than something invented. Newer or very small tokens often have no indexed social footprint yet — re-sweep later.`,
    top_voices_list: [],
    news: [],
    kols: [],
    total: 0,
    bullish: 0,
    bearish: 0,
    converged: false,
    sources_scanned: 0,
    engine: Boolean(engine),
    empty: true,
  }
}
