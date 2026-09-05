import { rateLimit } from '../../api/lib/rateLimit.js'
import { log, error } from '../../api/lib/logger.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const start = Date.now()

  // Lazy env read
  const ACEDATA_BASE = process.env.ACEDATA_BASE
  const ACEDATA_KEY = process.env.ACEDATA_KEY

  const { prompt, duration = 5, resolution = '720p', ratio = '16:9' } = req.body || {}
  if (!prompt) {
    return res.status(400).json({ error: 'prompt required' })
  }

  const limit = rateLimit('acedata', 10, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/video', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  // Helper: poll for task result (defined inside handler for Vercel compatibility)
  async function pollTask(taskId, maxAttempts = 40, pollInterval = 3000) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, pollInterval))
      const pollRes = await fetch(`${ACEDATA_BASE}/seedance/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${ACEDATA_KEY}` },
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
    const url = `${ACEDATA_BASE}/seedance/videos`
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACEDATA_KEY}`,
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
}
