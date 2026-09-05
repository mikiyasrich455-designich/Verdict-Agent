// Active-token store.
//
// A ticker alone is not an identity — "ACE" is Fusionist on one chain and
// Ace Data Cloud on another. When the user pastes a contract address we keep
// the whole identity {symbol, name, ca, chain} so every downstream request can
// be pinned to the exact asset instead of whatever the AI layer guesses from
// the ticker.
//
// The identity travels two ways:
//   1. localStorage — survives navigation and reloads inside the dashboard.
//   2. ?ca=&chain= URL params — survive a shared link or a manual URL edit and
//      always win over the stored value.

const KEY = 'verdict_active_token'

const norm = (s) => String(s || '').trim().toUpperCase()

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    // Older builds stored a bare ticker string.
    if (!raw.startsWith('{')) return raw ? { symbol: raw } : null
    const parsed = JSON.parse(raw)
    return parsed && parsed.symbol ? parsed : null
  } catch {
    return null
  }
}

export function getActiveToken() {
  return read()
}

export function getStoredToken() {
  return read()?.symbol || ''
}

export function setActiveToken(token) {
  const symbol = norm(token?.symbol)
  if (!symbol) return
  // A URL only carries {token, ca, chain}; the logo/banner live in the store.
  // Merge so navigating by link never blanks out the artwork.
  const previous = norm(read()?.symbol) === symbol ? read() : {}
  const pick = (key) => {
    const value = token?.[key]
    if (value !== undefined && value !== '') return value
    return previous[key] || ''
  }
  const identity = {
    symbol,
    name: pick('name') || symbol,
    ca: pick('ca'),
    chain: pick('chain'),
    logo: pick('logo'),
    banner: pick('banner'),
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(identity))
  } catch {
    /* private-mode storage failures are non-fatal */
  }
  // Let the shell / background repaint without a router round-trip.
  window.dispatchEvent(new CustomEvent(TOKEN_EVENT, { detail: identity }))
  return identity
}

export const TOKEN_EVENT = 'verdict:active-token'

export function clearActiveToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(TOKEN_EVENT, { detail: null }))
}

// The stored identity only counts for the token it actually describes.
export function identityForSymbol(symbol) {
  const active = read()
  if (!active) return null
  return norm(active.symbol) === norm(symbol) ? active : null
}

// ?token=&ca=&chain= from the current URL — highest priority.
export function identityFromParams(searchParams) {
  const symbol = searchParams?.get?.('token') || searchParams?.get?.('symbol')
  if (!symbol) return null
  const ca = searchParams.get('ca') || ''
  const chain = searchParams.get('chain') || ''
  if (ca) return { symbol: norm(symbol), ca, chain }
  return identityForSymbol(symbol)
}

// Build a token-scoped link that carries the identity with it.
// Accepts a full profile object, an identity, or a plain ticker string.
export function tokenQuery(token) {
  const symbol = norm(typeof token === 'string' ? token : token?.symbol)
  if (!symbol) return {}
  const ca = (typeof token === 'string' ? '' : token?.ca) || ''
  const chain = (typeof token === 'string' ? '' : token?.chain) || ''
  const q = { token: symbol }
  if (ca) {
    q.ca = ca
    if (chain) q.chain = chain
  }
  return q
}

export function tokenHref(path, token) {
  const q = tokenQuery(token)
  if (!q.token) return path
  return `${path}?${new URLSearchParams(q).toString()}`
}

// Shorten an address for display: GEuuz…pump
export function shortCa(ca, head = 6, tail = 4) {
  const s = String(ca || '')
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
