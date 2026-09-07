// Live API layer — calls the Express proxy at /api/proxy/*
// The proxy holds all API keys (RYO, Qwen) and never exposes them to the browser.
// Every function keeps the same signature the UI expects.

import { identityForSymbol } from './activeToken'
import { enrichProfile } from './tokenEnrich'
import { verdictCardPng, verdictMotionWebm } from './verdictArt.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A ticker is not an identity. If the active token was resolved from a contract
// address, pin every request to that address so the backend can never answer
// for a same-ticker token on another chain.
function withIdentity(body, identity) {
  const source = identity || identityForSymbol(body.symbol) || identityFromUrl(body.symbol)
  if (!source?.ca) return body
  const { symbol, name, ca, chain } = source
  return { ...body, ca, chain: chain || undefined, name: name || undefined }
}

// Shared links carry ?token=X&ca=0x…; honour them even when localStorage is empty.
function identityFromUrl(symbol) {
  try {
    const params = new URLSearchParams(window.location.search)
    const ca = params.get('ca')
    if (!ca) return null
    const urlSymbol = (params.get('token') || params.get('symbol') || '').toUpperCase()
    if (urlSymbol && urlSymbol !== String(symbol || '').toUpperCase()) return null
    return { symbol, name: params.get('name') || '', ca, chain: params.get('chain') || '' }
  } catch {
    return null
  }
}

