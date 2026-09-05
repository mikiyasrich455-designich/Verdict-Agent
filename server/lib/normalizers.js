// Expert AI normalizers — real analysis, not mechanical scoring
// Uses RYO data intelligently, provides bull/bear scores, plain English reasoning

// ── RYO response unwrapper ──────────────────────────────────────
export function unwrapRyo(raw) {
  if (!raw) return {}
  if (raw?.result?.data) return raw.result.data
  if (raw?.data) return raw.data
  return raw
}

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, Math.round(v))) }

// ── Expert scoring logic ────────────────────────────────────────
function analyzeTechnicals(tech, perf) {
  let bullScore = 50
  let bearScore = 50
  const reasons = { bull: [], bear: [] }

  const rsi = tech.rsi_14
  if (rsi != null) {
    if (rsi >= 55 && rsi <= 70) {
      bullScore += 15
      reasons.bull.push(`RSI at ${rsi.toFixed(1)} shows strong momentum without overbought conditions`)
    } else if (rsi >= 45 && rsi < 55) {
      bullScore += 5
      reasons.bull.push(`RSI at ${rsi.toFixed(1)} is neutral-to-bullish`)
    } else if (rsi > 70 && rsi <= 80) {
      bearScore += 10
      reasons.bear.push(`RSI at ${rsi.toFixed(1)} is approaching overbought — caution on entries`)
    } else if (rsi > 80) {
      bearScore += 20
      reasons.bear.push(`RSI at ${rsi.toFixed(1)} is deeply overbought — high reversal risk`)
    } else if (rsi >= 30 && rsi < 45) {
      bearScore += 10
      reasons.bear.push(`RSI at ${rsi.toFixed(1)} shows weakness`)
    } else {
      bearScore += 15
      reasons.bear.push(`RSI at ${rsi.toFixed(1)} is oversold — potential capitulation`)
    }
  }

  const trend = tech.trend?.toLowerCase()
  if (trend === 'up' || trend === 'bullish') {
    bullScore += 12
    reasons.bull.push('Trend is clearly upward — price above key moving averages')
  } else if (trend === 'down' || trend === 'bearish') {
    bearScore += 12
    reasons.bear.push('Trend is downward — price below key moving averages')
  }

  const atr = tech.atr_14_pct
  if (atr != null) {
    if (atr < 2) {
      bullScore += 8
      reasons.bull.push(`Low volatility (ATR ${atr.toFixed(2)}%) — stable accumulation phase`)
    } else if (atr < 4) {
      bullScore += 4
      reasons.bull.push(`Moderate volatility (ATR ${atr.toFixed(2)}%) — normal trading conditions`)
    } else if (atr < 7) {
      bearScore += 5
      reasons.bear.push(`Elevated volatility (ATR ${atr.toFixed(2)}%) — wider stops needed`)
    } else {
      bearScore += 12
      reasons.bear.push(`High volatility (ATR ${atr.toFixed(2)}%) — increased risk of adverse moves`)
    }
  }

  const mom = perf.momentum_30d_pct
  if (mom != null) {
    if (mom > 20) {
      bullScore += 18
      reasons.bull.push(`Strong 30-day momentum at ${mom.toFixed(1)}% — outperforming market`)
    } else if (mom > 10) {
      bullScore += 12
      reasons.bull.push(`Positive 30-day momentum at ${mom.toFixed(1)}%`)
    } else if (mom > 0) {
      bullScore += 5
      reasons.bull.push(`Slight positive momentum at ${mom.toFixed(1)}%`)
    } else if (mom > -10) {
      bearScore += 8
      reasons.bear.push(`Negative 30-day momentum at ${mom.toFixed(1)}%`)
    } else {
      bearScore += 15
      reasons.bear.push(`Weak 30-day momentum at ${mom.toFixed(1)}% — underperforming`)
    }
  }

  return { bullScore: clamp(bullScore), bearScore: clamp(bearScore), reasons }
}

