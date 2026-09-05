import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import ryoRoutes from './routes/ryo.js'
import aceRoutes from './routes/acedata.js'
import synthesisRoutes from './routes/synthesis.js'
import { log } from './lib/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, '..', 'dist')

// Load server/.env explicitly (works regardless of cwd; real env vars on Render take priority)
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(cors({ origin: true }))
app.use(express.json({ limit: '10mb' }))

// Serve the built frontend (production: Render/hosting serves dist + API from one origin)
app.use(express.static(DIST))

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

// SPA fallback: any non-API GET serves the React app
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
    return res.sendFile(path.join(DIST, 'index.html'))
  }
  next()
})

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
