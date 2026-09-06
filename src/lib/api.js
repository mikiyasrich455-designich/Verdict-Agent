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

// POST /api/proxy/synthesis/verdict → Deep forensic analysis (research + RYO + Qwen)
// Backend now parallelizes RYO + 3x SERP queries (was sequential = 9-15s)
export async function fetchVerdict(symbol, onStep) {
  try {
    const res = await fetch('/api/proxy/synthesis/verdict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withIdentity({ symbol })),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Verdict failed')
    }

    return res.json()
  } catch (err) {
    throw err
  }
}

// POST /api/proxy/synthesis/debate → RYO analyze → debate shape
export async function fetchDebate(symbol) {
  const res = await fetch('/api/proxy/synthesis/debate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withIdentity({ symbol })),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Debate failed')
  }

  return res.json()
}

// POST /api/proxy/synthesis/council → evidence-grounded Bull vs Bear vs Judge
export async function fetchCouncil(symbol) {
  const res = await fetch('/api/proxy/synthesis/council', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withIdentity({ symbol })),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Council failed')
  }

  return res.json()
}

// POST /api/proxy/ryo/market_overview → normalized overview shape
export async function fetchMarketOverview() {
  const res = await fetch('/api/proxy/ryo/market_overview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Market overview failed')
  }

  return res.json()
}

// POST /api/proxy/ryo/scan_market → normalized scan array
export async function fetchScan() {
  const res = await fetch('/api/proxy/ryo/scan_market', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Scan failed')
  }

  return res.json()
}

// POST /api/proxy/ryo/analyze_token → normalized profile shape
// `identity` ({ca, chain, name}) pins the lookup to one contract when the page
// already knows it — otherwise the stored active token is used.
export async function fetchTokenProfile(symbol, identity) {
  const res = await fetch('/api/proxy/ryo/analyze_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withIdentity({ symbol }, identity)),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Token profile failed')
  }

  return enrichProfile(await res.json())
}

// POST /api/proxy/ryo/compare_tokens → normalized compare array
export async function fetchCompare(symbols) {
  const res = await fetch('/api/proxy/ryo/compare_tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Compare failed')
  }

  return res.json()
}

// POST /api/proxy/ryo/sentiment_shift → normalized sentiment shape
export async function fetchSentimentShift() {
  const res = await fetch('/api/proxy/ryo/sentiment_shift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Sentiment shift failed')
  }

  return res.json()
}

// POST /api/proxy/synthesis/narrative → normalized narrative shape
export async function fetchNarrative(symbol) {
  const res = await fetch('/api/proxy/synthesis/narrative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withIdentity({ symbol })),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Narrative failed')
  }

  return res.json()
}

// POST /api/proxy/synthesis/risk → normalized risk desk shape
export async function fetchRiskDesk(symbol, limits) {
  const res = await fetch('/api/proxy/synthesis/risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withIdentity({ symbol, limits })),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Risk desk failed')
  }

  return res.json()
}

// POST /api/proxy/synthesis/script → normalized studio script shape
export async function fetchStudioScript(symbol) {
  const res = await fetch('/api/proxy/synthesis/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withIdentity({ symbol })),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Studio script failed')
  }

  return res.json()
}

// POST /api/proxy/studio/image → Qwen image; live-data art card fallback
export async function generateStudioImage(script) {
  const symbol = script?.symbol || 'TOKEN'
  const verdict = script?.verdict || 'HOLD'
  const accent = verdict === 'BUY' ? '#34d399' : verdict === 'AVOID' ? '#f87171' : '#5b93ff'
  const motif = script?.artDirection?.motif || 'premium fintech lighting'
  const prompt = `A premium dark glassmorphism financial dashboard card, deep navy #020208 background, blue accent #5b93ff glow. Center: large bold "${symbol}" text with verdict badge "${verdict}" in ${accent}. Motif: ${motif}. Bottom: "VERDICT · AI INTELLIGENCE" watermark. Style: clean, professional, no clutter, motion blur glow effects, 800x450.`

  try {
    const res = await fetch('/api/proxy/studio/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size: '1:1' }),
    })

    if (res.ok) {
      const data = await res.json()
      const imageUrl = data?.data?.[0]?.image_url || data?.image_url
      if (imageUrl) return { url: imageUrl, format: 'png' }
    }
  } catch (err) {
    console.warn('[studio] image model unavailable — rendering live-data art card:', err.message)
  }

  // Fallback: render the card locally from the live verdict data — never a dead screen.
  return { url: verdictCardPng(script), format: 'png' }
}