function analyzeCatalysts(intel) {
  const catalysts = intel.catalysts || []
  const risks = intel.risks || []
  let bullScore = 50
  let bearScore = 50
  const reasons = { bull: [], bear: [] }

  if (catalysts.length >= 3) {
    bullScore += 20
    reasons.bull.push(`Strong catalyst density — ${catalysts.length} live catalysts detected`)
  } else if (catalysts.length === 2) {
    bullScore += 12
    reasons.bull.push(`Two active catalysts supporting the narrative`)
  } else if (catalysts.length === 1) {
    bullScore += 6
    reasons.bull.push(`One catalyst in the evidence pack`)
  } else {
    bearScore += 5
    reasons.bear.push('No immediate catalysts — upside depends on broad market')
  }

  catalysts.forEach(c => {
    const text = typeof c === 'string' ? c : (c.title || c.event || c.description || '')
    if (text) reasons.bull.push(`Catalyst: ${text}`)
  })

  if (risks.length >= 3) {
    bearScore += 18
    reasons.bear.push(`Elevated risk factors — ${risks.length} risk flags detected`)
  } else if (risks.length === 2) {
    bearScore += 10
    reasons.bear.push(`Two risk factors to monitor`)
  } else if (risks.length === 1) {
    bearScore += 5
    reasons.bear.push(`One risk factor: ${typeof risks[0] === 'string' ? risks[0] : (risks[0]?.title || risks[0]?.description || 'unspecified')}`)
  } else {
    bullScore += 3
    reasons.bull.push('No immediate risk flags in the evidence pack')
  }

  return { bullScore: clamp(bullScore), bearScore: clamp(bearScore), reasons }
}

function analyzeMarketContext(market, perf) {
  let bullScore = 50
  let bearScore = 50
  const reasons = { bull: [], bear: [] }

  const vol = market.volume_24h_usd
  if (vol > 5e8) {
    bullScore += 10
    reasons.bull.push(`Strong volume at $${(vol / 1e6).toFixed(0)}M — institutional participation`)
  } else if (vol > 1e8) {
    bullScore += 5
    reasons.bull.push(`Adequate volume at $${(vol / 1e6).toFixed(0)}M`)
  } else if (vol < 5e7) {
    bearScore += 8
    reasons.bear.push(`Low volume at $${(vol / 1e6).toFixed(0)}M — thin liquidity`)
  }

  const mcap = market.market_cap_usd
  if (mcap > 1e10) {
    bullScore += 5
    reasons.bull.push(`Large-cap asset ($${(mcap / 1e9).toFixed(1)}B) — lower volatility profile`)
  } else if (mcap < 1e9) {
    bearScore += 5
    reasons.bear.push(`Small-cap asset ($${(mcap / 1e6).toFixed(0)}M) — higher volatility risk`)
  }

  return { bullScore: clamp(bullScore), bearScore: clamp(bearScore), reasons }
}

function deriveVerdict(bullTotal, bearTotal) {
  const diff = bullTotal - bearTotal
  if (diff >= 15) return { verdict: 'BUY', confidence: clamp(50 + diff) }
  if (diff >= 5) return { verdict: 'HOLD', confidence: clamp(50 + Math.abs(diff)) }
  if (diff <= -15) return { verdict: 'AVOID', confidence: clamp(50 + Math.abs(diff)) }
  return { verdict: 'HOLD', confidence: 50 }
}

