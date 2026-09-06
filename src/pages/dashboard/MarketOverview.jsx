// Market Overview agent — regime, fear & greed, breadth, movers.
import { Globe, RefreshCw, TrendingUp, TrendingDown, ArrowRight, Crosshair } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchMarketOverview, fetchVerdict, fetchTokenProfile } from '../../lib/api'
import { PageHeader, Panel, Stat, fmtUsd, fmtPct, changeColor, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'
import { SpinnerCard } from '../../components/ShadcnLoaders'
import VerdictBadge, { verdictColor } from '../../components/VerdictBadge'
import { getStoredToken } from '../../components/DashboardShell'

const REGIME_TONE = {
  'risk-on': 'text-success',
  neutral: 'text-warning',
  'risk-off': 'text-danger',
}

function FearGreedDial({ value, label }) {
  const angle = (value / 100) * 180
  const tone = value >= 60 ? '#34d399' : value >= 45 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative w-full max-w-[240px]">
        <svg viewBox="0 0 200 110" className="w-full">
          <defs>
            <linearGradient id="fgArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f87171" />
              <stop offset="0.5" stopColor="#fbbf24" />
              <stop offset="1" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="11" strokeLinecap="round" />
          <path
            d="M 16 100 A 84 84 0 0 1 184 100"
            fill="none"
            stroke="url(#fgArc)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${(angle / 180) * 264} 264`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
          <text x="100" y="88" textAnchor="middle" fill="#eef2ff" fontSize="30" fontWeight="700" fontFamily="'Plus Jakarta Sans', sans-serif">
            {value}
          </text>
        </svg>
      </div>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: tone }}>
        {label}
      </span>
    </div>
  )
}

