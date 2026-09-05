// Scout agent — the meme / token hunter. Scans the market and returns
// ranked candidates with explicit select AND reject reasons.
import { Radar, RefreshCw, Check, X, ArrowRight, Pin, Swords } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchScan, fetchTokenProfile } from '../../lib/api'
import { PageHeader, Panel, fmtUsd, fmtPct, changeColor, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'
import { SkeletonCard } from '../../components/ShadcnLoaders'
import { getStoredToken } from '../../components/DashboardShell'

function MomentumBar({ value, selected }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            selected ? 'bg-gradient-to-r from-[#34d399] to-[#5b93ff]' : 'bg-gradient-to-r from-[#f87171]/70 to-[#fbbf24]/60'
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] ${selected ? 'text-success' : 'text-muted'}`}>{value}</span>
    </div>
  )
}

function CandidateCard({ c, delay, pinned }) {
  return (
    <div className={`glass-panel !p-4 ${pinned ? 'ring-1 ring-accent/50' : ''}`} style={{ transitionDelay: `${delay}s` }}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-7 h-7 flex-shrink-0 grid place-items-center rounded-full border ${
              c.selected
                ? 'text-success border-success/40 bg-success/10'
                : 'text-danger border-danger/35 bg-danger/10'
            }`}
          >
            {c.selected ? <Check size={13} strokeWidth={2.6} /> : <X size={13} strokeWidth={2.6} />}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-snow leading-none">{c.symbol}</p>
            <p className="text-[10.5px] text-faint truncate mt-0.5">{c.name}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[12px] font-mono text-snow/85">{fmtUsd(c.priceUsd)}</p>
          <p className={`text-[11px] font-mono ${changeColor(c.change24h)}`}>{fmtPct(c.change24h)}</p>
        </div>
      </div>

      <div className="mb-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1">Momentum</p>
        <MomentumBar value={c.momentum} selected={c.selected} />
      </div>

      <p className="text-[11.5px] text-muted leading-relaxed">{c.reason}</p>

      <Link
        to={`/dashboard/analysis?token=${c.symbol}`}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-[#8fb3ff] transition-colors"
      >
        Run Token Analysis <ArrowRight size={12} />
      </Link>
    </div>
  )
}

function PinnedTokenCard({ token, focus }) {
  if (focus.status !== 'ready' || !focus.data) {
    return <div className="mb-4"><SkeletonCard /></div>
  }

  const p = focus.data
  const momentum = Math.max(8, Math.min(97, Math.round(50 + p.change24h * 3)))

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="glass-panel !p-5 mb-4"
      style={{ borderColor: 'rgba(122,162,255,0.38)', boxShadow: '0 0 34px rgba(43,104,255,0.12)' }}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-3 md:w-[250px] flex-shrink-0">
          <span className="w-9 h-9 flex-shrink-0 grid place-items-center rounded-full border border-accent/45 bg-accent/10 text-accent">
            <Pin size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Your token · pinned</p>
            <p className="font-display text-lg font-bold text-snow leading-tight mt-0.5">{p.symbol}</p>
            <p className="text-[11px] text-faint truncate">{p.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 flex-1">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Price</p>
            <p className="font-display text-lg font-bold text-snow mt-1">{fmtUsd(p.priceUsd)}</p>
            <p className={`text-[11px] font-mono ${changeColor(p.change24h)}`}>{fmtPct(p.change24h)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Market cap</p>
            <p className="font-display text-lg font-bold text-snow mt-1">{fmtUsd(p.marketCap)}</p>
            <p className="text-[11px] text-faint">volatility {Math.round(p.volatility)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">Scout momentum</p>
            <MomentumBar value={momentum} selected={momentum >= 62} />
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Link to={`/dashboard/analysis?token=${p.symbol}`} className="glass-chip justify-center">
            Run Token Analysis <ArrowRight size={12} />
          </Link>
          <Link to={`/dashboard/council?token=${p.symbol}`} className="glass-chip justify-center">
            <Swords size={12} /> Council
          </Link>
        </div>
      </div>
      <p className="text-[11.5px] text-muted mt-3.5 pt-3 border-t border-white/5 break-words">
        Scout ran {p.symbol} through the same filter as every candidate below — momentum {momentum}/100{momentum >= 62 ? ' clears the selection bar.' : ' sits below the selection bar, so it would not auto-qualify. Run the full analysis for the deeper read.'}
      </p>
    </motion.div>
  )
}

export default function Scout() {
  const [runKey, rerun] = useRunKey()
  const { status, data } = useAgentData(() => fetchScan(), [runKey])
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || getStoredToken()
  const focus = useAgentData(
    () => (token ? fetchTokenProfile(token) : Promise.resolve(null)),
    [token]
  )

  if (status === 'error') {
    return (
      <>
        <PageHeader icon={Radar} title="Scout" subtitle="The token hunter — scans the tape and keeps only what survives the filter." source={{ mode: 'live', name: 'RYO scan_market' }} />
        <ErrorState error={data} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={Radar} title="Scout" subtitle="The token hunter — scans the tape and keeps only what survives the filter." source={{ mode: 'live', name: 'RYO scan_market' }} />
        {token && <PinnedTokenCard token={token} focus={focus} />}
        <PageSkeleton />
      </>
    )
  }

  const selected = data.filter((c) => c.selected)
  const rejected = data.filter((c) => !c.selected)
  const pinnedSymbol = focus.data?.symbol || ''

  return (
    <>
      <PageHeader
        icon={Radar}
        title="Scout"
        subtitle="The token hunter — scans the tape and keeps only what survives the filter."
        source={{ mode: 'live', name: 'RYO scan_market' }}
      >
        <button onClick={rerun} className="glass-chip">
          <RefreshCw size={12} /> Re-scan
        </button>
      </PageHeader>

      {token && <PinnedTokenCard token={token} focus={focus} />}

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div className="glass-panel !p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Scanned</p>
          <p className="font-display text-2xl font-bold text-snow mt-1">{data.length}</p>
          <p className="text-[11px] text-muted mt-0.5">candidates this pass</p>
        </div>
        <div className="glass-panel !p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Selected</p>
          <p className="font-display text-2xl font-bold text-success mt-1">{selected.length}</p>
          <p className="text-[11px] text-muted mt-0.5">momentum ≥ 62 + liquidity</p>
        </div>
        <div className="glass-panel !p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Rejected</p>
          <p className="font-display text-2xl font-bold text-danger mt-1">{rejected.length}</p>
          <p className="text-[11px] text-muted mt-0.5">with explicit reasons</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={`Watchlist · ${selected.length}`} delay={0.1}>
          {selected.length ? (
            <div className="space-y-3">
              {selected.map((c, i) => (
                <CandidateCard key={c.symbol} c={c} delay={i * 0.05} pinned={c.symbol === pinnedSymbol} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted py-6 text-center">Nothing survived the filter this pass. That is a signal too.</p>
          )}
        </Panel>

        <Panel title={`Rejected · ${rejected.length}`} delay={0.16}>
          {rejected.length ? (
            <div className="space-y-3">
              {rejected.map((c, i) => (
                <CandidateCard key={c.symbol} c={c} delay={i * 0.05} pinned={c.symbol === pinnedSymbol} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted py-6 text-center">Every candidate cleared — rare, and worth extra caution.</p>
          )}
        </Panel>
      </div>
    </>
  )
}
