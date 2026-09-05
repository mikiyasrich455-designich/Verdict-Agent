// POST/GET /api/proxy/resolve — live token identity from a pasted CA, ticker, or name.
import { Router } from 'express'
import { rateLimit } from '../lib/rateLimit.js'
import { log, error } from '../lib/logger.js'
import { resolveToken } from '../lib/tokenResolver.js'

const router = Router()

async function handleResolve(method, getPath, q, req, res) {
  const start = Date.now()
  if (!q) return res.status(400).json({ error: 'q required' })

  const limit = rateLimit('resolve', 60, 60000)
  if (!limit.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded', retry_after: limit.retryAfter })
  }

  try {
    const data = await resolveToken(q)
    log(method, getPath, 200, Date.now() - start, `(${data.matchType})`)
    res.json(data)
  } catch (err) {
    const msg = String(err.message || '')
    const upstream = /DexScreener HTTP|aborted|network|socket|fetch failed|ETIMEDOUT|ECONNRESET/i.test(msg)
    error('resolve', err)
    res.status(upstream ? 502 : 404).json({
      error: upstream
        ? 'Market data service is momentarily unreachable — try again in a few seconds.'
        : msg,
    })
  }
}

router.post('/', (req, res) => {
  const q = String(req.body?.q || req.body?.query || req.body?.symbol || '').trim()
  handleResolve('POST', '/resolve', q, req, res)
})

// GET /api/proxy/resolve?q=dogwifhat
router.get('/', (req, res) => {
  const q = String(req.query?.q || '').trim()
  handleResolve('GET', '/resolve', q, req, res)
})

export default router
