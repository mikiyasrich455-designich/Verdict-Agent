// Live market data clients — every one is a key-free public API, so the agent
// can resolve a contract address on ANY chain without a paid data plan.
//
//   DexScreener    → identity + deepest pool + liquidity/volume/fdv + per-token branding
//   GeckoTerminal  → logo + banner + decimals + supply + real market cap + top pools + exchange
//                    + real OHLCV candles (this is what kills the synthetic chart)
//   CoinGecko      → description, categories, website/social links, rank, watchlist users, ATH/ATL
//
// Every call is fail-soft: a 404 / 429 / timeout on one source can never break a profile.
import fetch from 'node-fetch'

// Cloud hosts get share-ratelimited and sometimes IP-blocked by public data
// APIs. A real browser UA plus a short backoff retry keeps enrichment alive.
const JSON_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

const GT_BASE = 'https://api.geckoterminal.com/api/v2'
const CG_BASE = 'https://api.coingecko.com/api/v3'
const DEX_BASE = 'https://api.dexscreener.com/latest/dex'

export const CHAIN_LABELS = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  bsc: 'BNB Chain',
  base: 'Base',
  arbitrum: 'Arbitrum',
  arbitrum_nova: 'Arbitrum Nova',
  polygon: 'Polygon',
  polygon_zkevm: 'Polygon zkEVM',
  avalanche: 'Avalanche',
  optimism: 'Optimism',
  tron: 'Tron',
  blast: 'Blast',
  sui: 'Sui',
  ton: 'TON',
  fantom: 'Fantom',
  celo: 'Celo',
  aptos: 'Aptos',
  zksync: 'zkSync',
  linea: 'Linea',
  scroll: 'Scroll',
  mantle: 'Mantle',
  mode: 'Mode',
  zora: 'Zora',
  sei: 'Sei',
  manta: 'Manta Pacific',
  core: 'Core',
  hedera: 'Hedera',
  pulsechain: 'PulseChain',
  cronos: 'Cronos',
  metis: 'Metis',
  bob: 'BOB',
  unichain: 'Unichain',
  berachain: 'Berachain',
  sonic: 'Sonic',
  abstract: 'Abstract',
  world: 'World Chain',
  ink: 'Ink',
  fraxtal: 'Fraxtal',
  moonbeam: 'Moonbeam',
  glimmer: 'Glimmer',
  klaytn: 'Klaytn',
  filecoin: 'Filecoin',
  heco: 'Huobi ECO',
  oasis: 'Oasis',
  thundercore: 'ThunderCore',
  wanchain: 'Wanchain',
  plume: 'Plume',
  monad: 'Monad',
  hyperevm: 'HyperEVM',
}

// DexScreener chain ids → GeckoTerminal network slugs (they disagree on most names).
const GT_NETWORK = {
  ethereum: 'eth',
  bsc: 'bsc',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  fantom: 'ftm',
  sui: 'sui-network',
  sei: 'sei-network',
  zora: 'zora-network',
  manta: 'manta-pacific',
  hedera: 'hedera-hashgraph',
  moonbeam: 'glmr',
  glimmer: 'glmr',
  cronos: 'cronos',
  celo: 'celo',
  aptos: 'aptos',
  zksync: 'zksync',
  linea: 'linea',
  scroll: 'scroll',
  mantle: 'mantle',
  mode: 'mode',
  blast: 'blast',
  core: 'core',
  pulsechain: 'pulsechain',
  ton: 'ton',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  solana: 'solana',
}

export function chainLabel(chain) {
  const c = String(chain || '')
  return CHAIN_LABELS[c.toLowerCase()] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : null)
}

// Unknown chains fall through by slug; GeckoTerminal 404s are tolerated upstream.
export function gtNetwork(chain) {
  const c = String(chain || '').toLowerCase()
  if (!c) return null
  return GT_NETWORK[c] || c
}

