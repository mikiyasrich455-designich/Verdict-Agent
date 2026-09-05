import { Router } from 'express'
import fetch from 'node-fetch'
import { rateLimit } from '../lib/rateLimit.js'
import { getCache, setCache } from '../lib/cache.js'
import { log, error } from '../lib/logger.js'

const router = Router()

// AceData Chat helper — lazy env read
async function callAceChat(messages, model = 'grok-4', maxTokens = 2000) {
  const url = `${process.env.ACEDATA_BASE}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AceData Chat failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// POST /api/proxy/acedata/serp — Google SERP
router.post('/serp', async (req, res) => {
  const start = Date.now()
  const { query, num = 10 } = req.body
  if (!query) return res.status(400).json({ error: 'query required' })

  const limit = rateLimit('acedata', 100, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/serp', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const cacheKey = `ace:serp:${query}`
    const cached = getCache(cacheKey)
    if (cached) {
      log('POST', '/acedata/serp', 200, Date.now() - start, '(cached)')
      return res.json(cached)
    }

    const url = `${process.env.ACEDATA_BASE}/serp/google`
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
      },
      body: JSON.stringify({ type: 'search', query, number: num }),
    })

    if (!fetchRes.ok) {
      const text = await fetchRes.text()
      throw new Error(`SERP failed: ${fetchRes.status} ${text}`)
    }

    const data = await fetchRes.json()
    setCache(cacheKey, data, 10 * 60 * 1000)
    log('POST', '/acedata/serp', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('serp', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/acedata/chat — Grok chat
router.post('/chat', async (req, res) => {
  const start = Date.now()
  const { messages, model = 'grok-4', maxTokens = 2000 } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' })

  const limit = rateLimit('acedata', 100, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/chat', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const content = await callAceChat(messages, model, maxTokens)
    log('POST', '/acedata/chat', 200, Date.now() - start)
    res.json({ content })
  } catch (err) {
    error('chat', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/acedata/image — Seedream image generation (cheapest & best quality on AceData)
// Endpoint: POST /seedream/images  body: { model, prompt, size }
// Seedream 5.0 Pro: $0.032/image, direct response (no polling needed)
// Fallback to Flux if Seedream fails
router.post('/image', async (req, res) => {
  const start = Date.now()
  const { prompt, size = '1:1', model } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const limit = rateLimit('acedata', 20, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/image', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  // Try Seedream first (cheapest, direct response, no polling)
  try {
    const seedreamModel = model || 'doubao-seedream-5-0-pro-260628'
    const url = `${process.env.ACEDATA_BASE}/seedream/images`
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
      },
      body: JSON.stringify({
        model: seedreamModel,
        prompt,
        size: size === '1:1' ? '1024x1024' : size === '16:9' ? '1280x720' : '1024x1024',
      }),
    })

    if (fetchRes.ok) {
      const data = await fetchRes.json()
      log('POST', '/acedata/image', 200, Date.now() - start, '(seedream)')
      return res.json(data)
    }

    // Seedream failed, try Flux as fallback
    const text = await fetchRes.text()
    console.log('[IMAGE] Seedream failed, trying Flux fallback:', fetchRes.status, text)

    const fluxModel = model || 'flux-2-pro'
    const fluxUrl = `${process.env.ACEDATA_BASE}/flux/images`
    const fluxRes = await fetch(fluxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
      },
      body: JSON.stringify({
        action: 'generate',
        prompt,
        model: fluxModel,
        size,
        count: 1,
      }),
    })

    if (!fluxRes.ok) {
      const fluxText = await fluxRes.text()
      throw new Error(`Image generation failed: Seedream (${fetchRes.status}) + Flux (${fluxRes.status}) ${fluxText}`)
    }

    const fluxData = await fluxRes.json()

    // Flux may be async — poll for result (max 60s)
    if (fluxData.task_id) {
      let attempts = 0
      const maxAttempts = 30
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000))
        const pollRes = await fetch(`${process.env.ACEDATA_BASE}/flux/tasks/${fluxData.task_id}`, {
          headers: { 'Authorization': `Bearer ${process.env.ACEDATA_KEY}` },
        })
        if (pollRes.ok) {
          const pollData = await pollRes.json()
          if (pollData.data && pollData.data.length > 0) {
            log('POST', '/acedata/image', 200, Date.now() - start, '(flux+poll)')
            return res.json(pollData)
          }
        }
        attempts++
      }
      throw new Error('Image generation timed out (Flux)')
    }

    log('POST', '/acedata/image', 200, Date.now() - start, '(flux)')
    res.json(fluxData)
  } catch (err) {
    error('image', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Seedance video — ASYNC task flow (never hold one HTTP request open) ──
// POST /video          → creates the task, returns { task_id } immediately
// GET  /video/status/:id → one upstream poll, returns { done, videoUrl, posterUrl, status }
// The old design polled for up to 2 min inside a single request — Render's
// request timeout killed it, so the UI spun forever.

// Pull the video/poster URLs out of any of the shapes AceData may return.
function extractVideoUrls(payload) {
  const videoUrl =
    payload?.video_url ||
    payload?.data?.video_url ||
    payload?.result_url ||
    payload?.videoUrl ||
    payload?.data?.[0]?.url ||
    payload?.data?.result?.video_url ||
    null
  const posterUrl =
    payload?.poster_url ||
    payload?.cover_url ||
    payload?.last_frame_url ||
    payload?.data?.poster_url ||
    payload?.data?.last_frame_url ||
    payload?.data?.[0]?.poster_url ||
    null
  if (videoUrl || posterUrl) return { videoUrl, posterUrl }

  // Fallback: scan the whole JSON blob for hosted .mp4 / cover URLs
  const json = JSON.stringify(payload || {})
  const mp4 = json.match(/https?:\/\/[^"'\\\s]+\.mp4[^"'\\\s]*/)
  const cover = json.match(/https?:\/\/[^"'\\\s]+(?:cover|poster|thumbnail)[^"'\\\s]*/)
  return { videoUrl: mp4 ? mp4[0] : null, posterUrl: cover ? cover[0] : null }
}

// Seedance async tasks report bad parameters (e.g. an unsupported model) in the
// *poll* response, not the submit response — so the old "retry next model on !ok"
// logic never fired and the render died silently. Poll once right after submitting
// and walk down this list until a model is actually accepted.
const VIDEO_MODELS = [
  { id: 'doubao-seedance-2-0-mini-260615', maxDuration: 15 },
  { id: 'doubao-seedance-2-0-fast-260128', maxDuration: 15 },
  { id: 'doubao-seedance-1-0-pro-fast-251015', maxDuration: 12 },
]

// One upstream query. Returns { status, videoUrl, posterUrl, error } where
// status is 'unknown' while the task is still queued or rendering.
async function pollTask(taskId) {
  const pollRes = await fetch(`${process.env.ACEDATA_BASE}/seedance/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.ACEDATA_KEY}`,
    },
    body: JSON.stringify({ id: taskId, action: 'retrieve' }),
    signal: AbortSignal.timeout(15000),
  })

  if (!pollRes.ok) return { httpStatus: pollRes.status, status: 'unknown' }

  const data = await pollRes.json()
  // While the task is queued/rendering the upstream sends back only the task record
  // (no `response` field yet) — that is NOT a terminal state, so report it as running.
  // When it finishes: { response: { success, error?, data: { status, video_url, last_frame_url } } }
  const inner = data.response?.data || data.data || {}
  const status = data.response
    ? String(inner.status || data.status || 'running').toLowerCase()
    : String(data.status || 'running').toLowerCase()
  const { videoUrl, posterUrl } = extractVideoUrls(inner)

  const upstreamError = data.response?.success === false ? data.response?.error || data.error : null
  const failed = Boolean(upstreamError) || ['failed', 'error', 'cancelled', 'expired'].includes(status)
  const message = upstreamError?.message || inner?.error?.message || data.message || `status ${status}`

  return { status, videoUrl, posterUrl, failed, message }
}

router.post('/video', async (req, res) => {
  const start = Date.now()
  const { prompt, duration = 5, resolution = '720p', ratio = '16:9' } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const limit = rateLimit('acedata', 10, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/video', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const url = `${process.env.ACEDATA_BASE}/seedance/videos`
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    }

    // callback_url switches Seedance to ASYNC mode: without it the upstream holds the
    // HTTP connection open for the whole 1-2 min render, which blows past Render's
    // request timeout and leaves the client spinning. The callback target is a
    // throwaway sink — we poll /video/status ourselves.
    const submitBody = (model, maxDur) => ({
      model,
      content: [{ type: 'text', text: prompt }],
      resolution,
      ratio,
      duration: Math.min(duration, maxDur),
      generate_audio: true,
      callback_url: process.env.ACEDATA_CALLBACK_URL || 'https://api.acedata.cloud/health',
    })

    let lastProblem = null
    for (const model of VIDEO_MODELS) {
      let fetchRes
      try {
        // NOTE: node-fetch v3 ignores the old `timeout` option — must use AbortSignal.
        fetchRes = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(submitBody(model.id, model.maxDuration)),
          signal: AbortSignal.timeout(20000),
        })
      } catch (err) {
        lastProblem = `${model.id}: ${err.name === 'TimeoutError' ? 'submit timed out' : err.message}`
        continue
      }

      if (!fetchRes.ok) {
        const text = await fetchRes.text().catch(() => '')
        lastProblem = `${model.id}: HTTP ${fetchRes.status} ${text.slice(0, 140)}`
        console.log('[VIDEO] submit rejected', lastProblem)
        continue
      }

      const data = await fetchRes.json()
      const taskId = data.id || data.task_id || data.data?.task_id || data.data?.id

      if (!taskId) {
        // Direct response (already rendered) — no polling needed.
        const { videoUrl, posterUrl } = extractVideoUrls(data)
        if (videoUrl) {
          log('POST', '/acedata/video', 200, Date.now() - start, '(direct)')
          return res.json({ queued: false, done: true, videoUrl, posterUrl })
        }
        lastProblem = `${model.id}: no task id in response`
        continue
      }

      // Catch parameters-only-upstream before handing the task to the browser.
      await new Promise((r) => setTimeout(r, 900))
      const check = await pollTask(taskId).catch(() => null)
      if (check?.failed) {
        lastProblem = `${model.id}: ${check.message}`
        console.log('[VIDEO] task failed immediately', lastProblem)
        // Only a parameter rejection is worth retrying; quota/auth errors are not.
        if (!/not supported|invalid|parameter|resolution|duration/i.test(check.message || '')) {
          return res.status(400).json({ error: `Video render rejected: ${check.message}` })
        }
        continue
      }

      console.log('[VIDEO] Task created:', taskId, 'with', model.id)
      log('POST', '/acedata/video', 200, Date.now() - start, `(queued ${model.id})`)
      return res.json({ queued: true, task_id: taskId })
    }

    throw new Error(`Video submit failed — ${lastProblem || 'no Seedance model accepted the request'}`)
  } catch (err) {
    error('video', err)
    res.status(502).json({ error: err.message })
  }
})

// GET /api/proxy/acedata/video/status/:taskId — single upstream poll, returns fast.
// AceData queries async tasks with POST /seedance/tasks { id, action: "retrieve" };
// a GET on /seedance/tasks/:id 404s, which is why every poll used to come back empty.
router.get('/video/status/:taskId', async (req, res) => {
  const start = Date.now()
  const taskId = String(req.params.taskId || '').replace(/[^A-Za-z0-9_-]/g, '')
  if (!taskId) return res.status(400).json({ error: 'taskId required' })

  try {
    const poll = await pollTask(taskId)

    if (poll.httpStatus === 404) {
      return res.json({ done: true, videoUrl: null, posterUrl: null, status: 'not_found', error: 'Render task not found — please try again.' })
    }
    if (poll.httpStatus) {
      // Transient upstream hiccups shouldn't kill the client poll loop
      return res.json({ done: false, status: `poll_${poll.httpStatus}` })
    }

    if (poll.videoUrl || poll.failed) {
      log('GET', '/acedata/video/status', 200, Date.now() - start, `(${poll.videoUrl ? 'done' : 'failed'})`)
      return res.json({
        done: true,
        videoUrl: poll.videoUrl,
        posterUrl: poll.posterUrl,
        status: poll.status,
        error: poll.failed && !poll.videoUrl ? `Render failed (${poll.status}): ${poll.message}` : null,
      })
    }

    log('GET', '/acedata/video/status', 200, Date.now() - start, `(${poll.status})`)
    res.json({ done: false, status: poll.status, videoUrl: null, posterUrl: null })
  } catch (err) {
    error('video/status', err)
    res.json({ done: false, status: 'poll_error' })
  }
})

// Simple test route
router.post('/test', async (req, res) => {
  console.log('[ACEDATA-TEST] Received:', JSON.stringify(req.body))
  res.json({ ok: true, message: 'AceData test works' })
})

export default router
