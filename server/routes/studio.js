// Studio media + chat/search routes.
// Image → qwen-image · Video → Grok Imagine 2×shots = 25s (async, falls back to Sora/Veo) · Voice → Qwen script + AceData TTS · Chat/Search → qwen-flash.
import { Router } from 'express'
import { rateLimit } from '../lib/rateLimit.js'
import { log, error } from '../lib/logger.js'
import { callLLM, callSearch, QWEN_MODELS, qwenImage, qwenTTS } from '../lib/llm.js'
import { aceTTS, aceGrokSubmit, aceGrokPoll, aceSoraSubmit, aceSoraPoll, aceVideoSubmit, aceVideoPoll, VIDEO_RESOLUTION, ACE_MODELS } from '../lib/acedata.js'

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
    const content = await callLLM(messages, QWEN_MODELS.chat, Math.min(Number(maxTokens) || 900, 1200), { timeoutMs: 30000 })
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

// POST /api/proxy/studio/video — submit one Grok Imagine shot (cheap; falls back to Sora then Veo)
// and return the task id immediately. The live grok model caps a clip at 15s, so the client submits
// two shots (15s + 10s) and plays them back-to-back as one 25s news package. Poll /video/status/:taskId.
router.post('/video', async (req, res) => {
  const start = Date.now()
  const { prompt, duration } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  const limit = rateLimit('studio', 10, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/video', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const grok = await aceGrokSubmit(prompt, duration)
    log('POST', '/studio/video', 200, Date.now() - start, `(queued · grok ${grok.duration}s)`)
    return res.json({ queued: true, task_id: `grok:${grok.taskId}`, duration: grok.duration, resolution: VIDEO_RESOLUTION, provider: 'grok', model: ACE_MODELS.grokVideo })
  } catch (grokErr) {
    error('video/grok', grokErr)
    try {
      const sora = await aceSoraSubmit(prompt, duration)
      log('POST', '/studio/video', 200, Date.now() - start, `(queued · sora ${sora.duration}s fallback)`)
      return res.json({ queued: true, task_id: `sora:${sora.taskId}`, duration: sora.duration, resolution: VIDEO_RESOLUTION, provider: 'sora', model: ACE_MODELS.video })
    } catch (soraErr) {
      error('video/sora', soraErr)
      try {
        const taskId = await aceVideoSubmit(prompt)
        log('POST', '/studio/video', 200, Date.now() - start, '(queued · veo fallback)')
        return res.json({ queued: true, task_id: `veo:${taskId}`, duration: 8, resolution: VIDEO_RESOLUTION, provider: 'veo', model: ACE_MODELS.fallbackVideo })
      } catch (veoErr) {
        error('video/veo', veoErr)
        res.status(502).json({ error: veoErr.message })
      }
    }
  }
})

// GET /api/proxy/studio/video/status/:taskId — single poll, returns fast
router.get('/video/status/:taskId', async (req, res) => {
  const start = Date.now()
  const taskId = String(req.params.taskId || '').replace(/[^A-Za-z0-9_:-]/g, '')
  if (!taskId) return res.status(400).json({ error: 'taskId required' })

  try {
    // Prefixed ids route to the right provider; legacy unprefixed ids go to Veo.
    const isGrok = taskId.startsWith('grok:')
    const isSora = taskId.startsWith('sora:')
    const provider = isGrok ? 'grok' : isSora ? 'sora' : 'veo'
    const rawId = taskId.includes(':') ? taskId.split(':').slice(1).join(':') : taskId
    const poll = isGrok ? await aceGrokPoll(rawId) : isSora ? await aceSoraPoll(rawId) : await aceVideoPoll(rawId)

    if (poll.httpStatus === 404) {
      return res.json({ done: true, videoUrl: null, posterUrl: null, status: 'not_found', error: 'Render task not found — please try again.' })
    }
    if (poll.httpStatus) {
      return res.json({ done: false, status: `poll_${poll.httpStatus}` })
    }
    if (poll.videoUrl || poll.failed) {
      log('GET', '/studio/video/status', 200, Date.now() - start, `(${poll.videoUrl ? 'done' : 'failed'} · ${provider})`)
      return res.json({
        done: true,
        videoUrl: poll.videoUrl,
        posterUrl: poll.posterUrl,
        status: poll.status,
        // Only Veo has a fixed length; grok/sora clips keep the duration the client asked for.
        duration: provider === 'veo' ? 8 : undefined,
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
  const { text, symbol = '', verdict = 'NEUTRAL', tone = 'neutral' } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })

  const limit = rateLimit('studio', 20, 60000)
  if (!limit.allowed) {
    log('POST', '/studio/voice', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const condensed = await callLLM([
      { role: 'system', content: 'You are a professional financial voiceover writer. Deliver ONLY the spoken text — no headings, no markdown, no stage directions, no labels.' },
      { role: 'user', content: `Write a detailed, professional ~130-150 word market briefing from the analysis below for a clean, calm, deep male analyst. Cover it all: open with the research stance, state the key numbers (price, 24h change, market cap, volume), then explain WHY the positives are strong (the growth case) and WHY the risks matter (the bear case), then give one balanced rating of growth-potential versus risk. Never instruct anyone to buy, hold, sell or avoid anything. End with a one-line disclaimer reminding listeners to do their own research.\n\nSYMBOL: ${symbol}\nSTANCE: ${verdict}\nTONE: ${tone}\n\nANALYSIS:\n${String(text).slice(0, 6000)}` },
    ], QWEN_MODELS.script, 600)

    let script = String(condensed || '').replace(/```/g, '').trim()
    if (!script) throw new Error('Voiceover script came back empty')

    const words = script.split(/\s+/).length
    const duration = Math.max(5, Math.round((words / 2.7) * 10) / 10)

    // TTS fallback chain: AceData (primary) → Qwen native TTS → script only (client speaks it).
    const failures = []
    try {
      const audio = await aceTTS(script)
      log('POST', '/studio/voice', 200, Date.now() - start, '(acedata tts)')
      return res.json({ script, audioUrl: audio.dataUrl, duration, format: 'mp3', symbol, verdict, tone, provider: 'acedata' })
    } catch (aceErr) {
      error('voice/acedata', aceErr)
      failures.push(aceErr.message)
    }

    try {
      const audio = await qwenTTS(script)
      log('POST', '/studio/voice', 200, Date.now() - start, '(qwen tts fallback)')
      return res.json({ script, audioUrl: audio.dataUrl, duration, format: 'mp3', symbol, verdict, tone, provider: 'qwen' })
    } catch (qwenErr) {
      error('voice/qwen', qwenErr)
      failures.push(qwenErr.message)
    }

    // Never dead-end the page — hand back the script so the browser can read it aloud.
    log('POST', '/studio/voice', 200, Date.now() - start, '(script only · tts unavailable)')
    res.json({ script, audioUrl: null, duration, format: 'mp3', symbol, verdict, tone, provider: 'browser', ttsError: failures[failures.length - 1] || 'TTS unavailable' })
  } catch (err) {
    error('voice', err)
    res.status(502).json({ error: err.message })
  }
})

export default router