async function httpJsonOnce(url, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: JSON_HEADERS })
    if (!res.ok) {
      const err = new Error(`${hostOf(url)} HTTP ${res.status}`)
      err.status = res.status
      err.retryAfter = Number(res.headers.get('retry-after')) || 0
      throw err
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function hostOf(url) {
  const m = /^https?:\/\/([^/]+)/.exec(String(url))
  return m ? m[1].split('.')[0] : 'upstream'
}

// Public data APIs hiccup — and on shared cloud IPs they rate-limit. Retry with
// a backoff (honouring Retry-After) before giving up on the enrichment.
async function httpJson(url, timeoutMs = 9000) {
  let lastErr
  for (let attemptNo = 0; attemptNo < 3; attemptNo += 1) {
    try {
      return await httpJsonOnce(url, timeoutMs)
    } catch (err) {
      lastErr = err
      const status = err.status
      // 4xx other than 408/429 is a real "not there" — no point hammering it.
      if (status && status < 500 && status !== 408 && status !== 429) break
      if (attemptNo === 2) break
      const backoff = err.retryAfter ? Math.min(4000, err.retryAfter * 1000) : 400 * (attemptNo + 1) ** 2
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

// Fail-soft wrapper: enrichment is a bonus, never a blocker.
async function attempt(fn, label) {
  try {
    return await fn()
  } catch (err) {
    console.warn(`[marketData] ${label} failed: ${err.message}`)
    return null
  }
}

export const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const cleanSymbol = (s) =>
  String(s || '')
    .replace(/^[$￥]+/, '')
    .trim()
    .toUpperCase()
    .slice(0, 12)

// ── DexScreener ─────────────────────────────────────────────────
export function dexPairsByCa(ca) {
  return attempt(
    () => httpJson(`${DEX_BASE}/tokens/${encodeURIComponent(ca)}`, 11000).then((d) => d?.pairs || []),
    `dexscreener tokens ${ca}`
  )
}

export function dexSearch(query) {
  // "$Ace" returns an empty pair list — DexScreener name search must be sigil-free.
  const q = String(query || '').replace(/^[$￥]+/, '')
  return attempt(
    () => httpJson(`${DEX_BASE}/search?q=${encodeURIComponent(q)}`, 11000).then((d) => d?.pairs || []),
    `dexscreener search ${q}`
  )
}

// ── GeckoTerminal ───────────────────────────────────────────────
export function gtTokenDetail(chain, ca) {
  const net = gtNetwork(chain)
  if (!net) return Promise.resolve(null)
  return attempt(
    () => httpJson(`${GT_BASE}/networks/${net}/tokens/${encodeURIComponent(ca)}?include=top_pools&currency=usd`),
    `geckoterminal token ${net}/${ca}`
  )
}

// Cross-network pool search — the address itself is the query, so this finds a
// token on a chain DexScreener didn't report. Network comes from the pool id prefix.
export function gtSearchPools(query) {
  return attempt(
    () => httpJson(`${GT_BASE}/search/pools?query=${encodeURIComponent(query)}`).then((d) => d?.data || []),
    `geckoterminal search ${query}`
  )
}

// Returns the full { data, included } document so callers can read relationships too
// (e.g. include=base_token to learn a pool's real token name and logo).
export function gtPool(chain, poolAddress, include) {
  const net = gtNetwork(chain)
  if (!net || !poolAddress) return Promise.resolve(null)
  const q = include ? `?include=${encodeURIComponent(include)}` : ''
  return attempt(
    () => httpJson(`${GT_BASE}/networks/${net}/pools/${encodeURIComponent(poolAddress)}${q}`),
    `geckoterminal pool ${net}/${poolAddress}`
  )
}

// timeframe is strictly day|hour|minute|second — anything else is an HTTP 400.
export function gtOhlcv(chain, poolAddress, { timeframe = 'hour', aggregate = 1, duration = 24, limit = 32 } = {}) {
  const net = gtNetwork(chain)
  if (!net || !poolAddress) return Promise.resolve([])
  return attempt(
    () =>
      httpJson(
        `${GT_BASE}/networks/${net}/pools/${encodeURIComponent(poolAddress)}` +
          `/ohlcv/${timeframe}?aggregate=${aggregate}&duration=${duration}&limit=${limit}&currency=usd`
      ).then((d) => d?.data?.attributes?.ohlcv_list || []),
    `geckoterminal ohlcv ${net}/${poolAddress}`
  )
}

// ── CoinGecko ───────────────────────────────────────────────────
// CoinGecko's own platform slugs (a third naming scheme). Only the chains we can
// name are mapped; anything else simply misses the contract lookup and stays
// un-enriched rather than guessing.
const CG_PLATFORM = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  bsc: 'binance-smart-chain',
  binance: 'binance-smart-chain',
  polygon: 'polygon-pos',
  avalanche: 'avalanche',
  fantom: 'fantom',
  solana: 'solana',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  base: 'base',
  sui: 'sui',
  aptos: 'aptos',
  tron: 'tron',
  near: 'near',
  cardano: 'cardano',
  celo: 'celo',
  gnosis: 'xdai',
  xdai: 'xdai',
  zksync: 'zksync',
  linea: 'linea',
  scroll: 'scroll',
  mantle: 'mantle',
  mode: 'mode',
  blast: 'blast',
  core: 'core',
  pulsechain: 'pulsechain',
  ton: 'the-open-network',
  sei: 'sei-network',
  hedera: 'hedera-hashgraph',
  moonbeam: 'moonbeam',
  cronos: 'crypto-com-chain',
  monad: 'monad',
  harmony: 'harmony-shard-2',
  manta: 'manta-pacific',
  zora: 'zora',
  plume: 'plume',
  thundercore: 'thundercore',
  wanchain: 'wanchain',
}

export function cgPlatform(chain) {
  return CG_PLATFORM[String(chain || '').toLowerCase()] || null
}

const CG_SLIM = '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false'

export function cgCoin(coinId) {
  if (!coinId) return Promise.resolve(null)
  return attempt(() => httpJson(`${CG_BASE}/coins/${encodeURIComponent(coinId)}${CG_SLIM}`, 9000), `coingecko coin ${coinId}`)
}

// The only exact contract→coin mapping CoinGecko offers: search does NOT index
// addresses (measured: /search?query=<ca> always returns zero coins), so this is
// how a CA reaches its description, links, categories and history.
export function cgCoinByCa(chain, ca) {
  const platform = cgPlatform(chain)
  if (!platform || !ca) return Promise.resolve(null)
  return attempt(
    () => httpJson(`${CG_BASE}/coins/${platform}/contract/${encodeURIComponent(ca)}${CG_SLIM}`, 9000),
    `coingecko contract ${platform}/${ca}`
  )
}

export function cgSearch(query) {
  const q = String(query || '').replace(/^[$￥]+/, '')
  return attempt(
    () => httpJson(`${CG_BASE}/search?query=${encodeURIComponent(q)}`).then((d) => d?.coins || []),
    `coingecko search ${q}`
  )
}

// Thin tokens come back with an empty 1-day series, so callers can widen the
// window; the point list is returned as-is for the chart to trim.
export function cgMarketChart(coinId, days = 1) {
  if (!coinId) return Promise.resolve(null)
  return attempt(
    () =>
      httpJson(`${CG_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`, 9000),
    `coingecko chart ${coinId}/${days}d`
  )
}
