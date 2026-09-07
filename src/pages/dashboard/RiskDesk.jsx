// Risk Desk agent — the dip-entry discipline layer.
// User tunes limits with sliders; the desk returns signal checks and
// a sized entry / stop / target plan built from ATR.
import { useEffect, useState } from 'react'
import { ShieldAlert, RefreshCw, Check, X, Crosshair, SlidersHorizontal, Sigma, Target, Gauge, Microscope, Swords } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchRiskDesk } from '../../lib/api'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow,
  MicroLabel, LivePill, TONES,
} from '../../components/ConsoleUI'
import { fmtUsd, ErrorState } from '../../components/DashUI'
import CandleLoader from '../../components/loaders/CandleLoader'

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

function Slider({ label, value, min, max, step = 1, unit, onChange }) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px]" style={{ color: '#aebfe4' }}>{label}</span>
        <span className="font-mono text-[12px]" style={{ color: '#eaf2ff' }}>{value}{unit}</span>
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

function PlanRow({ label, value, color = '#eaf2ff' }) {
  return (
    <div className="cv-rowline">
      <span className="cv-rowline-label">{label}</span>
      <span className="cv-rowline-cell text-right font-mono text-[12px]" style={{ color }}>{value}</span>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="cv-panel cv-ghost h-[118px]" />
      <div className="cv-grid-stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[92px]" />)}
      </div>
      <div className="cv-panel flex flex-col items-center px-6 py-9">
        <div className="inline-flex items-center gap-3" style={{ color: '#eaf2ff' }}>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6ea8ff] border-t-transparent" />
          <span className="font-mono text-sm">re-checking the gates…</span>
        </div>
        <p className="mt-4 font-mono text-[10px] tracking-[0.2em]" style={{ color: '#66739a' }}>
          SIZING · STOPS · CONVICTION
        </p>
      </div>
      <div className="cv-panel cv-ghost h-[240px]" />
    </div>
  )
}

