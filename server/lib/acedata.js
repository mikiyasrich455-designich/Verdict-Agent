// AceDataCloud (api.acedata.cloud) — used for Studio VIDEO (Google Veo) and VOICE (TTS).
// Key comes from Render env ACEDATA_KEY — never committed. Every model is env-overridable.
import fetch from 'node-fetch'

const ACE_BASE = process.env.ACEDATA_BASE || 'https://api.acedata.cloud'
const ACE_KEY = process.env.ACEDATA_KEY || ''

export const ACE_MODELS = {
  video: process.env.ACEDATA_VIDEO_MODEL || 'sora-2',
  fallbackVideo: process.env.ACEDATA_FALLBACK_VIDEO_MODEL || 'veo3-fast',
  tts: process.env.ACEDATA_TTS_MODEL || 'tts-1-hd',
  ttsVoice: process.env.ACEDATA_TTS_VOICE || 'onyx',
}

export const VIDEO_DURATION = Math.min(25, Math.max(5, Number(process.env.ACEDATA_VIDEO_DURATION) || 15))
export const VIDEO_SIZE = process.env.ACEDATA_VIDEO_SIZE || 'small' // sora: small | large

function requireKey() {
  if (!ACE_KEY) throw new Error('ACEDATA_KEY is not configured')
}

// Voice → OpenAI-compatible /v1/audio/speech. Returns a durable data URL (mp3 bytes).
export async function aceTTS(text, voice = ACE_MODELS.ttsVoice) {
  requireKey()
  const input = String(text || '').trim()
  if (!input) throw new Error('TTS text is empty')

  const res = await fetch(`${ACE_BASE}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ACE_KEY}` },
    body: JSON.stringify({ model: ACE_MODELS.tts, input, voice, response_format: 'mp3' }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error(`AceData TTS failed: ${res.status} ${(await res.text()).slice(0, 200)}`)

  const ct = res.headers.get('content-type') || ''
  const bytes = Buffer.from(await res.arrayBuffer())
  if (!bytes.length) throw new Error('AceData TTS returned empty audio')

  const mime = /mpeg/.test(ct) ? 'audio/mpeg' : 'audio/mp3'
  return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}`, bytes: bytes.length }
}

// ─── PRIMARY: Sora (supports real duration 10/15/25s) ───────────────────────
// Submit → POST /sora/videos. Returns task_id immediately (async).
export async function aceSoraSubmit(prompt, duration = VIDEO_DURATION) {
  requireKey()
  const body = {
    model: ACE_MODELS.video,
    prompt: String(prompt || ''),
    duration: Number(duration) || VIDEO_DURATION,
    orientation: 'landscape',
    size: VIDEO_SIZE,
    async: true,
  }
  const res = await fetch(`${ACE_BASE}/sora/videos`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ACE_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`AceData sora submit failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const taskId = data?.task_id || data?.id
  if (!taskId) throw new Error(`AceData sora: no task_id (${JSON.stringify(data).slice(0, 160)})`)
  return { taskId, duration: body.duration }
}

// Sora poll → POST /sora/tasks { id, action: "retrieve" }.
export async function aceSoraPoll(taskId) {
  requireKey()
  const res = await fetch(`${ACE_BASE}/sora/tasks`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ACE_KEY}` },
    body: JSON.stringify({ id: taskId, action: 'retrieve' }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return { httpStatus: res.status, status: 'unknown' }
  return normalizeTask(await res.json())
}

// ─── FALLBACK: Veo (fixed ~8s clips, no duration param) ────────────────────
// Video → Google Veo (async). Submit returns a task_id immediately, then poll.
export async function aceVideoSubmit(prompt) {
  requireKey()
  const res = await fetch(`${ACE_BASE}/veo/videos`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ACE_KEY}` },
    body: JSON.stringify({ action: 'text2video', model: ACE_MODELS.fallbackVideo, prompt: String(prompt || ''), aspect_ratio: '16:9', async: true }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`AceData video submit failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const taskId = data?.task_id || data?.id
  if (!taskId) throw new Error('AceData video: no task_id in response')
  return taskId
}

// Video poll → POST /veo/tasks { id, action: "retrieve" }.
export async function aceVideoPoll(taskId) {
  requireKey()
  const res = await fetch(`${ACE_BASE}/veo/tasks`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ACE_KEY}` },
    body: JSON.stringify({ id: taskId, action: 'retrieve' }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return { httpStatus: res.status, status: 'unknown' }
  return normalizeTask(await res.json())
}

// Both Sora and Veo tasks resolve to the same shape: { response: { data: [{ video_url, state }] } }.
function normalizeTask(data) {
  const resp = data?.response || data
  const arr = Array.isArray(resp?.data) ? resp.data : Array.isArray(data?.data) ? data.data : []
  const first = arr[0] || {}
  const videoUrl = first.video_url || first.output_url || first.url || resp?.video_url || null
  const rawState = String(first.state || resp?.status || data?.status || (videoUrl ? 'succeeded' : 'running')).toLowerCase()
  const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(rawState)
  const status = rawState === 'succeeded' ? 'succeeded' : failed ? 'failed' : 'running'
  const poster = first.cover_url || first.poster_url || resp?.cover_url || null
  return { status, videoUrl, posterUrl: poster, failed, message: failed ? (data?.message || first.error || rawState) : '' }
}