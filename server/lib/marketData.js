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

const JSON_HEADERS = { Accept: 'application/json', 'User-Agent': 'verdict-agent/1.0' }

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
    if (!res.ok) throw new Error(`${hostOf(url)} HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function hostOf(url) {
  const m = /^https?:\/\/([^/]+)/.exec(String(url))
  return m ? m[1].split('.')[0] : 'upstream'
}

// Public data APIs hiccup — one quick retry keeps the UX clean.
async function httpJson(url, timeoutMs = 9000) {
  try {
    return await httpJsonOnce(url, timeoutMs)
  } catch (err) {
    await new Promise((r) => setTimeout(r, 450))
    return httpJsonOnce(url, timeoutMs)
  }
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

export function gtPool(chain, poolAddress) {
  const net = gtNetwork(chain)
  if (!net || !poolAddress) return Promise.resolve(null)
  return attempt(
    () => httpJson(`${GT_BASE}/networks/${net}/pools/${encodeURIComponent(poolAddress)}`).then((d) => d?.data || null),
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
export function cgCoin(coinId) {
  if (!coinId) return Promise.resolve(null)
  return attempt(
    () =>
      httpJson(
        `${CG_BASE}/coins/${encodeURIComponent(coinId)}` +
          '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false',
        9000
      ),
    `coingecko coin ${coinId}`
  )
}

export function cgSearch(query) {
  const q = String(query || '').replace(/^[$￥]+/, '')
  return attempt(
    () => httpJson(`${CG_BASE}/search?query=${encodeURIComponent(q)}`).then((d) => d?.coins || []),
    `coingecko search ${q}`
  )
}
