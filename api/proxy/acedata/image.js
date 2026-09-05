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

  const { prompt, size = '1:1', model } = req.body || {}
  if (!prompt) {
    return res.status(400).json({ error: 'prompt required' })
  }

  const limit = rateLimit('acedata', 20, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/image', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    // Map size to pixel dimensions for Seedream
    const sizeMapping = {
      '1:1': '1024x1024',
      '16:9': '1280x720',
    }
    const seedreamSize = sizeMapping[size] || '1024x1024'

    // Try Seedream first (cheapest, direct response, no polling)
    try {
      const seedreamModel = model || 'doubao-seedream-5-0-pro-260628'
      const url = `${ACEDATA_BASE}/seedream/images`
      const fetchRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACEDATA_KEY}`,
        },
        body: JSON.stringify({
          model: seedreamModel,
          prompt,
          size: seedreamSize,
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
    } catch (seedreamErr) {
      console.log('[IMAGE] Seedream error, trying Flux fallback:', seedreamErr.message)
    }

    // Flux fallback — may be async with polling
    const fluxModel = model || 'flux-2-pro'
    const fluxUrl = `${ACEDATA_BASE}/flux/images`
    const fluxRes = await fetch(fluxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACEDATA_KEY}`,
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
      throw new Error(`Image generation failed: Seedream + Flux (${fluxRes.status}) ${fluxText}`)
    }

    const fluxData = await fluxRes.json()

    // Flux may be async — poll for result (max 60s)
    if (fluxData.task_id) {
      let attempts = 0
      const maxAttempts = 30
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000))
        const pollRes = await fetch(`${ACEDATA_BASE}/flux/tasks/${fluxData.task_id}`, {
          headers: { 'Authorization': `Bearer ${ACEDATA_KEY}` },
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
}
