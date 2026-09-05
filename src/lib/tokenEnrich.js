// Browser-side token enrichment.
//
// The proxy resolves tokens from Render's shared egress IP, and the key-free public
// market APIs (DexScreener / GeckoTerminal / CoinGecko) rate-limit datacenter ranges
// hard — so a profile can come back with correct numbers but no logo, banner,
// description or chart. A visitor's own connection is not blocked, and both
// DexScreener and CoinGecko answer with `Access-Control-Allow-Origin: *`, so the
// browser fills the blanks itself.
//
// It only ever writes fields the server left empty: it can never overwrite a live
// number, a resolved identity or the contract address the page is pinned to.

const DEX = 'https://api.dexscreener.com/latest/dex'
const CG = 'https://api.coingecko.com/api/v3'
// Two ceilings, because this runs before the profile is painted: one request may
// stall for TIMEOUT, and the whole enrichment gets BUDGET before the page renders
// whatever has been filled so far. Without the budget a slow network leaves the
// console sitting on an empty dark screen for half a minute.
const TIMEOUT = 4500
const BUDGET = 9000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const blank = (v) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

function signal() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined
}

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: signal() })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function apply(target, patch) {
  let filled = false
  for (const [field, value] of Object.entries(patch)) {
    if (blank(value) || !blank(target[field])) continue
    target[field] = value
    filled = true
  }
  return filled
}

// ── DexScreener: branding + official links ──────────────────────────────────
async function fromDexScreener(p) {
  const doc = await getJson(`${DEX}/tokens/${encodeURIComponent(p.ca)}`)
  const wanted = String(p.ca).toLowerCase()
  const chain = String(p.chain || '').toLowerCase()
  const pairs = (doc?.pairs || []).filter((x) => String(x?.baseToken?.address || '').toLowerCase() === wanted)
  if (!pairs.length) return false

  pairs.sort((a, b) => {
    const sameChain = (x) => (String(x.chainId || '').toLowerCase() === chain ? 1 : 0)
    return sameChain(b) - sameChain(a) || (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
  })

  const best = pairs[0]
  const info = best.info || {}
  return apply(p, {
    logo: info.imageUrl,
    banner: info.header,
    socials: info.socials,
    websites: (info.websites || []).map((w) =>
      typeof w === 'string' ? { url: w, label: 'Website' } : { url: w?.url, label: w?.label || w?.app_name || 'Website' }
    ),
    website: (info.websites || []).map((w) => (typeof w === 'string' ? w : w?.url)).find(Boolean),
    dexUrl: best.url,
    pairName: best.pairName,
    quoteSymbol: best.quoteToken?.symbol,
  })
}

// ── CoinGecko: the "info thing" — what the project is, plus a real price tape ─
// CoinGecko's own platform slugs for the chains people actually paste addresses from.
const CG_PLATFORM = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  bsc: 'binance-smart-chain',
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
  ton: 'the-open-network',
  gnosis: 'xdai',
  xdai: 'xdai',
}

const SLIM =
  '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false'

async function resolveCoinId(p) {
  if (p.cgCoinId) return p.cgCoinId
  const wanted = String(p.ca).toLowerCase()
  const platform = CG_PLATFORM[String(p.chain || '').toLowerCase()]
  if (!platform) return null
  // /search?query=<address> never matches, so the contract endpoint is the only
  // exact address→coin mapping available.
  const hit = await getJson(`${CG}/coins/${platform}/contract/${encodeURIComponent(p.ca)}`)
  const listed = Object.values(hit?.platforms || {}).map((a) => String(a).toLowerCase())
  if (!hit?.id || (listed.length && !listed.includes(wanted))) return null
  return hit.id
}

// Thin listings come back with an empty 1-day series, so widen the window until
// there is something real to plot.
async function chartFor(coinId) {
  for (const days of [1, 7, 30]) {
    const chart = await getJson(`${CG}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`)
    if ((chart?.prices || []).length > 3) return { chart, days }
  }
  return null
}