// Video → Qwen video model async task: POST /video submits, GET /video/status/:id polls.
// Polling lives in the browser so no single request ever hits the platform timeout.
// If the render service is unavailable, a motion card is rendered locally from the
// live verdict data so the studio never dead-ends.
export async function generateStudioVideo(script, onStatus) {
  const symbol = script?.symbol || 'TOKEN'
  const verdict = script?.verdict || 'HOLD'
  const prompt = `A 12-second motion graphics video for ${symbol} crypto analysis. Scene 1 (0-4s): "${symbol}" logo reveal with ${verdict} badge animation. Scene 2 (4-8s): Price chart motion with confidence bar filling. Scene 3 (8-12s): Top bull and bear arguments as text cards sliding in. End frame: "VERDICT · Share this analysis". Style: dark glassmorphism, blue accent #5b93ff, professional.`

  try {
    onStatus?.('Submitting render job…')
    const res = await fetch('/api/proxy/studio/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration: 12 }),
    })

    if (res.ok) {
      const submitted = await res.json()

      // If the upstream returned the finished video inline, use it directly.
      if (!submitted.queued && (submitted.videoUrl || submitted.posterUrl)) {
        return {
          poster: submitted.posterUrl || submitted.videoUrl,
          videoUrl: submitted.videoUrl,
          duration: 12,
          resolution: '720p',
          format: 'mp4',
        }
      }

      if (submitted.task_id) {
        // Poll the task status from the browser: every 4s, up to ~6 minutes
        // (a 12s 720p clip measures ~2.5 min end to end).
        onStatus?.('Render queued — generating frames…')
        for (let i = 0; i < 90; i++) {
          await wait(4000)

          const statusRes = await fetch(`/api/proxy/studio/video/status/${encodeURIComponent(submitted.task_id)}`)
          const status = await statusRes.json().catch(() => ({}))

          const secs = (i + 1) * 4
          onStatus?.(`Rendering… ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} elapsed`)

          if (status.done && status.videoUrl) {
            onStatus?.('Render complete')
            return {
              poster: status.posterUrl || status.videoUrl,
              videoUrl: status.videoUrl,
              duration: 12,
              resolution: '720p',
              format: 'mp4',
            }
          }
          if (status.done && status.error) throw new Error(status.error)
        }
        throw new Error('Video render timed out')
      }
    }
  } catch (err) {
    console.warn('[studio] video model unavailable — rendering live-data motion card:', err.message)
  }

  // Fallback: render a motion card locally from the live verdict data.
  return verdictMotionWebm(script, onStatus)
}

// Voice — browser TTS speaking the REAL analysis script produced for this token
export async function generateStudioVoice(script, { onProgress } = {}) {
  const voiceScript = String(script?.script || '').trim() ||
    `VERDICT analysis for ${script?.symbol || 'this token'}. Current verdict: ${script?.verdict || 'HOLD'}. Confidence: ${script?.confidence || 70}%. This is not financial advice. Trade the evidence, not the noise.`

  for (let p = 0; p <= 100; p += 10) {
    onProgress?.(p)
    await wait(60)
  }

  return {
    script: voiceScript,
    tone: script?.tone || 'neutral',
    duration: Number(script?.duration) || Math.max(30, Math.round(voiceScript.split(/\s+/).length / 2.5)),
    format: 'tts',
    credits: 0,
  }
}

export { verdictArt } from './verdictArt.js'
