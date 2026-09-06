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
  cgMarketChart,
  cmcQuote,
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
    // A pool search names pairs, not projects ("ACE / SOL") — the token record wins.
    if (attrs.name && (!profile.name || profile.name.includes('/') || profile.name === profile.symbol)) {
      profile.name = String(attrs.name).trim()
      profile.symbol = cleanSymbol(attrs.symbol) || profile.symbol
    }
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
  profile.cgCoinId = coin.id

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
    rememberSticky(profile)
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

  return {
    symbol: cleanSymbol(item.symbol) || upper,
    name: item.name || upper,
    chain: null,
    chainLabel: null,
    ca: null,
    isCA: false,
    priceUsd: num(usd.price),
    change24h: num(usd.percent_change_24h),
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
    matchType: 'cmc_major',
  }
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
      const deep =
        fallback.logo && fallback.description
          ? fallback
          : await deepenFromTokenRecord(fallback)
      const out = await hydrate(deep, [])
      setCache(cacheKey, out, 5 * 60 * 1000)
      return out
    }

    // Both indexers went quiet (they throttle shared cloud ranges hard). The
    // per-chain token record, then the launchpad that minted it, still answer.
    const record = (await gtTokenProfile(ca)) || (await pumpFunProfile(ca))
    if (record) {
      const out = await hydrate(record, [])
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

  // ── 3. Ticker or token name — search live, disambiguate by liquidity ──
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
    setCache(cacheKey, out, 2 * 60 * 1000)
    return out
  }

  throw new Error(`Couldn't find "${raw}" on live markets — try a ticker, a full token name, or paste the contract address.`)
}
