// Live token resolution — CA-canonical, every network, real numbers.
//
// Identity rule: a pasted contract address IS the token. It is never swapped for a
// same-ticker lookalike. DexScreener is the primary source (one call covers all chains),
// GeckoTerminal is the cross-network fallback + logo/banner/supply/exchange source,
// CoinGecko adds the description + links + rank, and GeckoTerminal OHLCV supplies the
// real candles. Anything that fails is simply absent — the profile never breaks.
import { getCache, setCache } from './cache.js'
import {
  chainLabel,
  num,
  cleanSymbol,
  dexPairsByCa,
  dexSearch,
  gtTokenDetail,
  gtTokenInfo,
  gtSearchPools,
  gtPool,
  gtOhlcv,
  pumpCoin,
  cgCoin,
  cgCoinByCa,
  cgSearch,
  cgMarkets,
  cgMarketChart,
  cmcQuote,
  cmcInfo,
  venueCandles,
} from './marketData.js'

const EVM_CA_RE = /^0x[a-fA-F0-9]{40}$/
const BASE58_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
// solscan/etherscan/dexscreener/birdeye/pump.fun/geckoterminal links, plus ?chain= hints
const CA_IN_URL_RE = /(?:token|coin|address|pair|pools?)\/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i
const TICKER_RE = /^[A-Za-z][A-Za-z0-9.$_-]{0,11}$/

// Native major coins live on CoinGecko (not on DEX indexers), so a bare "BTC" or
// "SOL" resolves here with real price/cap/volume instead of a zero-fallback.
const MAJOR_COINS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', LINK: 'chainlink',
  MATIC: 'matic-network', POL: 'matic-network', DOT: 'polkadot', LTC: 'litecoin',
  ATOM: 'cosmos', UNI: 'uniswap', NEAR: 'near', APT: 'aptos', SUI: 'sui',
  TRX: 'tron', TON: 'the-open-network', SHIB: 'shiba-inu', PEPE: 'pepe',
  INJ: 'injective', ARB: 'arbitrum', OP: 'optimism', FIL: 'filecoin',
}

// Reverse of marketData's GT slug map — only used when GeckoTerminal is the
// first source to see the token and we need a human chain name back.
const GT_SLUG_TO_CHAIN = {
  eth: 'ethereum', bsc: 'bsc', polygon_pos: 'polygon', avax: 'avalanche', ftm: 'fantom',
  'sui-network': 'sui', 'sei-network': 'sei', 'zora-network': 'zora', 'manta-pacific': 'manta',
  'hedera-hashgraph': 'hedera', glmr: 'moonbeam',
}

function looksLikeContractAddress(input) {
  const s = String(input || '').trim()
  return EVM_CA_RE.test(s) || BASE58_CA_RE.test(s)
}

/**
 * Pull a contract address out of anything a user might paste:
 * a bare address, "$ACE", "solscan.io/token/…", "dexscreener.com/solana/…", or
 * an address buried in a sentence. Returns null for plain tickers/names.
 */
export function extractContractAddress(input) {
  const s = String(input || '').trim()
  if (!s) return null
  if (looksLikeContractAddress(s)) return s
  const inUrl = CA_IN_URL_RE.exec(s)
  if (inUrl) return inUrl[1]
  const bare = /(0x[a-fA-F0-9]{40})/.exec(s)
  if (bare) return bare[1]
  const b58 = /([1-9A-HJ-NP-Za-km-z]{40,44})/.exec(s)
  if (b58 && !/[^1-9A-HJ-NP-Za-km-z]/.test(b58[1])) return b58[1]
  return null
}

