// Token Analysis — the full live profile of ONE asset.
// Identity comes from the contract address, never from a ticker guess: the same
// "ACE" is a $19M gaming token on one chain and a $24K Solana token on another.
// Everything here (logo, banner, description, links, cap, volume, liquidity,
// venue, candles) is pulled live from DexScreener + GeckoTerminal + CoinGecko.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity, AlertTriangle, ArrowUpRight, Check, Copy, ExternalLink, FileText,
  Github, Globe, Layers, MessageCircle, Microscope, ShieldAlert, Sparkles,
  Swords, Twitter, Wallet, Search,
} from 'lucide-react'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchTokenProfile } from '../../lib/api'
import { setActiveToken, tokenHref } from '../../lib/activeToken'
import { Panel, Stat, Chip, ErrorState, fmtUsd, fmtPrice, fmtPct, fmtNum, changeColor } from '../../components/DashUI'

function SentimentSplit({ sentiment }) {
  const bull = Math.max(0, Math.min(100, Number(sentiment?.bull) || 0))
  const bear = Math.max(0, Math.min(100, Number(sentiment?.bear) || 0))
  const neutral = Math.max(0, 100 - bull - bear)
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden flex bg-white/5 mb-3">
        <div className="bg-gradient-to-r from-[#34d399] to-[#10b981]" style={{ width: `${bull}%` }} />
        <div className="bg-white/15" style={{ width: `${neutral}%` }} />
        <div className="bg-gradient-to-r from-[#ef4444] to-[#f87171]" style={{ width: `${bear}%` }} />
      </div>
      <div className="grid grid-cols-3 text-center">
        {[['Bull', bull, 'text-success'], ['Neutral', neutral, 'text-snow/70'], ['Bear', bear, 'text-danger']].map(([k, v, cls]) => (
          <div key={k}>
            <p className={`font-display text-lg font-bold ${cls}`}>{v}%</p>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-faint">{k}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

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
      className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full border border-line2 bg-white/[0.04] text-muted hover:text-snow hover:border-accent/50 transition-colors"
    >
      {done ? <Check size={11} className="text-success" /> : <Copy size={11} />}
      <span>{short}</span>
    </button>
  )
}

function LinkChip({ href, icon: Icon, children }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={href}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-line2 bg-white/[0.04] text-muted hover:text-snow hover:border-accent/50 transition-colors max-w-[230px]"
    >
      <Icon size={11} className="flex-shrink-0 text-accent" />
      <span className="truncate">{children}</span>
      <ExternalLink size={9} className="flex-shrink-0 opacity-50" />
    </a>
  )
}

function KV({ k, v, tone = '' }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11.5px] text-faint flex-shrink-0">{k}</span>
      <span className={`text-[12.5px] font-mono text-snow/85 text-right break-all ${tone}`}>{v}</span>
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
  const stroke = up ? '#34d399' : '#f87171'
  const bars = (history || []).slice(-48)

  if (!line) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center text-center px-6">
        <Activity size={20} className="text-faint mb-2" />
        <p className="text-[12.5px] text-muted leading-relaxed">
          No hourly candles published for this pool yet. Every number on this page is still live —
          there is just nothing chartable on this market yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="w-full h-[150px]" aria-label="Hourly price action">
        <defs>
          <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tokenFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex items-end gap-[2px] h-9 mt-1">
        {bars.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px] bg-accent/30"
            title={`${new Date(Number(b.t)).toLocaleString()} · ${fmtUsd(b.volume)}`}
            style={{ height: `${Math.max(3, ((Number(b.volume) || 0) / maxVol) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
        <p className="text-[11px] text-faint font-mono">
          {bars.length} hourly candles · {fmtPrice(first)} → {fmtPrice(last)}
        </p>
        <span className={`text-[11px] font-mono ${changeColor(change)}`}>{fmtPct(change)} over the window</span>
      </div>
    </div>
  )
}

// The route a lookup took stays internal — the UI says what was matched, not who
// answered it.
const MATCH_LABEL = {
  contract: 'contract address',
  contract_dexscreener: 'contract address',
  contract_geckoterminal: 'contract address',
  contract_pumpfun: 'contract address',
  ticker: 'ticker symbol',
  ticker_unverified: 'ticker symbol · unverified',
  name: 'token name',
  search: 'live search',
}
const matchLabel = (m) => MATCH_LABEL[m] || (m ? 'live market data' : '—')
const LAYER_LABEL = { RYO: 'AI reasoning', 'Live market structure': 'Live market data' }
const layerLabel = (v) => (v ? LAYER_LABEL[v] || 'live market data' : '—')

function Loading() {
  const steps = ['Reading the contract', 'Matching the network', 'Pulling price, cap & volume', 'Collecting logo, links & description']
  return (
    <div className="space-y-4">
      <div className="glass-panel relative overflow-hidden">
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.06] animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2.5 max-w-sm">
              <div className="h-5 w-40 rounded-md bg-white/[0.07] animate-pulse" />
              <div className="h-3 w-56 rounded-md bg-white/[0.05] animate-pulse" />
            </div>
            <div className="ml-auto text-right">
              <div className="h-3 w-14 rounded-md bg-white/[0.05] animate-pulse ml-auto" />
              <div className="h-7 w-24 rounded-md bg-white/[0.07] animate-pulse mt-2" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-panel !p-4">
            <div className="h-2.5 w-16 rounded bg-white/[0.05] animate-pulse" />
            <div className="h-6 w-20 rounded bg-white/[0.07] animate-pulse mt-2.5" />
          </div>
        ))}
      </div>

      <div className="glass-panel flex flex-col items-center py-9 px-6">
        <div className="inline-flex items-center gap-3 text-snow">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-sm">resolving token from live markets…</span>
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-center">
          {steps.map((s) => (
            <p key={s} className="text-[11.5px] font-mono text-faint">{s}…</p>
          ))}
        </div>
      </div>
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
  const [view, setView] = useState('catalysts')

  const identity = ca ? { symbol: token, ca, chain } : null
  const { status, data } = useAgentData(
    () => (token ? fetchTokenProfile(token, identity) : null),
    [token, ca, chain, runKey]
  )

  if (!token) {
    return (
      <div className="glass-panel flex flex-col items-center text-center py-14 px-6">
        <Search size={22} className="text-faint mb-3" />
        <h3 className="font-display font-semibold text-snow">No token selected</h3>
        <p className="text-[13px] text-muted mt-1.5 max-w-sm">
          Paste a contract address, ticker, or token name in the search bar above. A contract address
          always wins — that is the only identity that cannot be confused.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState error={data} onRetry={rerun}>
        <p className="text-[11.5px] text-faint font-mono">
          {ca ? `contract ${ca}` : `query ${token}`} — no live market answered
        </p>
      </ErrorState>
    )
  }

  if (status !== 'ready' || !data) return <Loading />

  let p
  try {
    p = data
    // Force a synchronous read to surface any shape issues early
    void p.marketCap
    void p.volume24h
  } catch (err) {
    console.error('[TOKEN-ANALYSIS] Data shape error:', err)
    return (
      <ErrorState error={err} onRetry={rerun}>
        <p className="text-[11.5px] text-faint font-mono">
          {ca ? `contract ${ca}` : `query ${token}`} — the live feed returned unexpected data
        </p>
      </ErrorState>
    )
  }

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

  return (
    <div className="space-y-4">
      {/* ── identity hero: the token's own banner, logo, CA and venue ─────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="glass-panel relative overflow-hidden"
      >
        {p.banner && (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-35 bg-cover bg-center"
            style={{ backgroundImage: `url(${p.banner})` }}
          />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-night/85 via-night/60 to-transparent" />
        <div className="relative p-5 md:p-6">
          <div className="flex items-start justify-between gap-5 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              {p.logo ? (
                <img src={p.logo} alt="" className="w-14 h-14 rounded-2xl object-cover border border-line2 flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-2xl grid place-items-center border border-line2 bg-white/[0.04] flex-shrink-0">
                  <Search size={20} className="text-accent" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-xl md:text-2xl font-bold text-snow tracking-tight leading-none truncate max-w-[15ch]">
                    {p.name}
                  </h1>
                  <span className="font-mono text-[15px] text-accent">${p.symbol}</span>
                  {p.chainLabel && (
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-line2 text-muted">
                      {p.chainLabel}
                    </span>
                  )}
                  {p.isCA && (
                    <span className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-success/35 bg-success/10 text-success">
                      pinned to contract
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <CopyChip value={p.ca} />
                  {p.decimals !== null && p.decimals !== undefined && (
                    <span className="text-[11px] font-mono text-faint">{p.decimals} decimals</span>
                  )}
                  {p.matchType && (
                    <span className="text-[11px] font-mono text-faint">matched by {matchLabel(p.matchType)}</span>
                  )}
                </div>
                {p.description && (
                  <p className="text-[12.5px] text-snow/70 leading-relaxed mt-3 max-w-2xl break-words">
                    {p.description}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right ml-auto">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Price</p>
              <p className="font-display text-3xl font-bold text-snow leading-none mt-1.5">{fmtPrice(p.priceUsd)}</p>
              <p className={`text-[12px] font-mono mt-1.5 ${changeColor(p.change24h)}`}>
                {fmtPct(p.change24h)} · 24h
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-4">
            <LinkChip href={p.website || websites[0]?.url} icon={Globe}>Website</LinkChip>
            <LinkChip href={p.twitter || findSocial(/twitter|x\.com/i)} icon={Twitter}>X</LinkChip>
            <LinkChip href={p.telegram || findSocial(/telegram/i)} icon={MessageCircle}>Telegram</LinkChip>
            <LinkChip href={p.github || findSocial(/github/i)} icon={Github}>GitHub</LinkChip>
            <LinkChip href={p.whitepaper} icon={FileText}>Whitepaper</LinkChip>
            <LinkChip href={p.dexUrl} icon={Layers}>{p.exchange || 'DEX'} pool</LinkChip>
            <LinkChip href={p.explorer} icon={Search}>Explorer</LinkChip>
            <LinkChip href={p.cgUrl} icon={ExternalLink}>Listing</LinkChip>
            {(p.categories || []).slice(0, 4).map((c) => (
              <span key={c} className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-line text-faint">
                {c}
              </span>
            ))}
          </div>
        </div>
      </motion.div>

      {p.aiNote && (
        <div className="glass-panel !py-3 !px-4 flex items-start gap-2.5 border-warning/30">
          <ShieldAlert size={14} className="text-warning mt-0.5 flex-shrink-0" />
          <p className="text-[12.5px] text-snow/80 leading-relaxed">{p.aiNote}</p>
        </div>
      )}

      {/* ── live numbers ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Market Cap" value={fmtUsd(p.marketCap)} sub={p.fdv ? `FDV ${fmtUsd(p.fdv)}` : 'FDV unavailable'} delay={0.02} />
        <Stat
          label="24h Volume"
          value={fmtUsd(p.volume24h)}
          sub={volToCap !== null ? `${volToCap.toFixed(1)}% of cap` : 'no tape'}
          delay={0.06}
        />
        <Stat
          label="Liquidity"
          value={fmtUsd(p.liquidityUsd)}
          sub={p.poolLiquidityUsd ? `pool ${fmtUsd(p.poolLiquidityUsd)}` : 'pool reserve n/a'}
          delay={0.1}
        />
        <Stat label="Venue" value={<span className="text-[17px] leading-7">{p.exchange || '—'}</span>} sub={p.pairName || 'DEX pair'} delay={0.14} />
        <Stat
          label="Pair Age"
          value={
            p.pairAgeDays === null || p.pairAgeDays === undefined
              ? '—'
              : p.pairAgeDays >= 365
                ? `${(p.pairAgeDays / 365).toFixed(1)}y`
                : `${Math.round(p.pairAgeDays)}d`
          }
          sub={p.pairCreatedAt ? new Date(p.pairCreatedAt).toLocaleDateString() : 'unlisted pool'}
          delay={0.18}
        />
        <Stat
          label="Tape 24h"
          value={<span className="text-[17px] leading-7">{totalTx ? `${fmtNum(buys)} / ${fmtNum(sells)}` : '—'}</span>}
          sub={bullShare !== null ? `${bullShare}% buys · ${fmtNum(p.uniqueBuyers24h || 0)} wallets` : 'no trades indexed'}
          tone={bullShare === null ? '' : bullShare >= 50 ? 'text-success' : 'text-danger'}
          delay={0.22}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Panel
            title={`Price Action · ${(p.priceHistory || []).length} live points`}
            icon={Activity}
            delay={0.16}
            actions={
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-faint truncate">
                {p.chartSource || 'no candle feed'}
              </span>
            }
          >
            <PriceChart history={p.priceHistory} change={p.change24h} />
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[['1h', p.change1h], ['6h', p.change6h], ['24h', p.change24h]].map(([k, v]) => (
                <div key={k} className="text-center rounded-xl border border-line bg-white/[0.03] py-2.5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-faint">{k}</p>
                  <p className={`font-display text-[15px] font-bold mt-0.5 ${changeColor(v)}`}>{fmtPct(v)}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Supply & Valuation" icon={Wallet} delay={0.24}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-4">
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
                <div key={k}>
                  <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-faint">{k}</p>
                  <p className="font-display text-[15px] font-semibold text-snow mt-1">{v}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title={view === 'catalysts' ? 'Catalysts' : 'Risk Flags'}
            icon={view === 'catalysts' ? Sparkles : AlertTriangle}
            delay={0.3}
            actions={
              <div className="flex gap-2">
                <Chip active={view === 'catalysts'} onClick={() => setView('catalysts')}>Catalysts</Chip>
                <Chip active={view === 'risks'} onClick={() => setView('risks')}>Risks</Chip>
              </div>
            }
          >
            <ul className="space-y-2.5">
              {(view === 'catalysts' ? p.catalysts || [] : p.risks || []).map((c, i) => {
                const text = typeof c === 'string' ? c : (c?.t || JSON.stringify(c))
                return (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-snow/75 leading-relaxed">
                    {view === 'catalysts'
                      ? <Check size={13} className="text-success mt-1 flex-shrink-0" />
                      : <AlertTriangle size={13} className="text-danger mt-1 flex-shrink-0" />}
                    <span>{text}</span>
                  </li>
                )
              })}
              {(view === 'catalysts' ? p.catalysts || [] : p.risks || []).length === 0 && (
                <li className="text-[13px] text-faint">Nothing material flagged on this asset right now.</li>
              )}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Crowd Sentiment" icon={Sparkles} delay={0.2}>
            <SentimentSplit sentiment={p.sentiment} />
            <p className="text-[12px] text-snow/70 leading-relaxed mt-4">
              {bullShare === null
                ? 'No 24h trade tape indexed for this pool yet — the stance is read off price structure instead.'
                : `${fmtNum(buys)} buys vs ${fmtNum(sells)} sells in 24h, from ${fmtNum(p.uniqueBuyers24h || 0)} buyers and ${fmtNum(p.uniqueSellers24h || 0)} sellers.`}
            </p>
          </Panel>

          <Panel title="Identity & Sources" icon={ShieldAlert} delay={0.26}>
            <div className="space-y-2">
              <KV k="Matched by" v={matchLabel(p.matchType)} />
              <KV k="Chain" v={p.chainLabel || p.chain || 'unknown'} />
              <KV k="Contract" v={p.ca || 'not published'} />
              <KV k="Pool / pair" v={p.pairAddress || p.poolAddress || '—'} />
              <KV k="Venue" v={p.exchange || '—'} />
              <KV k="Analysis layer" v={layerLabel(p.aiLayer)} tone={p.aiLayer === 'RYO' ? 'text-warning' : 'text-success'} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {[
                p.ca ? 'contract verified' : null,
                p.priceHistory?.length ? 'price history live' : null,
                p.description ? 'project info live' : null,
                p.logo ? 'artwork live' : null,
              ]
                .filter(Boolean)
                .map((s) => (
                  <span key={s} className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border border-line text-faint">
                    {s}
                  </span>
                ))}
            </div>
          </Panel>

          {candidates.length > 1 && (
            <Panel title={`Same ticker elsewhere · ${candidates.length}`} icon={Layers} delay={0.32}>
              <p className="text-[11.5px] text-faint leading-relaxed mb-3">
                “{p.symbol}” is not unique. These are the other live markets that matched — click one to
                re-pin the whole console.
              </p>
              <div className="space-y-2">
                {candidates.map((c) => {
                  const current = String(c.ca).toLowerCase() === String(p.ca).toLowerCase()
                  const Icon = current ? Check : ArrowUpRight
                  return (
                    <button
                      key={`${c.chain}-${c.ca}`}
                      type="button"
                      disabled={current}
                      onClick={() => go({ symbol: c.symbol, name: c.name, ca: c.ca, chain: c.chain, logo: c.logo })}
                      className={`w-full flex items-center gap-2.5 text-left rounded-xl border px-3 py-2 transition-colors ${
                        current
                          ? 'border-accent/40 bg-accent/10 cursor-default'
                          : 'border-line2 bg-white/[0.03] hover:border-accent/40'
                      }`}
                    >
                      {c.logo ? (
                        <img src={c.logo} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-white/5 flex-shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] text-snow truncate">{c.name}</span>
                        <span className="block text-[10.5px] text-faint font-mono truncate">
                          {c.chainLabel || c.chain} · {fmtUsd(c.liquidityUsd)} liq
                        </span>
                      </span>
                      <Icon size={13} className={current ? 'text-accent' : 'text-faint'} />
                    </button>
                  )
                })}
              </div>
            </Panel>
          )}

          <Panel title={`Run the stack on ${p.symbol}`} icon={Microscope} delay={0.36}>
            <div className="flex flex-wrap gap-2">
              <Link to={tokenHref('/dashboard/deep', p)} className="glass-chip"><Microscope size={12} /> Deep Analysis</Link>
              <Link to={tokenHref('/dashboard/council', p)} className="glass-chip"><Swords size={12} /> Council</Link>
              <Link to={tokenHref('/dashboard/risk', p)} className="glass-chip"><ShieldAlert size={12} /> Risk Desk</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
