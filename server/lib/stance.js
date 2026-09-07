// Stance vocabulary — the console never tells a user to buy, hold or avoid anything.
// It reports a research stance built from positivity and risk, and always hands the
// decision back to the user.
export const STANCE_KEYS = ['POSITIVE', 'NEUTRAL', 'CAUTION']

export const STANCES = {
  POSITIVE: { key: 'POSITIVE', label: 'Positive Bias', short: 'Positive', tag: 'POSITIVITY', tone: 'positive' },
  NEUTRAL: { key: 'NEUTRAL', label: 'Mixed Signals', short: 'Mixed', tag: 'NEUTRAL', tone: 'neutral' },
  CAUTION: { key: 'CAUTION', label: 'Elevated Risk', short: 'Risk', tag: 'RISK', tone: 'risk' },
}

// Older cached payloads and upstream tools still speak BUY/HOLD/AVOID. They are folded
// into the safe vocabulary here so no instruction-style word can ever reach the UI.
const LEGACY = {
  BUY: 'POSITIVE', LONG: 'POSITIVE', ACCUMULATE: 'POSITIVE', BULLISH: 'POSITIVE', STRONG_BUY: 'POSITIVE',
  HOLD: 'NEUTRAL', WAIT: 'NEUTRAL', NEUTRAL: 'NEUTRAL', WATCH: 'NEUTRAL', MIXED: 'NEUTRAL',
  AVOID: 'CAUTION', SELL: 'CAUTION', SHORT: 'CAUTION', REDUCE: 'CAUTION', BEARISH: 'CAUTION', CAUTION: 'CAUTION',
}

export function stanceKey(raw) {
  const k = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (!k) return 'NEUTRAL'
  if (STANCES[k]) return k
  if (LEGACY[k]) return LEGACY[k]
  // Free-form desk phrases ("HOLD & MONITOR", "AVOID NEW CAPITAL", "WAIT FOR CONFIRMATION")
  for (const [word, key] of Object.entries(LEGACY)) {
    if (k.includes(word)) return key
  }
  return 'NEUTRAL'
}

export const stanceOf = (raw) => STANCES[stanceKey(raw)]
export const stanceLabel = (raw) => stanceOf(raw).label

// Bull/bear spread → stance. `threshold` is the 0-1 gap that counts as a clear lean.
export function stanceFromDiff(bull01, bear01, threshold = 0.15) {
  const diff = Number(bull01) - Number(bear01)
  if (diff > threshold) return 'POSITIVE'
  if (diff < -threshold) return 'CAUTION'
  return 'NEUTRAL'
}

// 0-100 scores → stance.
export function stanceFromScores(bull100, bear100, gap = 15) {
  return stanceFromDiff(bull100 / 100, bear100 / 100, gap / 100)
}

export const DYOR_TEXT =
  'Informational research only — not financial advice. Crypto tokens, especially memecoins, can lose most or all of their value. Always do your own research and never commit capital you cannot afford to lose.'

export const DYOR_SHORT = 'Do your own research — this is information, not financial advice.'

// Standing instruction injected into every analyst prompt so no agent can emit a
// buy/hold/avoid instruction, and every output reminds the user to research first.
export const STANCE_RULES = `STANCE & SAFETY RULES (non-negotiable):
- You are a research analyst, NOT a financial advisor. You NEVER instruct anyone to buy, sell, hold, accumulate, avoid or enter/exit anything.
- Report a research stance using ONLY these three values: "POSITIVE" (evidence leans constructive), "NEUTRAL" (evidence is two-sided / balanced), "CAUTION" (evidence leans toward meaningful risk).
- The words buy, hold, sell, avoid, accumulate and "take profit" are FORBIDDEN in every string you return.
- Frame everything as positivity vs risk: what the evidence supports, and what could go wrong.
- Always leave the decision with the reader and remind them to do their own research.
- Never name data providers, APIs, tools or models behind the inputs — write as an analyst, not an integration log.`