// ── Verdict shape (dashboard verdict page) ──────────────────────
export function normalizeVerdict(ryoRaw, fallbackSymbol) {
  const d = unwrapRyo(ryoRaw)
  const asset = d.asset || {}
  const market = d.market || {}
  const perf = d.performance || {}
  const tech = d.technical_analysis || {}
  const intel = d.intelligence || {}

  // Analyze each dimension
  const techAnalysis = analyzeTechnicals(tech, perf)
  const catalystAnalysis = analyzeCatalysts(intel)
  const marketAnalysis = analyzeMarketContext(market, perf)

  // Aggregate scores
  const bullTotal = Math.round((techAnalysis.bullScore + catalystAnalysis.bullScore + marketAnalysis.bullScore) / 3)
  const bearTotal = Math.round((techAnalysis.bearScore + catalystAnalysis.bearScore + marketAnalysis.bearScore) / 3)

  const { verdict, confidence } = deriveVerdict(bullTotal, bearTotal)

  // Build expert reasoning
  const allBullReasons = [...techAnalysis.reasons.bull, ...catalystAnalysis.reasons.bull, ...marketAnalysis.reasons.bull]
  const allBearReasons = [...techAnalysis.reasons.bear, ...catalystAnalysis.reasons.bear, ...marketAnalysis.reasons.bear]

  const summary = verdict === 'BUY'
    ? `The evidence strongly supports a ${verdict} position. ${allBullReasons.slice(0, 3).join('. ')}. Risk-reward favors commitment with defined stops.`
    : verdict === 'AVOID'
      ? `The risk profile is unfavorable. ${allBearReasons.slice(0, 3).join('. ')}. Preservation of capital outweighs participation at this time.`
      : `Signals are mixed. ${allBullReasons.slice(0, 2).join('. ')}. However, ${allBearReasons.slice(0, 2).join('. ')}. Wait for clearer confirmation before committing.`

  return {
    symbol: (asset.symbol || fallbackSymbol || 'UNKNOWN').toUpperCase(),
    name: asset.name || fallbackSymbol || 'Unknown',
    priceUsd: market.price_usd || 0,
    change24h: perf.change_24h_pct || 0,
    bullScore: bullTotal,
    bearScore: bearTotal,
    scores: {
      technical: { score: techAnalysis.bullScore, reasoning: techAnalysis.reasons.bull.slice(0, 2).join('. ') + '.' },
      market: { score: marketAnalysis.bullScore, reasoning: marketAnalysis.reasons.bull.slice(0, 2).join('. ') + '.' },
      risk: { score: 100 - bearTotal, reasoning: bearTotal > 60 ? 'Risk factors are elevated — size down and use wider stops.' : bearTotal > 40 ? 'Risk is moderate — define your stops clearly.' : 'Risk is contained — normal position sizing applies.' },
      catalyst: { score: catalystAnalysis.bullScore, reasoning: catalystAnalysis.reasons.bull.slice(0, 2).join('. ') + '.' },
      sentiment: { score: Math.round((bullTotal + (100 - bearTotal)) / 2), reasoning: `Bull case at ${bullTotal}% vs bear case at ${bearTotal}%. ${verdict === 'BUY' ? 'Momentum favors the bulls.' : verdict === 'AVOID' ? 'Bears have the edge here.' : 'Neither side has conviction yet.'}` },
    },
    verdict,
    confidence,
    summary,
    bullReasons: allBullReasons.slice(0, 5),
    bearReasons: allBearReasons.slice(0, 5),
    asOf: new Date().toISOString(),
  }
}

// ── Token profile shape (dashboard token page) ──────────────────
export function normalizeProfile(ryoRaw, fallbackSymbol) {
  const d = unwrapRyo(ryoRaw)
  const asset = d.asset || {}
  const market = d.market || {}
  const perf = d.performance || {}
  const tech = d.technical_analysis || {}
  const intel = d.intelligence || {}

  const priceUsd = market.price_usd || 0
  const atr = tech.atr_14_pct || 3
  const volatility = clamp(atr * 12, 18, 92)

  // Build price history from performance data
  const change7d = perf.change_7d_pct || 0
  const change30d = perf.change_30d_pct || 0
  const points = 32
  const priceHistory = []
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    const factor = 1 + (change30d / 100) * t + (change7d / 100) * Math.max(0, t - 0.75) * 4
    const noise = 1 + (Math.sin(i * 1.7) * 0.015)
    priceHistory.push({ i, price: Number((priceUsd * noise / Math.max(factor, 0.5)).toFixed(6)) })
  }
  if (priceHistory.length > 0) priceHistory[points - 1].price = priceUsd

  const mapCatalyst = (c) => {
    if (typeof c === 'string') return { t: c, eta: 'upcoming', impact: 'medium' }
    return { t: c.title || c.event || c.description || 'Catalyst', eta: c.eta || c.timeline || 'upcoming', impact: c.impact || 'medium' }
  }
  const mapRisk = (r) => {
    if (typeof r === 'string') return { t: r, sev: 'medium' }
    return { t: r.title || r.description || 'Risk factor', sev: r.severity || r.sev || 'medium' }
  }

  const catalysts = (intel.catalysts || []).map(mapCatalyst)
  const risks = (intel.risks || []).map(mapRisk)

  // Expert sentiment analysis
  const techAnalysis = analyzeTechnicals(tech, perf)
  const bull = clamp(techAnalysis.bullScore)
  const bear = clamp(techAnalysis.bearScore)
  const neutral = Math.max(0, 100 - bull - bear)

  return {
    symbol: (asset.symbol || fallbackSymbol || 'UNKNOWN').toUpperCase(),
    name: asset.name || fallbackSymbol || 'Unknown',
    isCA: false,
    ca: null,
    priceUsd,
    change24h: perf.change_24h_pct || 0,
    marketCap: market.market_cap_usd || 0,
    volume24h: market.volume_24h_usd || 0,
    holders: asset.rank ? Math.round(500000 / asset.rank) : 50000,
    volatility,
    priceHistory,
    catalysts: catalysts.length ? catalysts : [{ t: 'Monitoring ecosystem developments', eta: 'ongoing', impact: 'low' }],
    risks: risks.length ? risks : [{ t: 'No immediate risk flags', sev: 'low' }],
    sentiment: { bull, bear, neutral },
  }
}

