// SVG art generator for shareable verdict cards (fallback if Flux fails)
export function verdictArt(verdict, symbol, kind) {
  const palettes = {
    BUY: ['#5b93ff', '#34d399', '#0ea5e9'],
    HOLD: ['#5b93ff', '#a78bfa', '#64748b'],
    AVOID: ['#f87171', '#5b93ff', '#334155'],
  }
  const [a, b, c] = palettes[verdict] || palettes.HOLD
  const icon = verdict === 'BUY' ? '▲' : verdict === 'AVOID' ? '▼' : '◆'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#020208"/><stop offset="1" stop-color="#0b1024"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.35" r="0.75">
        <stop offset="0" stop-color="${a}" stop-opacity="0.45"/><stop offset="1" stop-color="${a}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#bg)"/>
    <rect width="800" height="450" fill="url(#glow)"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${60 + i * 50}" y="${280 + ((i * 37) % 90)}" width="18" height="${60 + ((i * 53) % 110)}" rx="4" fill="${i % 3 ? c : a}" opacity="0.${28 + ((i * 7) % 40)}"/>`).join('')}
    <circle cx="400" cy="180" r="86" fill="none" stroke="url(#ring)" stroke-width="3" opacity="0.9"/>
    <circle cx="400" cy="180" r="70" fill="#05070f" stroke="${b}" stroke-width="1" opacity="0.8"/>
    <text x="400" y="205" font-family="Arial" font-size="64" fill="${b}" text-anchor="middle" font-weight="bold">${icon}</text>
    <text x="400" y="330" font-family="Arial" font-size="42" fill="#eef2ff" text-anchor="middle" font-weight="bold" letter-spacing="6">${symbol}</text>
    <text x="400" y="372" font-family="Arial" font-size="24" fill="${b}" text-anchor="middle" letter-spacing="10">${verdict}${kind === 'video' ? ' · VERDICT STUDIO' : ''}</text>
    <text x="400" y="416" font-family="Arial" font-size="13" fill="#94a3b8" text-anchor="middle" letter-spacing="3">AI-GENERATED VISUAL · NOT FINANCIAL ADVICE</text>
  </svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const PALETTES = {
  BUY: ['#5b93ff', '#34d399', '#0ea5e9'],
  HOLD: ['#5b93ff', '#a78bfa', '#64748b'],
  AVOID: ['#f87171', '#5b93ff', '#334155'],
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Locally-rendered shareable card built from the LIVE verdict data for this token.
// Used whenever the remote image model is unavailable — never a dead screen.
export function verdictCardPng(script) {
  const s = script || {}
  const verdict = s.verdict || 'HOLD'
  const [a, b] = s.artDirection?.palette?.length >= 2 ? s.artDirection.palette : (PALETTES[verdict] || PALETTES.HOLD)
  const symbol = String(s.symbol || 'TOKEN')
  const name = String(s.name || '')
  const confidence = num(s.confidence) ?? 50
  const bull = num(s.bullScore) ?? 50
  const bear = num(s.bearScore) ?? 50
  const price = num(s.priceUsd)

  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 450
  const ctx = canvas.getContext('2d')

  const bg = ctx.createLinearGradient(0, 0, 800, 450)
  bg.addColorStop(0, '#05060f')
  bg.addColorStop(1, '#020208')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 800, 450)

  const glow = ctx.createRadialGradient(400, 160, 20, 400, 160, 420)
  glow.addColorStop(0, `${a}55`)
  glow.addColorStop(1, `${a}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 800, 450)

  // decorative candles
  for (let i = 0; i < 16; i++) {
    const h = 40 + ((i * 53) % 110)
    ctx.fillStyle = i % 3 ? `${a}30` : `${b}40`
    roundRect(ctx, 50 + i * 45, 300 - h / 2, 16, h, 4)
    ctx.fill()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#eef2ff'
  ctx.font = 'bold 64px Arial'
  ctx.fillText(symbol, 400, 150)
  if (name) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '20px Arial'
    ctx.fillText(name, 400, 182)
  }

  // verdict badge
  ctx.font = 'bold 30px Arial'
  const badgeW = ctx.measureText(verdict).width + 56
  ctx.fillStyle = `${b}22`
  ctx.strokeStyle = b
  ctx.lineWidth = 2
  roundRect(ctx, 400 - badgeW / 2, 205, badgeW, 52, 26)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = b
  ctx.fillText(verdict, 400, 241)

  if (price != null) {
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 24px Arial'
    ctx.fillText(`$${price.toLocaleString()}`, 400, 292)
  }

  // confidence bar
  ctx.fillStyle = '#94a3b8'
  ctx.font = '14px Arial'
  ctx.fillText(`CONFIDENCE ${confidence}/100`, 400, 330)
  ctx.fillStyle = '#1e293b'
  roundRect(ctx, 200, 340, 400, 10, 5)
  ctx.fill()
  ctx.fillStyle = a
  roundRect(ctx, 200, 340, Math.max(10, 400 * (confidence / 100)), 10, 5)
  ctx.fill()

  // bull / bear bars
  ctx.fillStyle = '#34d399'
  roundRect(ctx, 200, 366, Math.max(8, 190 * (bull / 100)), 8, 4)
  ctx.fill()
  ctx.fillStyle = '#f87171'
  roundRect(ctx, 600 - Math.max(8, 190 * (bear / 100)), 366, Math.max(8, 190 * (bear / 100)), 8, 4)
  ctx.fill()
  ctx.font = '12px Arial'
  ctx.fillStyle = '#34d399'
  ctx.textAlign = 'left'
  ctx.fillText(`BULL ${bull}`, 200, 392)
  ctx.fillStyle = '#f87171'
  ctx.textAlign = 'right'
  ctx.fillText(`BEAR ${bear}`, 600, 392)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748b'
  ctx.font = '13px Arial'
  ctx.fillText('VERDICT · AI INTELLIGENCE · NOT FINANCIAL ADVICE', 400, 428)

  return canvas.toDataURL('image/png')
}

// Locally-rendered 8s motion card (WebM) built from the LIVE verdict data.
export function verdictMotionWebm(script, onStatus) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.MediaRecorder) {
      reject(new Error('Video rendering is not supported in this browser'))
      return
    }

    const s = script || {}
    const verdict = s.verdict || 'HOLD'
    const [a, b] = s.artDirection?.palette?.length >= 2 ? s.artDirection.palette : (PALETTES[verdict] || PALETTES.HOLD)
    const symbol = String(s.symbol || 'TOKEN')
    const confidence = num(s.confidence) ?? 50
    const bull = num(s.bullScore) ?? 50
    const bear = num(s.bearScore) ?? 50

    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    const stream = canvas.captureStream(30)
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((m) => window.MediaRecorder.isTypeSupported(m)) || ''

    let recorder
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined)
    } catch {
      reject(new Error('Video rendering is not supported in this browser'))
      return
    }

    const DURATION = 8000
    const ease = (t) => 1 - (1 - t) ** 3

    const draw = (t) => {
      const bg = ctx.createLinearGradient(0, 0, 1280, 720)
      bg.addColorStop(0, '#05060f')
      bg.addColorStop(1, '#020208')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 1280, 720)
      const glow = ctx.createRadialGradient(640, 260, 40, 640, 260, 700)
      glow.addColorStop(0, `${a}44`)
      glow.addColorStop(1, `${a}00`)
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, 1280, 720)

      // Scene 1 — symbol reveal (0–2.5s)
      const p1 = ease(Math.min(1, t / 2500))
      ctx.textAlign = 'center'
      ctx.globalAlpha = p1
      ctx.fillStyle = '#eef2ff'
      ctx.font = `bold ${Math.round(96 * (0.8 + 0.2 * p1))}px Arial`
      ctx.fillText(symbol, 640, 300)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '28px Arial'
      ctx.fillText('VERDICT · AI INTELLIGENCE', 640, 350)
      ctx.globalAlpha = 1

      // Scene 2 — animated score bars (2.5–5.5s)
      if (t > 2500) {
        const p2 = ease(Math.min(1, (t - 2500) / 2500))
        ctx.fillStyle = '#1e293b'
        roundRect(ctx, 240, 430, 800, 18, 9)
        ctx.fill()
        ctx.fillStyle = a
        roundRect(ctx, 240, 430, Math.max(14, 800 * (confidence / 100) * p2), 18, 9)
        ctx.fill()
        ctx.fillStyle = '#94a3b8'
        ctx.font = '20px Arial'
        ctx.fillText(`CONFIDENCE ${confidence}/100`, 640, 480)

        ctx.fillStyle = '#34d399'
        roundRect(ctx, 240, 520, Math.max(10, 380 * (bull / 100) * p2), 14, 7)
        ctx.fill()
        ctx.fillStyle = '#f87171'
        const bw = Math.max(10, 380 * (bear / 100) * p2)
        roundRect(ctx, 1040 - bw, 520, bw, 14, 7)
        ctx.fill()
        ctx.font = '18px Arial'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#34d399'
        ctx.fillText(`BULL ${Math.round(bull * p2)}`, 240, 560)
        ctx.textAlign = 'right'
        ctx.fillStyle = '#f87171'
        ctx.fillText(`BEAR ${Math.round(bear * p2)}`, 1040, 560)
        ctx.textAlign = 'center'
      }

      // Scene 3 — verdict stamp (5.5–8s)
      if (t > 5500) {
        const p3 = ease(Math.min(1, (t - 5500) / 800))
        ctx.globalAlpha = p3
        ctx.font = `bold ${Math.round(120 * (1.4 - 0.4 * p3))}px Arial`
        ctx.fillStyle = b
        ctx.fillText(verdict, 640, 300)
        ctx.globalAlpha = 1
        ctx.fillStyle = '#64748b'
        ctx.font = '20px Arial'
        ctx.fillText('NOT FINANCIAL ADVICE · TRADE THE EVIDENCE', 640, 660)
      }
    }

    const chunks = []
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
    recorder.onerror = () => reject(new Error('Video rendering failed'))
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      resolve({
        poster: canvas.toDataURL('image/png'),
        videoUrl: URL.createObjectURL(blob),
        duration: Math.round(DURATION / 1000),
        resolution: '720p',
        format: 'webm',
      })
    }

    onStatus?.('Rendering motion card…')
    const start = performance.now()
    recorder.start(250)
    const tick = (now) => {
      const t = now - start
      draw(t)
      if (t < DURATION) requestAnimationFrame(tick)
      else setTimeout(() => recorder.stop(), 200)
    }
    requestAnimationFrame(tick)
  })
}
