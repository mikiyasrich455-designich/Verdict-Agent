// Live token resolution via DexScreener (key-free public API).
// Handles: pasted contract addresses (Solana base58 + EVM 0x) and token names/tickers.
// Resolved identities are cached so repeat lookups are instant.
import fetch from 'node-fetch'
import { getCache, setCache } from './cache.js'

const EVM_CA_RE = /^0x[a-fA-F0-9]{40}$/
const BASE58_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

const CHAIN_LABELS = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  bsc: 'BNB Chain',
  base: 'Base',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
  optimism: 'Optimism',
  tron: 'Tron',
  blast: 'Blast',
  sui: 'Sui',
}

export function looksLikeContractAddress(input) {
  const s = String(input || '').trim()
  return EVM_CA_RE.test(s) || BASE58_CA_RE.test(s)
}

function shortAddr(addr) {
  const a = String(addr)
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

async function dexFetchOnce(url, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'verdict-agent/1.0' },
    })
    if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Live market APIs hiccup occasionally — one quick retry keeps UX clean.
async function dexFetch(url, timeoutMs = 11000) {
  try {
    return await dexFetchOnce(url, timeoutMs)
  } catch (err) {
    await new Promise((r) => setTimeout(r, 600))
    return dexFetchOnce(url, timeoutMs)
  }
}

// For CA lookups the pairs array is one token across many pools → deepest pool wins.
function pickBestPair(pairs) {
  let best = null
  let bestLiq = -1
  for (const p of pairs) {
    const liq = Number(p?.liquidity?.usd) || 0
    if (liq > bestLiq) {
      bestLiq = liq
      best = p
    }
  }
  return best
}

function shapeFromPair(pair, inputCa, isCA, matchType) {
  const base = pair.baseToken || {}
  // Tickers like "$WIF" break downstream lookups — normalize to a clean ticker
  const cleanSymbol = String(base.symbol || '').replace(/^[$￥]+/, '').toUpperCase().slice(0, 12)
  return {
    symbol: cleanSymbol || 'UNKNOWN',
    name: base.name || base.symbol || 'Unknown',
    chain: pair.chainId || null,
    chainLabel: CHAIN_LABELS[pair.chainId] || pair.chainId || null,
    ca: isCA ? inputCa : base.address || null,
    isCA: !!isCA,
    priceUsd: Number(pair.priceUsd) || 0,
    liquidityUsd: Number(pair.liquidity?.usd) || 0,
    volume24h: Number(pair.volume?.h24) || 0,
    dexUrl: pair.url || null,
    resolved: true,
    matchType,
  }
}

/**
 * Resolve ANY user input to a real token identity, live:
 *  - 0x… (EVM CA) or base58 (Solana CA) → DexScreener token lookup
 *  - ticker ("WIF") or name ("dogwifhat") → DexScreener search
 * Throws only for unresolvable contract addresses / names.
 * Plain ticker-like input falls through unverified (RYO may still know it).
 */
export async function resolveToken(rawInput) {
  const input = String(rawInput || '').trim()
  if (!input) throw new Error('query required')

  const cacheKey = `resolve:${input.toLowerCase()}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  // ── 1. Contract address pasted → live market lookup ──────────
  if (looksLikeContractAddress(input)) {
    const data = await dexFetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(input)}`)
    const pairs = Array.isArray(data?.pairs) ? data.pairs.filter((p) => p && p.baseToken) : []
    if (!pairs.length) {
      throw new Error(`No live market found for ${shortAddr(input)} — double-check the contract address.`)
    }
    const out = shapeFromPair(pickBestPair(pairs), input, true, 'contract')
    setCache(cacheKey, out, 10 * 60 * 1000)
    return out
  }

  // ── 2. Ticker or token name → live search ─────────────────────
  const data = await dexFetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(input)}`)
  const pairs = Array.isArray(data?.pairs) ? data.pairs.filter((p) => p && p.baseToken) : []
  const uq = input.toUpperCase()

  if (pairs.length) {
    // Exact ticker match first, then name match — keep DexScreener's relevance order.
    const exact = pairs.filter((p) => String(p.baseToken.symbol).toUpperCase() === uq)
    if (exact.length) {
      const out = shapeFromPair(exact[0], null, false, 'ticker')
      setCache(cacheKey, out, 10 * 60 * 1000)
      return out
    }
    const named = pairs.filter(
      (p) => String(p.baseToken.name || '').toUpperCase().includes(uq) || uq.includes(String(p.baseToken.symbol || '').toUpperCase())
    )
    if (named.length) {
      const out = shapeFromPair(named[0], null, false, 'name')
      setCache(cacheKey, out, 10 * 60 * 1000)
      return out
    }
  }

  // ── 3. Nothing live found — unverified ticker passthrough ─────
  if (/^[A-Za-z][A-Za-z0-9.$_-]{0,11}$/.test(input)) {
    const out = {
      symbol: uq,
      name: uq,
      chain: null,
      chainLabel: null,
      ca: null,
      isCA: false,
      priceUsd: 0,
      liquidityUsd: 0,
      volume24h: 0,
      dexUrl: null,
      resolved: false,
      matchType: 'ticker_unverified',
    }
    setCache(cacheKey, out, 2 * 60 * 1000)
    return out
  }

  throw new Error(`Couldn't find "${input}" on live markets — try a ticker, a full token name, or paste the contract address.`)
}
