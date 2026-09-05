// Receipt persistence — localStorage only, no fake data.
// Receipts are built from real API responses (Council, Deep Analysis, etc.)

const HISTORY_KEY = 'verdict_history'

export function buildReceipt(verdictData, meta = {}) {
  return {
    id: `${verdictData.symbol}-${verdictData.asOf}`,
    symbol: verdictData.symbol,
    name: verdictData.name,
    verdict: verdictData.verdict,
    confidence: verdictData.confidence,
    priceUsd: verdictData.priceUsd,
    asOf: verdictData.asOf,
    sources: meta.sources || ['RYO analyze_token', 'Qwen verdict engine'],
    media: { image: !!meta.image, video: !!meta.video, voice: !!meta.voice },
  }
}

export function saveReceipt(receipt) {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    const next = [receipt, ...list.filter((r) => r.id !== receipt.id)].slice(0, 24)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    return next
  } catch {
    return [receipt]
  }
}

export function loadReceipts() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

export function clearReceipts() {
  localStorage.removeItem(HISTORY_KEY)
}