export default function RiskDesk() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [limits, setLimits] = useState({ maxPosition: 5, stopLoss: 8, minConviction: 60 })
  const [queryLimits, setQueryLimits] = useState(limits)
  // Sliders fire on every pixel of movement — settle the drag before asking the desk to re-check.
  useEffect(() => {
    const id = setTimeout(() => setQueryLimits(limits), 400)
    return () => clearTimeout(id)
  }, [limits])
  const [runKey, rerun] = useRunKey()
  const { status, data, error: agentError } = useAgentData(
    () => (token ? fetchRiskDesk(token, queryLimits) : null),
    [token, queryLimits.maxPosition, queryLimits.stopLoss, queryLimits.minConviction, runKey]
  )

  const pick = (t) => setSearchParams({ token: t })

  const header = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="cv-panel flex flex-wrap items-center justify-between gap-4 p-5"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"
          style={{ color: TONES.blue, background: 'rgba(78,139,255,0.14)', border: '1px solid rgba(126,156,255,0.28)' }}
        >
          <ShieldAlert size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold leading-tight tracking-tight" style={{ color: '#f4f8ff' }}>
            {status === 'ready' && data?.symbol ? `Risk Desk · ${data.symbol}` : 'Risk Desk'}
          </h1>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#aebfe4' }}>
            Sizing, stops and conviction gates — the discipline layer.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <LivePill label="risk engine" />
        <button type="button" onClick={rerun} className="cv-btn">
          <RefreshCw size={13} /> Re-check
        </button>
      </div>
    </motion.div>
  )

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="cv-panel flex flex-col items-center px-6 py-12 text-center">
          <ShieldAlert size={22} className="mb-3" style={{ color: '#66739a' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>Set a token first</h3>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed" style={{ color: '#8b98bd' }}>
            Enter a token on the Your Token page or use the search bar above to begin.
          </p>
          <Link to="/dashboard" className="cv-btn mt-4">Go to Your Token</Link>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState error={agentError} onRetry={() => rerun()} />
      </div>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Loading />
      </div>
    )
  }

  const d = data
  const p = d.plan
  const range = p.target - p.stop
  const pos = (v) => `${Math.max(2, Math.min(98, ((v - p.stop) / range) * 100))}%`
  const signals = Array.isArray(d.signals) ? d.signals : []
  const passed = signals.filter((s) => s.pass).length
  const failed = signals.filter((s) => !s.pass)
  const tone = d.qualified ? 'up' : 'down'

  return (
    <div className="flex flex-col gap-4">
      {header}

      {/* ── the risk verdict, first ── */}
      <AnswerBanner
        icon={d.qualified ? Check : X}
        kicker={`Risk desk · ${d.symbol} · $10,000 practice account`}
        answer={
          d.qualified
            ? `${d.symbol} qualifies for the dip-entry plan — ${passed}/${signals.length} conviction gates cleared. The plan enters at ${fmtUsd(p.entry)}, stops at ${fmtUsd(p.stop)} (${d.limits.stopLoss}% away) and targets ${fmtUsd(p.target)}, sizing ${fmtUsd(p.sizeUsd)} so only ${fmtUsd(p.riskUsd)} is at risk for ${p.rr}R.`
            : `${d.symbol} is refused — ${failed.length} of ${signals.length} conviction gates failed${failed.length ? ` (${failed.map((f) => f.label).join(', ')})` : ''}. The desk still sizes the plan (entry ${fmtUsd(p.entry)}, stop ${fmtUsd(p.stop)}, target ${fmtUsd(p.target)}) but no position opens until every gate clears.`
        }
        stance={<StancePill label={d.qualified ? 'position qualified' : 'position rejected'} tone={tone} />}
        confidence={null}
        chips={[
          `${passed}/${signals.length} gates passed`,
          `stop ${d.limits.stopLoss}%`,
          `max position ${limits.maxPosition}%`,
          `${p.rr}R reward/risk`,
        ]}
      />

      {/* ── live plan numbers ── */}
      <div className="cv-grid-stats">
        <StatTile
          icon={Sigma}
          label="Position size"
          value={fmtUsd(p.sizeUsd)}
          foot={`of a $10,000 practice account`}
          delay={0.02}
        />
        <StatTile
          icon={ShieldAlert}
          label="Risk at stop"
          value={fmtUsd(p.riskUsd)}
          foot={`${d.limits.stopLoss}% stop distance`}
          delay={0.06}
        />
        <StatTile
          icon={Target}
          label="Reward / Risk"
          value={`${p.rr}R`}
          foot={`target ${fmtUsd(p.target)}`}
          delay={0.1}
        />
        <StatTile
          icon={Gauge}
          label="ATR(14)"
          value={fmtUsd(p.atr)}
          foot="the volatility ruler behind the ladder"
          delay={0.14}
        />
      </div>

      <div className="cv-grid-2">
        <div className="flex min-w-0 flex-col gap-4">
          {/* plan + ladder */}
          <PanelV2
            icon={Crosshair}
            title="Practice Plan · $10,000"
            right={<MicroLabel>entry · stop · target</MicroLabel>}
            delay={0.16}
          >
            <PlanRow label="Entry" value={fmtUsd(p.entry)} />
            <PlanRow label="Stop (2×ATR)" value={fmtUsd(p.stop)} color={TONES.down} />
            <PlanRow label="Target (3.5×ATR)" value={fmtUsd(p.target)} color={TONES.up} />
            <PlanRow label="Position size" value={fmtUsd(p.sizeUsd)} />
            <PlanRow label="Risk at stop" value={`${fmtUsd(p.riskUsd)} (${d.limits.stopLoss}%)`} color={TONES.amber} />
            <PlanRow label="Reward / Risk" value={`${p.rr}R`} color={TONES.up} />
            <PlanRow label="ATR(14)" value={fmtUsd(p.atr)} />

            {/* ladder */}
            <div className="mt-4">
              <div
                className="relative h-2 rounded-full"
                style={{ background: `linear-gradient(90deg, ${TONES.down}88, rgba(255,255,255,0.1), ${TONES.up}88)` }}
              >
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/60"
                  style={{ left: pos(p.stop), background: TONES.down }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white"
                  style={{ left: pos(p.entry), background: TONES.blue, boxShadow: `0 0 10px ${TONES.blue}cc` }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/60"
                  style={{ left: pos(p.target), background: TONES.up }}
                />
              </div>
              <div className="flex justify-between mt-1.5 font-mono text-[9px]" style={{ color: '#66739a' }}>
                <span>STOP {fmtUsd(p.stop)}</span>
                <span>ENTRY {fmtUsd(p.entry)}</span>
                <span>TARGET {fmtUsd(p.target)}</span>
              </div>
            </div>

            <p className="text-[9.5px] leading-relaxed mt-3.5" style={{ color: '#66739a' }}>
              Practice sizing only — not financial advice. The desk exists so every entry has a defined exit before it happens.
            </p>
          </PanelV2>

          {/* limits */}
          <PanelV2
            icon={SlidersHorizontal}
            title="Your Limits"
            right={<MicroLabel>live re-sizing</MicroLabel>}
            delay={0.2}
          >
            <div className="space-y-5">
              <Slider label="Max position size" value={limits.maxPosition} min={1} max={10} unit="%" onChange={(v) => setLimits((l) => ({ ...l, maxPosition: v }))} />
              <Slider label="Stop-loss distance" value={limits.stopLoss} min={2} max={15} unit="%" onChange={(v) => setLimits((l) => ({ ...l, stopLoss: v }))} />
              <Slider label="Min conviction gate" value={limits.minConviction} min={40} max={90} unit="" onChange={(v) => setLimits((l) => ({ ...l, minConviction: v }))} />
            </div>
            <p className="text-[10.5px] leading-relaxed mt-5" style={{ color: '#66739a' }}>
              Tune the sliders — the desk re-sizes the plan live on a $10,000 practice account.
            </p>
          </PanelV2>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* conviction gates */}
          <PanelV2
            icon={ShieldAlert}
            title="Conviction Gates"
            right={<MicroLabel>{passed}/{signals.length} passed</MicroLabel>}
            delay={0.18}
          >
            <ScoreBar
              left={passed}
              right={failed.length}
              leftLabel="Passed"
              rightLabel="Failed"
              leftTone="up"
              rightTone="down"
            />
            <div className="mt-3.5 flex flex-col gap-0">
              {signals.map((s, i) => (
                <InsightRow
                  key={i}
                  icon={s.pass ? Check : X}
                  tone={s.pass ? 'up' : 'down'}
                  title={s.label}
                  body={`${String(s.value)} — ${s.pass ? 'gate cleared' : 'gate failed'}`}
                />
              ))}
            </div>
            <p className="text-[10.5px] leading-relaxed mt-3.5" style={{ color: '#66739a' }}>
              {passed}/{signals.length} gates passed — every rule is explicit so the logic can be audited.
            </p>
          </PanelV2>

          {/* next */}
          <PanelV2 icon={Microscope} title="Next step" delay={0.24}>
            <div className="flex flex-wrap gap-2">
              <Link to={`/dashboard/deep?token=${d.symbol}`} className="cv-chip">
                <Microscope size={12} /> See the evidence →
              </Link>
              <Link to={`/dashboard/council?token=${d.symbol}`} className="cv-chip">
                <Swords size={12} /> Let the Council argue it →
              </Link>
            </div>
          </PanelV2>
        </div>
      </div>
    </div>
  )
}
