// Memecoin structural risk engine.
//
// These are the checks that actually decide whether a small token survives: how deep the
// pool is, how old the pair is, whether the tape is one-sided, how many distinct wallets
// are participating, and how violent the price movement is. Every number comes from the
// live resolver — nothing here is guessed, and a metric with no data says "unavailable"
// rather than scoring a fake pass.
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

export function money(v) {
  const x = Number(v) || 0
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`
  if (x >= 1e6) return `$${(x / 1e6).toFixed(2)}M`
  if (x >= 1e3) return `$${(x / 1e3).toFixed(1)}K`
  if (x > 0) return `$${x.toFixed(2)}`
  return '$0'
}

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)))

// ── Individual metric readers ────────────────────────────────────────────────
function liquidityMetric(liq, mcap) {
  if (!liq || liq <= 0) {
    return { id: 'liquidity', label: 'Liquidity depth', value: 'unavailable', severity: 'high', side: 'risk', score: 78, text: 'No pool depth reading on this feed — exits cannot be sized safely, so this is treated as elevated risk rather than assumed fine.' }
  }
  const ratio = mcap > 0 ? liq / mcap : null
  let severity, side, score, text
  if (liq < 25000) {
    severity = 'critical'; side = 'risk'; score = 95
    text = `Only ${money(liq)} of pool depth. A single mid-sized exit can move price violently, and slippage on the way out is severe.`
  } else if (liq < 100000) {
    severity = 'critical'; side = 'risk'; score = 88
    text = `Thin depth at ${money(liq)}. This is micro-cap liquidity — orders of a few thousand dollars already distort price.`
  } else if (liq < 500000) {
    severity = 'high'; side = 'risk'; score = 72
    text = `Light depth at ${money(liq)}. Workable for small size, but large exits will slip.`
  } else if (liq < 2000000) {
    severity = 'medium'; side = 'neutral'; score = 52
    text = `Moderate depth at ${money(liq)}. Enough for retail-sized flow, still fragile under a coordinated sell.`
  } else {
    severity = 'low'; side = 'positive'; score = 26
    text = `Solid depth at ${money(liq)} — the pool can absorb normal flow without dislocating price.`
  }
  if (ratio != null && ratio < 0.02 && liq < 5000000) {
    score = clamp(score + 12)
    text += ` Liquidity backs only ${(ratio * 100).toFixed(2)}% of the ${money(mcap)} cap, so the valuation is barely supported by the pool.`
  } else if (ratio != null && ratio > 0.15) {
    score = clamp(score - 8)
    text += ` Liquidity covers ${(ratio * 100).toFixed(1)}% of market cap — unusually well backed.`
  }
  return { id: 'liquidity', label: 'Liquidity depth', value: money(liq), severity, side, score, text }
}

function poolAgeMetric(ageDays) {
  const a = n(ageDays)
  if (a == null) {
    return { id: 'poolAge', label: 'Token / pair age', value: 'unavailable', severity: 'medium', side: 'risk', score: 66, text: 'Pair creation date is not on this feed. Age is the single best rug filter for new tokens, so an unknown age is treated as a risk, not a pass.' }
  }
  if (a < 1) {
    return { id: 'poolAge', label: 'Token / pair age', value: `${Math.round(a * 24)}h old`, severity: 'critical', side: 'risk', score: 96, text: `The pool is only ${Math.round(a * 24)} hours old. Brand-new pairs carry maximum rug, honeypot and liquidity-pull risk, and there is no price history to read structure from.` }
  }
  if (a < 7) {
    return { id: 'poolAge', label: 'Token / pair age', value: `${a.toFixed(1)} days`, severity: 'critical', side: 'risk', score: 88, text: `Pool is ${a.toFixed(1)} days old. Still inside the window where most new tokens fail; liquidity can be pulled with almost no history to warn you.` }
  }
  if (a < 30) {
    return { id: 'poolAge', label: 'Token / pair age', value: `${Math.round(a)} days`, severity: 'high', side: 'risk', score: 72, text: `Pool is ${Math.round(a)} days old — young. Enough tape to read, not enough to prove the team sticks around.` }
  }
  if (a < 180) {
    return { id: 'poolAge', label: 'Token / pair age', value: `${Math.round(a)} days`, severity: 'medium', side: 'neutral', score: 50, text: `Pool is about ${Math.round(a / 30)} months old. Past the initial failure window, still young for a durable track record.` }
  }
  const yrs = a / 365
  return { id: 'poolAge', label: 'Token / pair age', value: `${yrs.toFixed(1)}y`, severity: 'low', side: 'positive', score: 24, text: `Pool has survived ${yrs.toFixed(1)} years. Longevity is real evidence — most tokens never reach this age.` }
}

function tapeMetric(buys, sells, uBuyers, uSellers) {
  const b = n(buys), s = n(sells)
  const ub = n(uBuyers), us = n(uSellers)
  if ((b == null || b === 0) && (s == null || s === 0)) {
    return { id: 'tape', label: '24h buy/sell tape', value: 'unavailable', severity: 'medium', side: 'risk', score: 62, text: 'No transaction tape on this feed, so order flow cannot be verified. Absence of visible flow is itself a warning for a small token.' }
  }
  const total = (b || 0) + (s || 0)
  const buyShare = total > 0 ? (b || 0) / total : 0.5
  const wallets = (ub || 0) + (us || 0)
  let severity, side, score, text

  if (total < 20) {
    severity = 'high'; side = 'risk'; score = 80
    text = `Only ${total} transactions in 24h. The token is effectively dead on this pool — no real two-way market.`
  } else if (buyShare < 0.35) {
    severity = 'high'; side = 'risk'; score = 78
    text = `Tape is distribution-heavy: ${b || 0} buys vs ${s || 0} sells (${(buyShare * 100).toFixed(0)}% buy-side). Sellers are consistently finding exits.`
  } else if (buyShare > 0.65) {
    severity = 'low'; side = 'positive'; score = 32
    text = `Tape is demand-heavy: ${b || 0} buys vs ${s || 0} sells (${(buyShare * 100).toFixed(0)}% buy-side). Buyers are absorbing supply.`
  } else {
    severity = 'medium'; side = 'neutral'; score = 50
    text = `Balanced tape: ${b || 0} buys vs ${s || 0} sells (${(buyShare * 100).toFixed(0)}% buy-side). No side is in control.`
  }

  if (wallets > 0 && wallets < 30) {
    score = clamp(score + 14); severity = severity === 'low' ? 'medium' : 'high'
    text += ` Only ${wallets} distinct wallets traded — participation is extremely narrow, so a couple of addresses can move the whole chart.`
  } else if (ub != null && us != null && ub > 0 && us / ub > 2.5) {
    score = clamp(score + 10)
    text += ` Selling wallets (${us}) outnumber buying wallets (${ub}) by more than 2.5×.`
  } else if (wallets >= 500) {
    score = clamp(score - 8)
    text += ` ${wallets} distinct wallets participated — a genuinely broad holder base for this size.`
  }
  return { id: 'tape', label: '24h buy/sell tape', value: `${b || 0}B / ${s || 0}S`, severity, side, score, text }
}

function walletMetric(uBuyers, uSellers) {
  const ub = n(uBuyers), us = n(uSellers)
  const total = (ub || 0) + (us || 0)
  if (!total) {
    return { id: 'wallets', label: 'Wallet participation', value: 'unavailable', severity: 'medium', side: 'risk', score: 64, text: 'Unique-wallet counts are not published on this feed. Without them, concentration risk cannot be ruled out.' }
  }
  let severity, side, score, text
  if (total < 15) {
    severity = 'critical'; side = 'risk'; score = 92
    text = `Just ${total} unique wallets traded in 24h. This is not a market — it is a handful of addresses, and any one of them leaving breaks price.`
  } else if (total < 60) {
    severity = 'high'; side = 'risk'; score = 76
    text = `${total} unique wallets in 24h. Very thin participation; concentration and single-wallet manipulation are live risks.`
  } else if (total < 250) {
    severity = 'medium'; side = 'neutral'; score = 54
    text = `${total} unique wallets in 24h — small but real two-sided participation.`
  } else if (total < 2000) {
    severity = 'low'; side = 'positive'; score = 34
    text = `${total} unique wallets in 24h. A healthy crowd for a token this size, which makes coordinated manipulation harder.`
  } else {
    severity = 'low'; side = 'positive'; score = 22
    text = `${total.toLocaleString()} unique wallets in 24h — broad, distributed participation.`
  }
  return { id: 'wallets', label: 'Wallet participation', value: `${total.toLocaleString()} wallets`, severity, side, score, text }
}

function movementMetric(live) {
  const h1 = n(live.change1h), h6 = n(live.change6h), h24 = n(live.change24h)
  const d7 = n(live.change7d), d32 = n(live.change32h)
  const moves = [h1, h6, h24, d7, d32].filter((v) => v != null)
  if (!moves.length) {
    return { id: 'movement', label: 'Price movement / volatility', value: 'unavailable', severity: 'medium', side: 'risk', score: 60, text: 'No price-change history on this feed, so volatility cannot be measured. Unmeasured volatility in a small token is assumed adverse.' }
  }
  const swing = Math.max(...moves.map(Math.abs))
  const c24 = h24 || 0
  let severity, side, score, text
  if (swing > 60) {
    severity = 'critical'; side = 'risk'; score = 90
    text = `Price has swung ${swing.toFixed(1)}% in a single window. That is dislocation-level volatility — position sizing has to assume the whole move can reverse.`
  } else if (swing > 30) {
    severity = 'high'; side = 'risk'; score = 74
    text = `Peak window swing of ${swing.toFixed(1)}%. Very high volatility; stops get jumped and entries slip.`
  } else if (swing > 12) {
    severity = 'medium'; side = 'neutral'; score = 52
    text = `Peak window swing of ${swing.toFixed(1)}% — elevated but normal for this asset class.`
  } else {
    severity = 'low'; side = 'positive'; score = 30
    text = `Peak window swing of only ${swing.toFixed(1)}%. Unusually calm, which means the current range is holding.`
  }
  const parts = []
  if (h1 != null) parts.push(`1h ${h1 >= 0 ? '+' : ''}${h1.toFixed(2)}%`)
  if (h6 != null) parts.push(`6h ${h6 >= 0 ? '+' : ''}${h6.toFixed(2)}%`)
  if (h24 != null) parts.push(`24h ${h24 >= 0 ? '+' : ''}${h24.toFixed(2)}%`)
  if (d7 != null) parts.push(`7d ${d7 >= 0 ? '+' : ''}${d7.toFixed(2)}%`)
  if (d32 != null) parts.push(`32h-candles ${d32 >= 0 ? '+' : ''}${d32.toFixed(2)}%`)
  text += ` Tape: ${parts.join(' · ')}.`
  if (c24 < -20) { score = clamp(score + 10); text += ' A 24h drop this deep usually means holders are exiting, not accumulating.' }
  if (c24 > 40) { score = clamp(score + 6); text += ' A 40%+ single-day run often marks a local blow-off — chasing here is where most losses start.' }
  return { id: 'movement', label: 'Price movement / volatility', value: `${c24 >= 0 ? '+' : ''}${c24.toFixed(2)}% 24h`, severity, side, score, text }
}

function turnoverMetric(vol, mcap, liq) {
  if (!mcap || !vol) {
    return { id: 'turnover', label: 'Volume / cap turnover', value: 'unavailable', severity: 'low', side: 'neutral', score: 50, text: 'Turnover cannot be computed without both volume and market cap.' }
  }
  const t = vol / mcap
  const volLiq = liq > 0 ? vol / liq : null
  let severity, side, score, text
  if (t > 4) {
    severity = 'critical'; side = 'risk'; score = 86
    text = `24h volume is ${(t).toFixed(1)}× the entire market cap. Churn this extreme usually means wash trading or a hot-hand speculative frenzy that unwinds fast.`
  } else if (t > 1.5) {
    severity = 'high'; side = 'risk'; score = 68
    text = `Turnover of ${(t * 100).toFixed(0)}% of cap in one day — heavy speculative rotation.`
  } else if (t > 0.1) {
    severity = 'low'; side = 'positive'; score = 32
    text = `Turnover of ${(t * 100).toFixed(1)}% of cap — active interest without mania.`
  } else if (t > 0.01) {
    severity = 'medium'; side = 'neutral'; score = 55
    text = `Turnover of only ${(t * 100).toFixed(2)}% of cap. Interest is fading; thin volume means price discovery is unreliable.`
  } else {
    severity = 'high'; side = 'risk'; score = 80
    text = `Turnover of ${(t * 100).toFixed(3)}% of cap — effectively no trading. A token nobody trades cannot be exited.`
  }
  if (volLiq != null && volLiq > 25) {
    score = clamp(score + 10)
    text += ` Volume is ${volLiq.toFixed(0)}× pool depth, so the pool cannot absorb a real exit at this pace.`
  }
  return { id: 'turnover', label: 'Volume / cap turnover', value: `${(t * 100).toFixed(1)}%`, severity, side, score, text }
}

function supplyMetric(mcap, fdv) {
  const c = n(mcap), f = n(fdv)
  if (!c || !f || f <= c * 1.02) {
    return { id: 'supply', label: 'Circulating vs fully diluted', value: c && f ? 'fully circulating' : 'unavailable', severity: 'low', side: c && f ? 'positive' : 'neutral', score: c && f ? 28 : 50, text: c && f ? 'Market cap and fully diluted value are aligned — little or no locked supply waiting to unlock onto buyers.' : 'Fully diluted value is not published, so unlock overhang cannot be measured.' }
  }
  const ratio = f / c
  const circulating = (c / f) * 100
  let severity, side, score
  if (ratio > 5) { severity = 'critical'; side = 'risk'; score = 88 }
  else if (ratio > 2.5) { severity = 'high'; side = 'risk'; score = 72 }
  else { severity = 'medium'; side = 'neutral'; score = 54 }
  return { id: 'supply', label: 'Circulating vs fully diluted', value: `${circulating.toFixed(1)}% circulating`, severity, side, score, text: `Only ${circulating.toFixed(1)}% of supply is circulating — FDV is ${ratio.toFixed(1)}× market cap. The remaining ${(100 - circulating).toFixed(1)}% is future sell pressure that has not hit the book yet.` }
}

function athMetric(athPct) {
  const a = n(athPct)
  if (a == null || a === 0) {
    return { id: 'ath', label: 'Distance from all-time high', value: 'unavailable', severity: 'low', side: 'neutral', score: 50, text: 'All-time-high distance is not on this feed.' }
  }
  const drawdown = Math.abs(a)
  if (drawdown > 90) {
    return { id: 'ath', label: 'Distance from all-time high', value: `${a.toFixed(1)}%`, severity: 'high', side: 'risk', score: 76, text: `Down ${drawdown.toFixed(1)}% from the all-time high. Structure is broken — overhead supply is heavy and prior holders are underwater.` }
  }
  if (drawdown > 60) {
    return { id: 'ath', label: 'Distance from all-time high', value: `${a.toFixed(1)}%`, severity: 'medium', side: 'neutral', score: 58, text: `Down ${drawdown.toFixed(1)}% from the high. Deep drawdown, but this is also where bases form if volume returns.` }
  }
  if (drawdown > 25) {
    return { id: 'ath', label: 'Distance from all-time high', value: `${a.toFixed(1)}%`, severity: 'low', side: 'neutral', score: 44, text: `Down ${drawdown.toFixed(1)}% from the high — a normal correction range.` }
  }
  return { id: 'ath', label: 'Distance from all-time high', value: `${a >= 0 ? '+' : ''}${a.toFixed(1)}%`, severity: 'medium', side: a >= -5 ? 'risk' : 'positive', score: a >= -5 ? 66 : 30, text: a >= -5 ? `Trading within ${drawdown.toFixed(1)}% of the all-time high. Momentum is intact, but there is no overhead structure to lean on and late entries carry the most extension risk.` : `Holding near highs (${a.toFixed(1)}% from ATH) with relative strength intact.` }
}

// ── Aggregate ────────────────────────────────────────────────────────────────
// Builds the full structural read for a token from live resolver data.
export function assessMemecoinRisk(live = {}) {
  const mcap = n(live.marketCap) || 0
  const liq = n(live.liquidityUsd) || n(live.poolLiquidityUsd) || 0
  const vol = n(live.volume24h) || 0

  const metrics = [
    liquidityMetric(liq, mcap),
    poolAgeMetric(live.pairAgeDays),
    tapeMetric(live.buys24h, live.sells24h, live.uniqueBuyers24h, live.uniqueSellers24h),
    walletMetric(live.uniqueBuyers24h, live.uniqueSellers24h),
    movementMetric(live),
    turnoverMetric(vol, mcap, liq),
    supplyMetric(mcap, n(live.fdv)),
    athMetric(live.athChangePct),
  ]

  // Weighted: liquidity, age and wallets decide survival for a memecoin.
  const WEIGHTS = { liquidity: 1.5, poolAge: 1.35, wallets: 1.2, tape: 1.1, movement: 1.0, turnover: 0.95, supply: 0.85, ath: 0.6 }
  let wSum = 0, wScore = 0
  for (const m of metrics) {
    const w = WEIGHTS[m.id] || 1
    wSum += w
    wScore += m.score * w
  }
  const riskScore = clamp(wScore / (wSum || 1))
  const positivityScore = clamp(100 - riskScore)

  const critical = metrics.filter((m) => m.severity === 'critical')
  const high = metrics.filter((m) => m.severity === 'high')
  const positives = metrics.filter((m) => m.side === 'positive')
  const unavailable = metrics.filter((m) => m.value === 'unavailable')

  let grade, gradeNote
  if (critical.length >= 2 || riskScore >= 85) { grade = 'SEVERE'; gradeNote = 'Multiple structural failures at once. This profile matches the tokens that go to zero.' }
  else if (critical.length === 1 || riskScore >= 70) { grade = 'ELEVATED'; gradeNote = 'At least one severe structural weakness. Risk dominates the read.' }
  else if (high.length >= 2 || riskScore >= 55) { grade = 'MODERATE'; gradeNote = 'Several real weaknesses, offset by some working structure.' }
  else if (riskScore >= 40) { grade = 'GUARDED'; gradeNote = 'Mixed structure — positives and risks are close to balanced.' }
  else { grade = 'CONTAINED'; gradeNote = 'Structure holds up on the metrics that matter most for this asset class.' }

  return {
    riskScore,
    positivityScore,
    grade,
    gradeNote,
    metrics,
    flags: metrics.filter((m) => m.side === 'risk').map((m) => ({ id: m.id, label: m.label, severity: m.severity, text: m.text })),
    strengths: positives.map((m) => ({ id: m.id, label: m.label, text: m.text })),
    dataGaps: unavailable.map((m) => m.label),
    inputs: {
      liquidityUsd: liq || null, marketCap: mcap || null, volume24h: vol || null, fdv: n(live.fdv),
      pairAgeDays: n(live.pairAgeDays), buys24h: n(live.buys24h), sells24h: n(live.sells24h),
      uniqueBuyers24h: n(live.uniqueBuyers24h), uniqueSellers24h: n(live.uniqueSellers24h),
      change1h: n(live.change1h), change6h: n(live.change6h), change24h: n(live.change24h),
      change7d: n(live.change7d), athChangePct: n(live.athChangePct),
    },
  }
}

// Prompt block — the structural evidence the analyst models must reason from.
export function riskPromptBlock(a) {
  if (!a) return ''
  const lines = [
    'STRUCTURAL MEMECOIN RISK READ (computed from live on-chain / market data — reason from these exact numbers):',
    `- Composite risk score: ${a.riskScore}/100 (positivity ${a.positivityScore}/100) → grade ${a.grade}. ${a.gradeNote}`,
    '',
    'METRIC BY METRIC:',
  ]
  for (const m of a.metrics) {
    lines.push(`- ${m.label}: ${m.value} [${m.severity.toUpperCase()}${m.side === 'risk' ? ' · RISK' : m.side === 'positive' ? ' · POSITIVE' : ''}] ${m.text}`)
  }
  if (a.dataGaps.length) {
    lines.push('')
    lines.push(`DATA GAPS (must be disclosed, never assumed fine): ${a.dataGaps.join(', ')}`)
  }
  return lines.join('\n')
}

// Short human one-liner for UI surfaces that only have room for a sentence.
export function riskHeadline(a) {
  if (!a) return ''
  const top = a.metrics.filter((m) => m.side === 'risk').sort((x, y) => y.score - x.score)[0]
  return top ? `${a.grade} structural risk (${a.riskScore}/100) — biggest factor: ${top.label.toLowerCase()} at ${top.value}.` : `${a.grade} structural risk (${a.riskScore}/100) — no dominant weakness detected.`
}
