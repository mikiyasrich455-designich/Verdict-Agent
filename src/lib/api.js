// Live API layer — calls the Express proxy at /api/proxy/*
// The proxy holds all API keys (RYO, AceData) and never exposes them to the browser.
// Every function keeps the same signature the UI expects.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const ANALYSIS_STEPS = [
  'Scanning market data…',
  'Running technicals…',
  'Reading sentiment regime…',
  'Weighing the evidence…',
  'Building the verdict…',
]

// POST /api/proxy/synthesis/verdict → Deep forensic analysis (SERP + RYO + Grok)
// Backend now parallelizes RYO + 3x SERP queries (was sequential = 9-15s)
export async function fetchVerdict(symbol, onStep) {
  try {
    const res = await fetch('/api/proxy/synthesis/verdict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
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
    body: JSON.stringify({ symbol }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Debate failed')
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
export async function fetchTokenProfile(symbol) {
  const res = await fetch('/api/proxy/ryo/analyze_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Token profile failed')
  }

  return res.json()
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
    body: JSON.stringify({ symbol }),
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
    body: JSON.stringify({ symbol, limits }),
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
    body: JSON.stringify({ symbol }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Studio script failed')
  }

  return res.json()
}

// POST /api/proxy/acedata/image → Seedream (primary) / Flux (fallback)
export async function generateStudioImage(symbol, verdict) {
  const prompt = `A premium dark glassmorphism financial dashboard card, deep navy #020208 background, blue accent #5b93ff glow. Center: large bold "${symbol}" text with verdict badge "${verdict}" in ${verdict === 'BUY' ? '#34d399' : verdict === 'AVOID' ? '#f87171' : '#5b93ff'}. Below: confidence 70%. Top: 3 signal icons. Bottom: "VERDICT · AI INTELLIGENCE" watermark. Style: clean, professional, no clutter, motion blur glow effects, 800x450.`

  const res = await fetch('/api/proxy/acedata/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, size: '1:1' }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Image generation failed')
  }

  const data = await res.json()
  // Seedream: {data:[{image_url, prompt, size}]}
  // Flux (async poll): {data:[{image_url}]}
  const imageUrl = data?.data?.[0]?.image_url || data?.image_url
  if (!imageUrl) throw new Error('No image URL in response')
  return { url: imageUrl, format: 'png' }
}

// POST /api/proxy/acedata/video → Seedance (1.0 Lite cheapest, fallback 2.0 Mini)
export async function generateStudioVideo(symbol, verdict) {
  const prompt = `A 12-second motion graphics video for ${symbol} crypto analysis. Scene 1 (0-4s): "${symbol}" logo reveal with ${verdict} badge animation. Scene 2 (4-8s): Price chart motion with confidence bar filling. Scene 3 (8-12s): Top bull and bear arguments as text cards sliding in. End frame: "VERDICT · Share this analysis". Style: dark glassmorphism, blue accent #5b93ff, professional.`

  const res = await fetch('/api/proxy/acedata/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, duration: 12 }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Video generation failed')
  }

  const data = await res.json()
  // Seedance response: {data:{video_url, poster_url, resolution, ratio, duration}}
  const videoUrl = data?.data?.video_url || data?.video_url
  const posterUrl = data?.data?.poster_url || data?.data?.last_frame_url || data?.poster_url
  if (!videoUrl && !posterUrl) throw new Error('No video URL in response')
  return {
    poster: posterUrl || videoUrl,
    videoUrl,
    duration: 12,
    resolution: '720p',
    format: 'mp4',
  }
}

// Voice — browser TTS, no API call needed
export async function generateStudioVoice(script, { onProgress } = {}) {
  const voiceScript = `VERDICT analysis for ${script.symbol}. Current verdict: ${script.verdict}. Confidence: ${script.confidence || 70}%. Top signal: strong momentum. Risk flag: monitor volatility. Share this analysis.`

  for (let p = 0; p <= 100; p += 10) {
    onProgress?.(p)
    await wait(60)
  }

  return { script: voiceScript, tone: 'neutral', duration: 30, format: 'tts', credits: 0 }
}

export { verdictArt } from './verdictArt.js'
