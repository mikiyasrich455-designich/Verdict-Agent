// Unified AI backend — Qwen Cloud (DashScope intl, pay-as-you-go) is the single provider.
// Every model below is overridable via env so a name can be adjusted from Render without
// a redeploy of code. The top research/analysis agent is the "main" model everywhere.
import fetch from 'node-fetch'

const QWEN_BASE = process.env.QWEN_BASE || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const QWEN_NATIVE = QWEN_BASE.replace(/\/compatible-mode\/v1\/?$/, '')
// Key comes from the Render env var QWEN_KEY — never committed.
const QWEN_KEY = process.env.QWEN_KEY || ''

export const QWEN_MODELS = {
  // Top agent — research, deep analysis, verdicts, scripts, compare, insights.
  main: process.env.QWEN_MAIN_MODEL || 'deepseek-v4-pro',
  chat: process.env.QWEN_CHAT_MODEL || 'deepseek-v4-pro',
  // Grounded web search needs a Qwen model that accepts enable_search.
  search: process.env.QWEN_SEARCH_MODEL || 'qwen-flash',
  // Voiceover/script writing — a fast model, not the deep reasoning agent.
  script: process.env.QWEN_SCRIPT_MODEL || 'qwen-flash',
  // Council agents — each side gets its own model, the judge is stronger.
  bull: process.env.QWEN_BULL_MODEL || 'qwen3.6-flash',
  bear: process.env.QWEN_BEAR_MODEL || 'deepseek-v4-flash-0731',
  judge: process.env.QWEN_JUDGE_MODEL || 'qwen3.7-plus',
  // Studio media — exact Qwen Cloud models.
  image: process.env.QWEN_IMAGE_MODEL || 'wan2.7-image-pro',
  video: process.env.QWEN_VIDEO_MODEL || 'wan3.0-text-to-video',
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
export async function callLLM(messages, model = QWEN_MODELS.main, maxTokens = 2000, opts = {}) {
  requireKey()
  const body = { model, messages, max_tokens: maxTokens, temperature: opts.temperature ?? 0.4 }
  if (opts.search) body.enable_search = true
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${QWEN_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
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
export async function callSearch(query, num = 6) {
  const text = await callLLM([
    { role: 'system', content: 'You are a live web-search result extractor. Respond with ONLY valid JSON.' },
    { role: 'user', content: `Use your live web search for this query: "${query}"\nReturn ONLY a JSON object of the form {"organic":[{"title":"...","link":"...","snippet":"..."}]} with up to ${num} REAL, CURRENT results. Every "link" MUST be a real URL returned by your search — never invent or guess URLs.` },
  ], QWEN_MODELS.search, 1500, { search: true, json: true })

  const parsed = extractJsonLite(text)
  const organic = Array.isArray(parsed?.organic)
    ? parsed.organic.filter((r) => r && typeof r.title === 'string' && typeof r.link === 'string' && /^https?:\/\//.test(r.link)).slice(0, num)
    : []
  return { organic }
}

// Image generation, normalized to { data: [{ image_url }] }.
export async function qwenImage(prompt, size = '1024x1024') {
  requireKey()
  const res = await fetch(`${QWEN_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
    body: JSON.stringify({ model: QWEN_MODELS.image, prompt, size, n: 1 }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`Qwen image failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const item = data.data?.[0] || {}
  const imageUrl = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null)
  if (!imageUrl) throw new Error('Qwen image returned no url')
  return { data: [{ image_url: imageUrl, url: imageUrl }] }
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
      parameters: { size: '1280*720', duration: Math.min(Number(duration) || 15, 15), prompt_extend: true },
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

// Voice (TTS) via Qwen's OpenAI-compatible audio endpoint. Returns a data URL the
// browser can play immediately — no asset is ever stored on our side.
export async function qwenTTS(text, voice = QWEN_MODELS.ttsVoice) {
  requireKey()
  const input = String(text || '').trim()
  if (!input) throw new Error('TTS text is empty')

  const res = await fetch(`${QWEN_BASE}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
    body: JSON.stringify({ model: QWEN_MODELS.voice, input, voice, response_format: 'mp3' }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`Qwen TTS failed: ${res.status} ${(await res.text()).slice(0, 200)}`)

  const bytes = Buffer.from(await res.arrayBuffer())
  if (!bytes.length) throw new Error('Qwen TTS returned empty audio')
  return { dataUrl: `data:audio/mp3;base64,${bytes.toString('base64')}`, bytes: bytes.length }
}