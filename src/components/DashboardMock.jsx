import {
  LayoutGrid, Radar as RadarIcon, MessagesSquare, Activity, ShieldCheck,
  Settings, LineChart, TrendingUp, TrendingDown, ArrowRight,
} from 'lucide-react'
import Logo from './Logo'

const STATS = [
  { label: 'Tokens Scanned', value: '1,420', delta: '+12% today', up: true },
  { label: 'Verdicts Issued', value: '318', delta: '+8% today', up: true },
  { label: 'Avg Confidence', value: '86%', delta: '+2.1 pts', up: true },
  { label: 'Live Debates', value: '3', delta: '2 resolving', up: false },
]

const ACTIVITY = [
  { name: 'SOL verdict issued', detail: 'BUY · confidence 78', tone: 'text-success', time: '12s' },
  { name: 'Council debate resolved', detail: 'AVAX · HOLD', tone: 'text-warning', time: '48s' },
  { name: 'Narrative convergence', detail: 'AI sector · 3/3 signals', tone: 'text-accent', time: '2m' },
  { name: 'Risk alert', detail: 'MEME sector · vol spike', tone: 'text-danger', time: '5m' },
]

const SPARK = [22, 28, 25, 34, 30, 42, 38, 52, 47, 60, 55, 68]

export default function DashboardMock({ compact = false }) {
  const max = Math.max(...SPARK)
  const points = SPARK.map((v, i) => `${(i / (SPARK.length - 1)) * 100},${36 - (v / max) * 32}`).join(' ')

  return (
    <div className="card-dark !rounded-xl overflow-hidden text-left shadow-lift">
      {/* Window top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          </div>
          <span className="text-[11px] font-mono text-faint hidden sm:block">verdict · operations center</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> 6 live data feeds connected
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className={`w-12 lg:w-44 border-r border-line bg-white/[0.015] py-3 flex-shrink-0 ${compact ? 'hidden sm:block' : ''}`}>
          <div className="px-3 pb-3 mb-2 border-b border-line flex items-center gap-2">
            <Logo size={20} />
            <span className="text-xs font-bold text-snow hidden lg:block">verdict*</span>
          </div>
          {[
            { icon: LayoutGrid, label: 'Overview', active: true },
            { icon: RadarIcon, label: 'Verdicts' },
            { icon: MessagesSquare, label: 'Council' },
            { icon: Activity, label: 'Signals' },
            { icon: ShieldCheck, label: 'Risk' },
            { icon: LineChart, label: 'Narratives' },
            { icon: Settings, label: 'Settings' },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`flex items-center gap-2.5 px-3 py-2 mx-2 rounded-md mb-0.5 ${
                active ? 'bg-accent/15 text-snow' : 'text-faint'
              }`}
            >
              <Icon size={14} className={active ? 'text-accent' : ''} />
              <span className="text-[11px] font-medium hidden lg:block">{label}</span>
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="flex-1 p-4 lg:p-5 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-snow">Operations Command Center</h3>
              <p className="text-[11px] text-faint mt-0.5">Live view of every agent, verdict and debate</p>
            </div>
            <span className="pill-badge !py-1 !px-2.5 !text-[10px]">risk-on regime</span>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-white/[0.02] p-3">
                <p className="text-[10px] text-faint font-mono uppercase tracking-wider">{s.label}</p>
                <p className="text-lg font-bold font-mono text-snow mt-1">{s.value}</p>
                <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${s.up ? 'text-success' : 'text-warning'}`}>
                  {s.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />} {s.delta}
                </p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-2.5">
            {/* Orchestration flow */}
            <div className="rounded-lg border border-line bg-white/[0.02] p-4">
              <p className="text-[10px] text-faint font-mono uppercase tracking-wider mb-3">agent orchestration</p>
              <div className="flex items-center justify-between gap-1">
                {[
                  { label: 'scan', sub: 'candidates' },
                  { label: 'analyze', sub: 'technicals' },
                  { label: 'deep dive', sub: 'evidence' },
                  { label: 'council', sub: 'bull vs bear' },
                  { label: 'verdict', sub: 'final call', final: true },
                ].map((node, i, arr) => (
                  <div key={node.label} className="flex items-center flex-1 min-w-0">
                    <div
                      className={`flex-1 rounded-md border px-2 py-2 text-center min-w-0 ${
                        node.final ? 'border-accent/50 bg-accent/15 shadow-glowsm' : 'border-line bg-white/[0.03]'
                      }`}
                    >
                      <p className={`text-[9px] font-mono truncate ${node.final ? 'text-accent' : 'text-snow'}`}>
                        {node.label}
                      </p>
                      <p className="text-[8px] text-faint truncate">{node.sub}</p>
                    </div>
                    {i < arr.length - 1 && <ArrowRight size={10} className="text-faint mx-1 flex-shrink-0" />}
                  </div>
                ))}
              </div>

              {/* Sparkline */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-faint font-mono">verdict confidence · 12h</p>
                  <p className="text-[10px] font-mono text-success">+14.2%</p>
                </div>
                <svg viewBox="0 0 100 40" className="w-full h-14" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6467f2" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#6467f2" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={`0,40 ${points} 100,40`} fill="url(#sparkfill)" />
                  <polyline points={points} fill="none" stroke="#6467f2" strokeWidth="1.2" />
                </svg>
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-lg border border-line bg-white/[0.02] p-4">
              <p className="text-[10px] text-faint font-mono uppercase tracking-wider mb-3">recent activity</p>
              <ul className="space-y-2.5">
                {ACTIVITY.map((a) => (
                  <li key={a.name} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-snow font-medium truncate">{a.name}</p>
                      <p className={`text-[10px] font-mono truncate ${a.tone}`}>{a.detail}</p>
                    </div>
                    <span className="text-[10px] text-faint font-mono flex-shrink-0">{a.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
