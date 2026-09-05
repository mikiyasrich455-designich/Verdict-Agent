import { rateLimit } from '../../lib/rateLimit.js'
import { log, error } from '../../lib/logger.js'

export default async function handler(req, res) {
  // CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const start = Date.now()

  // Lazy env read
  const ACEDATA_BASE = process.env.ACEDATA_BASE
  const ACEDATA_KEY = process.env.ACEDATA_KEY

  const { messages, model = 'grok-4', maxTokens = 2000 } = req.body || {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  const limit = rateLimit('acedata', 100, 60000)
  if (!limit.allowed) {
    log('POST', '/acedata/chat', 429, Date.now() - start)
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const url = `${ACEDATA_BASE}/v1/chat/completions`
    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACEDATA_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    })

    if (!fetchRes.ok) {
      const text = await fetchRes.text()
      throw new Error(`AceData Chat failed: ${fetchRes.status} ${text}`)
    }

    const data = await fetchRes.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    log('POST', '/acedata/chat', 200, Date.now() - start)
    res.json({ content })
  } catch (err) {
    error('chat', err)
    res.status(500).json({ error: err.message })
  }
}
