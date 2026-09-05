// Risk Desk agent — the Buy-the-Dip discipline layer.
// User tunes limits with sliders; the desk returns signal checks and
// a sized entry / stop / target plan built from ATR.
import { useState } from 'react'
import { ShieldAlert, RefreshCw, Check, X, Crosshair } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchRiskDesk } from '../../lib/api'
import { PageHeader, Panel, EmptyState, fmtUsd, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'

function Slider({ label, value, min, max, step = 1, unit, onChange }) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="font-mono text-[12px] text-snow">{value}{unit}</span>
      </div>
      <input
        type="range"
        className="vslider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function PlanRow({ label, value, tone = '' }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className={`font-mono text-[12.5px] ${tone || 'text-snow'}`}>{value}</span>
    </div>
  )
}

export default function RiskDesk() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [limits, setLimits] = useState({ maxPosition: 5, stopLoss: 8, minConviction: 60 })
  const [runKey, rerun] = useRunKey()
  const { status, data } = useAgentData(
    () => (token ? fetchRiskDesk(token, limits) : null),
    [token, limits.maxPosition, limits.stopLoss, limits.minConviction, runKey]
  )

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <>
        <PageHeader icon={ShieldAlert} title="Risk Desk" subtitle="Sizing, stops and conviction gates — the discipline layer." source={{ mode: 'live', name: 'risk engine' }} />
        <EmptyState
          icon={ShieldAlert}
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
        <PageHeader icon={ShieldAlert} title="Risk Desk" subtitle="Sizing, stops and conviction gates — the discipline layer." source={{ mode: 'live', name: 'risk engine' }} />
        <ErrorState error={data} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={ShieldAlert} title="Risk Desk" subtitle="Sizing, stops and conviction gates — the discipline layer." source={{ mode: 'live', name: 'risk engine' }} />
        <PageSkeleton />
      </>
    )
  }

  const d = data
  const p = d.plan
  const range = p.target - p.stop
  const pos = (v) => `${Math.max(2, Math.min(98, ((v - p.stop) / range) * 100))}%`

  return (
    <>
      <PageHeader
        icon={ShieldAlert}
        title={`Risk Desk · ${d.symbol}`}
        subtitle="Sizing, stops and conviction gates — the discipline layer."
        source={{ mode: 'live', name: 'risk engine' }}
      >
        <button onClick={rerun} className="glass-chip"><RefreshCw size={12} /> Re-check</button>
      </PageHeader>

      {/* GO / NO-GO banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`glass-panel !py-4 !px-5 mb-4 flex items-center gap-3 ${
          d.qualified ? 'border-success/30 shadow-[0_0_34px_rgba(52,211,153,0.1)]' : 'border-danger/30 shadow-[0_0_34px_rgba(248,113,113,0.1)]'
        }`}
      >
        <span className={`w-10 h-10 grid place-items-center rounded-full border flex-shrink-0 ${d.qualified ? 'text-success border-success/40 bg-success/10' : 'text-danger border-danger/40 bg-danger/10'}`}>
          {d.qualified ? <Check size={18} strokeWidth={2.6} /> : <X size={18} strokeWidth={2.6} />}
        </span>
        <div>
          <p className={`font-display font-bold text-[16px] ${d.qualified ? 'text-success' : 'text-danger'}`}>
            {d.qualified ? 'POSITION QUALIFIED' : 'POSITION REJECTED'}
          </p>
          <p className="text-[11.5px] text-muted mt-0.5">
            {d.qualified
              ? 'All conviction gates cleared — the plan below respects your limits.'
              : 'A gate failed. The desk refuses the trade before the market can.'}
          </p>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* limits */}
        <Panel title="Your Limits" delay={0.08}>
          <div className="space-y-5">
            <Slider label="Max position size" value={limits.maxPosition} min={1} max={10} unit="%" onChange={(v) => setLimits((l) => ({ ...l, maxPosition: v }))} />
            <Slider label="Stop-loss distance" value={limits.stopLoss} min={2} max={15} unit="%" onChange={(v) => setLimits((l) => ({ ...l, stopLoss: v }))} />
            <Slider label="Min conviction gate" value={limits.minConviction} min={40} max={90} unit="" onChange={(v) => setLimits((l) => ({ ...l, minConviction: v }))} />
          </div>
          <p className="text-[10.5px] text-faint leading-relaxed mt-5">
            Tune the sliders — the desk re-sizes the plan live on a $10,000 practice account.
          </p>
        </Panel>

        {/* signals */}
        <Panel title="Conviction Gates" delay={0.12}>
          <div className="space-y-2">
            {d.signals.map((s, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5">
                <span className={`w-6 h-6 grid place-items-center rounded-full border flex-shrink-0 ${s.pass ? 'text-success border-success/40 bg-success/10' : 'text-danger border-danger/40 bg-danger/10'}`}>
                  {s.pass ? <Check size={12} strokeWidth={2.8} /> : <X size={12} strokeWidth={2.8} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] text-snow/85">{s.label}</p>
                </div>
                <span className="font-mono text-[11px] text-muted">{String(s.value)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-faint leading-relaxed mt-3.5">
            {d.signals.filter((s) => s.pass).length}/{d.signals.length} gates passed — every rule is explicit so the logic can be audited.
          </p>
        </Panel>

        {/* plan */}
        <Panel title="Practice Plan · $10,000" icon={Crosshair} delay={0.16}>
          <PlanRow label="Entry" value={fmtUsd(p.entry)} />
          <PlanRow label="Stop (2×ATR)" value={fmtUsd(p.stop)} tone="text-danger" />
          <PlanRow label="Target (3.5×ATR)" value={fmtUsd(p.target)} tone="text-success" />
          <PlanRow label="Position size" value={fmtUsd(p.sizeUsd)} />
          <PlanRow label="Risk at stop" value={`${fmtUsd(p.riskUsd)} (${d.limits.stopLoss}%)`} tone="text-warning" />
          <PlanRow label="Reward / Risk" value={`${p.rr}R`} tone="text-success" />
          <PlanRow label="ATR(14)" value={fmtUsd(p.atr)} />

          {/* ladder */}
          <div className="mt-4">
            <div className="relative h-2 rounded-full bg-gradient-to-r from-[#f87171]/60 via-white/10 to-[#34d399]/60">
              <span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-danger border border-white/60" style={{ left: pos(p.stop) }} />
              <span className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent border border-white shadow-[0_0_10px_rgba(43,104,255,0.8)]" style={{ left: pos(p.entry) }} />
              <span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-success border border-white/60" style={{ left: pos(p.target) }} />
            </div>
            <div className="flex justify-between mt-1.5 font-mono text-[9px] text-faint">
              <span>STOP</span><span>ENTRY</span><span>TARGET</span>
            </div>
          </div>

          <p className="text-[9.5px] text-faint leading-relaxed mt-3.5">
            Practice sizing only — not financial advice. The desk exists so every entry has a defined exit before it happens.
          </p>
        </Panel>
      </div>

      {/* next */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/dashboard/deep?token=${d.symbol}`} className="glass-chip">See the evidence →</Link>
        <Link to={`/dashboard/council?token=${d.symbol}`} className="glass-chip">Let the Council argue it →</Link>
      </div>
    </>
  )
}
