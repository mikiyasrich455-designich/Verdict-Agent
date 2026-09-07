// Token Analysis — the full live profile of ONE asset.
// Identity comes from the contract address, never from a ticker guess: the same
// "ACE" is a $19M gaming token on one chain and a $24K Solana token on another.
// Everything here (logo, banner, description, links, cap, volume, liquidity,
// venue, candles) is pulled live from DexScreener + GeckoTerminal + CoinGecko.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity, AlertTriangle, ArrowUpRight, Check, Copy,
  Layers, Microscope, ShieldAlert, Sparkles,
  Swords, Wallet, Search, Coins, Timer, Gauge,
} from 'lucide-react'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchTokenProfile } from '../../lib/api'
import { setActiveToken, tokenHref } from '../../lib/activeToken'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow, SourceRow,
  TokenLogo, MicroLabel, TONES,
} from '../../components/ConsoleUI'
import { ErrorState, fmtUsd, fmtPrice, fmtPct, fmtNum } from '../../components/DashUI'
import PercentLoader from '../../components/loaders/PercentLoader'

function CopyChip({ value }) {
  const [done, setDone] = useState(false)
  if (!value) return null
  const short = value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
  return (
    <button
      type="button"
      title={value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        } catch {
          /* clipboard blocked — the full address is still in the tooltip */
        }
      }}
      className="cv-chip !rounded-full font-mono"
    >
      {done ? <Check size={11} style={{ color: TONES.up }} /> : <Copy size={11} />}
      <span>{short}</span>
    </button>
  )
}

function StancePill({ label, tone }) {
  const color = TONES[tone] || TONES.blue
  return (
    <span
      className="rounded-full px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]"
      style={{ color, background: `${color}14`, border: `1px solid ${color}55`, boxShadow: `0 0 18px ${color}33` }}
    >
      {label}
    </span>
  )
}

function MiniChange({ k, v }) {
  const up = Number(v) >= 0
  return (
    <div className="rounded-xl border border-[rgba(126,156,255,0.14)] bg-[rgba(255,255,255,0.03)] px-1 py-2.5 text-center">
      <MicroLabel>{k}</MicroLabel>
      <p className={`mt-0.5 text-[13px] sm:text-[15px] font-bold truncate ${up ? 'cv-delta up' : 'cv-delta down'}`}>{fmtPct(v)}</p>
    </div>
  )
}

