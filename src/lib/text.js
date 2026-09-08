// Model output cleanup. The reasoning layer is asked for pure JSON, and the
// server already strips code fences around the payload — but the *string
// fields inside* that JSON can still carry markdown dressing ("**bold**",
// "- bullets", stray backticks, literal \n). Rendered verbatim that reads as
// half-finished code, so every page normalizes text through these helpers.

// One-line prose: drop all dressing, collapse line breaks into spaces.
export function plain(v) {
  let s = String(v ?? '')
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`/g, '')
  s = s.replace(/^#{1,6}\s*/gm, '')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
  s = s.replace(/^\s*[-*•]\s+/gm, '')
  s = s.replace(/^\s*\d+[.)]\s+/gm, '')
  return s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

// Multi-line prose: keep paragraph breaks, drop the dressing.
export function prose(v) {
  return String(v ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
    .filter(Boolean)
}

// Normalize a model list field (array of strings | array of objects | one blob
// of text) into a clean string array.
export function asList(v) {
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === 'object'
        ? plain(x.t || x.text || x.point || x.read || x.summary || x.reason || '')
        : plain(x)))
      .filter(Boolean)
  }
  if (typeof v === 'string' && v.trim()) return prose(v)
  return []
}

// Prices/levels sometimes arrive as "$0.12 (key support)" or "**$0.12**".
// Keep the value readable but strip the dressing.
export function level(v) {
  return plain(v) || '—'
}