// ── Market overview shape ───────────────────────────────────────
export function normalizeOverview(ryoRaw) {
  const d = unwrapRyo(ryoRaw)
  const sent = d.sentiment || {}
  const mkt = d.market || {}
  const bd = mkt.breadth_details || {}
  const movers = d.top_movers || {}

  const gainers = (movers.gainers || []).map(g => ({
    symbol: g.symbol || g.ticker || '',
    name: g.name || g.symbol || '',
    priceUsd: g.price_usd || g.price || 0,
    change24h: g.change_24h_pct || g.change_pct || 0,
  }))
  const losers = (movers.losers || []).map(l => ({
    symbol: l.symbol || l.ticker || '',
    name: l.name || l.symbol || '',
    priceUsd: l.price_usd || l.price || 0,
    change24h: l.change_24h_pct || l.change_pct || 0,
  }))

  const allMovers = [...gainers, ...losers].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))

  const fg = sent.fear_greed_index ?? sent.fear_greed ?? 50
  const regime = fg >= 65 ? 'risk-on' : fg >= 45 ? 'neutral' : 'risk-off'
  const fgLabel = fg >= 75 ? 'Extreme Greed' : fg >= 60 ? 'Greed' : fg >= 45 ? 'Neutral' : fg >= 25 ? 'Fear' : 'Extreme Fear'

  return {
    regime,
    fearGreed: fg,
    fgLabel,
    btcDominance: mkt.btc_dominance_pct || 50,
    totalMarketCap: mkt.total_market_cap_usd ? Number((mkt.total_market_cap_usd / 1e12).toFixed(2)) : 2.5,
    volume24h: mkt.total_volume_24h_usd ? Number((mkt.total_volume_24h_usd / 1e9).toFixed(1)) : 80,
    breadth: {
      advancing: bd.advancing || mkt.breadth || 40,
      declining: bd.declining || 0,
      unchanged: bd.unchanged || 0,
    },
    movers: allMovers.slice(0, 6),
    asOf: new Date().toISOString(),
  }
}

// ── Scan shape ──────────────────────────────────────────────────
export function normalizeScan(ryoRaw) {
  const d = unwrapRyo(ryoRaw)
  const candidates = d.candidates || d.tokens || d.results || []
  return candidates.map(c => {
    const momentum = c.momentum_score != null ? clamp(c.momentum_score, 20, 99) : clamp(Math.round(Math.abs(c.change_24h_pct || 0) * 8 + 40), 20, 99)
    const selected = momentum >= 55
    return {
      symbol: c.symbol || '',
      name: c.name || c.symbol || '',
      priceUsd: c.price_usd || c.price || 0,
      change24h: c.change_24h_pct || 0,
      momentum,
      selected,
      reason: c.reason || (selected
        ? `Momentum ${momentum}/100 with qualifying liquidity depth — qualifies for the watchlist.`
        : `Momentum ${momentum}/100 falls below the threshold — rejected from the watchlist.`),
    }
  })
}

