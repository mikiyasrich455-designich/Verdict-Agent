// Real web intelligence layer.
//
// Every link this module hands back comes from a genuine search-engine result set —
// never from a model's imagination. The engine is preferred first; a grounded model
// search is only used as a last resort if the engine is unavailable, and in that case
// the payload is flagged `engine: false` so callers can be honest about provenance.
import { aceSerp, aceSerpAvailable } from './acedata.js'
import { callSearch } from './llm.js'

// ── Platform / author resolution (deterministic, parsed from the real URL) ────
export function platformOf(url) {
  const u = String(url || '').toLowerCase()
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('reddit.com')) return 'reddit'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('telegram.me') || u.includes('t.me')) return 'telegram'
  if (u.includes('discord.')) return 'discord'
  if (u.includes('medium.com') || u.includes('substack.com')) return 'blog'
  return 'web'
}

const PLATFORM_LABEL = {
  x: 'X', youtube: 'YouTube', reddit: 'Reddit', tiktok: 'TikTok',
  instagram: 'Instagram', telegram: 'Telegram', discord: 'Discord', blog: 'Blog', web: 'Web',
}
export const platformLabel = (p) => PLATFORM_LABEL[p] || 'Web'

// Creator handle parsed straight out of the post URL — deterministic, not invented.
export function handleFromUrl(url) {
  const u = String(url || '')
  const x = u.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/)
  if (x && !['status', 'search', 'home', 'explore', 'i', 'intent', 'hashtag'].includes(x[1].toLowerCase())) return `@${x[1]}`
  const yt = u.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/) || u.match(/youtube\.com\/(?:user|channel|c)\/([A-Za-z0-9_.-]+)/)
  if (yt) return `@${yt[1]}`
  const rd = u.match(/reddit\.com\/user\/([A-Za-z0-9_-]+)/) || u.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/)
  if (rd) return rd[0].includes('/user/') ? `u/${rd[1]}` : `r/${rd[1]}`
  const tg = u.match(/t\.me\/([A-Za-z0-9_]+)/)
  if (tg) return `@${tg[1]}`
  return ''
}

// Hostname for "where was this posted" — e.g. x.com, coinmarketcap.com
export function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, '') } catch { return '' }
}

function isRealUrl(u) {
  return /^https?:\/\//i.test(String(u || ''))
}

// Normalize any result row into the one shape the console renders.
function toPost(row, opts = {}) {
  const url = String(row?.link || row?.url || '').trim()
  if (!isRealUrl(url)) return null
  const platform = opts.platform || platformOf(url)
  const handle = String(row?.channel || '').trim()
    ? `@${String(row.channel).trim()}`
    : handleFromUrl(url)
  return {
    title: String(row?.title || '').trim(),
    url,
    snippet: String(row?.snippet || row?.description || '').trim(),
    date: String(row?.date || '').trim(),          // real published/posted date from the engine
    source: String(row?.source || hostOf(url)),    // real publisher / channel
    author: handle,
    handle,
    platform,
    host: hostOf(url),
    image: String(row?.image_url || row?.thumbnail || '').trim() || null,
    duration: row?.duration ? String(row.duration) : null,
  }
}

function dedupe(posts, cap) {
  const seen = new Set()
  const out = []
  for (const p of posts) {
    if (!p) continue
    const key = p.url.split('#')[0].replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length >= cap) break
  }
  return out
}

// ── Engine-backed search ─────────────────────────────────────────────────────
// type: 'search' | 'news' | 'videos'
export async function serp(type, query, opts = {}) {
  const rows = []
  if (aceSerpAvailable()) {
    try {
      const data = await aceSerp(query, { type, number: opts.number || 10, range: opts.range, timeoutMs: opts.timeoutMs || 22000 })
      const bucket = type === 'news' ? data.news : type === 'videos' ? data.videos : data.organic
      for (const r of bucket) {
        const p = toPost(r, { platform: type === 'videos' ? platformOf(r.link) : undefined })
        if (p) rows.push(p)
      }
      if (rows.length) return { posts: dedupe(rows, opts.cap || 12), engine: true }
    } catch (e) {
      console.log(`[SERP] engine ${type} failed for "${query}": ${e.message}`)
    }
  }

  // Last resort only — a grounded model search. Flagged so callers never claim
  // these links came from the engine.
  try {
    const fallback = await callSearch(query, opts.number || 8, opts.timeoutMs || 20000)
    const organic = fallback?.organic || fallback?.data?.organic || []
    for (const r of organic) {
      const p = toPost(r)
      if (p) rows.push(p)
    }
  } catch (e) {
    console.log(`[SERP] grounded fallback failed for "${query}": ${e.message}`)
  }
  return { posts: dedupe(rows, opts.cap || 12), engine: false }
}

// Run several queries at once and merge into one deduped, real-link feed.
export async function serpMany(specs, opts = {}) {
  const settled = await Promise.allSettled(specs.map((s) => serp(s.type || 'search', s.query, { ...opts, ...s })))
  const merged = []
  let engine = false
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    if (r.value.engine) engine = true
    merged.push(...r.value.posts)
  }
  return { posts: dedupe(merged, opts.cap || 30), engine }
}

// Render a post feed as prompt text. Every URL here is real and citable.
export function postsToPromptText(posts, { withUrls = true, limit = 20 } = {}) {
  if (!posts?.length) return 'No live web results returned for this sweep.'
  return posts.slice(0, limit).map((p, i) => {
    const bits = [`${i + 1}. ${p.title || '(untitled)'}`]
    if (p.snippet) bits.push(`   Excerpt: ${p.snippet}`)
    const meta = []
    if (p.author) meta.push(`by ${p.author}`)
    if (p.source) meta.push(`on ${p.source}`)
    if (p.date) meta.push(`posted ${p.date}`)
    if (meta.length) bits.push(`   ${meta.join(' · ')}`)
    if (withUrls && p.url) bits.push(`   Link: ${p.url}`)
    return bits.join('\n')
  }).join('\n')
}
