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
  gtSearchPools,
  gtOhlcv,
  cgCoin,
  cgSearchByCa,
} from './marketData.js'

const EVM_CA_RE = /^0x[a-fA-F0-9]{40}$/
const BASE58_CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
// solscan/etherscan/dexscreener/birdeye/pump.fun/geckoterminal links, plus ?chain= hints
const CA_IN_URL_RE = /(?:token|coin|address|pair|pools?)\/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i
const TICKER_RE = /^[A-Za-z][A-Za-z0-9.$_-]{0,11}$/

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
    websites: Array.isArray(info.websites) ? info.websites : [],
    description: null,
    categories: [],
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
    if (num(attrs.price_usd)) profile.priceUsd = num(attrs.price_usd)
  }

  // Deepest GeckoTerminal pool wins the exchange label and the candle feed.
  const pools = (Array.isArray(detail?.included) ? detail.included : []).filter((i) => i?.type === 'pool')
  let bestPool = null
  let bestReserve = -1
  for (const pool of pools) {
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
    profile.chartSource = 'GeckoTerminal OHLCV'
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
  return {
    symbol: cleanSymbol(a.name)?.split(' ')[0] || 'UNKNOWN',
    name: a.name || 'Unknown',
    chain: chain || null,
    chainLabel: chainLabel(chain),
    ca,
    isCA: true,
    priceUsd: num(a.base_token_price_usd ?? a.token_price_usd),
    change24h: num(a.price_change_percentage?.h24),
    marketCap: num(a.market_cap_usd) || num(a.fdv_usd),
    fdv: num(a.fdv_usd),
    volume24h: num(a.volume_usd?.h24),
    liquidityUsd: num(a.reserve_in_usd),
    exchange: prettyDex(match.relationships?.dex?.data?.id),
    exchangeId: match.relationships?.dex?.data?.id || null,
    pairAddress: a.address || String(match.id || '').split('_').slice(1).join('_'),
    pairName: a.name || null,
    pairCreatedAt: a.pool_created_at ? Date.parse(a.pool_created_at) : null,
    buys24h: num(a.transactions?.h24?.buys),
    sells24h: num(a.transactions?.h24?.sells),
    logo: null,
    banner: null,
    socials: [],
    websites: [],
    description: null,
    categories: [],
    resolved: true,
    matchType: 'contract_geckoterminal',
  }
}

// ── CoinGecko: the "info thing" — what the project actually is ───────────────
async function applyCoinGecko(profile) {
  let coinId = profile.cgCoinId
  // GeckoTerminal has no CoinGecko link (or its detail call was rate-limited):
  // CoinGecko indexes contract addresses in search, so ask it directly.
  if (!coinId && profile.ca) {
    const hits = await cgSearchByCa(profile.ca)
    const wanted = String(profile.ca).toLowerCase()
    const hit = (hits || []).find((c) =>
      Object.values(c.platforms || {}).some((a) => String(a).toLowerCase() === wanted)
    )
    coinId = hit?.id || null
    if (coinId) profile.cgCoinId = coinId
  }
  if (!coinId) return profile
  const coin = await cgCoin(coinId)
  if (!coin) return profile

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

  const md = coin.market_data || {}
  const links = coin.links || {}

  profile.name = coin.name || profile.name
  profile.symbol = cleanSymbol(coin.symbol) || profile.symbol
  profile.description = (coin.description && coin.description.en) || profile.description
  profile.categories = Array.isArray(coin.categories) ? coin.categories.filter(Boolean).slice(0, 6) : []
  profile.logo = coin.image?.large || coin.image?.small || profile.logo
  profile.website = (links.homepage || []).find(Boolean) || null
  profile.whitepaper = links.whitepaper || null
  profile.explorer = (links.blockchain_site || []).find(Boolean) || null
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

// Shared tail: everything found by CA or by search gets the same enrichment.
async function hydrate(profile, candidates) {
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
  return profile
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
    const pairs = (await dexPairsByCa(ca)) || []
    const mine = pairs.filter((p) => String(p?.baseToken?.address || '').toLowerCase() === ca.toLowerCase())
    const groups = groupPairs(mine.length ? mine : pairs.filter((p) => p?.baseToken))

    if (groups.length) {
      const profile = identityFromPair(groups[0].pair)
      profile.ca = ca
      profile.isCA = true
      profile.matchType = 'contract'
      const out = await hydrate(profile, groups.slice(0, 6).map(candidateCard))
      setCache(cacheKey, out, 5 * 60 * 1000)
      return out
    }

    // DexScreener doesn't index every venue — ask GeckoTerminal directly.
    const fallback = await geckoFallback(ca)
    if (fallback) {
      const out = await hydrate(fallback, [])
      setCache(cacheKey, out, 5 * 60 * 1000)
      return out
    }

    throw new Error(`No live market found for ${shortAddr(ca)} — check the contract address and try again.`)
  }

  // ── 2. Ticker or token name — search live, disambiguate by liquidity ──
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
    const profile = identityFromPair(ranked[0].pair)
    profile.matchType = byTicker.length ? 'ticker' : byName.length ? 'name' : 'search'
    // Ambiguity is surfaced, not hidden: same ticker on different chains/mints.
    const candidates = groups.slice(0, 8).map(candidateCard)
    const out = await hydrate(profile, candidates)
    setCache(cacheKey, out, 5 * 60 * 1000)
    return out
  }

  // ── 3. Nothing live — plain ticker passes through unverified for RYO ──
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
    setCache(cacheKey, out, 2 * 60 * 1000)
    return out
  }

  throw new Error(`Couldn't find "${raw}" on live markets — try a ticker, a full token name, or paste the contract address.`)
}