function PriceChart({ history, change }) {
  const { line, area, maxVol, first, last } = useMemo(() => {
    const pts = (history || []).map((p) => Number(p.price)).filter((n) => Number.isFinite(n))
    if (pts.length < 2) return { line: '', area: '', maxVol: 0, first: 0, last: 0 }
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const range = max - min || Math.abs(max) * 0.01 || 1
    const w = 100
    const h = 34
    const step = w / (pts.length - 1)
    const coords = pts.map((v, i) => [i * step, h - ((v - min) / range) * (h - 5) - 2.5])
    const path = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
    return {
      line: path,
      area: `${path} L${w} ${h} L0 ${h} Z`,
      maxVol: Math.max(1, ...(history || []).map((p) => Number(p.volume) || 0)),
      first: pts[0],
      last: pts[pts.length - 1],
    }
  }, [history])

  const up = Number(change) >= 0
  const stroke = up ? TONES.up : TONES.down
  const bars = (history || []).slice(-48)

  if (!line) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center px-6 text-center">
        <Activity size={20} className="mb-2" style={{ color: '#66739a' }} />
        <p className="text-[12.5px] leading-relaxed" style={{ color: '#8b98bd' }}>
          No hourly candles published for this pool yet. Every number on this page is still live —
          there is just nothing chartable on this market yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-[150px] w-full" aria-label="Hourly price action">
        <defs>
          <linearGradient id="tokenFillV2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tokenFillV2)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex h-9 items-end gap-[2px]">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            title={`${new Date(Number(b.t)).toLocaleString()} · ${fmtUsd(b.volume)}`}
            style={{
              height: `${Math.max(3, ((Number(b.volume) || 0) / maxVol) * 100)}%`,
              background: 'rgba(110, 168, 255, 0.32)',
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <MicroLabel>{bars.length} hourly candles · {fmtPrice(first)} → {fmtPrice(last)}</MicroLabel>
        <span className={`cv-delta ${up ? 'up' : 'down'}`}>{fmtPct(change)} over the window</span>
      </div>
    </div>
  )
}

// Live payloads vary by source — coerce every field the UI reads so a
// malformed response can never crash the screen.
const str = (v) => (typeof v === 'string' && v ? v : null)
const num = (v) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
const arr = (v) => (Array.isArray(v) ? v : [])
function sanitizeProfile(d) {
  if (!d || typeof d !== 'object') d = {}
  const sentiment = d.sentiment && typeof d.sentiment === 'object' ? d.sentiment : {}
  return {
    ...d,
    name: str(d.name) || str(d.symbol) || 'Unknown token',
    symbol: str(d.symbol) || '???',
    chain: str(d.chain),
    chainLabel: str(d.chainLabel),
    ca: str(d.ca) || str(d.contractAddress),
    pairAddress: str(d.pairAddress || d.poolAddress),
    logo: str(d.logo),
    banner: str(d.banner),
    description: str(d.description),
    website: str(d.website),
    twitter: str(d.twitter),
    telegram: str(d.telegram),
    github: str(d.github),
    whitepaper: str(d.whitepaper),
    dexUrl: str(d.dexUrl),
    explorer: str(d.explorer),
    cgUrl: str(d.cgUrl),
    chartSource: str(d.chartSource),
    priceUsd: num(d.priceUsd),
    change1h: num(d.change1h),
    change6h: num(d.change6h),
    change24h: num(d.change24h),
    marketCap: num(d.marketCap),
    fdv: num(d.fdv),
    volume24h: num(d.volume24h),
    liquidityUsd: num(d.liquidityUsd),
    poolLiquidityUsd: num(d.poolLiquidityUsd),
    totalReserveUsd: num(d.totalReserveUsd),
    pairAgeDays: num(d.pairAgeDays),
    circulatingSupply: num(d.circulatingSupply),
    totalSupply: num(d.totalSupply),
    marketCapFdvRatio: num(d.marketCapFdvRatio),
    cgRank: num(d.cgRank),
    watchers: num(d.watchers),
    ath: num(d.ath),
    atl: num(d.atl),
    athChangePct: num(d.athChangePct),
    buys24h: num(d.buys24h),
    sells24h: num(d.sells24h),
    uniqueBuyers24h: num(d.uniqueBuyers24h),
    uniqueSellers24h: num(d.uniqueSellers24h),
    decimals: num(d.decimals),
    categories: arr(d.categories).filter((c) => typeof c === 'string'),
    socials: arr(d.socials),
    websites: arr(d.websites),
    candidates: arr(d.candidates),
    priceHistory: arr(d.priceHistory),
    catalysts: arr(d.catalysts),
    risks: arr(d.risks),
    sentiment: {
      bull: num(sentiment.bull) || 0,
      bear: num(sentiment.bear) || 0,
      neutral: num(sentiment.neutral) || 0,
    },
    isCA: Boolean(d.isCA),
  }
}

function Loading() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <PercentLoader label="Crunching on-chain & fundamentals" />
    </div>
  )
}

