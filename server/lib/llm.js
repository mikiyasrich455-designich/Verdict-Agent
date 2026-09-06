// Unified AI backend — Qwen Cloud (DashScope intl, pay-as-you-go) is the single provider.
// Every model below is overridable via env so a name can be adjusted from Render without
// a redeploy of code. The top research/analysis agent is the "main" model everywhere.
import fetch from 'node-fetch'

const QWEN_BASE = process.env.QWEN_BASE || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const QWEN_NATIVE = QWEN_BASE.replace(/\/compatible-mode\/v1\/?$/, '')
// Key comes from the Render env var QWEN_KEY — never committed.
const QWEN_KEY = process.env.QWEN_KEY || ''

export const QWEN_MODELS = {
  // Top agent — research, deep analysis, verdicts, compare, insights, council.
  main: process.env.QWEN_MAIN_MODEL || 'qwen3.8-max',
  chat: process.env.QWEN_CHAT_MODEL || 'qwen3.8-flash',
  // Grounded web search needs a model that accepts enable_search.
  search: process.env.QWEN_SEARCH_MODEL || 'qwen3.8-flash',
  // Voiceover/script writing — a fast model, not the deep reasoning agent.
  script: process.env.QWEN_SCRIPT_MODEL || 'qwen3.8-flash',
  // Council agents — each side gets its own model, the judge is stronger.
  bull: process.env.QWEN_BULL_MODEL || 'qwen3.6-flash',
  bear: process.env.QWEN_BEAR_MODEL || 'qwen3.7-flash',
  judge: process.env.QWEN_JUDGE_MODEL || 'qwen3.7-plus',
  // Studio media — exact Qwen Cloud models confirmed on this account.
  image: process.env.QWEN_IMAGE_MODEL || 'qwen-image-plus',
  video: process.env.QWEN_VIDEO_MODEL || 'wan2.1-t2v-turbo',
  voice: process.env.QWEN_VOICE_MODEL || 'qwen3-tts-flash',
  ttsVoice: process.env.QWEN_TTS_VOICE || 'Ethan',
}

function requireKey() {
  if (!QWEN_KEY) throw new Error('QWEN_KEY is not configured')
}