// POST /api/proxy/resolve → live token lookup by contract address, ticker, or name
// Returns { symbol, name, chain, chainLabel, ca, isCA, priceUsd, liquidityUsd, ... }
export async function resolveToken(q) {
  const res = await fetch('/api/proxy/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Couldn't find "${q}" — check the address or name and try again`)
  }

  // The proxy shares one cloud egress IP that public market APIs throttle; the
  // visitor's browser does not, so it tops up any branding/copy it couldn't get.
  return enrichProfile(data)
}

export const ANALYSIS_STEPS = [
  'Scanning market data…',
  'Running technicals…',
  'Reading sentiment regime…',
  'Weighing the evidence…',
  'Building the verdict…',
]

// ── Speed layer: client cache + in-flight dedupe ────────────────────────────
// Re-visiting a dashboard renders instantly instead of re-running the whole
// agent chain, and two pages asking for the same feed share ONE network call.
// TTLs stay under the server's own cache windows so this never shows staler
// data than the backend would have. body === null → GET.
const cacheStore = new Map()
const inflight = new Map()

function request(path, body, { ttl = 90000, label = 'Request', cacheIf } = {}) {
  const isGet = body === null
  const key = isGet ? path : `${path}::${JSON.stringify(body || {})}`
  const hit = cacheStore.get(key)
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value)
  if (inflight.has(key)) return inflight.get(key)

  const p = (async () => {
    const res = await fetch(path, isGet
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `${label} failed`)
    }
    const value = await res.json()
    cacheStore.set(key, { at: Date.now(), value })
    return value
  })().finally(() => inflight.delete(key))

  inflight.set(key, p)
  return p
}

// POST /api/proxy/synthesis/verdict → Deep forensic analysis (research + live data)
export function fetchVerdict(symbol) {
  // A degraded (data-only) verdict is never cached: the next visit retries the
  // full reasoning pass instead of pinning the weak answer to the screen.
  return request('/api/proxy/synthesis/verdict', withIdentity({ symbol }), {
    ttl: 240000,
    label: 'Verdict',
    cacheIf: (v) => !v?.degraded,
  })
}

// POST /api/proxy/synthesis/debate → analyze → debate shape
export function fetchDebate(symbol) {
  return request('/api/proxy/synthesis/debate', withIdentity({ symbol }), { ttl: 90000, label: 'Debate' })
}

// POST /api/proxy/synthesis/council → evidence-grounded Bull vs Bear vs Judge
export function fetchCouncil(symbol) {
  return request('/api/proxy/synthesis/council', withIdentity({ symbol }), { ttl: 240000, label: 'Council' })
}

// POST /api/proxy/ryo/market_overview → normalized overview shape
export function fetchMarketOverview() {
  return request('/api/proxy/ryo/market_overview', {}, { ttl: 60000, label: 'Market overview' })
}

// GET /api/proxy/ryo/majors → real live quotes for the console quick-start tiles
export function fetchMajors() {
  return request('/api/proxy/ryo/majors', null, { ttl: 30000, label: 'Major quotes' })
}

// POST /api/proxy/ryo/scan_market → normalized scan array
export function fetchScan() {
  return request('/api/proxy/ryo/scan_market', {}, { ttl: 60000, label: 'Scan' })
}

// POST /api/proxy/ryo/analyze_token → normalized profile shape
// `identity` ({ca, chain, name}) pins the lookup to one contract when the page
// already knows it — otherwise the stored active token is used.
export async function fetchTokenProfile(symbol, identity) {
  const data = await request('/api/proxy/ryo/analyze_token', withIdentity({ symbol }, identity), { ttl: 60000, label: 'Token profile' })
  return enrichProfile(data)
}

// POST /api/proxy/ryo/compare_tokens → normalized compare array
export function fetchCompare(symbols) {
  return request('/api/proxy/ryo/compare_tokens', { symbols }, { ttl: 60000, label: 'Compare' })
}

// POST /api/proxy/ryo/sentiment_shift → normalized sentiment shape
export function fetchSentimentShift() {
  return request('/api/proxy/ryo/sentiment_shift', {}, { ttl: 90000, label: 'Sentiment shift' })
}

// POST /api/proxy/synthesis/narrative → normalized narrative shape
export function fetchNarrative(symbol) {
  return request('/api/proxy/synthesis/narrative', withIdentity({ symbol }), { ttl: 120000, label: 'Narrative' })
}

// POST /api/proxy/synthesis/risk → normalized risk desk shape
export function fetchRiskDesk(symbol, limits) {
  return request('/api/proxy/synthesis/risk', withIdentity({ symbol, limits }), { ttl: 45000, label: 'Risk desk' })
}

// POST /api/proxy/synthesis/script → normalized studio script shape
export function fetchStudioScript(symbol) {
  return request('/api/proxy/synthesis/script', withIdentity({ symbol }), { ttl: 240000, label: 'Studio script' })
}

// POST /api/proxy/synthesis/final → master desk pass over every other agent's output.
// The client gathers the agents itself (so the UI can track each one), then hands
// the payloads over — the server never re-fetches, it just reconciles.
export function fetchFinal(symbol, agents) {
  return request('/api/proxy/synthesis/final', withIdentity({ symbol, agents }), { ttl: 600000, label: 'Final recommendation' })
}

// POST /api/proxy/studio/image → Qwen image (wan2.7-image). The prompt is built
// behind the scenes from the live verdict — the user only sees CTA → result → download.
export async function generateStudioImage(script) {
  const symbol = script?.symbol || 'TOKEN'
  const verdict = script?.verdict || 'HOLD'
  const confidence = script?.confidence ?? 50
  const bull = script?.bullScore ?? 50
  const bear = script?.bearScore ?? 50
  const prompt = `A clean, professional crypto analysis result card rendered as a dark glassmorphism financial dashboard. Deep navy background with a soft blue glow and a subtle grid. Large bold "${symbol}" ticker, a "${verdict}" verdict badge, confidence ${confidence}%, bull case ${bull} vs bear case ${bear}. Minimal, premium fintech aesthetic, crisp typography, balanced composition, no clutter.`

  try {
    const res = await fetch('/api/proxy/studio/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size: '1:1' }),
    })

    if (res.ok) {
      const data = await res.json()
      const imageUrl = data?.data?.[0]?.image_url || data?.image_url || data?.url
      if (imageUrl) return { url: imageUrl, format: 'png' }
    }
  } catch (err) {
    console.warn('[studio] image model unavailable — rendering live-data art card:', err.message)
  }

  // Fallback: render the card locally from the live verdict data — never a dead screen.
  return { url: verdictCardPng(script), format: 'png' }
}

// Video → AceData Grok Imagine (grok-imagine-video, async task). The live model caps one clip at
// 15s, so the 25-second news package is rendered as two cheap shots — 15s opening + market numbers,
// then 10s bull-vs-bear + balanced rating — and played back-to-back as one broadcast. Both prompts
// describe the same anchor, desk and lighting so the cut feels like a real studio package.
// Prompts are built behind the scenes; the UI only ever sees the finished clips.
function studioShots(symbol) {
  const anchor = `A professional, realistic female news anchor sits at a clean, modern broadcast desk with a softly blurred studio background, subtle cool-blue accent lighting, the same wardrobe and hairstyle throughout. She looks directly into the camera with natural lip-sync and clear mouth movement. Neutral, professional, data-driven tone, cinematic studio lighting, shallow depth of field, realistic skin, hair and fabric, crisp detail, smooth locked-off camera. A real person speaking to camera — no motion graphics, no cartoons, no text-only frames.`

  return [
    {
      duration: 15,
      prompt: `A cinematic 15-second news broadcast shot, the opening of a market report. ${anchor} She opens the segment and delivers the first half of a ${symbol} analysis, pacing her words to fill the full 15 seconds: a calm greeting, then what the data shows right now — the current price trend, the 24-hour move, market cap and trading volume. Clean, well-paced broadcast delivery, never a buy or sell instruction.`,
    },
    {
      duration: 10,
      prompt: `A cinematic 10-second news broadcast shot, the closing half of the same market report. ${anchor} She continues straight from the opening and wraps the ${symbol} analysis in 10 seconds: the bull case versus the bear case, then one balanced rating of growth potential versus risk, and a brief professional sign-off. Never a buy or sell instruction.`,
    },
  ]
}

export async function generateStudioVideo(script, onStatus) {
  const symbol = script?.symbol || 'TOKEN'
  const shots = studioShots(symbol)

  try {
    onStatus?.('Submitting render jobs…')
    const queued = []
    for (let s = 0; s < shots.length; s++) {
      const res = await fetch('/api/proxy/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: shots[s].prompt, duration: shots[s].duration }),
      })
      const submitted = res.ok ? await res.json().catch(() => ({})) : {}
      if (!submitted.task_id) throw new Error(submitted.error || `Shot ${s + 1} failed to queue`)
      queued.push({
        task_id: submitted.task_id,
        resolution: submitted.resolution || '720p',
        duration: Number(submitted.duration) || shots[s].duration,
        url: null,
        poster: null,
        error: null,
      })
    }

    onStatus?.('Both shots queued — rendering…')
    // Each Grok Imagine shot takes ~30s–3min; both render in parallel. Poll every 3s up to 8 minutes.
    for (let i = 0; i < 160; i++) {
      await wait(3000)

      const pending = queued.filter((q) => !q.url && !q.error)
      await Promise.all(
        pending.map(async (q) => {
          const statusRes = await fetch(`/api/proxy/studio/video/status/${encodeURIComponent(q.task_id)}`)
          const status = await statusRes.json().catch(() => ({}))
          if (status.done && status.videoUrl) {
            q.url = status.videoUrl
            q.poster = status.posterUrl || status.videoUrl
            if (Number(status.duration)) q.duration = Number(status.duration)
          } else if (status.done && status.error) {
            q.error = status.error
          }
        })
      )

      const settled = queued.filter((q) => q.url || q.error).length
      const secs = (i + 1) * 3
      onStatus?.(`Rendering shot ${Math.min(settled + 1, queued.length)}/${queued.length}… ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} elapsed`)

      if (settled === queued.length) break
    }

    // One surviving shot still beats nothing — only bail to the local card when every shot failed.
    const clips = queued.filter((q) => q.url)
    if (!clips.length) throw new Error(queued.find((q) => q.error)?.error || 'Video render timed out')

    onStatus?.('Render complete')
    return {
      poster: clips[0].poster || clips[0].url,
      videoUrl: clips[0].url,
      clips: clips.map((c) => c.url),
      posters: clips.map((c) => c.poster || c.url),
      duration: clips.reduce((sum, c) => sum + (c.duration || 0), 0),
      resolution: clips[0].resolution,
      format: 'mp4',
    }
  } catch (err) {
    console.warn('[studio] video model unavailable — rendering live-data motion card:', err.message)
  }

  // Fallback: render a motion card locally from the live verdict data.
  return verdictMotionWebm(script, onStatus)
}

// Voice → real Qwen TTS (qwen-audio-3.0-tts-plus). The prompt/script is condensed
// behind the scenes on the server; the browser only ever receives the finished MP3.
export async function generateStudioVoice(script, { onProgress } = {}) {
  const symbol = script?.symbol || 'TOKEN'
  const verdict = script?.verdict || 'HOLD'
  const tone = script?.tone || 'neutral'
  const text = String(script?.script || '')

  onProgress?.(8)

  const res = await fetch('/api/proxy/studio/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, symbol, verdict, tone }),
  })

  onProgress?.(82)

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Voice generation failed')
  }

  const data = await res.json()

  onProgress?.(100)

  // Server may return audioUrl:null when every TTS provider is down — the script
  // still comes back so the page can read it aloud in the browser instead of erroring.
  return {
    script: data.script,
    audioUrl: data.audioUrl || null,
    duration: data.duration,
    format: data.format || 'mp3',
    tone: data.tone || tone,
    symbol: data.symbol || symbol,
    verdict: data.verdict || verdict,
    provider: data.provider || 'acedata',
  }
}

export { verdictArt } from './verdictArt.js'
