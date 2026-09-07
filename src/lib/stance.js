// stance.js — the single source of truth for how the app talks about a token.
// The pipeline emits POSITIVE / NEUTRAL / CAUTION. Legacy cached verdicts
// (BUY / HOLD / AVOID and friends) are mapped here so old data still renders.
export const STANCES = {
  POSITIVE: { key: 'POSITIVE', label: 'Positive Bias', short: 'Positive', tag: 'POSITIVITY', tone: 'positive', hex: '#22c55e', blurb: 'Evidence leans constructive on this token right now.' },
  NEUTRAL: { key: 'NEUTRAL', label: 'Mixed Signals', short: 'Mixed', tag: 'NEUTRAL', tone: 'neutral', hex: '#f59e0b', blurb: 'Evidence is two-sided — positives and risks are close to balanced.' },
  CAUTION: { key: 'CAUTION', label: 'Elevated Risk', short: 'Risk', tag: 'RISK', tone: 'risk', hex: '#ef4444', blurb: 'Evidence leans toward meaningful risk on this token right now.' },
}

const LEGACY = { BUY: 'POSITIVE', HOLD: 'NEUTRAL', AVOID: 'CAUTION', LONG: 'POSITIVE', SHORT: 'CAUTION', ACCUMULATE: 'POSITIVE', REDUCE: 'CAUTION', SELL: 'CAUTION' }

export function stanceKey(raw) {
  const k = String(raw ?? '').trim().toUpperCase()
  if (!k) return 'NEUTRAL'
  if (STANCES[k]) return k
  if (LEGACY[k]) return LEGACY[k]
  return 'NEUTRAL'
}

export function stanceOf(raw) {
  return STANCES[stanceKey(raw)]
}

export const DYOR_TEXT =
  'Informational research only — not financial advice. Crypto tokens, especially memecoins, can lose most or all of their value. Always do your own research and never commit capital you cannot afford to lose.'

export const DYOR_SHORT = 'Do your own research — this is information, not financial advice.'
