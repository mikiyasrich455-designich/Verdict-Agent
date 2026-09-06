// Sentiment Shift agent — 7-day mood drift monitor.
import { Gauge, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchSentimentShift } from '../../lib/api'
import { PageHeader, Panel, Stat, fmtPct, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'

const DIR_META = {
  'risk-on rotation': { icon: TrendingUp, cls: 'text-success', note: 'Confidence is rotating in. Momentum playbooks get the green light, but watch for crowded positioning near the top of the drift.' },
  'risk-off rotation': { icon: TrendingDown, cls: 'text-danger', note: 'Confidence is rotating out. The desk shifts to capital preservation — dips are observed, not chased.' },
  'range-bound': { icon: Minus, cls: 'text-warning', note: 'Mood is flat. Range-bound sentiment favors selectivity: catalysts over momentum until the drift picks a direction.' },
}

export default function SentimentShift() {
  const [runKey, rerun] = useRunKey()
  const { status, data, error: agentError } = useAgentData(() => fetchSentimentShift(), [runKey])

  if (status === 'error') {
    return (
      <>
        <PageHeader icon={Gauge} title="Sentiment Shift" subtitle="Seven-day mood drift — where the crowd is heading, not where it stood." source={{ mode: 'live', name: 'live sentiment' }} />
        <ErrorState error={agentError} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={Gauge} title="Sentiment Shift" subtitle="Seven-day mood drift — where the crowd is heading, not where it stood." source={{ mode: 'live', name: 'live sentiment' }} />
        <PageSkeleton />
      </>
    )
  }

  const d = data
  const meta = DIR_META[d.direction] || DIR_META['range-bound']
  const DirIcon = meta.icon

  return (
    <>
      <PageHeader
        icon={Gauge}
        title="Sentiment Shift"
        subtitle="Seven-day mood drift — where the crowd is heading, not where it stood."
        source={{ mode: 'live', name: 'live sentiment' }}
      >
        <button onClick={rerun} className="glass-chip"><RefreshCw size={12} /> Refresh</button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Now" value={d.now} sub="Fear & Greed today" tone={d.now >= 60 ? 'text-success' : d.now >= 45 ? 'text-warning' : 'text-danger'} delay={0.02} />
        <Stat label="Week Ago" value={d.weekAgo} sub="Where it started" delay={0.06} />
        <Stat label="7-Day Delta" value={fmtPct(d.delta).replace('%', ' pts')} sub={d.delta >= 0 ? 'drifting up' : 'drifting down'} tone={d.delta >= 0 ? 'text-success' : 'text-danger'} delay={0.1} />
        <Stat label="Rotation" value={<span className={meta.cls}>{d.direction.toUpperCase()}</span>} sub="Regime read" delay={0.14} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Fear & Greed · 7 days" className="lg:col-span-2" delay={0.16}>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="ssFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5b93ff" stopOpacity={0.4} />
                    <stop offset="1" stopColor="#5b93ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#6b7590', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#6b7590', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.14)" strokeDasharray="4 4" />
                <ReferenceLine y={75} stroke="rgba(52,211,153,0.25)" strokeDasharray="3 5" />
                <ReferenceLine y={25} stroke="rgba(248,113,113,0.25)" strokeDasharray="3 5" />
                <Tooltip
                  contentStyle={{ background: 'rgba(7,9,20,0.94)', border: '1px solid rgba(122,162,255,0.25)', borderRadius: 10, fontSize: 12 }}
                  formatter={(v) => [v, 'index']}
                />
                <Area type="monotone" dataKey="value" stroke="#7aa2ff" strokeWidth={2.5} fill="url(#ssFill)" dot={{ fill: '#7aa2ff', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#dbe7ff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Rotation Read" delay={0.2}>
          <div className={`flex items-center gap-2.5 mb-3 ${meta.cls}`}>
            <DirIcon size={18} />
            <span className="font-display font-bold text-[15px]">{d.direction}</span>
          </div>
          <p className="text-[12.5px] text-muted leading-relaxed">{meta.note}</p>
          <div className="mt-4 pt-3 border-t border-white/5">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-2">Agent wiring</p>
            <p className="text-[12px] text-snow/80 leading-relaxed">
              This feed feeds the Overview regime flag and the Risk Desk sizing rules — one sentiment read, three consumers.
            </p>
          </div>
        </Panel>
      </div>
    </>
  )
}
