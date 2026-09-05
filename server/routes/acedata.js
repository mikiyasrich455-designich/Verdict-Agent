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

// POST /api/proxy/acedata/video — Seedance video generation
// Cheapest: doubao-seedance-1-0-lite-t2v-250428 ($0.008/sec, 2-12s)
// Better: doubao-seedance-2-0-mini-260615 ($0.008/sec, 4-15s)
// Polling: GET /seedance/tasks/{task_id}
router.post('/video', async (req, res) => {
  const start = Date.now()
  const { prompt, duration = 5, resolution = '720p', ratio = '16:9' } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const limit = rateLimit('acedata', 10, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/video', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  // Helper: poll for task result
  async function pollTask(taskId, maxAttempts = 40, pollInterval = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, pollInterval))
      const pollRes = await fetch(`${process.env.ACEDATA_BASE}/seedance/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ACEDATA_KEY}` },
      })
      if (!pollRes.ok) continue

      const pollData = await pollRes.json()

      // Success: has video_url
      if (pollData.data?.video_url) {
        return pollData
      }

      // Error status
      if (pollData.error) {
        throw new Error(`Video generation error: ${pollData.error}`)
      }

      // Check if task is still processing
      if (pollData.status === 'completed' || pollData.status === 'succeeded') {
        return pollData
      }

      // Timeout after maxAttempts
      if (i === maxAttempts - 1) {
        throw new Error(`Video generation timed out after ${maxAttempts * pollInterval / 1000}s. Task status: ${pollData.status || 'unknown'}`)
      }
    }
    throw new Error('Video generation timed out')
  }

  try {
    const url = `${process.env.ACEDATA_BASE}/seedance/videos`
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    }

    // Try cheapest model first: 1.0 Lite T2V (2-12s)
    let fetchRes = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'doubao-seedance-1-0-lite-t2v-250428',
        content: [{ type: 'text', text: prompt }],
        resolution,
        ratio,
        duration: Math.min(duration, 12),
        generate_audio: true,
      }),
    })

    // If 1.0 Lite fails, try 2.0 Mini (4-15s)
    if (!fetchRes.ok) {
      const text = await fetchRes.text()
      console.log('[VIDEO] 1.0 Lite failed, trying 2.0 Mini:', fetchRes.status, text)

      fetchRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'doubao-seedance-2-0-mini-260615',
          content: [{ type: 'text', text: prompt }],
          resolution,
          ratio,
          duration: Math.min(duration, 15),
          generate_audio: true,
        }),
      })

      if (!fetchRes.ok) {
        const text2 = await fetchRes.text()
        throw new Error(`Video generation failed: both models failed (1.0 Lite: ${fetchRes.status}, 2.0 Mini: ${fetchRes.status}). ${text2}`)
      }
    }

    const data = await fetchRes.json()

    // Extract task ID — AceData may use 'id' or 'task_id'
    if (data.id || data.task_id) {
      const taskId = data.id || data.task_id
      console.log('[VIDEO] Task created:', taskId, 'Polling...')

      const result = await pollTask(taskId, 40, 3000) // max 2 min

      log('POST', '/acedata/video', 200, Date.now() - start)
      return res.json(result)
    }

    // Direct response (some models return immediately)
    log('POST', '/acedata/video', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('video', err)
    res.status(500).json({ error: err.message })
  }
})

// Simple test route
router.post('/test', async (req, res) => {
  console.log('[ACEDATA-TEST] Received:', JSON.stringify(req.body))
  res.json({ ok: true, message: 'AceData test works' })
})

export default router
