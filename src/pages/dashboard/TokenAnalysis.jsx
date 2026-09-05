// Token Analysis agent — the full single-token profile dashboard.
// Accepts a ticker or contract address via ?token= (set from the topbar).
import { Crosshair, Zap, AlertTriangle, ArrowRight, Swords, ShieldAlert, Microscope } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchTokenProfile } from '../../lib/api'
import { PageHeader, Panel, Stat, EmptyState, fmtUsd, fmtPct, changeColor, SevPill, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'

const IMPACT_TONE = { high: 'sev-high', medium: 'sev-med', low: 'sev-low' }

function SentimentSplit({ s }) {
  return (
    <div>
      <div className="h-3 rounded-full overflow-hidden flex bg-white/5 mb-3">
        <div className="bg-gradient-to-r from-[#34d399] to-[#10b981]" style={{ width: `${s.bull}%` }} />
        <div className="bg-white/15" style={{ width: `${s.neutral}%` }} />
        <div className="bg-gradient-to-r from-[#ef4444] to-[#f87171]" style={{ width: `${s.bear}%` }} />
      </div>
      <div className="grid grid-cols-3 text-center">
        <div>
          <p className="font-display text-lg font-bold text-success">{s.bull}%</p>
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-faint">Bull</p>
        </div>
        <div>
          <p className="font-display text-lg font-bold text-snow/70">{s.neutral}%</p>
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-faint">Neutral</p>
        </div>
        <div>
          <p className="font-display text-lg font-bold text-danger">{s.bear}%</p>
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-faint">Bear</p>
        </div>
      </div>
    </div>
  )
}

export default function TokenAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [runKey, rerun] = useRunKey()
  const { status, data } = useAgentData(() => (token ? fetchTokenProfile(token) : null), [token, runKey])

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <>
        <PageHeader icon={Crosshair} title="Token Analysis" subtitle="Drop a ticker or contract address — get the full profile." source={{ mode: 'live', name: 'RYO analyze_token' }} />
        <EmptyState
          icon={Crosshair}
          title="Set a token first"
          hint="Enter a token on the Your Token page or use the search bar above to begin."
          action={<a href="/dashboard" className="glass-btn">Go to Your Token</a>}
        />
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader icon={Crosshair} title="Token Analysis" subtitle="Drop a ticker or contract address — get the full profile." source={{ mode: 'live', name: 'RYO analyze_token' }} />
        <ErrorState error={data} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={Crosshair} title="Token Analysis" subtitle="Drop a ticker or contract address — get the full profile." source={{ mode: 'live', name: 'RYO analyze_token' }} />
        <PageSkeleton />
      </>
    )
  }

  const p = data

  return (
    <>
      <PageHeader
        icon={Crosshair}
        title={
          <span>
            {p.name} <span className="text-accent font-mono text-base align-middle">· {p.symbol}</span>
          </span>
        }
        subtitle={p.isCA ? `Contract ${p.ca.slice(0, 10)}…${p.ca.slice(-6)}` : 'Full single-token profile'}
        source={{ mode: 'live', name: 'RYO analyze_token' }}
      >
        <div className="flex gap-2">
          <Link to={`/dashboard/deep?token=${p.symbol}`} className="glass-chip"><Microscope size={12} /> Deep Analysis</Link>
          <Link to={`/dashboard/council?token=${p.symbol}`} className="glass-chip"><Swords size={12} /> Council</Link>
          <Link to={`/dashboard/risk?token=${p.symbol}`} className="glass-chip"><ShieldAlert size={12} /> Risk Desk</Link>
        </div>
      </PageHeader>

      {/* headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Price" value={fmtUsd(p.priceUsd)} sub={<span className={changeColor(p.change24h)}>{fmtPct(p.change24h)} · 24h</span>} delay={0.02} />
        <Stat label="Market Cap" value={fmtUsd(p.marketCap)} sub="Fully diluted estimate" delay={0.06} />
        <Stat label="24h Volume" value={fmtUsd(p.volume24h)} sub={`${((p.volume24h / p.marketCap) * 100).toFixed(1)}% of cap`} delay={0.1} />
        <Stat label="Holders" value={p.holders.toLocaleString()} sub={`Volatility index ${p.volatility}/100`} delay={0.14} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* price chart */}
        <Panel title="Price Action · 32 bars" className="lg:col-span-2" delay={0.16}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={p.priceHistory} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="taFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5b93ff" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#5b93ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip
                  cursor={{ stroke: 'rgba(122,162,255,0.25)' }}
                  contentStyle={{ background: 'rgba(7,9,20,0.94)', border: '1px solid rgba(122,162,255,0.25)', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={() => p.symbol}
                  formatter={(v) => [fmtUsd(v), 'price']}
                />
                <Area type="monotone" dataKey="price" stroke="#7aa2ff" strokeWidth={2} fill="url(#taFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* sentiment */}
        <Panel title="Crowd Sentiment" delay={0.2}>
          <SentimentSplit s={p.sentiment} />
          <p className="text-[12px] text-muted leading-relaxed mt-4">
            {p.sentiment.bull > p.sentiment.bear + 15
              ? 'The crowd is positioned long — momentum has fuel, but crowded trades reverse hard.'
              : p.sentiment.bear > p.sentiment.bull + 15
              ? 'The crowd leans short — contrarian setups improve if structure holds.'
              : 'Crowd is split — expect chop until a catalyst picks a side.'}
          </p>
        </Panel>

        {/* catalysts */}
        <Panel title="Live Catalysts" icon={Zap} delay={0.24}>
          <div className="space-y-2.5">
            {p.catalysts.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                <div className="min-w-0">
                  <p className="text-[12.5px] text-snow/90">{c.t}</p>
                  <p className="text-[10px] font-mono text-faint mt-0.5">ETA · {c.eta}</p>
                </div>
                <span className={`sev-pill ${IMPACT_TONE[c.impact] || 'sev-low'}`}>{c.impact}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* risks */}
        <Panel title="Risk Flags" icon={AlertTriangle} delay={0.28}>
          <div className="space-y-2.5">
            {p.risks.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                <p className="text-[12.5px] text-snow/90">{r.t}</p>
                <SevPill sev={r.sev} />
              </div>
            ))}
          </div>
        </Panel>

        {/* next step CTA */}
        <Panel title="Keep Going" delay={0.32}>
          <div className="space-y-2">
            {[
              { to: `/dashboard/deep?token=${p.symbol}`, icon: Microscope, t: 'Run Deep Analysis', d: 'Five-pillar forensic read with reasoning' },
              { to: `/dashboard/council?token=${p.symbol}`, icon: Swords, t: 'Send to the Council', d: 'Bull vs Bear debate this token' },
              { to: `/dashboard/narrative?token=${p.symbol}`, icon: ArrowRight, t: 'Check the Narrative', d: 'What KOLs are saying right now' },
            ].map((x) => {
              const XIcon = x.icon
              return (
                <Link key={x.t} to={x.to} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5 hover:border-accent/40 hover:bg-accent/5 transition-colors group">
                  <span className="w-8 h-8 grid place-items-center rounded-lg bg-accent/10 text-accent flex-shrink-0">
                    <XIcon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-snow">{x.t}</span>
                    <span className="block text-[10.5px] text-faint">{x.d}</span>
                  </span>
                  <ArrowRight size={13} className="text-faint group-hover:text-accent transition-colors" />
                </Link>
              )
            })}
          </div>
        </Panel>
      </div>
    </>
  )
}
