import 'dotenv/config' // MUST be first: loads .env before route modules read process.env
import express from 'express'
import cors from 'cors'
import ryoRoutes from './routes/ryo.js'
import aceRoutes from './routes/acedata.js'
import synthesisRoutes from './routes/synthesis.js'
import { log } from './lib/logger.js'

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'] }))
app.use(express.json({ limit: '10mb' }))

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  console.log(`[REQ] ${req.method} ${req.path}`)
  res.on('finish', () => {
    console.log(`[RES] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
  })
  res.on('error', (err) => {
    console.error(`[RES ERROR] ${req.method} ${req.path}`, err)
  })
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Test POST route
app.post('/test-post', (req, res) => {
  console.log('[TEST-POST] Received:', JSON.stringify(req.body))
  res.json({ ok: true, body: req.body })
})

// API routes
app.use('/api/proxy/ryo', ryoRoutes)
app.use('/api/proxy/acedata', aceRoutes)
app.use('/api/proxy/synthesis', synthesisRoutes)

// Error handler
app.use((err, req, res, next) => {
  console.error('[FATAL ERROR]', err.message, err.stack)
  console.error('[FATAL REQ]', req.method, req.path, JSON.stringify(req.body))
  res.status(500).json({ error: 'Internal server error', detail: err.message })
})

// Catch unhandled rejections so the server doesn't crash
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err)
})

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err)
})

app.listen(PORT, () => {
  console.log(`[VERDICT] Server running on http://localhost:${PORT}`)
  console.log(`[VERDICT] RYO routes: /api/proxy/ryo/*`)
  console.log(`[VERDICT] AceData routes: /api/proxy/acedata/*`)
  console.log(`[VERDICT] Synthesis routes: /api/proxy/synthesis/*`)
})