export function extractJsonLite(text) {
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

// Chat completion via Qwen. Never falls back — a failure is a real error.
// opts.timeoutMs lets fast paths (council, search) cut a slow call short instead of
// sitting on the 120s ceiling.
export async function callLLM(messages, model = QWEN_MODELS.main, maxTokens = 2000, opts = {}) {
  requireKey()
  const body = { model, messages, max_tokens: maxTokens, temperature: opts.temperature ?? 0.4 }
  if (opts.search) body.enable_search = true
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${QWEN_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(opts.timeoutMs) || 120000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Qwen chat failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Qwen chat returned empty content')
  return content
}

// Live web research via Qwen grounded search.
// Returns a SERP-shaped { organic: [{ title, link, snippet }] }.
export async function callSearch(query, num = 6, timeoutMs = 45000) {
  const text = await callLLM([
    { role: 'system', content: 'You are a live web-search result extractor. Respond with ONLY valid JSON.' },
    { role: 'user', content: `Use your live web search for this query: "${query}"\nReturn ONLY a JSON object of the form {"organic":[{"title":"...","link":"...","snippet":"..."}]} with up to ${num} REAL, CURRENT results. Every "link" MUST be a real URL returned by your search — never invent or guess URLs.` },
  ], QWEN_MODELS.search, 1200, { search: true, json: true, timeoutMs })

  const parsed = extractJsonLite(text)
  const organic = Array.isArray(parsed?.organic)
    ? parsed.organic.filter((r) => r && typeof r.title === 'string' && typeof r.link === 'string' && /^https?:\/\//.test(r.link)).slice(0, num)
    : []
  return { organic }
}

// Image generation via the native DashScope text2image async flow, normalized to
// { data: [{ image_url }] }. qwen-image-plus is the confirmed text-to-image model.
export async function qwenImage(prompt, size = '1024*1024') {
  requireKey()
  const sz = String(size || '1024*1024').replace('x', '*')
  const submit = await fetch(`${QWEN_NATIVE}/api/v1/services/aigc/text2image/image-synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}`, 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({ model: QWEN_MODELS.image, input: { prompt }, parameters: { size: sz, n: 1 } }),
    signal: AbortSignal.timeout(30000),
  })
  if (!submit.ok) throw new Error(`Qwen image submit failed: ${submit.status} ${(await submit.text()).slice(0, 200)}`)
  const sdata = await submit.json()
  const taskId = sdata.output?.task_id
  if (!taskId) throw new Error('Qwen image: no task_id in response')

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = await fetch(`${QWEN_NATIVE}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${QWEN_KEY}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) continue
    const data = await res.json()
    const out = data.output || {}
    if (out.task_status === 'SUCCEEDED') {
      const url = out.results?.[0]?.url || out.images?.[0]?.url
      if (!url) throw new Error('Qwen image: no url in result')
      return { data: [{ image_url: url, url }] }
    }
    if (out.task_status === 'FAILED') throw new Error(`Qwen image failed: ${data.message || out.message || 'task failed'}`)
  }
  throw new Error('Qwen image timed out')
}

// Video generation — native async task flow (submit, then poll from the browser).
export async function qwenVideoSubmit(prompt, duration = 5) {
  requireKey()
  const res = await fetch(`${QWEN_NATIVE}/api/v1/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${QWEN_KEY}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: QWEN_MODELS.video,
      input: { prompt },
      // wan2.1-t2v-turbo produces a 720p ~5s clip; other durations are rejected.
      parameters: { size: '1280*720', duration: 5, prompt_extend: true },
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Qwen video submit failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const taskId = data.output?.task_id
  if (!taskId) throw new Error('Qwen video: no task_id in response')
  return taskId
}

export async function qwenVideoPoll(taskId) {
  requireKey()
  const res = await fetch(`${QWEN_NATIVE}/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${QWEN_KEY}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return { httpStatus: res.status, status: 'unknown' }
  const data = await res.json()
  const out = data.output || {}
  const status = String(out.task_status || 'RUNNING').toLowerCase()
  if (status === 'succeeded') {
    const videoUrl = out.video_url || out.results?.[0]?.url || null
    return { status, videoUrl, posterUrl: out.cover_url || null, failed: !videoUrl, message: videoUrl ? '' : 'no video url in result' }
  }
  const failed = ['failed', 'canceled', 'unknown'].includes(status)
  return { status, videoUrl: null, posterUrl: null, failed, message: failed ? (data.message || out.message || status) : '' }
}

// Voice (TTS) via the native DashScope multimodal-generation endpoint. Returns a durable
// data URL the browser can play immediately — no asset is ever stored on our side.
export async function qwenTTS(text, voice = QWEN_MODELS.ttsVoice) {
  requireKey()
  const input = String(text || '').trim()
  if (!input) throw new Error('TTS text is empty')

  const res = await fetch(`${QWEN_NATIVE}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
    body: JSON.stringify({ model: QWEN_MODELS.voice, input: { text: input }, parameters: { voice, format: 'mp3' } }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`Qwen TTS failed: ${res.status} ${(await res.text()).slice(0, 200)}`)

  const data = await res.json()
  const audioUrl = data.output?.audio?.url
  if (!audioUrl) throw new Error('Qwen TTS returned no audio url')

  const ar = await fetch(audioUrl, { signal: AbortSignal.timeout(60000) })
  if (!ar.ok) throw new Error(`Qwen TTS download failed: ${ar.status}`)
  const bytes = Buffer.from(await ar.arrayBuffer())
  if (!bytes.length) throw new Error('Qwen TTS returned empty audio')

  const ct = ar.headers.get('content-type') || ''
  const mime = /mpeg/.test(ct) || /\.mp3($|\?)/i.test(audioUrl) ? 'audio/mpeg' : 'audio/wav'
  return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, bytes: bytes.length }
}