// AceDataCloud (api.acedata.cloud) — used for Studio VIDEO (Google Veo) and VOICE (TTS).
// Key comes from Render env ACEDATA_KEY — never committed. Every model is env-overridable.
import fetch from 'node-fetch'

const ACE_BASE = process.env.ACEDATA_BASE || 'https://api.acedata.cloud'
const ACE_KEY = process.env.ACEDATA_KEY || ''

export const ACE_MODELS = {
  video: process.env.ACEDATA_VIDEO_MODEL || 'veo3-fast',
  tts: process.env.ACEDATA_TTS_MODEL || 'tts-1-hd',
  ttsVoice: process.env.ACEDATA_TTS_VOICE || 'onyx',
}

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

// Video → Google Veo (async). Submit returns a task_id immediately, then poll.
export async function aceVideoSubmit(prompt) {
  requireKey()
  const res = await fetch(`${ACE_BASE}/veo/videos`, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${ACE_KEY}` },
    body: JSON.stringify({ action: 'text2video', model: ACE_MODELS.video, prompt: String(prompt || ''), aspect_ratio: '16:9', async: true }),
    signal: AbortSignal.timeout(30000),
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
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return { httpStatus: res.status, status: 'unknown' }

  const data = await res.json()
  const resp = data?.response || data
  const arr = Array.isArray(resp?.data) ? resp.data : Array.isArray(data?.data) ? data.data : []
  const first = arr[0] || {}
  const videoUrl = first.video_url || first.output_url || null
  const rawState = String(first.state || resp?.status || data?.status || (videoUrl ? 'succeeded' : 'running')).toLowerCase()
  const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(rawState)
  const status = rawState === 'succeeded' ? 'succeeded' : failed ? 'failed' : 'running'
  return { status, videoUrl, posterUrl: null, failed, message: failed ? (data?.message || rawState) : '' }
}