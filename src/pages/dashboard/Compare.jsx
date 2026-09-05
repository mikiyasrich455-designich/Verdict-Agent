// Compare agent — head-to-head token comparison (up to 4).
import { useMemo, useState } from 'react'
import { Scale, Crown, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import VerdictBadge, { verdictColor } from '../../components/VerdictBadge'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'

const POPULAR_TOKENS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC']
import { fetchCompare } from '../../lib/api'
import { PageHeader, Panel, Chip, fmtUsd, fmtPct, changeColor, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'

const PILLARS = ['technical', 'market', 'risk', 'catalyst', 'sentiment']
const PILLAR_LABEL = { technical: 'TECH', market: 'MKT', risk: 'RISK', catalyst: 'CAT', sentiment: 'SENT' }

function TokenColumn({ t, winner, delay }) {
  return (
    <div
      className={`glass-panel !p-4 flex flex-col gap-3 ${winner ? 'ring-1 ring-accent/50 shadow-[0_0_30px_rgba(43,104,255,0.15)]' : ''}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-snow leading-none flex items-center gap-1.5">
            {t.symbol}
            {winner && <Crown size={13} className="text-warning" />}
          </p>
          <p className="text-[10.5px] text-faint truncate mt-1">{t.name}</p>
        </div>
        <VerdictBadge verdict={t.verdict} size="sm" animate={false} />
      </div>

      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[13px] text-snow/90">{fmtUsd(t.priceUsd)}</span>
        <span className={`font-mono text-[11.5px] ${changeColor(t.change24h)}`}>{fmtPct(t.change24h)}</span>
      </div>

      {/* pillar bars */}
      <div className="space-y-1.5">
        {PILLARS.map((k) => {
          const v = t.scores[k] ?? 0
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="font-mono text-[8.5px] tracking-[0.12em] text-faint w-9 flex-shrink-0">{PILLAR_LABEL[k]}</span>
              <div className="flex-1 h-1 rounded-full bg-white/6 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${v}%`, background: v >= 70 ? '#34d399' : v >= 50 ? '#fbbf24' : '#f87171' }}
                />
              </div>
              <span className="font-mono text-[9.5px] text-muted w-5 text-right">{v}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-auto pt-2 border-t border-white/5 space-y-1">
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Confidence</span><span className="text-snow/85 font-mono">{t.confidence}</span></div>
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Cap</span><span className="text-snow/85 font-mono">{fmtUsd(t.marketCap)}</span></div>
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Vol</span><span className="text-snow/85 font-mono">{fmtUsd(t.volume24h)}</span></div>
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Volatility</span><span className="text-snow/85 font-mono">{t.volatility}/100</span></div>
      </div>

      <Link to={`/dashboard/deep?token=${t.symbol}`} className="text-[11px] font-semibold text-accent hover:text-[#8fb3ff] transition-colors text-center">
        Deep dive →
      </Link>
    </div>
  )
}

export default function Compare() {
  const [picked, setPicked] = useState(['BTC', 'ETH', 'SOL'])
  const [runKey, rerun] = useRunKey()
  const { status, data } = useAgentData(() => fetchCompare(picked), [picked.join(','), runKey])

  const toggle = (s) =>
    setPicked((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length >= 4 ? prev : [...prev, s]))

  const winner = useMemo(() => {
    if (!data || data.length < 2) return null
    return [...data].sort((a, b) => b.confidence - a.confidence)[0].symbol
  }, [data])

  return (
    <>
      <PageHeader
        icon={Scale}
        title="Compare"
        subtitle="Put up to four tokens side by side — the council picks the strongest case."
        source={{ mode: 'live', name: 'live comparison' }}
      >
        <button onClick={rerun} className="glass-chip"><RefreshCw size={12} /> Re-run</button>
      </PageHeader>

      {/* selector */}
      <Panel title="Pick tokens · max 4" className="mb-4">
        <div className="flex flex-wrap gap-2">
          {POPULAR_TOKENS.map((s) => (
            <Chip key={s} active={picked.includes(s)} onClick={() => toggle(s)}>
              {s}
            </Chip>
          ))}
        </div>
        {picked.length < 2 && (
          <p className="text-[11px] text-warning mt-3">Pick at least two tokens to compare.</p>
        )}
      </Panel>

      {status === 'error' ? (
        <ErrorState error={data} onRetry={() => rerun()} />
      ) : status !== 'ready' || !data ? (
        <PageSkeleton />
      ) : (
        <>
          {winner && (
            <div className="glass-panel !py-3.5 !px-5 mb-4 flex items-center gap-3">
              <Crown size={16} className="text-warning flex-shrink-0" />
              <p className="text-[12.5px] text-snow/85">
                <span className="font-semibold text-snow">{winner}</span> carries the strongest combined evidence pack this round.
              </p>
              <span className="ml-auto font-mono text-[10px] text-faint tracking-[0.12em] hidden sm:block">AUTO-RANKED BY CONFIDENCE</span>
            </div>
          )}
          <div className={`grid gap-4 sm:grid-cols-2 ${data.length === 3 ? 'xl:grid-cols-3' : data.length >= 4 ? 'xl:grid-cols-4' : ''}`}>
            {data.map((t, i) => (
              <TokenColumn key={t.symbol} t={t} winner={winner === t.symbol} delay={i * 0.06} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