function TokenFocusStrip({ token, focus }) {
  if (focus.status !== 'ready' || !focus.data) {
    return (
      <div className="mb-4">
        <SpinnerCard
          label={`Running ${token.toUpperCase()} through the verdict engine`}
          sub="Verdict, price and confidence for your token in this market context…"
        />
      </div>
    )
  }

  const { v, p } = focus.data
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="glass-panel !p-5 mb-4"
      style={{ borderColor: `${verdictColor(v.verdict)}38`, boxShadow: `0 0 34px ${verdictColor(v.verdict)}10` }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex items-center gap-4 lg:w-[280px] flex-shrink-0">
          <VerdictBadge verdict={v.verdict} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              <Crosshair size={11} /> Token in focus
            </p>
            <p className="font-display text-lg font-bold text-snow leading-tight mt-1">{p.symbol}</p>
            <p className="text-[11px] text-faint truncate">{p.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 flex-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Price</p>
            <p className="font-display text-lg font-bold text-snow mt-1">{fmtUsd(v.priceUsd)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">24h</p>
            <p className={`font-display text-lg font-bold mt-1 ${changeColor(v.change24h)}`}>{fmtPct(v.change24h)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Confidence</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#7aa2ff] to-[#2b68ff]" style={{ width: `${v.confidence}%` }} />
              </div>
              <span className="font-mono text-[12px] text-snow/85">{v.confidence}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Link to={`/dashboard/analysis?token=${p.symbol}`} className="glass-chip justify-center">
            Full analysis <ArrowRight size={12} />
          </Link>
          <Link to={`/dashboard/council?token=${p.symbol}`} className="glass-chip justify-center">
            Send to Council
          </Link>
        </div>
      </div>
    </motion.section>
  )
}

export default function MarketOverview() {
  const [runKey, rerun] = useRunKey()
  const { status, data, error: agentError } = useAgentData(() => fetchMarketOverview(), [runKey])
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || getStoredToken()
  const focus = useAgentData(
    () => (token
      ? Promise.all([fetchVerdict(token), fetchTokenProfile(token)]).then(([v, p]) => ({ v, p }))
      : Promise.resolve(null)),
    [token]
  )

  if (status === 'error') {
    return (
      <>
        <PageHeader icon={Globe} title="Market Overview" subtitle="Reading the regime so every other agent knows the weather." source={{ mode: 'live', name: 'live market data' }} />
        {token && <TokenFocusStrip token={token} focus={focus} />}
        <ErrorState error={agentError} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={Globe} title="Market Overview" subtitle="Reading the regime so every other agent knows the weather." source={{ mode: 'live', name: 'live market data' }} />
        {token && <TokenFocusStrip token={token} focus={focus} />}
        <PageSkeleton />
      </>
    )
  }

  const d = data
  const declining = Math.max(0, 100 - d.breadth.advancing)
  const focusSymbol = focus.data?.p?.symbol || token.toUpperCase()

  return (
    <>
      <PageHeader
        icon={Globe}
        title="Market Overview"
        subtitle="Reading the regime so every other agent knows the weather."
        source={{ mode: 'live', name: 'live market data' }}
      >
        <button onClick={rerun} className="glass-chip">
          <RefreshCw size={12} /> Refresh
        </button>
      </PageHeader>

      {token && <TokenFocusStrip token={token} focus={focus} />}

      {/* headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Regime" value={<span className={REGIME_TONE[d.regime] || 'text-snow'}>{d.regime.toUpperCase()}</span>} sub="Market posture right now" delay={0.02} />
        <Stat label="BTC Dominance" value={`${d.btcDominance}%`} sub="Share of total cap" delay={0.06} />
        <Stat label="Total Market Cap" value={`$${d.totalMarketCap.toFixed(2)}T`} sub="All crypto assets" delay={0.1} />
        <Stat label="24h Volume" value={`$${d.volume24h.toFixed(1)}B`} sub="Cross-market turnover" delay={0.14} />
      </div>

      <div className="grid lg:grid-cols-5 gap-4 mb-4">
        {/* fear & greed */}
        <Panel title="Fear & Greed Index" delay={0.16} className="lg:col-span-2">
          <FearGreedDial value={d.fearGreed} label={d.fgLabel} />
          <p className="text-[12px] text-muted text-center leading-relaxed mt-1">
            {d.fearGreed >= 60
              ? 'Confidence is elevated — momentum trades work, euphoria risk rises.'
              : d.fearGreed >= 45
              ? 'Balanced sentiment — selectivity beats conviction here.'
              : 'Fear dominates — capital preservation mode, dips get bought slowly.'}
          </p>
        </Panel>

        {/* breadth */}
        <Panel title="Market Breadth" delay={0.2} className="lg:col-span-2">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="font-display text-2xl font-bold text-success">{d.breadth.advancing}%</p>
              <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1"><TrendingUp size={11} /> advancing</p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-danger">{declining}%</p>
              <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1 justify-end"><TrendingDown size={11} /> declining</p>
            </div>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-white/5 mb-3">
            <div className="bg-gradient-to-r from-[#34d399] to-[#10b981]" style={{ width: `${d.breadth.advancing}%` }} />
            <div className="bg-gradient-to-r from-[#ef4444] to-[#f87171]" style={{ width: `${declining}%` }} />
          </div>
          <p className="text-[12px] text-muted leading-relaxed">
            {d.breadth.advancing >= 55
              ? 'Broad participation — rallies are confirmed by the tape, not just majors.'
              : d.breadth.advancing >= 40
              ? 'Mixed participation — leadership is narrow; follow the movers, not the index.'
              : 'Narrow tape — downside breadth warns against aggressive entries.'}
          </p>
          <div className="mt-4 pt-3 border-t border-white/5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-2">Agent note</p>
            <p className="text-[12px] text-snow/80 leading-relaxed">
              {d.regime === 'risk-on'
                ? 'Council and analysis agents run aggressive playbooks in this regime.'
                : d.regime === 'risk-off'
                ? 'Risk Desk tightens stops automatically when the regime flips risk-off.'
                : 'Neutral regime — agents weight catalysts over momentum.'}
            </p>
          </div>
        </Panel>

        {/* movers */}
        <Panel title="Biggest Movers" className="lg:col-span-1" delay={0.24}>
          <div className="space-y-1.5">
            {d.movers.map((m) => {
              const isFocus = m.symbol === focusSymbol
              return (
              <Link
                key={m.symbol}
                to={`/dashboard/analysis?token=${m.symbol}`}
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors group ${
                  isFocus ? 'bg-accent/10 ring-1 ring-accent/40' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-snow flex items-center gap-1.5">
                    {m.symbol}
                    {isFocus && <span className="text-[8px] font-mono tracking-[0.14em] text-accent border border-accent/40 rounded px-1 py-px">FOCUS</span>}
                  </p>
                  <p className="text-[10px] text-faint truncate">{m.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-snow/85 font-mono">{fmtUsd(m.priceUsd)}</p>
                  <p className={`text-[11px] font-mono ${changeColor(m.change24h)}`}>{fmtPct(m.change24h)}</p>
                </div>
                <ArrowRight size={12} className="text-faint opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>
              )
            })}
          </div>
        </Panel>
      </div>
    </>
  )
}