async function fromCoinGecko(p) {
  const wanted = String(p.ca).toLowerCase()
  const coinId = await resolveCoinId(p)
  if (!coinId) return false
  p.cgCoinId = coinId
  const wantsChart = !(p.priceHistory || []).length
  const [coin, tape] = await Promise.all([
    getJson(`${CG}/coins/${encodeURIComponent(coinId)}${SLIM}`),
    wantsChart ? chartFor(coinId) : null,
  ])

  let filled = false
  if (coin) {
    // Trust but verify: the listed coin must publish our exact contract address.
    const listed = [
      coin.contract_address,
      ...Object.values(coin.platforms || {}),
      ...Object.values(coin.detail_platforms || {}),
    ].filter((v) => typeof v === 'string' && v.length > 8)
    const matches = !listed.length || listed.some((a) => String(a).toLowerCase() === wanted)

    if (matches) {
      const links = coin.links || {}
      const md = coin.market_data || {}
      filled = apply(p, {
        description: (coin.description?.en || '').replace(/\s*\n\s*/g, ' ').trim(),
        categories: (coin.categories || []).filter(Boolean).slice(0, 6),
        logo: coin.image?.large || coin.image?.small,
        website: (links.homepage || []).find(Boolean),
        whitepaper: links.whitepaper,
        explorer: (links.blockchain_site || []).find(Boolean),
        twitter: links.twitter_screen_name ? `https://x.com/${links.twitter_screen_name}` : null,
        telegram: links.telegram_channel_identifier ? `https://t.me/${links.telegram_channel_identifier}` : null,
        github: (links.repos_url?.github || []).find(Boolean),
        cgUrl: coin.url || `https://www.coingecko.com/en/coins/${coin.id}`,
        cgRank: coin.market_cap_rank,
        watchers: coin.watchlist_portfolio_users,
        ath: md.ath?.usd,
        athChangePct: md.ath_change_percentage?.usd,
        athDate: md.ath_date?.usd,
        atl: md.atl?.usd,
        atlChangePct: md.atl_change_percentage?.usd,
        atlDate: md.atl_date?.usd,
      })
    }
  }

  const prices = tape?.chart?.prices || []
  if (prices.length > 3) {
    const volumes = tape.chart.total_volumes || []
    const slice = prices.slice(-32)
    const offset = prices.length - slice.length
    p.priceHistory = slice.map(([t, price], i) => ({
      i,
      t,
      price: Number(price) || 0,
      volume: Number(volumes[offset + i]?.[1]) || 0,
    }))
    p.chartSource = `live history · last ${tape.days === 1 ? '24 hours' : `${tape.days} days`}`
    return true
  }
  return filled
}

/**
 * Fill any identity/art/info gaps on a server-resolved token profile.
 * Fail-soft by design: if the browser is blocked too, the profile is unchanged.
 */
export async function enrichProfile(profile) {
  const p = profile && typeof profile === 'object' ? { ...profile } : null
  if (!p || !p.ca || p.resolved === false) return profile

  const needsBranding = blank(p.logo) || blank(p.banner) || blank(p.socials) || blank(p.websites) || blank(p.dexUrl)
  const needsInfo =
    blank(p.description) || blank(p.categories) || blank(p.website) || blank(p.whitepaper) || blank(p.cgUrl) ||
    !(p.priceHistory || []).length

  if (!needsBranding && !needsInfo) return profile

  const jobs = []
  if (needsBranding) jobs.push(fromDexScreener(p).catch(() => false))
  if (needsInfo) jobs.push(fromCoinGecko(p).catch(() => false))

  // Enrichment is decoration, never a gate: whoever wins the race, the caller gets
  // a detached snapshot so nothing can mutate a profile React has already rendered.
  const work = Promise.all(jobs).then((done) => {
    if (done.some(Boolean)) p.browserEnriched = true
    return p
  })
  const raced = await Promise.race([work, wait(BUDGET).then(() => null)])
  return { ...(raced || p) }
}