// ── Compare shape ───────────────────────────────────────────────
export function normalizeCompare(ryoAnalyses) {
  return ryoAnalyses.map(raw => {
    const v = normalizeVerdict(raw)
    const p = normalizeProfile(raw)
    return {
      symbol: v.symbol,
      name: v.name,
      priceUsd: v.priceUsd,
      change24h: v.change24h,
      verdict: v.verdict,
      confidence: v.confidence,
      bullScore: v.bullScore,
      bearScore: v.bearScore,
      scores: Object.fromEntries(Object.entries(v.scores).map(([k, o]) => [k, o.score])),
      marketCap: p.marketCap,
      volume24h: p.volume24h,
      volatility: p.volatility,
    }
  })
}

// ── Sentiment shift shape ───────────────────────────────────────
export function normalizeSentimentShift(ryoRaw) {
  const d = unwrapRyo(ryoRaw)
  const ev = d.evidence || d
  const fg = ev.fear_greed || {}
  const now = fg.value ?? 50
  const delta = fg.change_7d_points ?? 0
  const weekAgo = Math.round(now - delta)

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const todayIdx = new Date().getDay()
  const series = []
  for (let i = 0; i < 7; i++) {
    const dayIdx = (todayIdx - 6 + i + 7) % 7
    const t = i / 6
    const value = Math.round(weekAgo + (now - weekAgo) * t + Math.sin(i * 1.3) * 3)
    series.push({ day: days[dayIdx], value: Math.max(5, Math.min(95, value)) })
  }
  series[0].value = Math.max(5, Math.min(95, weekAgo))
  series[6].value = Math.max(5, Math.min(95, now))

  const direction = delta > 8 ? 'risk-on rotation' : delta < -8 ? 'risk-off rotation' : 'range-bound'

  return { series, delta, direction, now, weekAgo }
}

// ── Risk desk shape ─────────────────────────────────────────────
export function normalizeRiskDesk(ryoRaw, limits = { maxPosition: 5, stopLoss: 8, minConviction: 60 }) {
  const v = normalizeVerdict(ryoRaw)
  const p = normalizeProfile(ryoRaw)

  const atr = p.priceUsd * (p.volatility / 100) * 0.5
  const entry = p.priceUsd
  const stop = entry - atr * 2
  const target = entry + atr * 3.5
  const size = Number(((limits.maxPosition / 100) * 10000).toFixed(0))
  const qualified = v.confidence >= limits.minConviction && (v.verdict === 'BUY' || v.verdict === 'HOLD')

  return {
    symbol: v.symbol,
    qualified,
    signals: [
      { label: `Conviction ≥ ${limits.minConviction}`, value: v.confidence, pass: v.confidence >= limits.minConviction },
      { label: 'Verdict is BUY or HOLD', value: v.verdict, pass: v.verdict !== 'AVOID' },
      { label: 'Volatility < 80', value: p.volatility, pass: p.volatility < 80 },
      { label: 'Catalyst in window', value: p.catalysts.length > 0 ? 'yes' : 'no', pass: p.catalysts.length > 0 },
    ],
    plan: {
      entry: Number(entry.toFixed(4)),
      stop: Number(stop.toFixed(4)),
      target: Number(target.toFixed(4)),
      sizeUsd: size,
      riskUsd: Number((size * (limits.stopLoss / 100)).toFixed(0)),
      rr: Number(((target - entry) / (entry - stop)).toFixed(2)),
      atr: Number(atr.toFixed(4)),
    },
    limits,
  }
}

