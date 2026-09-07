// Session-scoped studio output cache. A generated clip / card / narration
// survives navigation for the token it was made for — leaving the page and
// coming back shows the same media instantly instead of asking for a fresh
// (paid) generation. Picking a new token starts that token's own slot.
// In-memory on purpose: media data URLs can be megabytes, so they never
// touch localStorage/sessionStorage quotas. A hard refresh starts clean.
const store = new Map()

const keyOf = (kind, symbol) => `${kind}:${String(symbol || '').toUpperCase()}`

export function recallStudio(kind, symbol) {
  if (!symbol) return null
  return store.get(keyOf(kind, symbol)) || null
}

export function rememberStudio(kind, symbol, entry) {
  if (!symbol || !entry) return
  store.set(keyOf(kind, symbol), entry)
}