export default function TokenAnalysis() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const ca = searchParams.get('ca') || ''
  const chain = searchParams.get('chain') || ''
  const [runKey, rerun] = useRunKey()

  const identity = ca ? { symbol: token, ca, chain } : null
  const { status, data, error } = useAgentData(
    () => (token ? fetchTokenProfile(token, identity) : null),
    [token, ca, chain, runKey]
  )

  if (!token) {
    return (
      <div className="cv-panel flex flex-col items-center px-6 py-14 text-center">
        <Search size={22} className="mb-3" style={{ color: '#66739a' }} />
        <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>No token selected</h3>
        <p className="mt-1.5 max-w-sm text-[13px]" style={{ color: '#8b98bd' }}>
          Paste a contract address, ticker, or token name in the search bar above. A contract address
          always wins — that is the only identity that cannot be confused.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState error={error} onRetry={rerun}>
        <p className="font-mono text-[11.5px] text-faint">
          {ca ? `contract ${ca}` : `query ${token}`} — no live market answered
        </p>
      </ErrorState>
    )
  }

  if (status !== 'ready' || !data) return <Loading />

  const p = sanitizeProfile(data)

  const volToCap = p.marketCap ? (p.volume24h / p.marketCap) * 100 : null
  const buys = Number(p.buys24h) || 0
  const sells = Number(p.sells24h) || 0
  const totalTx = buys + sells
  const bullShare = totalTx ? Math.round((buys / totalTx) * 100) : null
  const socials = Array.isArray(p.socials) ? p.socials : []
  const websites = Array.isArray(p.websites) ? p.websites : []
  const candidates = Array.isArray(p.candidates) ? p.candidates : []
  const findSocial = (re) => socials.find((s) => re.test(`${s.type} ${s.url}`))?.url
  const go = (t) => {
    setActiveToken({ ...t, resolved: true })
    navigate(tokenHref('/dashboard/analysis', t))
  }

  // ── the plain-English answer, derived only from live numbers ──
  const sentBull = p.sentiment.bull || 0
  const sentBear = p.sentiment.bear || 0
  let stance = 'No tape yet'
  let stanceTone = 'blue'
  let conf = null
  if (bullShare !== null) {
    conf = Math.max(bullShare, 100 - bullShare)
    stance = bullShare >= 55 ? 'Bullish tape' : bullShare <= 45 ? 'Bearish tape' : 'Contested tape'
    stanceTone = bullShare >= 55 ? 'up' : bullShare <= 45 ? 'down' : 'amber'
  } else if (sentBull + sentBear > 0) {
    conf = Math.max(sentBull, sentBear)
    stance = sentBull > sentBear ? 'Bullish read' : sentBull < sentBear ? 'Bearish read' : 'Even read'
    stanceTone = sentBull > sentBear ? 'up' : sentBull < sentBear ? 'down' : 'amber'
  }
  const answer = `${p.symbol} trades at ${fmtPrice(p.priceUsd)}, ${fmtPct(p.change24h)} on the day`
    + (volToCap !== null ? ` with ${fmtUsd(p.volume24h)} of tape (${volToCap.toFixed(1)}% of cap)` : '')
    + (bullShare !== null ? ` and ${bullShare}% of trades hitting the bid` : '')
    + ` — ${fmtUsd(p.liquidityUsd)} of liquidity on ${p.chainLabel || p.chain || 'chain'}.`

  const sparkPts = p.priceHistory.slice(-24).map((x) => Number(x.price)).filter((n) => Number.isFinite(n))
  const upTone = (p.change24h ?? 0) >= 0 ? 'up' : 'down'

  const sentimentLeft = sentBull + sentBear > 0 ? sentBull : (bullShare ?? 50)
  const sentimentRight = sentBull + sentBear > 0 ? sentBear : (bullShare !== null ? 100 - bullShare : 50)

  const sources = [
    { title: 'Project website', url: p.website || websites[0]?.url, tag: 'web' },
    { title: 'X / Twitter', url: p.twitter || findSocial(/twitter|x\.com/i), tag: 'social' },
    { title: 'Telegram', url: p.telegram || findSocial(/telegram/i), tag: 'social' },
    { title: 'GitHub', url: p.github || findSocial(/github/i), tag: 'code' },
    { title: 'Whitepaper', url: p.whitepaper, tag: 'docs' },
    { title: 'Live chart venue', url: p.dexUrl, tag: 'dex' },
    { title: 'Block explorer', url: p.explorer, tag: 'chain' },
    { title: 'Market listing', url: p.cgUrl, tag: 'index' },
  ].filter((s) => s.url)

  return (
    <div className="flex flex-col gap-4">
      {/* ── identity: the token's own banner, logo, CA and venue ─────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="cv-panel relative overflow-hidden"
      >
        {p.banner && (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-25 bg-cover bg-center"
            style={{ backgroundImage: `url(${p.banner})` }}
          />
        )}
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(6,9,22,0.94), rgba(6,9,22,0.72) 55%, rgba(6,9,22,0.45))' }} />
        <div className="relative p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-4">
              <TokenLogo src={p.logo} symbol={p.symbol} size={54} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="max-w-[16ch] truncate text-xl font-bold tracking-tight md:text-2xl" style={{ color: '#f4f8ff' }}>
                    {p.name}
                  </h1>
                  <span className="font-mono text-[15px]" style={{ color: TONES.blue }}>${p.symbol}</span>
                  {p.chainLabel && <span className="cv-chip !py-0.5">{p.chainLabel}</span>}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <CopyChip value={p.ca} />
                  {(p.categories || []).slice(0, 4).map((c) => (
                    <span key={c} className="cv-chip !py-0.5 opacity-80">{c}</span>
                  ))}
                </div>
                {p.description && (
                  <p className="mt-3 max-w-2xl break-words text-[12.5px] leading-relaxed" style={{ color: '#aebfe4' }}>
                    {p.description}
                  </p>
                )}
              </div>
            </div>
            <div className="ml-auto text-right">
              <MicroLabel>Price</MicroLabel>
              <p className="mt-1 text-3xl font-bold leading-none" style={{ color: '#f4f8ff' }}>{fmtPrice(p.priceUsd)}</p>
              <p className={`cv-delta mt-1.5 !text-[12px] ${upTone === 'up' ? 'up' : 'down'}`}>
                {fmtPct(p.change24h)} · 24h
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── the answer, first ── */}
      <AnswerBanner
        icon={Gauge}
        kicker={`Token analysis · ${p.symbol}`}
        answer={answer}
        stance={<StancePill label={stance} tone={stanceTone} />}
        confidence={conf}
        confidenceTone={stanceTone}
        chips={[
          p.chainLabel || p.chain || 'chain unknown',
          p.cgRank ? `global rank #${fmtNum(p.cgRank)}` : 'not globally ranked',
          p.pairAgeDays !== null && p.pairAgeDays !== undefined
            ? `pool age ${p.pairAgeDays >= 365 ? `${(p.pairAgeDays / 365).toFixed(1)}y` : `${Math.round(p.pairAgeDays)}d`}`
            : 'pool age unknown',
          `${fmtUsd(p.liquidityUsd)} liquidity`,
        ].filter(Boolean)}
      />

      {/* ── live numbers as glowing tiles ── */}
      <div className="cv-grid-stats">
        <StatTile icon={Coins} label="Market Cap" value={fmtUsd(p.marketCap)} foot={p.fdv ? `FDV ${fmtUsd(p.fdv)}` : 'FDV unavailable'} delay={0.02} />
        <StatTile
          icon={Activity}
          label="24h Volume"
          value={fmtUsd(p.volume24h)}
          foot={volToCap !== null ? `${volToCap.toFixed(1)}% of cap` : 'no tape'}
          delay={0.06}
        />
        <StatTile
          icon={Wallet}
          label="Liquidity"
          value={fmtUsd(p.liquidityUsd)}
          foot={p.poolLiquidityUsd ? `pool ${fmtUsd(p.poolLiquidityUsd)}` : 'pool reserve n/a'}
          delay={0.1}
        />
        <StatTile
          icon={Timer}
          label="Pair Age"
          value={
            p.pairAgeDays === null || p.pairAgeDays === undefined
              ? '—'
              : p.pairAgeDays >= 365
                ? `${(p.pairAgeDays / 365).toFixed(1)}y`
                : `${Math.round(p.pairAgeDays)}d`
          }
          foot={p.pairCreatedAt ? new Date(p.pairCreatedAt).toLocaleDateString() : 'unlisted pool'}
          delay={0.14}
        />
        <StatTile
          icon={Gauge}
          label="Tape 24h"
          value={totalTx ? `${fmtNum(buys)} / ${fmtNum(sells)}` : '—'}
          delta={bullShare !== null ? bullShare : undefined}
          deltaTone={bullShare !== null ? (bullShare >= 50 ? 'up' : 'down') : undefined}
          foot={bullShare !== null ? `${bullShare}% buys · ${fmtNum(p.uniqueBuyers24h || 0)} wallets` : 'no trades indexed'}
          delay={0.18}
        />
        <StatTile
          icon={Sparkles}
          label="Price"
          value={fmtPrice(p.priceUsd)}
          delta={p.change24h ?? undefined}
          spark={sparkPts}
          sparkTone={upTone}
          foot={`${fmtPct(p.change1h)} 1h · ${fmtPct(p.change6h)} 6h`}
          delay={0.22}
        />
      </div>

      <div className="cv-grid-2">
        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2
            icon={Activity}
            title="Price Action"
            right={<MicroLabel>{p.chartSource || 'no candle feed'}</MicroLabel>}
            delay={0.16}
          >
            <PriceChart history={p.priceHistory} change={p.change24h} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniChange k="1h" v={p.change1h} />
              <MiniChange k="6h" v={p.change6h} />
              <MiniChange k="24h" v={p.change24h} />
            </div>
          </PanelV2>

          <PanelV2 icon={Wallet} title="Supply & Valuation" delay={0.24}>
            {[
              ['Circulating', p.circulatingSupply ? `${fmtNum(p.circulatingSupply)} ${p.symbol}` : '—'],
              ['Total Supply', p.totalSupply ? `${fmtNum(p.totalSupply)} ${p.symbol}` : '—'],
              ['MC / FDV', p.marketCapFdvRatio ? p.marketCapFdvRatio.toFixed(2) : '—'],
              ['Global Rank', p.cgRank ? `#${fmtNum(p.cgRank)}` : 'not ranked'],
              ['Watchlists', p.watchers ? fmtNum(p.watchers) : '—'],
              ['Pool Reserve', fmtUsd(p.totalReserveUsd)],
              ['All-Time High', p.ath ? fmtPrice(p.ath) : '—'],
              ['vs ATH', p.athChangePct === null || p.athChangePct === undefined ? '—' : fmtPct(p.athChangePct)],
              ['All-Time Low', p.atl ? fmtPrice(p.atl) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="cv-rowline">
                <span className="cv-rowline-label">{k}</span>
                <span className="cv-rowline-cell text-right font-mono text-[12px]">{v}</span>
              </div>
            ))}
          </PanelV2>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2 icon={Sparkles} title="Crowd Sentiment" delay={0.2} right={<MicroLabel>live tape</MicroLabel>}>
            <ScoreBar left={sentimentLeft} right={sentimentRight} leftLabel="Bull" rightLabel="Bear" />
            <InsightRow
              icon={Activity}
              tone={stanceTone}
              title={
                bullShare === null
                  ? 'No 24h trade tape indexed for this pool yet'
                  : `${fmtNum(buys)} buys vs ${fmtNum(sells)} sells in 24h`
              }
              body={
                bullShare === null
                  ? 'The stance above is read off price structure instead of order flow.'
                  : `From ${fmtNum(p.uniqueBuyers24h || 0)} unique buyers and ${fmtNum(p.uniqueSellers24h || 0)} unique sellers.`
              }
            />
          </PanelV2>

          <PanelV2 icon={ShieldAlert} title="Identity & Sources" delay={0.26}>
            <div className="cv-rowline">
              <span className="cv-rowline-label">Chain</span>
              <span className="cv-rowline-cell text-right">{p.chainLabel || p.chain || 'unknown'}</span>
            </div>
            <div className="cv-rowline">
              <span className="cv-rowline-label">Contract</span>
              <span className="cv-rowline-cell truncate text-right font-mono text-[11px]">{p.ca || 'not published'}</span>
            </div>
            <div className="cv-rowline">
              <span className="cv-rowline-label">Pool / pair</span>
              <span className="cv-rowline-cell truncate text-right font-mono text-[11px]">{p.pairAddress || '—'}</span>
            </div>
            <div className="mt-3">
              {sources.map((s) => (
                <SourceRow key={s.tag + s.title} title={s.title} url={s.url} tag={s.tag} />
              ))}
              {sources.length === 0 && (
                <p className="text-[11.5px]" style={{ color: '#66739a' }}>No public links published for this token.</p>
              )}
            </div>
          </PanelV2>

          {candidates.length > 1 && (
            <PanelV2 icon={Layers} title={`Same ticker elsewhere · ${candidates.length}`} delay={0.32}>
              <p className="mb-3 text-[11.5px] leading-relaxed" style={{ color: '#8b98bd' }}>
                “{p.symbol}” is not unique. These are the other live markets that matched — click one to
                re-pin the whole console.
              </p>
              <div className="flex flex-col gap-2">
                {candidates.map((c) => {
                  const current = String(c.ca).toLowerCase() === String(p.ca).toLowerCase()
                  const Icon = current ? Check : ArrowUpRight
                  return (
                    <button
                      key={`${c.chain}-${c.ca}`}
                      type="button"
                      disabled={current}
                      onClick={() => go({ symbol: c.symbol, name: c.name, ca: c.ca, chain: c.chain, logo: c.logo })}
                      className="cv-source w-full"
                      style={current ? { borderColor: 'rgba(47,224,176,0.4)', background: 'rgba(47,224,176,0.08)' } : undefined}
                    >
                      <TokenLogo src={c.logo} symbol={c.symbol} size={24} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[12px]" style={{ color: '#eaf2ff' }}>{c.name}</span>
                        <span className="block truncate font-mono text-[10px]" style={{ color: '#66739a' }}>
                          {c.chainLabel || c.chain} · {fmtUsd(c.liquidityUsd)} liq
                        </span>
                      </span>
                      <Icon size={13} style={{ color: current ? TONES.up : '#66739a' }} />
                    </button>
                  )
                })}
              </div>
            </PanelV2>
          )}

          <PanelV2 icon={Microscope} title={`Run the stack on ${p.symbol}`} delay={0.36}>
            <div className="flex flex-wrap gap-2">
              <Link to={tokenHref('/dashboard/deep', p)} className="cv-chip"><Microscope size={12} /> Deep Analysis</Link>
              <Link to={tokenHref('/dashboard/council', p)} className="cv-chip"><Swords size={12} /> Council</Link>
              <Link to={tokenHref('/dashboard/risk', p)} className="cv-chip"><ShieldAlert size={12} /> Risk Desk</Link>
              <Link to={tokenHref('/dashboard/sentiment', p)} className="cv-chip"><Activity size={12} /> Sentiment</Link>
            </div>
          </PanelV2>
        </div>
      </div>

      {/* ── catalysts vs risks: the evidence, side by side ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <PanelV2 icon={Sparkles} title="Catalysts" right={<MicroLabel>{(p.catalysts || []).length} signals</MicroLabel>} delay={0.3}>
          {(p.catalysts || []).length === 0 ? (
            <p className="text-[12px]" style={{ color: '#66739a' }}>Nothing material flagged on this asset right now.</p>
          ) : (
            (p.catalysts || []).map((c, i) => {
              const text = typeof c === 'string' ? c : (c?.t || JSON.stringify(c))
              return <InsightRow key={i} icon={Check} tone="up" title={text} />
            })
          )}
        </PanelV2>
        <PanelV2 icon={AlertTriangle} title="Risk Flags" right={<MicroLabel>{(p.risks || []).length} flags</MicroLabel>} delay={0.34}>
          {(p.risks || []).length === 0 ? (
            <p className="text-[12px]" style={{ color: '#66739a' }}>No risk flags raised on this asset right now.</p>
          ) : (
            (p.risks || []).map((c, i) => {
              const text = typeof c === 'string' ? c : (c?.t || JSON.stringify(c))
              return <InsightRow key={i} icon={AlertTriangle} tone="down" title={text} />
            })
          )}
        </PanelV2>
      </div>
    </div>
  )
}