export function shortAddr(addr) {
  const a = String(addr || '')
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

const DEX_PRETTY = {
  raydium: 'Raydium', 'raydium-clmm': 'Raydium CLMM', 'raydium-amm-v4': 'Raydium AMM',
  orca: 'Orca', 'orca-dlmm': 'Orca DLMM', meteora: 'Meteora', 'meteora-dbc': 'Meteora DBC',
  pumpfun: 'Pump.fun', 'pump-swap': 'PumpSwap', uniswap: 'Uniswap', 'uniswap-v3': 'Uniswap v3',
  'uniswap-v2': 'Uniswap v2', 'uniswap-v4': 'Uniswap v4', pancakeswap: 'PancakeSwap',
  'pancakeswap-v3': 'PancakeSwap v3', sushiswap: 'SushiSwap', baseswap: 'BaseSwap',
  aerodrome: 'Aerodrome', 'osmosis-dex': 'Osmosis', jupiter: 'Jupiter', moonshot: 'Moonshot',
  boop: 'BOOP', launchlab: 'LaunchLab', firmachain: 'FirmaChain', flaunch: 'flaunch',
  daolama: 'DAO Lama', hibachi: 'Hibachi', zeuswap: 'ZeusNetwork', thruster: 'Thruster',
}

function prettyDex(dexId) {
  const d = String(dexId || '')
  if (!d) return null
  return DEX_PRETTY[d] || d.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Cross-source market sanity ─────────────────────────────────────────────
// Every enrichment step records the numbers it actually saw. hydrate() then
// clusters the quotes (largest agreeing cluster wins, ties break on source
// trust), checks the winner against the token's own traded candles, and
// refuses to print impossible 24h moves. One broken pool can never again
// surface as a $928 blue-chip or a +375,809% day.
const SOURCE_TRUST = { cmc: 5, coingecko: 4, dexscreener: 3, 'gt-token': 2, 'gt-pool': 2, geckoterminal: 2, pumpfun: 1 }

const fin = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function observe(profile, source, priceUsd, change24h) {
  const price = fin(priceUsd)
  const change = fin(change24h)
  if ((price === null || price <= 0) && change === null) return
  const obs = profile.priceObservations || (profile.priceObservations = [])
  if (obs.length < 12) obs.push({ source, price: price !== null && price > 0 ? price : null, change })
}

// Real traded candles are ground truth: the % move over the last ~24h of tape.
function candleChange24h(profile) {
  const hist = Array.isArray(profile.priceHistory) ? profile.priceHistory : []
  if (hist.length < 3) return null
  const last = hist[hist.length - 1]
  if (!last?.price || last.price <= 0 || !last.t) return null
  const target = last.t - 24 * 3600 * 1000
  let base = null
  for (const c of hist) {
    if (!c?.price || c.price <= 0 || !c.t) continue
    if (!base || Math.abs(c.t - target) < Math.abs(base.t - target)) base = c
  }
  if (!base || base.t === last.t) return null
  const spanH = (last.t - base.t) / 3600000
  if (spanH < 12 || spanH > 48) return null
  return ((last.price - base.price) / base.price) * 100
}

function clusterConsensus(obs, field, tolerance) {
  const pts = obs.map((o) => ({ v: o[field], source: o.source })).filter((p) => p.v !== null && Number.isFinite(p.v))
  if (!pts.length) return null
  const sorted = [...pts].sort((a, b) => a.v - b.v)
  let best = null
  for (const anchor of sorted) {
    const cluster = sorted.filter((p) => tolerance(p.v, anchor.v))
    const trust = cluster.reduce((s, p) => s + (SOURCE_TRUST[p.source] || 0), 0)
    if (!best || cluster.length > best.cluster.length || (cluster.length === best.cluster.length && trust > best.trust)) {
      best = { cluster, trust }
    }
  }
  return medianOf(best.cluster.map((p) => p.v))
}

function consensusMarket(profile) {
  const obs = Array.isArray(profile.priceObservations) ? profile.priceObservations : []
  const tape = candleChange24h(profile)
  const hist = Array.isArray(profile.priceHistory) ? profile.priceHistory : []
  const lastCandle = hist.length && hist[hist.length - 1].price > 0 ? hist[hist.length - 1].price : 0

  // Price: largest cluster of agreeing quotes (within 2.5x) wins.
  const priceConsensus = clusterConsensus(obs, 'price', (v, a) => v >= a / 2.5 && v <= a * 2.5)
  if (priceConsensus !== null && obs.filter((o) => o.price > 0).length >= 2) {
    if (!profile.priceUsd || profile.priceUsd < priceConsensus / 2.5 || profile.priceUsd > priceConsensus * 2.5) {
      profile.priceUsd = priceConsensus
      profile.priceCorrected = true
    }
  }
  // Traded candles beat any quote that disagrees with its own tape by >3x.
  if (lastCandle > 0 && profile.priceUsd > 0 && (profile.priceUsd < lastCandle / 3 || profile.priceUsd > lastCandle * 3)) {
    profile.priceUsd = lastCandle
    profile.priceCorrected = true
  }

  // 24h change: agreeing cluster (within ±30pp or ±60%) wins, then the tape vetoes.
  const changeConsensus = clusterConsensus(obs, 'change', (v, a) => Math.abs(v - a) <= Math.max(30, Math.abs(a) * 0.6))
  if (changeConsensus !== null && obs.filter((o) => o.change !== null).length >= 2) {
    if (!Number.isFinite(profile.change24h) || Math.abs(profile.change24h - changeConsensus) > Math.max(60, Math.abs(changeConsensus) * 3)) {
      profile.change24h = Math.round(changeConsensus * 100) / 100
      profile.changeCorrected = true
    }
  }
  if (tape !== null && Number.isFinite(profile.change24h) && Math.abs(profile.change24h - tape) > Math.max(60, Math.abs(tape) * 4)) {
    profile.change24h = Math.round(tape * 100) / 100
    profile.changeCorrected = true
  }
  // A 24h move beyond ±9,999% is not a market number — fall back to the tape.
  if (Number.isFinite(profile.change24h) && Math.abs(profile.change24h) > 9999) {
    profile.change24h = tape !== null ? Math.round(tape * 100) / 100 : null
    profile.changeCorrected = true
  }
  if (Number.isFinite(profile.change6h) && Math.abs(profile.change6h) > 9999) profile.change6h = null
  if (Number.isFinite(profile.change1h) && Math.abs(profile.change1h) > 9999) profile.change1h = null
  return profile
}

// ── Global aggregate overlay ────────────────────────────────────────────────
// A contract address can point at a venue with no real tape of its own: Astar's
// Ethereum bridge vault prints "$25 volume" and a "$93K cap" while the asset
// trades nine figures globally. So the headline metrics (price, cap, volume,
// rank) are pulled from the GLOBAL aggregate market — CoinGecko first,
// CoinMarketCap as the keyed fallback — matched by symbol and cross-checked
// against the contract's own tape. The contract keeps its real job: identity,
// socials, artwork and on-chain liquidity. Pure on-chain memecoins with no
// global listing keep their pool numbers, because for them the pool IS market.
async function globalMarketOverlay(profile) {
  if (profile.globalMarket) return profile
  const sym = cleanSymbol(profile.symbol)
  if (!sym || sym === 'UNKNOWN') return profile

  let g = null
  const coin = await canonicalCoin(sym)
  if (coin) {
    const md = coin.market_data || {}
    g = {
      source: 'coingecko',
      name: coin.name || null,
      price: num(md.current_price?.usd),
      change: fin(md.price_change_percentage_24h),
      marketCap: num(md.market_cap?.usd),
      fdv: num(md.fully_diluted_valuation?.usd),
      volume: num(md.total_volume?.usd),
      rank: num(coin.market_cap_rank) || null,
      circulating: num(md.circulating_supply),
    }
    if (!g.marketCap && !g.volume && !g.price) g = null
  }

  if (!g) {
    try {
      const rawItem = (await cmcQuote(sym))?.data?.[sym]
      const items = Array.isArray(rawItem) ? rawItem : rawItem ? [rawItem] : []
      const item = items.slice().sort((a, b) => (num(a.cmc_rank) || 1e9) - (num(b.cmc_rank) || 1e9))[0]
      const usd = item?.quote?.USD
      if (usd && (num(usd.market_cap) || num(usd.volume_24h))) {
        g = {
          source: 'cmc',
          name: item.name || null,
          price: num(usd.price),
          change: fin(usd.percent_change_24h),
          marketCap: num(usd.market_cap),
          fdv: num(usd.fully_diluted_market_cap),
          volume: num(usd.volume_24h),
          rank: num(item.cmc_rank) || null,
          circulating: num(item.circulating_supply),
        }
      }
    } catch (err) {
      console.warn('[tokenResolver] global overlay (cmc) skipped:', err.message)
    }
  }
  if (!g || (!g.marketCap && !g.volume && !g.price)) return profile

  // Same ticker on an unrelated asset: the aggregate price must agree with the
  // contract-bound tape within 3x, or a lookalike's global stats would leak in.
  if (profile.priceUsd > 0 && g.price > 0 && (g.price < profile.priceUsd / 3 || g.price > profile.priceUsd * 3)) {
    return profile
  }

  observe(profile, g.source, g.price || null, g.change)
  if (g.price > 0) profile.priceUsd = g.price
  if (g.change !== null) profile.change24h = g.change
  if (g.marketCap > 0) profile.marketCap = g.marketCap
  if (g.fdv > 0) profile.fdv = g.fdv
  if (g.volume > 0) profile.volume24h = g.volume
  if (g.rank) profile.cgRank = profile.cgRank || g.rank
  if (g.circulating > 0) profile.circulatingSupply = profile.circulatingSupply || g.circulating
  if (coin?.id) {
    profile.cgCoinId = profile.cgCoinId || coin.id
    profile.cgUrl = profile.cgUrl || coin.url || `https://www.coingecko.com/en/coins/${coin.id}`
  }
  if (g.name && (!profile.name || PAIR_LIKE_NAME.test(profile.name) || profile.name === profile.symbol)) {
    profile.name = g.name
  }
  profile.globalMarket = true
  profile.marketScope = 'global aggregate'
  return profile
}

// ── CoinGecko as the global authority ──────────────────────────────────────
// A search index is not an authority. DexScreener happily serves a counterfeit
// mint wearing a blue-chip ticker with a self-reported "$843M" of liquidity,
// while the real mint sits further down the list. CoinGecko publishes the
// canonical contract address for every listed symbol, plus the artwork, copy,
// links, supplies and all-time extremes — so it is consulted FIRST and every
// pool-side claim is measured against it. Records are memoised per process:
// one symbol costs one CoinGecko call, no matter how many pages ask.
const coinRecords = new Map()
const COIN_TTL = 15 * 60 * 1000

function rememberCoin(coin) {
  if (!coin?.id) return
  coinRecords.set(coin.id, { at: Date.now(), coin })
  if (coinRecords.size > 200) {
    for (const [k, v] of coinRecords) {
      if (Date.now() - v.at > COIN_TTL) coinRecords.delete(k)
      else if (coinRecords.size < 150) break
    }
  }
}

function recallCoin(id) {
  const hit = id ? coinRecords.get(id) : null
  if (!hit) return null
  if (Date.now() - hit.at > COIN_TTL) {
    coinRecords.delete(id)
    return null
  }
  return hit.coin
}

const canonMemo = new Map()

/**
 * The global CoinGecko record for a symbol: exact-symbol match, highest-ranked
 * listing wins. Returns null (memoised) when the symbol has no global listing,
 * so pure on-chain memecoins never pay for a second lookup.
 */
async function canonicalCoin(symbol) {
  const sym = cleanSymbol(symbol)
  if (!sym || sym === 'UNKNOWN') return null
  const hit = canonMemo.get(sym)
  // A successful lookup is trusted for the full TTL; a FAILED one only for a
  // minute — one CoinGecko hiccup must not blind the resolver for 15 minutes.
  if (hit && Date.now() - hit.at < (hit.coin ? COIN_TTL : 60_000)) return hit.coin

  let coin = null
  for (let attempt = 0; attempt < 2 && !coin; attempt++) {
    try {
      const hits = (await cgSearch(sym)) || []
      const id =
        hits
          .filter((c) => cleanSymbol(c.symbol) === sym)
          .sort((a, b) => (num(a.market_cap_rank) || 1e9) - (num(b.market_cap_rank) || 1e9))[0]?.id || null
      if (!id) break // no global listing for this symbol — retrying won't help
      coin = await cgCoin(id)
      if (!coin?.id) coin = null
    } catch (err) {
      console.warn(`[tokenResolver] canonical coin ${sym} attempt ${attempt + 1} skipped:`, err.message)
    }
  }
  if (coin) rememberCoin(coin)
  canonMemo.set(sym, { at: Date.now(), coin })
  if (canonMemo.size > 300) {
    for (const [k, v] of canonMemo) {
      if (Date.now() - v.at > COIN_TTL) canonMemo.delete(k)
      else if (canonMemo.size < 220) break
    }
  }
  return coin
}

/** Every contract address CoinGecko publishes for a coin, across all networks. */
function platformCAs(coin) {
  const out = []
  const add = (chain, ca) => {
    const a = String(ca || '').trim()
    if (a.length < 26) return
    if (out.some((o) => o.ca.toLowerCase() === a.toLowerCase())) return
    out.push({ chain: chain || null, ca: a })
  }
  for (const [chain, ca] of Object.entries(coin?.platforms || {})) add(chain, ca)
  add(null, coin?.contract_address)
  return out
}

// Pools quoted in a real trading asset carry the honest price. Exotic quotes
// (a dead bridge token, a wrapped curiosity) are where fake numbers are born.
const MAJOR_QUOTES = new Set([
  'USDT', 'USDC', 'USDS', 'USDE', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'PYUSD', 'BUSD',
  'SOL', 'WSOL', 'ETH', 'WETH', 'BNB', 'WBNB', 'BTC', 'WBTC', 'CBBTC', 'MATIC', 'POL',
  'AVAX', 'WAVAX', 'JITOSOL', 'MSOL', 'BNSOL', 'JUPSOL', 'WEETH', 'WSTETH', 'ARBITRUM',
])

/**
 * Pick the pool that tells the truth: its price must agree with the global
 * aggregate tape, it should be quoted in a real trading asset, and among those
 * the deepest one wins. This is what turns "JUP / METORA at $928" into the live
 * market everyone else is trading.
 */
function pickVettedGroup(groups, canonicalPrice) {
  const ref = num(canonicalPrice)
  const agrees = (px) => {
    const p = num(px)
    if (!ref || !p) return true
    return p >= ref / 3 && p <= ref * 3
  }
  const honest = groups.filter((g) => agrees(g.pair?.priceUsd))
  const poolOf = honest.length ? honest : groups
  const scored = poolOf
    .map((g) => {
      const quote = cleanSymbol(g.pair?.quoteToken?.symbol)
      const depth = num(g.liquidityUsd)
      return { g, score: (depth > 0 ? depth : 1) * (MAJOR_QUOTES.has(quote) ? 1 : 0.3) }
    })
    .sort((a, b) => b.score - a.score)
  return scored[0]?.g || groups[0]
}

/**
 * Fill every remaining blank tile from the global listing: artwork, copy, links,
 * supplies, rank, watchlists and all-time extremes. Never touches a headline
 * number that the consensus gate has already settled.
 */
function applyGlobalCoinMetadata(profile, coin) {
  if (!coin?.id) return profile
  const md = coin.market_data || {}
  const links = coin.links || {}

  profile.cgCoinId = profile.cgCoinId || coin.id
  profile.cgUrl = profile.cgUrl || coin.url || `https://www.coingecko.com/en/coins/${coin.id}`
  profile.cgRank = profile.cgRank || num(coin.market_cap_rank) || null
  profile.watchers = profile.watchers || num(coin.watchlist_portfolio_users) || null
  profile.logo = profile.logo || coin.image?.large || coin.image?.small || null
  profile.description = profile.description || (coin.description && coin.description.en) || null
  if ((!profile.categories || !profile.categories.length) && Array.isArray(coin.categories)) {
    profile.categories = coin.categories.filter(Boolean).slice(0, 6)
  }
  profile.website = profile.website || (links.homepage || []).find(Boolean) || null
  if (!profile.websites || !profile.websites.length) profile.websites = normSites(links.homepage).slice(0, 4)
  profile.whitepaper = profile.whitepaper || links.whitepaper || null
  profile.explorer = profile.explorer || (links.blockchain_site || []).find(Boolean) || null
  profile.twitter = profile.twitter || (links.twitter_screen_name ? `https://x.com/${links.twitter_screen_name}` : null)
  profile.telegram =
    profile.telegram || (links.telegram_channel_identifier ? `https://t.me/${links.telegram_channel_identifier}` : null)
  profile.github = profile.github || (links.repos_url?.github || []).find(Boolean) || null
  profile.ath = profile.ath || num(md.ath?.usd) || null
  profile.athChangePct = profile.athChangePct || num(md.ath_change_percentage?.usd) || null
  profile.athDate = profile.athDate || md.ath_date?.usd || null
  profile.atl = profile.atl || num(md.atl?.usd) || null
  profile.atlChangePct = profile.atlChangePct || num(md.atl_change_percentage?.usd) || null
  profile.atlDate = profile.atlDate || md.atl_date?.usd || null
  profile.circulatingSupply = profile.circulatingSupply || num(md.circulating_supply) || null
  profile.totalSupply = profile.totalSupply || num(md.total_supply) || null
  profile.marketCapFdvRatio = profile.marketCapFdvRatio || num(md.market_cap_fdv_ratio) || null
  if (coin.name && (!profile.name || PAIR_LIKE_NAME.test(profile.name) || profile.name === profile.symbol)) {
    profile.name = coin.name
  }
  rememberCoin(coin)
  return profile
}

/** The pair feed carries its own branding and socials — use them before giving up. */
function applyPairSocials(profile) {
  const socials = Array.isArray(profile.socials) ? profile.socials : []
  const pick = (re) => {
    const hit = socials.find((s) => re.test(`${String(s?.type || '')} ${String(s?.url || '')}`))
    return hit?.url || null
  }
  profile.twitter = profile.twitter || pick(/twitter|x\.com/i)
  profile.telegram = profile.telegram || pick(/telegram/i)
  profile.discord = profile.discord || pick(/discord/i)
  profile.github = profile.github || pick(/github/i)
  const sites = Array.isArray(profile.websites) ? profile.websites : []
  profile.website = profile.website || sites[0]?.url || null
  profile.explorer = profile.explorer || pick(/explorer|solscan|etherscan|basescan|bscscan/i)
  return profile
}

// The coin listing publishes the project's own copy, artwork and links, but its
// free tier throttles shared cloud IPs — the keyed metadata endpoint then fills
// whatever is still blank. Only ever for a PROVABLY same asset: the listing must
// publish our contract address, so a ticker collision can never borrow another
// project's description and logo. Records are memoised: metadata moves slowly.
const INFO_TTL = 60 * 60 * 1000
const cmcInfoMemo = new Map()

async function recallCmcInfo(symbol) {
  const sym = cleanSymbol(symbol)
  if (!sym) return null
  const hit = cmcInfoMemo.get(sym)
  if (hit && Date.now() - hit.at < INFO_TTL) return hit.items

  let items = null
  try {
    const raw = (await cmcInfo(sym))?.data?.[sym]
    items = Array.isArray(raw) ? raw : raw ? [raw] : null
  } catch (err) {
    console.warn('[tokenResolver] cmc metadata skipped:', err.message)
  }
  if (items) {
    cmcInfoMemo.set(sym, { at: Date.now(), items })
    if (cmcInfoMemo.size > 200) {
      for (const [k, v] of cmcInfoMemo) {
        if (Date.now() - v.at > INFO_TTL) cmcInfoMemo.delete(k)
        else if (cmcInfoMemo.size < 150) break
      }
    }
  }
  return items
}

async function applyCmcInfo(profile) {
  const items = await recallCmcInfo(profile.symbol)
  if (!items) return profile
  const ca = String(profile.ca || '').toLowerCase()
  const info =
    items.find((i) => ca && String(i?.platform?.token_address || '').toLowerCase() === ca) ||
    (ca ? null : items[0])
  if (!info) return profile

  const first = (list) => (Array.isArray(list) && list.length ? list[0] : null)
  if (!profile.description && info.description) profile.description = String(info.description).trim()
  if (!profile.logo && info.logo) profile.logo = info.logo
  if (!(profile.categories || []).length && Array.isArray(info.tags) && info.tags.length) {
    profile.categories = info.tags.slice(0, 8)
  }

  const urls = info.urls || {}
  const boards = [
    ...(Array.isArray(urls.chat) ? urls.chat : []),
    ...(Array.isArray(urls.message_board) ? urls.message_board : []),
    ...(Array.isArray(urls.social) ? urls.social : []),
  ].map(String)
  profile.website = profile.website || first(urls.website)
  profile.explorer = profile.explorer || first(urls.explorer)
  profile.github = profile.github || first(urls.source_code)
  profile.twitter = profile.twitter || boards.find((u) => /twitter\.com|x\.com/i.test(u)) || null
  profile.telegram = profile.telegram || boards.find((u) => /t\.me/i.test(u)) || null
  profile.discord = profile.discord || boards.find((u) => /discord/i.test(u)) || null
  if (!(Array.isArray(profile.websites) && profile.websites.length) && profile.website) {
    profile.websites = normSites([profile.website])
  }
  return profile
}

/**
 * Links arrive as bare strings from one indexer and {url, app_name} objects from
 * another. The UI renders them as labelled chips, so settle on a single shape here
 * instead of teaching every consumer about all three.
 */
function normSites(list) {
  const out = []
  for (const w of Array.isArray(list) ? list : []) {
    const url = typeof w === 'string' ? w : w?.url
    if (!url) continue
    const label = (w && typeof w === 'object' && (w.label || w.app_name)) || 'Website'
    out.push({ url, label })
  }
  return out
}

/**
 * Collapse DexScreener's flat pair list into one entry per (chain, contract).
 * This is what stops a ticker collision: Fusionist and Ace Data Cloud share "ACE"
 * but never share an address, so they land in different groups ranked by liquidity.
 */
function groupPairs(pairs) {
  const groups = new Map()
  for (const p of pairs) {
    const base = p?.baseToken
    if (!base?.address) continue
    const key = `${p.chainId}:${base.address.toLowerCase()}`
    const liq = num(p.liquidity?.usd)
    const cur = groups.get(key)
    if (!cur || liq > cur.liquidityUsd) {
      groups.set(key, { pair: p, liquidityUsd: liq, pools: (cur?.pools || 0) + 1 })
    } else {
      cur.pools += 1
    }
  }
  return [...groups.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd)
}

function identityFromPair(pair) {
  const base = pair.baseToken || {}
  const info = pair.info || {}
  const ca = base.address || null
  return {
    symbol: cleanSymbol(base.symbol) || 'UNKNOWN',
    name: base.name || base.symbol || 'Unknown',
    chain: pair.chainId || null,
    chainLabel: chainLabel(pair.chainId),
    ca,
    isCA: !!ca,
    decimals: null,
    priceUsd: num(pair.priceUsd),
    change24h: num(pair.priceChange?.h24),
    change6h: num(pair.priceChange?.h6),
    change1h: num(pair.priceChange?.h1),
    marketCap: num(pair.marketCap) || num(pair.fdv),
    fdv: num(pair.fdv),
    volume24h: num(pair.volume?.h24),
    volume6h: num(pair.volume?.h6),
    liquidityUsd: num(pair.liquidity?.usd),
    exchange: prettyDex(pair.dexId),
    exchangeId: pair.dexId || null,
    dexUrl: pair.url || null,
    pairAddress: pair.pairAddress || null,
    pairCreatedAt: pair.pairCreatedAt || null,
    quoteSymbol: cleanSymbol(pair.quoteToken?.symbol),
    buys24h: num(pair.txns?.h24?.buys),
    sells24h: num(pair.txns?.h24?.sells),
    logo: info.imageUrl || null,
    banner: info.header || null,
    socials: Array.isArray(info.socials) ? info.socials : [],
    websites: normSites(info.websites),
    description: null,
    categories: [],
    priceObservations: [{ source: 'dexscreener', price: num(pair.priceUsd) || null, change: fin(pair.priceChange?.h24) }],
  }
}

function candidateCard(group) {
  const p = group.pair
  return {
    symbol: cleanSymbol(p.baseToken?.symbol),
    name: p.baseToken?.name || '',
    chain: p.chainId || null,
    chainLabel: chainLabel(p.chainId),
    ca: p.baseToken?.address || null,
    liquidityUsd: num(p.liquidity?.usd),
    marketCap: num(p.marketCap) || num(p.fdv),
    priceUsd: num(p.priceUsd),
    volume24h: num(p.volume?.h24),
    exchange: prettyDex(p.dexId),
    logo: p.info?.imageUrl || null,
  }
}

function ageInDays(fromMs) {
  if (!fromMs) return null
  const diff = Date.now() - Number(fromMs)
  if (!Number.isFinite(diff) || diff < 0) return null
  return Math.round((diff / 86400000) * 10) / 10
}

// ── GeckoTerminal: logo, banner, decimals, supply, real cap, exchange, candles ──
async function applyGeckoTerminal(profile) {
  const detail = await gtTokenDetail(profile.chain, profile.ca)
  const attrs = detail?.data?.attributes
  // Was the pool we arrived through a broken venue? Its price sits light-years
  // from the global tape — if so, the honest GeckoTerminal pool found below
  // replaces it as the displayed market (pair, quote, venue and link).
  const priceRef = num(profile.canonicalPriceUsd)
  const dsPairBroken =
    priceRef > 0 && profile.priceUsd > 0 && (profile.priceUsd < priceRef / 3 || profile.priceUsd > priceRef * 3)

  if (attrs) {
    profile.logo = profile.logo || attrs.image_url || null
    profile.banner = profile.banner || attrs.banner_image_url || null
    profile.decimals = Number.isFinite(Number(attrs.decimals)) ? Number(attrs.decimals) : profile.decimals
    profile.totalSupply = num(attrs.normalized_total_supply) || profile.totalSupply
    profile.gtMarketCap = num(attrs.market_cap_usd) || null
    profile.fdv = num(attrs.fdv_usd) || profile.fdv
    profile.tokenVolume24h = num(attrs.volume_usd?.h24) || profile.volume24h
    profile.totalReserveUsd = num(attrs.total_reserve_in_usd) || null
    profile.cgCoinId = attrs.coingecko_coin_id || null
    observe(profile, 'gt-token', attrs.price_usd, null)
    if (num(attrs.price_usd)) profile.priceUsd = num(attrs.price_usd)
    // A pool search names pairs, not projects ("ACE / SOL") — the token record wins.
    if (attrs.name && (!profile.name || profile.name.includes('/') || profile.name === profile.symbol)) {
      profile.name = String(attrs.name).trim()
      profile.symbol = cleanSymbol(attrs.symbol) || profile.symbol
    }
  }

  // Deepest GeckoTerminal pool wins the exchange label and the candle feed —
  // but only among pools whose price agrees with the global aggregate tape.
  // A dead venue (a broken Meteora book quoting $928 for a $0.25 token) must
  // never become the displayed market or the chart source.
  const pools = (Array.isArray(detail?.included) ? detail.included : []).filter((i) => i?.type === 'pool')
  const poolAgrees = (pool) => {
    const p = num(pool.attributes?.base_token_price_usd ?? pool.attributes?.token_price_usd)
    if (!priceRef || !p) return true
    return p >= priceRef / 3 && p <= priceRef * 3
  }
  const honestPools = pools.filter(poolAgrees)
  let bestPool = null
  let bestReserve = -1
  for (const pool of honestPools.length ? honestPools : pools) {
    const r = num(pool.attributes?.reserve_in_usd)
    if (r > bestReserve) {
      bestReserve = r
      bestPool = pool
    }
  }

  if (bestPool) {
    const a = bestPool.attributes || {}
    profile.poolAddress = a.address || bestPool.id?.split('_').slice(1).join('_') || profile.pairAddress
    profile.pairName = a.name || profile.pairName
    profile.exchange = prettyDex(bestPool.relationships?.dex?.data?.id) || profile.exchange
    profile.exchangeId = bestPool.relationships?.dex?.data?.id || profile.exchangeId
    if (dsPairBroken) {
      // Point the pair label, quote and link at the honest market instead of
      // the broken venue the search index happened to serve.
      const gtSlug = bestPool.relationships?.network?.data?.id || String(bestPool.id || '').split('_')[0]
      if (a.address) profile.pairAddress = a.address
      if (a.address && gtSlug) profile.dexUrl = `https://www.geckoterminal.com/${gtSlug}/pools/${a.address}`
      const quoteHalf = String(a.name || '').split('/')[1]
      if (quoteHalf) profile.quoteSymbol = cleanSymbol(quoteHalf) || profile.quoteSymbol
    }
    profile.poolLiquidityUsd = num(a.reserve_in_usd) || profile.liquidityUsd
    if (a.pool_created_at) {
      const created = Date.parse(a.pool_created_at)
      if (Number.isFinite(created)) profile.pairCreatedAt = profile.pairCreatedAt || created
    }
    profile.change24h = num(a.price_change_percentage?.h24) || profile.change24h
    profile.change1h = num(a.price_change_percentage?.h1) || profile.change1h
    profile.change6h = num(a.price_change_percentage?.h6) || profile.change6h
    profile.buys24h = profile.buys24h || num(a.transactions?.h24?.buys)
    profile.sells24h = profile.sells24h || num(a.transactions?.h24?.sells)
    profile.uniqueBuyers24h = num(a.transactions?.h24?.buyers) || null
    profile.uniqueSellers24h = num(a.transactions?.h24?.sellers) || null
    profile.volume24h = num(a.volume_usd?.h24) || profile.volume24h
    observe(profile, 'gt-pool', null, a.price_change_percentage?.h24)
  }

  profile.marketCap = profile.gtMarketCap || profile.marketCap
  profile.liquidityUsd = profile.totalReserveUsd || profile.liquidityUsd

  // Real candles: [ts, open, high, low, close, volume], newest first.
  const candles = await gtOhlcv(profile.chain, profile.poolAddress || profile.pairAddress, {
    timeframe: 'hour',
    aggregate: 1,
    duration: 32,
    limit: 32,
  })
  if (Array.isArray(candles) && candles.length > 3) {
    const ascending = [...candles].reverse()
    profile.priceHistory = ascending.map((c, i) => ({
      i,
      t: num(c[0]) * 1000,
      price: num(c[4]),
      volume: num(c[5]),
    }))
    profile.chartSource = 'live candles · hourly'
    const first = profile.priceHistory[0].price
    const last = profile.priceHistory[profile.priceHistory.length - 1].price
    if (first > 0) profile.change32h = Math.round(((last - first) / first) * 10000) / 100
  }
  return profile
}

// ── Cross-network fallback: GeckoTerminal search finds chains DexScreener missed ──
async function geckoFallback(ca) {
  const pools = await gtSearchPools(ca)
  if (!Array.isArray(pools) || !pools.length) return null
  const wanted = ca.toLowerCase()
  const match =
    pools.find((p) => String(p.relationships?.base_token?.data?.id || '').toLowerCase().endsWith(`_${wanted}`)) ||
    pools.find((p) => String(p.id || '').toLowerCase().includes(wanted)) ||
    pools[0]
  if (!match) return null

  const gtSlug = match.relationships?.network?.data?.id || String(match.id || '').split('_')[0]
  const chain = GT_SLUG_TO_CHAIN[gtSlug] || gtSlug
  const a = match.attributes || {}
  const pairAddress = a.address || String(match.id || '').split('_').slice(1).join('_')

  // A pool search only knows the pair ("ACE / SOL"). Ask the pool for its base
  // token so the profile carries the real project name and logo, never a pair slug.
  const pool = await gtPool(chain, pairAddress, 'base_token')
  const baseToken = (Array.isArray(pool?.included) ? pool.included : []).find((i) => i?.type === 'token')
  const bt = baseToken?.attributes || {}

  return {
    symbol: cleanSymbol(bt.symbol) || cleanSymbol(String(a.name || '').split('/')[0]) || 'UNKNOWN',
    name: bt.name || String(a.name || '').split('/')[0].trim() || 'Unknown',
    chain: chain || null,
    chainLabel: chainLabel(chain),
    ca,
    isCA: true,
    decimals: Number.isFinite(Number(bt.decimals)) ? Number(bt.decimals) : null,
    priceUsd: num(a.base_token_price_usd ?? a.token_price_usd),
    change24h: num(a.price_change_percentage?.h24),
    marketCap: num(a.market_cap_usd) || num(a.fdv_usd),
    fdv: num(a.fdv_usd),
    volume24h: num(a.volume_usd?.h24),
    liquidityUsd: num(a.reserve_in_usd),
    exchange: prettyDex(match.relationships?.dex?.data?.id),
    exchangeId: match.relationships?.dex?.data?.id || null,
    pairAddress,
    poolAddress: pairAddress,
    pairName: a.name || null,
    pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
    buys24h: num(a.transactions?.h24?.buys),
    sells24h: num(a.transactions?.h24?.sells),
    logo: bt.image_url || null,
    banner: bt.banner_image_url || null,
    cgCoinId: bt.coingecko_coin_id || null,
    totalSupply: num(bt.total_supply),
    socials: [],
    websites: [],
    description: null,
    categories: [],
    priceObservations: [{ source: 'geckoterminal', price: num(a.base_token_price_usd ?? a.token_price_usd) || null, change: fin(a.price_change_percentage?.h24) }],
    resolved: true,
    matchType: 'contract_geckoterminal',
  }
}

// ── Per-chain token record — answers when the cross-chain search is throttled ─
// Address shape narrows which ledgers are worth probing.
function chainsToProbe(ca, preferred) {
  const rest = EVM_CA_RE.test(String(ca))
    ? ['ethereum', 'base', 'bsc', 'polygon', 'arbitrum', 'optimism', 'avalanche']
    : BASE58_CA_RE.test(String(ca))
      ? ['solana']
      : []
  if (preferred && !rest.includes(preferred)) return [preferred, ...rest]
  return preferred ? [preferred, ...rest.filter((c) => c !== preferred)] : rest
}

async function gtTokenProfile(ca, preferredChain) {
  for (const chain of chainsToProbe(ca, preferredChain)) {
    const detail = await gtTokenDetail(chain, ca)
    const a = detail?.data?.attributes
    if (!a || (!a.name && !a.symbol)) continue

    const info = (await gtTokenInfo(chain, ca))?.data?.attributes || {}
    const pools = (Array.isArray(detail.included) ? detail.included : []).filter((p) => p?.type === 'pool')
    const deepest = pools.sort(
      (x, y) => num(y?.attributes?.reserve_in_usd) - num(x?.attributes?.reserve_in_usd)
    )[0]
    const pa = deepest?.attributes || {}
    const sites = normSites(info.websites)
    const socials = []
    if (info.twitter_handle) socials.push({ type: 'twitter', url: `https://x.com/${info.twitter_handle}` })
    if (info.telegram_handle) socials.push({ type: 'telegram', url: `https://t.me/${info.telegram_handle}` })
    if (info.discord_url) socials.push({ type: 'discord', url: info.discord_url })

    return {
      symbol: cleanSymbol(a.symbol) || 'UNKNOWN',
      name: a.name || a.symbol || 'Unknown',
      chain,
      chainLabel: chainLabel(chain),
      ca,
      isCA: true,
      decimals: Number.isFinite(Number(a.decimals)) ? Number(a.decimals) : null,
      priceUsd: num(a.price_usd),
      change24h: num(pa.price_change_percentage?.h24),
      marketCap: num(a.market_cap_usd) || num(a.fdv_usd),
      fdv: num(a.fdv_usd),
      volume24h: num(a.volume_usd?.h24),
      liquidityUsd: num(a.total_reserve_in_usd),
      totalSupply: num(a.normalized_total_supply),
      exchange: prettyDex(deepest?.relationships?.dex?.data?.id),
      exchangeId: deepest?.relationships?.dex?.data?.id || null,
      pairName: pa.name || null,
      pairAddress: pa.address || null,
      poolAddress: pa.address || null,
      pairCreatedAt: pa.pool_created_at ? Date.parse(pa.pool_created_at) : null,
      buys24h: num(pa.transactions?.h24?.buys),
      sells24h: num(pa.transactions?.h24?.sells),
      logo: a.image_url || null,
      banner: a.banner_image_url || null,
      cgCoinId: a.coingecko_coin_id || null,
      description: (info.description || '').replace(/\s*\n\s*/g, ' ').trim() || null,
      websites: sites.slice(0, 4),
      website: sites[0]?.url || null,
      whitepaper: sites.find((s) => /whitepaper|\.pdf/i.test(s.url))?.url || null,
      socials,
      categories: [],
      priceObservations: [{ source: 'geckoterminal', price: num(a.price_usd) || null, change: fin(pa.price_change_percentage?.h24) }],
      resolved: true,
      matchType: 'contract_geckoterminal',
    }
  }
  return null
}

// ── Deepen a pair-search hit ─────────────────────────────────────────────────
// A pool search only returns pair rows, so a token found that way arrives with no
// artwork, no copy and sometimes not even a real project name. The token record for
// the chain we just discovered carries all of it — one extra call fills the blanks.
const DEEP_FIELDS = [
  'name', 'symbol', 'decimals', 'logo', 'banner', 'description', 'websites', 'socials',
  'whitepaper', 'cgCoinId', 'totalSupply', 'marketCap', 'fdv', 'volume24h', 'liquidityUsd',
  'priceUsd', 'change24h', 'buys24h', 'sells24h', 'exchange', 'pairName', 'pairAddress',
  'poolAddress', 'pairCreatedAt',
]

async function deepenFromTokenRecord(record) {
  const rich = await gtTokenProfile(record.ca, record.chain)
  if (!rich) return record
  for (const field of DEEP_FIELDS) {
    if (isBlank(record[field]) && !isBlank(rich[field])) record[field] = rich[field]
  }
  return record
}

// ── pump.fun mints: the launchpad that issued the address always knows it ─────
// Launchpad artwork is stored on IPFS, so it only renders in a browser once it is
// rewritten to a gateway URL. "arrow://" is their marker for "no image uploaded".
function artUrl(uri) {
  const raw = String(uri || '').trim()
  if (!raw || !/^https?:\/\//i.test(raw)) {
    const cid = raw.replace(/^(ipfs:\/?\/?|ar:\/?\/?)/i, '')
    return /^[A-Za-z0-9]{20,}$/.test(cid) ? `https://ipfs.io/ipfs/${cid}` : null
  }
  return raw
}

async function pumpFunProfile(ca) {
  const coin = await pumpCoin(ca)
  if (!coin || (!coin.name && !coin.symbol)) return null
  const socials = []
  if (coin.twitter) socials.push({ type: 'twitter', url: coin.twitter })
  if (coin.telegram) socials.push({ type: 'telegram', url: coin.telegram })
  // The launchpad reports supply in base units, so the price has to come from the
  // decimal-adjusted amount or every brand-new mint reads as a fraction of a cent.
  const decimals = Number.isFinite(Number(coin.decimals)) ? Number(coin.decimals) : 6
  const rawSupply = num(coin.total_supply)
  const supply = rawSupply ? rawSupply / 10 ** decimals : 0
  const marketCap = num(coin.usd_market_cap)
  const site = typeof coin.website === 'string' ? coin.website.trim() : ''
  return {
    symbol: cleanSymbol(coin.symbol) || 'UNKNOWN',
    name: coin.name || coin.symbol || 'Unknown',
    chain: 'solana',
    chainLabel: chainLabel('solana'),
    ca,
    isCA: true,
    decimals,
    priceUsd: supply && marketCap ? marketCap / supply : 0,
    marketCap,
    totalSupply: supply,
    exchange: coin.raydium_pool ? 'Raydium' : 'pump.fun bonding curve',
    pairAddress: coin.pool_address || coin.market_id || null,
    poolAddress: coin.pool_address || coin.market_id || null,
    pairCreatedAt: num(coin.created_timestamp) || null,
    logo: artUrl(coin.image_uri),
    banner: null,
    description: (coin.description || '').replace(/\s*\n\s*/g, ' ').trim() || null,
    website: site || null,
    websites: site ? [{ url: site, label: 'Website' }] : [],
    socials,
    categories: [],
    ath: num(coin.ath_market_cap) || undefined,
    priceObservations: supply && marketCap ? [{ source: 'pumpfun', price: marketCap / supply, change: null }] : [],
    resolved: true,
    matchType: 'contract_pumpfun',
  }
}

// ── CoinGecko: the "info thing" — what the project actually is ───────────────
async function applyCoinGecko(profile) {
  let coin = profile.cgCoinId ? await cgCoin(profile.cgCoinId) : null
  if (!coin?.id && profile.ca) {
    // GeckoTerminal published no CoinGecko link (or its detail call was
    // rate-limited): the contract endpoint is the only exact address→coin map.
    coin = await cgCoinByCa(profile.chain, profile.ca)
  }
  if (!coin?.id) return profile

  // Trust but verify: CoinGecko links can be stale. If the listed coin publishes
  // contract addresses, ours must be one of them — otherwise skip it entirely
  // rather than let a mislink rewrite the identity we resolved from the CA.
  const listed = [
    coin.contract_address,
    ...Object.values(coin.platforms || {}),
    ...Object.keys(coin.detail_platforms || {}),
  ].filter((v) => typeof v === 'string' && v.length > 8)
  if (profile.ca && listed.length) {
    const wanted = profile.ca.toLowerCase()
    if (!listed.some((a) => a.toLowerCase() === wanted)) return profile
  }
  profile.cgCoinId = coin.id
  rememberCoin(coin)

  const md = coin.market_data || {}
  const links = coin.links || {}
  observe(profile, 'coingecko', md.current_price?.usd, md.price_change_percentage_24h)

  profile.name = coin.name || profile.name
  profile.symbol = cleanSymbol(coin.symbol) || profile.symbol
  profile.description = (coin.description && coin.description.en) || profile.description
  profile.categories = Array.isArray(coin.categories) ? coin.categories.filter(Boolean).slice(0, 6) : []
  profile.logo = coin.image?.large || coin.image?.small || profile.logo
  profile.website = (links.homepage || []).find(Boolean) || profile.website || null
  profile.websites = normSites(links.homepage).length ? normSites(links.homepage).slice(0, 4) : profile.websites || []
  profile.whitepaper = links.whitepaper || profile.whitepaper || null
  profile.explorer = (links.blockchain_site || []).find(Boolean) || profile.explorer || null
  profile.twitter = links.twitter_screen_name ? `https://x.com/${links.twitter_screen_name}` : null
  profile.telegram = links.telegram_channel_identifier ? `https://t.me/${links.telegram_channel_identifier}` : null
  profile.github = (links.repos_url?.github || []).find(Boolean) || null
  profile.cgRank = coin.market_cap_rank || null
  profile.watchers = num(coin.watchlist_portfolio_users) || null
  profile.priceUsd = num(md.current_price?.usd) || profile.priceUsd
  profile.marketCap = num(md.market_cap?.usd) || profile.marketCap
  profile.fdv = num(md.fully_diluted_valuation?.usd) || profile.fdv
  profile.volume24h = num(md.total_volume?.usd) || profile.volume24h
  profile.circulatingSupply = num(md.circulating_supply) || null
  profile.totalSupply = num(md.total_supply) || profile.totalSupply
  profile.change24h = num(md.price_change_percentage_24h) || profile.change24h
  profile.ath = num(md.ath?.usd) || null
  profile.athChangePct = num(md.ath_change_percentage?.usd) || null
  profile.athDate = md.ath_date?.usd || null
  profile.atl = num(md.atl?.usd) || null
  profile.atlChangePct = num(md.atl_change_percentage?.usd) || null
  profile.atlDate = md.atl_date?.usd || null
  profile.marketCapFdvRatio = num(md.market_cap_fdv_ratio) || null
  profile.cgUrl = coin.url || `https://www.coingecko.com/en/coins/${coin.id}`
  profile.resolved = true
  return profile
}

// A price tape from CoinGecko when GeckoTerminal's candle feed is unavailable.
// Thin listings return an empty 1-day series, so the window widens until points exist.
async function applyCoinGeckoTape(profile) {
  if ((profile.priceHistory || []).length || !profile.cgCoinId) return
  for (const days of [1, 7, 30]) {
    const chart = await cgMarketChart(profile.cgCoinId, days)
    const prices = chart?.prices || []
    if (prices.length < 4) continue
    const volumes = chart.total_volumes || []
    const slice = prices.slice(-32)
    const offset = prices.length - slice.length
    profile.priceHistory = slice.map(([t, price], i) => ({
      i,
      t: Number(t) || 0,
      price: Number(price) || 0,
      volume: Number(volumes[offset + i]?.[1]) || 0,
    }))
    profile.chartSource = `live history · last ${days === 1 ? '24 hours' : `${days} days`}`
    return
  }
}

// Last-resort tape: public venue candles need no key, so they still answer when
// this host is throttled by the free indexer tiers. A venue can list a COMPLETELY
// different project under the same ticker, so the series is accepted only when
// its last close agrees with the price the rest of the pipeline converged on —
// the same three-times test every other cross-source check here already applies.
async function applyVenueTape(profile) {
  if ((profile.priceHistory || []).length) return
  const sym = cleanSymbol(profile.symbol)
  if (!sym) return

  const found = await venueCandles(sym)
  if (!found) return
  const last = found.candles[found.candles.length - 1].price
  if (profile.priceUsd > 0 && (last < profile.priceUsd / 3 || last > profile.priceUsd * 3)) return

  profile.priceHistory = found.candles.map((c, i) => ({ i, t: c.t, price: c.price, volume: c.volume }))
  profile.chartSource = 'live candles · hourly'
  const first = profile.priceHistory[0].price
  if (first > 0) profile.change32h = Math.round(((last - first) / first) * 10000) / 100
}

// ── Stale-while-error ────────────────────────────────────────────────────────
// Public data APIs rate-limit shared cloud IPs hard. Anything we have once
// confirmed about a contract's identity, artwork or copy is kept for hours, so a
// momentary 403/429 upstream can never turn the profile back into a bare number.
const STICKY_FIELDS = [
  'logo', 'banner', 'description', 'categories', 'socials', 'websites', 'website',
  'whitepaper', 'explorer', 'twitter', 'telegram', 'github',
  'cgCoinId', 'cgUrl', 'cgRank', 'watchers', 'decimals',
]
const PAIR_LIKE_NAME = /^[\w.$-]{1,16}\s+\/\s+[\w.$-]{1,16}$/
const stickyByCa = new Map()
const STICKY_TTL = 6 * 60 * 60 * 1000

const isBlank = (v) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)

function stickyKey(profile) {
  return `${profile.chain || '?'}:${String(profile.ca || '').toLowerCase()}`
}

function rememberSticky(profile) {
  if (!profile.ca) return
  const bag = { at: Date.now(), fields: {} }
  for (const f of STICKY_FIELDS) if (!isBlank(profile[f])) bag.fields[f] = profile[f]
  if (profile.name && !PAIR_LIKE_NAME.test(profile.name)) bag.fields.name = profile.name
  if (profile.symbol && profile.symbol !== 'UNKNOWN') bag.fields.symbol = profile.symbol
  // A candle history is time-stamped, so an older one still tells the truth.
  if ((profile.priceHistory || []).length > 3) {
    bag.fields.priceHistory = profile.priceHistory.slice(-32)
    bag.fields.chartSource = profile.chartSource || 'candle feed'
  }
  stickyByCa.set(stickyKey(profile), bag)
  if (stickyByCa.size > 400) {
    for (const [k, v] of stickyByCa) {
      if (Date.now() - v.at > STICKY_TTL) stickyByCa.delete(k)
      else if (stickyByCa.size < 300) break
    }
  }
}

function restoreSticky(profile) {
  const bag = stickyByCa.get(stickyKey(profile))
  if (!bag || Date.now() - bag.at > STICKY_TTL) return
  let restored = false
  for (const [f, v] of Object.entries(bag.fields)) {
    if (isBlank(profile[f])) {
      profile[f] = v
      restored = true
    }
  }
  if (!profile.name || PAIR_LIKE_NAME.test(profile.name)) {
    profile.name = bag.fields.name || profile.name
    restored = true
  }
  if (!profile.symbol || profile.symbol === 'UNKNOWN') profile.symbol = bag.fields.symbol || profile.symbol
  const cached = bag.fields.priceHistory
  if (!(profile.priceHistory || []).length && Array.isArray(cached) && cached.length > 3) {
    profile.priceHistory = cached
    profile.chartSource = `${bag.fields.chartSource || 'candle feed'} · cached`
    restored = true
  }
  if (restored) profile.stickyEnrichment = true
}

// Shared tail: everything found by CA or by search gets the same enrichment.
async function hydrate(profile, candidates) {
  // The global listing record is fetched once (memoised) and shared by every
  // pass below: it anchors pool vetting with the canonical price, fills blank
  // tiles with verified artwork/copy, and powers the aggregate overlay.
  let canon = null
  try {
    canon = await canonicalCoin(profile.symbol)
  } catch (err) {
    console.warn('[tokenResolver] canonical coin skipped:', err.message)
  }
  const canonPrice = num(canon?.market_data?.current_price?.usd) || null
  if (canonPrice) profile.canonicalPriceUsd = canonPrice

  if (profile.ca) {
    try {
      await applyGeckoTerminal(profile)
    } catch (err) {
      console.warn('[tokenResolver] gecko enrichment skipped:', err.message)
    }
    try {
      await applyCoinGecko(profile)
    } catch (err) {
      console.warn('[tokenResolver] coingecko enrichment skipped:', err.message)
    }
    try {
      await applyCoinGeckoTape(profile)
    } catch (err) {
      console.warn('[tokenResolver] coingecko chart skipped:', err.message)
    }
    restoreSticky(profile)
  }

  // Blank tiles get filled from a global listing ONLY when it is provably the
  // same asset — our contract is one it publishes, or its price agrees with
  // ours (the very same test the aggregate overlay below must pass before it
  // dares overwrite our market numbers: one verdict, applied consistently).
  // A ticker collision must never borrow another project's logo and copy.
  const caMatches =
    !!profile.ca && platformCAs(canon).some((c) => c.ca.toLowerCase() === String(profile.ca).toLowerCase())
  const priceAgrees =
    canonPrice > 0 && profile.priceUsd > 0 && canonPrice >= profile.priceUsd / 3 && canonPrice <= profile.priceUsd * 3
  const canonIsThisAsset = !!canon && (caMatches || priceAgrees)
  applyGlobalCoinMetadata(profile, canonIsThisAsset ? canon : recallCoin(profile.cgCoinId))
  applyPairSocials(profile)
  try {
    await applyCmcInfo(profile)
  } catch (err) {
    console.warn('[tokenResolver] keyed metadata enrichment skipped:', err.message)
  }

  // Headline metrics come from the global aggregate market, never from one
  // isolated pool: a bridge vault's "$25 volume" must not reach a dashboard.
  try {
    await globalMarketOverlay(profile)
  } catch (err) {
    console.warn('[tokenResolver] global market overlay skipped:', err.message)
  }

  // Cross-source sanity gate: one broken pool must never print a fake price
  // or an impossible 24h move on any agent page.
  consensusMarket(profile)

  // Cap derivable from real price x real circulating supply beats a blank tile.
  if (!profile.marketCap && profile.priceUsd > 0 && profile.circulatingSupply > 0) {
    profile.marketCap = profile.priceUsd * profile.circulatingSupply
  }

  // Second chart chance: the first tape attempt can come back empty (throttled
  // feed, or the CoinGecko id was only confirmed later in the pipeline).
  if (!(profile.priceHistory || []).length && profile.cgCoinId) {
    try {
      await applyCoinGeckoTape(profile)
    } catch (err) {
      console.warn('[tokenResolver] coingecko chart retry skipped:', err.message)
    }
  }

  // Both indexer tapes can be silent at once — a key-free venue still has real
  // hourly candles, so the price-action panel never has to render empty.
  if (!(profile.priceHistory || []).length) {
    try {
      await applyVenueTape(profile)
    } catch (err) {
      console.warn('[tokenResolver] venue chart skipped:', err.message)
    }
  }

  if (PAIR_LIKE_NAME.test(String(profile.name || ''))) {
    profile.name = String(profile.name).split('/')[0].trim()
  }

  profile.pairAgeDays = ageInDays(profile.pairCreatedAt)
  profile.matchType = profile.matchType || 'contract'
  profile.resolved = true
  if (Array.isArray(candidates) && candidates.length) profile.candidates = candidates
  if (!profile.priceHistory && profile.priceUsd) {
    // No candles yet (unlisted / GT gap) — say so instead of inventing a curve.
    profile.priceHistory = []
    profile.chartSource = null
  }
  if (profile.ca) rememberSticky(profile)
  return profile
}

// Native major coin — CoinMarketCap carries the real quote for BTC/ETH/SOL etc.
async function majorCoinProfile(symbol) {
  const upper = String(symbol || '').toUpperCase()
  if (!MAJOR_COINS[upper]) return null

  const quote = await cmcQuote([upper])
  const item = quote?.data?.[upper] || quote?.data?.[cleanSymbol(symbol)]
  if (!item) return null

  const usd = item.quote?.USD || {}
  const cap = num(usd.market_cap)
  const fdv = num(usd.fully_diluted_market_cap)

  return consensusMarket({
    symbol: cleanSymbol(item.symbol) || upper,
    name: item.name || upper,
    chain: null,
    chainLabel: null,
    ca: null,
    isCA: false,
    priceUsd: num(usd.price),
    change24h: num(usd.percent_change_24h),
    priceObservations: [{ source: 'cmc', price: num(usd.price) || null, change: fin(usd.percent_change_24h) }],
    change7d: num(usd.percent_change_7d),
    marketCap: cap,
    fdv,
    volume24h: num(usd.volume_24h),
    liquidityUsd: 0,
    exchange: null,
    logo: item.id ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${item.id}.png` : null,
    banner: null,
    description: null,
    categories: [],
    socials: [],
    websites: [],
    website: null,
    explorer: null,
    twitter: null,
    cmcId: item.id || null,
    cmcRank: item.cmc_rank || null,
    watchers: null,
    ath: null,
    athChangePct: null,
    atl: null,
    circulatingSupply: num(item.circulating_supply),
    totalSupply: num(item.total_supply),
    marketCapFdvRatio: cap > 0 && fdv > 0 ? +(fdv / cap).toFixed(4) : null,
    priceHistory: [],
    chartSource: null,
    resolved: true,
    globalMarket: true,
    marketScope: 'global aggregate',
    matchType: 'cmc_major',
  })
}

/**
 * Contract address → the real live market for it. DexScreener first, with the
 * global listing record vetting WHICH pool tells the truth (a counterfeit or
 * broken venue quotes a price light-years from the aggregate tape — it loses
 * to an honest, deeper, major-quoted pool). Then GeckoTerminal's cross-chain
 * search, then the per-chain token record, then the launchpad that minted it.
 * Returns null when no live venue answers — the caller decides how to fail.
 */
async function resolveByCa(ca, { matchType = 'contract', candidates = null } = {}) {
  const pairs = (await dexPairsByCa(ca)) || []
  const mine = pairs.filter((p) => String(p?.baseToken?.address || '').toLowerCase() === ca.toLowerCase())
  const groups = groupPairs(mine.length ? mine : pairs.filter((p) => p?.baseToken))

  if (groups.length) {
    const sym0 = cleanSymbol(groups[0].pair?.baseToken?.symbol)
    const canon = await canonicalCoin(sym0)
    let canonicalPrice = num(canon?.market_data?.current_price?.usd) || null
    if (!canonicalPrice) {
      // CoinGecko is throttled from shared cloud IPs; the keyed CMC quote still
      // pins the real tape so quote-token-priced broken pools get vetoed here.
      try {
        const rawItem = (await cmcQuote(sym0))?.data?.[sym0]
        const items = Array.isArray(rawItem) ? rawItem : rawItem ? [rawItem] : []
        const item = items
          .slice()
          .sort((a, b) => (num(a.cmc_rank) || 1e9) - (num(b.cmc_rank) || 1e9))[0]
        canonicalPrice = num(item?.quote?.USD?.price) || null
      } catch (err) {
        console.warn('[tokenResolver] cmc price anchor skipped:', err.message)
      }
    }
    const pick = pickVettedGroup(groups, canonicalPrice)
    const profile = identityFromPair(pick.pair)
    profile.ca = ca
    profile.isCA = true
    profile.matchType = matchType
    // Branding lives on ANY of the token's pools — the chosen one may lack it.
    for (const p of pairs) {
      const info = p?.info || {}
      if (!profile.logo && info.imageUrl) profile.logo = info.imageUrl
      if (!profile.banner && info.header) profile.banner = info.header
      if (!(profile.socials || []).length && Array.isArray(info.socials) && info.socials.length) profile.socials = info.socials
      if (!(profile.websites || []).length && Array.isArray(info.websites) && info.websites.length) {
        profile.websites = normSites(info.websites)
      }
    }
    return hydrate(profile, candidates || groups.slice(0, 6).map(candidateCard))
  }

  // DexScreener doesn't index every venue — ask GeckoTerminal directly.
  const fallback = await geckoFallback(ca)
  if (fallback) {
    if (matchType !== 'contract') fallback.matchType = matchType
    const deep = fallback.logo && fallback.description ? fallback : await deepenFromTokenRecord(fallback)
    return hydrate(deep, [])
  }

  // Both indexers went quiet (they throttle shared cloud ranges hard). The
  // per-chain token record, then the launchpad that minted it, still answer.
  const record = (await gtTokenProfile(ca)) || (await pumpFunProfile(ca))
  if (record) {
    if (matchType !== 'contract') record.matchType = matchType
    return hydrate(record, [])
  }
  return null
}

/**
 * Resolve ANY user input to a real, fully-enriched token identity.
 *   "GEuuz…pump" / "0x…" / a explorer URL → that exact token, on its exact chain
 *   "$ACE" / "dogwifhat"                  → highest-liquidity match + candidates[]
 */
export async function resolveToken(rawInput) {
  const raw = String(rawInput || '').trim()
  if (!raw) throw new Error('query required')

  const cacheKey = `resolve:${raw.toLowerCase()}`
  const cached = getCache(cacheKey)
  if (cached) return cached

  const ca = extractContractAddress(raw)

  // ── 1. Contract address — the address is the identity, no ambiguity ──
  if (ca) {
    const out = await resolveByCa(ca)
    if (out) {
      setCache(cacheKey, out, 5 * 60 * 1000)
      return out
    }
    throw new Error(`No live market found for ${shortAddr(ca)} — check the contract address and try again.`)
  }

  // ── 2. Native major coin — BTC/ETH/SOL etc. resolve straight to CoinGecko ──
  {
    const ticker = raw.replace(/^[$￥]+/, '').toUpperCase()
    if (TICKER_RE.test(ticker) && MAJOR_COINS[ticker]) {
      const major = await majorCoinProfile(ticker)
      if (major) {
        setCache(cacheKey, major, 3 * 60 * 1000)
        return major
      }
    }
  }

  // ── 3. Ticker or token name — search live, confirmed by the global listing ──
  const query = raw.replace(/^[$￥]+/, '')
  const pairs = (await dexSearch(query)) || []
  const groups = groupPairs(pairs)
  const upper = query.toUpperCase()

  if (groups.length) {
    const byTicker = groups.filter((g) => cleanSymbol(g.pair.baseToken?.symbol) === upper)
    const byName = groups.filter((g) => {
      const name = cleanSymbol(g.pair.baseToken?.name)
      const sym = cleanSymbol(g.pair.baseToken?.symbol)
      return name.includes(upper) || (sym && upper.includes(sym))
    })
    const ranked = byTicker.length ? byTicker : byName.length ? byName : groups
    const matchType = byTicker.length ? 'ticker' : byName.length ? 'name' : 'search'
    // Ambiguity is surfaced, not hidden: same ticker on different chains/mints.
    const candidates = groups.slice(0, 8).map(candidateCard)

    // A search index is not an authority: it serves counterfeit mints wearing
    // blue-chip tickers with fabricated self-reported liquidity, ranked above
    // the real mint. The global listing publishes the canonical contract
    // addresses — when one of them has a live market in the results, THAT is
    // the token, no matter where its pool ranked.
    const canonSym = byTicker.length ? upper : cleanSymbol(ranked[0]?.pair?.baseToken?.symbol) || upper
    const canon = await canonicalCoin(canonSym)
    let canonPrice = num(canon?.market_data?.current_price?.usd) || null
    let cas = platformCAs(canon)
    let canonRank = num(canon?.market_cap_rank) || null
    if (!cas.length) {
      // CoinGecko's free API is throttled from shared cloud IPs; the keyed CMC
      // quote is the backup authority — it publishes the canonical platform
      // token_address and rank for the ticker's highest-ranked listing.
      try {
        const rawItem = (await cmcQuote(canonSym))?.data?.[canonSym]
        const items = Array.isArray(rawItem) ? rawItem : rawItem ? [rawItem] : []
        const item = items
          .slice()
          .sort((a, b) => (num(a.cmc_rank) || 1e9) - (num(b.cmc_rank) || 1e9))[0]
        const addr = item?.platform?.token_address
        if (addr && String(addr).length >= 26) {
          cas = [{ chain: String(item.platform?.symbol || '').toLowerCase(), ca: String(addr) }]
        }
        if (!canonRank) canonRank = num(item?.cmc_rank) || null
        if (!canonPrice) canonPrice = num(item?.quote?.usd?.price) || null
      } catch (err) {
        console.warn('[tokenResolver] cmc canonical fallback skipped:', err.message)
      }
    }
    const confirmed = cas.length
      ? ranked.find((g) => cas.some((c) => c.ca.toLowerCase() === String(g.pair?.baseToken?.address || '').toLowerCase()))
      : null

    let out = null
    if (confirmed) {
      out = await resolveByCa(String(confirmed.pair.baseToken.address), { matchType, candidates })
    }
    if (!out && cas.length) {
      // The global listing publishes contract addresses the search index never
      // served (a bridge pair on some side-chain outranked the real mint).
      // Resolve the canonical address directly — that IS the asset whose price
      // the global tape is quoting, with its real artwork, pools and tape.
      const searchAgrees =
        canonPrice > 0 &&
        ranked.some((g) => {
          const p = num(g.pair?.priceUsd)
          return p > 0 && p >= canonPrice / 3 && p <= canonPrice * 3
        })
      // A bare ticker means the globally established asset: when the canonical
      // listing ranks in the top 1000, trust its published address even if the
      // search only surfaced same-ticker strangers at contradictory prices.
      // Obscure canons keep the price-agreement guard so small caps are never
      // hijacked — a genuine small-cap collision can paste its CA instead.
      const established = canonRank > 0 && canonRank <= 1000
      if (established || searchAgrees) {
        for (const c of cas.slice(0, 3)) {
          try {
            out = await resolveByCa(c.ca, { matchType })
          } catch (err) {
            console.warn('[tokenResolver] canonical address resolve skipped:', err.message)
          }
          if (out) break
        }
      }
    }
    if (!out) {
      // No canonical address confirmed: take the deepest pool whose price
      // agrees with the global tape, quoted in a real trading asset.
      const profile = identityFromPair(pickVettedGroup(ranked, canonPrice).pair)
      profile.matchType = matchType
      out = await hydrate(profile, candidates)
    }
    setCache(cacheKey, out, 5 * 60 * 1000)
    return out
  }

  // ── 4. Plain ticker with no live DEX pair — zero fallback (major coins already tried) ──
  if (TICKER_RE.test(raw)) {
    const out = {
      symbol: cleanSymbol(raw) || upper,
      name: cleanSymbol(raw) || upper,
      chain: null,
      chainLabel: null,
      ca: null,
      isCA: false,
      priceUsd: 0,
      marketCap: 0,
      volume24h: 0,
      liquidityUsd: 0,
      exchange: null,
      logo: null,
      banner: null,
      description: null,
      categories: [],
      socials: [],
      websites: [],
      priceHistory: [],
      resolved: false,
      matchType: 'ticker_unverified',
    }
    // CEX-only listings have no DEX pair but a real global aggregate tape —
    // pull it instead of printing a zeroed-out dashboard.
    try {
      await globalMarketOverlay(out)
    } catch (err) {
      console.warn('[tokenResolver] ticker overlay skipped:', err.message)
    }
    if (out.globalMarket) {
      out.matchType = 'global_listing'
      out.resolved = true
    }
    consensusMarket(out)
    if (!out.marketCap && out.priceUsd > 0 && out.circulatingSupply > 0) {
      out.marketCap = out.priceUsd * out.circulatingSupply
    }
    setCache(cacheKey, out, 2 * 60 * 1000)
    return out
  }

  throw new Error(`Couldn't find "${raw}" on live markets — try a ticker, a full token name, or paste the contract address.`)
}