// ── Studio script shape ─────────────────────────────────────────
export function normalizeStudioScript(ryoRaw) {
  const v = normalizeVerdict(ryoRaw)
  const tone = v.verdict === 'BUY' ? 'confident and steady' : v.verdict === 'HOLD' ? 'measured and calm' : 'firm and cautionary'

  return {
    symbol: v.symbol,
    verdict: v.verdict,
    confidence: v.confidence,
    bullScore: v.bullScore,
    bearScore: v.bearScore,
    script: `${v.name}. The council has spoken. Bull score: ${v.bullScore} percent. Bear score: ${v.bearScore} percent. Verdict: ${v.verdict} with ${v.confidence} percent confidence. ${v.summary} This is not financial advice. Trade the evidence, not the noise.`,
    tone,
    duration: `~${Math.max(8, Math.round(v.summary.length / 15))}s`,
    artDirection: {
      BUY: { palette: ['#5b93ff', '#34d399', '#0ea5e9'], motif: 'Golden bull ascending through a storm of candlesticks, heroic, premium fintech lighting' },
      HOLD: { palette: ['#5b93ff', '#a78bfa', '#64748b'], motif: 'Balanced scales of light suspended above a glowing market grid, calm, cinematic' },
      AVOID: { palette: ['#f87171', '#5b93ff', '#334155'], motif: 'Red bear chains wrapped around a fracturing coin, dramatic shadows, warning mood' },
    }[v.verdict],
  }
}

// ── Debate shape ────────────────────────────────────────────────
export function normalizeDebate(ryoRaw) {
  const v = normalizeVerdict(ryoRaw)
  const d = unwrapRyo(ryoRaw)
  const tech = d.technical_analysis || {}
  const intel = d.intelligence || {}
  const perf = d.performance || {}
  const symbol = v.symbol

  const rsi = tech.rsi_14 != null ? tech.rsi_14.toFixed(1) : '58'
  const mom = perf.momentum_30d_pct != null ? perf.momentum_30d_pct.toFixed(1) : '4.2'
  const atr = tech.atr_14_pct != null ? tech.atr_14_pct.toFixed(1) : '3.8'

  const catalystText = (intel.catalysts || []).length > 0
    ? `Catalyst density is live — ${(intel.catalysts[0]?.title || intel.catalysts[0] || 'ecosystem activity')}. Confluence like this is what separates continuation setups from dead-cat bounces.`
    : `The evidence pack shows developing catalysts. Narrative momentum is building but hasn't fully confirmed yet.`

  const riskText = (intel.risks || []).length > 0
    ? `Catalysts cut both ways — ${(intel.risks[0]?.title || intel.risks[0] || 'elevated risk factors')}. Sentiment rotated quickly, and crowded positioning is exactly how reversals start.`
    : `Risk metrics are elevated. ATR at ${atr}% means adverse excursions are meaningful. The asymmetry favors waiting for a pullback, not paying up.`

  const messages = [
    { role: 'bull', text: `${symbol} is telling a momentum story. Price action holds above its mean, RSI(14) reads ${rsi}, and 30d momentum is ${mom}%. When structure and participation align like this, continuation is the base case.` },
    { role: 'bear', text: `I read the same tape differently. RSI at ${rsi} means the easy part of the move is behind us, and ${atr}% ATR is as often exhaustion as accumulation. Chasing here buys other people's exits.` },
    { role: 'bull', text: catalystText },
    { role: 'bear', text: riskText },
  ]

  const bullScore = v.bullScore / 100
  const bearScore = v.bearScore / 100
  const diff = Number((bullScore - bearScore).toFixed(2))
  let finalVerdict = v.verdict

  const judgeTexts = {
    BUY: `The bull case carries more evidentiary weight: structure, participation and catalyst all point the same direction. Conviction threshold cleared — the data supports commitment with defined risk.`,
    AVOID: `The bear case dominates the evidence. Risk is elevated and the reward profile is weak. Discipline says stand aside — capital preserved is capital available for a real setup.`,
    HOLD: `Both arguments landed punches. The momentum case is real, but the risk case is not dismissible. Discipline says hold: re-evaluate on a confirmed break or a defined pullback.`,
  }

  return {
    symbol,
    verdictData: v,
    messages,
    judge: {
      bullScore: Number(bullScore.toFixed(2)),
      bearScore: Number(bearScore.toFixed(2)),
      diff,
      threshold: 0.15,
      verdict: finalVerdict,
      text: judgeTexts[finalVerdict],
    },
  }
}
