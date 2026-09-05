// Narrative agent — the Multi-KOL Narrative spotlight.
// Tracks KOL voices, flags convergence, and stamps every news item
// VERIFIED / UNVERIFIED / CONTRADICTED against on-chain evidence.
import { Radio, RefreshCw, Newspaper, Users, Target } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchNarrative } from '../../lib/api'
import { PageHeader, Panel, Stat, EmptyState, StancePill, StampPill, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'

const URGENCY_CLS = { high: 'sev-high', medium: 'sev-med', low: 'sev-low' }

function KolCard({ k, delay }) {
  return (
    <div className="glass-panel !p-4" style={{ transitionDelay: `${delay}s` }}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-snow leading-none">{k.handle}</p>
          <p className="text-[10px] text-faint mt-1">{k.followers} followers · {k.lastSeen}</p>
        </div>
        <StancePill stance={k.stance} />
      </div>

      <p className="text-[12px] text-snow/75 leading-relaxed italic">"{k.quote}"</p>

      <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-white/5">
        <div className="flex-1">
          <div className="flex justify-between text-[9px] font-mono text-faint mb-1">
            <span>CONVICTION</span>
            <span>{k.conviction}</span>
          </div>
          <div className="h-1 rounded-full bg-white/6 overflow-hidden">
            <div
              className={`h-full rounded-full ${k.stance === 'bullish' ? 'bg-[#34d399]' : k.stance === 'bearish' ? 'bg-[#f87171]' : 'bg-[#94a3b8]'}`}
              style={{ width: `${k.conviction}%` }}
            />
          </div>
        </div>
        <span className={`sev-pill ${URGENCY_CLS[k.urgency]}`}>{k.urgency}</span>
      </div>
    </div>
  )
}

export default function Narrative() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [runKey, rerun] = useRunKey()
  const { status, data } = useAgentData(() => (token ? fetchNarrative(token) : null), [token, runKey])

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <>
        <PageHeader icon={Radio} title="KOL Radar" subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying." source={{ mode: 'live', name: 'narrative agent' }} />
        <EmptyState
          icon={Radio}
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
        <PageHeader icon={Radio} title="KOL Radar" subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying." source={{ mode: 'live', name: 'narrative agent' }} />
        <ErrorState error={data} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={Radio} title="KOL Radar" subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying." source={{ mode: 'live', name: 'narrative agent' }} />
        <PageSkeleton />
      </>
    )
  }

  const d = data

  return (
    <>
      <PageHeader
        icon={Radio}
        title={`KOL Radar · ${d.symbol}`}
        subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying."
        source={{ mode: 'live', name: 'narrative agent' }}
      >
        <button onClick={rerun} className="glass-chip"><RefreshCw size={12} /> Re-sweep</button>
      </PageHeader>

      {/* headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Voices Tracked" value={d.total} sub="KOLs in the sweep" delay={0.02} />
        <Stat label="Bullish" value={d.bullish} sub={`of ${d.total} voices`} tone="text-success" delay={0.06} />
        <Stat label="Bearish" value={d.total - d.bullish} sub="incl. neutrals" tone="text-danger" delay={0.1} />
        <Stat
          label="Convergence"
          value={d.converged ? <span className="text-success">CONVERGED</span> : <span className="text-warning">CONFLICTED</span>}
          sub={d.converged ? 'majority aligns bullish' : 'no clear consensus'}
          delay={0.14}
        />
      </div>

      {/* convergence banner */}
      <div className={`glass-panel !py-3.5 !px-5 mb-4 flex items-center gap-3 ${d.converged ? 'border-success/25' : 'border-warning/25'}`}>
        <Target size={16} className={d.converged ? 'text-success' : 'text-warning'} />
        <p className="text-[12.5px] text-snow/85">
          {d.converged
            ? `${d.bullish}/${d.total} voices lean the same way — narrative convergence is a momentum accelerant, and a reversal accelerant when it breaks.`
            : 'Voices are split — the narrative has not converged. Expect chop until one side capitulates.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* KOL grid */}
        <div className="lg:col-span-2">
          <Panel title={`Voices · ${d.total}`} icon={Users} delay={0.16}>
            <div className="grid sm:grid-cols-2 gap-3">
              {d.kols.map((k, i) => (
                <KolCard key={k.handle} k={k} delay={i * 0.04} />
              ))}
            </div>
          </Panel>
        </div>

        {/* news column */}
        <div className="space-y-4">
          <Panel title="News Checker" icon={Newspaper} delay={0.2}>
            <div className="space-y-2.5">
              {d.news.map((n, i) => (
                <div key={i} className="px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-[12px] text-snow/90 leading-snug flex-1">{n.title}</p>
                    <StampPill stamp={n.stamp} />
                  </div>
                  <p className="text-[9.5px] font-mono text-faint">{n.source} · {n.age}</p>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-faint leading-relaxed mt-3">
              Every headline is stamped against on-chain evidence before it can influence a verdict.
            </p>
          </Panel>

          <Panel title="Handoff" delay={0.24}>
            <div className="space-y-2">
              <Link to={`/dashboard/council?token=${d.symbol}`} className="glass-chip w-full justify-center">Send to the Council</Link>
              <Link to={`/dashboard/deep?token=${d.symbol}`} className="glass-chip w-full justify-center">Run Deep Analysis</Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
