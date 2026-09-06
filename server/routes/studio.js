// Studio media + chat/search routes — Qwen is the single provider.
// Image → qwen-image-2.0 · Video → wanx2.1-t2v-turbo (async) · Chat/Search → qwen-flash.
import { Router } from 'express'
import { rateLimit } from '../lib/rateLimit.js'
import { log, error } from '../lib/logger.js'
import { callLLM, callSearch, QWEN_MODELS, qwenImage } from '../lib/llm.js'
import { aceTTS, aceVideoSubmit, aceVideoPoll } from '../lib/acedata.js'

const router = Router()

function imageSize(size) {
  if (size === '16:9') return '1280x720'
  if (size === '1:1') return '1024x1024'
  if (typeof size === 'string' && /^\d+x\d+$/.test(size)) return size
  return '1024x1024'
}

// POST /api/proxy/studio/serp — live web search (Qwen grounded)
router.post('/serp', async (req, res) => {
  const start = Date.now()
  const { query, num = 10 } = req.body
  if (!query) return res.status(400).json({ error: 'query required' })

  const limit = rateLimit('studio', 100, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/serp', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const data = await callSearch(query, num)
    log('POST', '/studio/serp', 200, Date.now() - start)
    res.json(data)
  } catch (err) {
    error('serp', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/studio/chat — Qwen chat
router.post('/chat', async (req, res) => {
  const start = Date.now()
  const { messages, maxTokens = 2000 } = req.body
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' })

  const limit = rateLimit('studio', 100, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/chat', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const content = await callLLM(messages, undefined, maxTokens)
    log('POST', '/studio/chat', 200, Date.now() - start)
    res.json({ content })
  } catch (err) {
    error('chat', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/studio/image — Qwen image generation
router.post('/image', async (req, res) => {
  const start = Date.now()
  const { prompt, size = '1:1' } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const limit = rateLimit('studio', 20, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/image', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const data = await qwenImage(prompt, imageSize(size))
    log('POST', '/studio/image', 200, Date.now() - start, '(qwen)')
    res.json(data)
  } catch (err) {
    error('image', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/proxy/studio/video — submit AceData Veo render, return task id immediately
router.post('/video', async (req, res) => {
  const start = Date.now()
  const { prompt } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const limit = rateLimit('studio', 10, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/video', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const taskId = await aceVideoSubmit(prompt)
    log('POST', '/studio/video', 200, Date.now() - start, '(queued · veo)')
    res.json({ queued: true, task_id: taskId })
  } catch (err) {
    error('video', err)
    res.status(502).json({ error: err.message })
  }
})

// GET /api/proxy/studio/video/status/:taskId — single Qwen poll, returns fast
router.get('/video/status/:taskId', async (req, res) => {
  const start = Date.now()
  const taskId = String(req.params.taskId || '').replace(/[^A-Za-z0-9_:-]/g, '')
  if (!taskId) return res.status(400).json({ error: 'taskId required' })

  try {
    const poll = await aceVideoPoll(taskId)

    if (poll.httpStatus === 404) {
      return res.json({ done: true, videoUrl: null, posterUrl: null, status: 'not_found', error: 'Render task not found — please try again.' })
    }
    if (poll.httpStatus) {
      return res.json({ done: false, status: `poll_${poll.httpStatus}` })
    }
    if (poll.videoUrl || poll.failed) {
      log('GET', '/studio/video/status', 200, Date.now() - start, `(${poll.videoUrl ? 'done' : 'failed'})`)
      return res.json({
        done: true,
        videoUrl: poll.videoUrl,
        posterUrl: poll.posterUrl,
        status: poll.status,
        error: poll.failed && !poll.videoUrl ? `Render failed (${poll.status}): ${poll.message}` : null,
      })
    }
    log('GET', '/studio/video/status', 200, Date.now() - start, `(${poll.status})`)
    res.json({ done: false, status: poll.status, videoUrl: null, posterUrl: null })
  } catch (err) {
    error('video/status', err)
    res.json({ done: false, status: 'poll_error' })
  }
})

// POST /api/proxy/studio/voice — write a detailed financial briefing from the analysis,
// then synthesize it with AceData TTS. The prompt lives entirely behind the scenes; the
// client only ever gets the finished audio + downloadable script.
router.post('/voice', async (req, res) => {
  const start = Date.now()
  const { text, symbol = '', verdict = 'HOLD', tone = 'neutral' } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })

  const limit = rateLimit('studio', 20, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/voice', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const condensed = await callLLM([
      { role: 'system', content: 'You are a professional financial voiceover writer. Deliver ONLY the spoken text — no headings, no markdown, no stage directions, no labels.' },
      { role: 'user', content: `Write a detailed, professional ~130-150 word market briefing from the analysis below for a clean, calm, deep male analyst. Cover it all: open with the verdict, state the key numbers (price, 24h change, market cap, volume), then explain WHY it is bullish (the growth case) and WHY it is risky (the bear case), then give one balanced rating of growth-potential versus risk. No buy/sell instructions. End with a one-line disclaimer.\n\nSYMBOL: ${symbol}\nVERDICT: ${verdict}\nTONE: ${tone}\n\nANALYSIS:\n${String(text).slice(0, 6000)}` },
    ], QWEN_MODELS.script, 600)

    let script = String(condensed || '').replace(/```/g, '').trim()
    if (!script) throw new Error('Voiceover script came back empty')

    const audio = await aceTTS(script)
    const words = script.split(/\s+/).length
    const duration = Math.max(5, Math.round((words / 2.7) * 10) / 10)

    log('POST', '/studio/voice', 200, Date.now() - start, '(acedata tts)')
    res.json({ script, audioUrl: audio.dataUrl, duration, format: 'mp3', symbol, verdict, tone })
  } catch (err) {
    error('voice', err)
    res.status(502).json({ error: err.message })
  }
})

export default router