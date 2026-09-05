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
const TIMEOUT = 8000

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
    websites: info.websites,
    website: (info.websites || []).map((w) => w?.url).find(Boolean),
    dexUrl: best.url,
    pairName: best.pairName,
    quoteSymbol: best.quoteToken?.symbol,
  })
}

// ── CoinGecko: the "info thing" — what the project is, plus a real price tape ─
async function fromCoinGecko(p) {
  const hits = await getJson(`${CG}/search?query=${encodeURIComponent(p.ca)}`)
  const wanted = String(p.ca).toLowerCase()
  const coinId = (hits?.coins || [])
    .filter((c) => Object.values(c.platforms || {}).some((a) => String(a).toLowerCase() === wanted))
    .map((c) => c.id)[0]
  if (!coinId) return false

  const wantsChart = !(p.priceHistory || []).length
  const [coin, chart] = await Promise.all([
    getJson(
      `${CG}/coins/${encodeURIComponent(coinId)}` +
        '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false'
    ),
    wantsChart ? getJson(`${CG}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=1`) : null,
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

  const prices = chart?.prices || []
  if (prices.length > 3) {
    const volumes = chart.total_volumes || []
    const slice = prices.slice(-32)
    p.priceHistory = slice.map(([t, price], i) => ({
      i,
      t,
      price: Number(price) || 0,
      volume: Number(volumes[volumes.length - slice.length + i]?.[1]) || 0,
    }))
    p.chartSource = 'CoinGecko market chart'
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
  const done = await Promise.all(jobs)
  if (done.some(Boolean)) p.browserEnriched = true
  return p
}
