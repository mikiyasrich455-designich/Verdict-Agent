// Final Recommendation — the master desk agent.
// It gathers every other agent's live output in parallel (each step tracked on
// screen), then reconciles all of it into ONE nuanced house view.
import { useEffect, useMemo, useState } from 'react'
import {
  Crown, RefreshCw, Check, X, Microscope, Swords, Radio, ShieldAlert,
  Globe, Gauge, AlertTriangle, Zap, Target, Clock, Layers, ArrowRight,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  fetchVerdict, fetchCouncil, fetchNarrative, fetchRiskDesk,
  fetchMarketOverview, fetchSentimentShift, fetchFinal,
} from '../../lib/api'
import { ErrorState, fmtUsd } from '../../components/DashUI'
import DyorNote from '../../components/DyorNote'
import { stanceOf } from '../../lib/stance'
import CandleLoader from '../../components/loaders/CandleLoader'
import {
  PanelV2, MicroLabel, ProgressMeter, Ring, TONES,
} from '../../components/ConsoleUI'

const DEFAULT_LIMITS = { maxPosition: 5, stopLoss: 8, minConviction: 60 }

// Every agent the desk consults, in the order the user sees them checked off.
const AGENTS = [
  { key: 'verdict', name: 'Deep Analysis', hint: 'forensic read of the tape', icon: Microscope, tone: 'violet', run: (t) => fetchVerdict(t) },
  { key: 'council', name: 'Bull vs Bear', hint: 'adversarial ruling', icon: Swords, tone: 'amber', run: (t) => fetchCouncil(t) },
  { key: 'risk', name: 'Risk Desk', hint: 'gates, sizing, invalidation', icon: ShieldAlert, tone: 'blue', run: (t) => fetchRiskDesk(t, DEFAULT_LIMITS) },
  { key: 'narrative', name: 'Narrative Radar', hint: 'voices & story flow', icon: Radio, tone: 'cyan', run: (t) => fetchNarrative(t) },
  { key: 'overview', name: 'Market Regime', hint: 'breadth & backdrop', icon: Globe, tone: 'blue', run: () => fetchMarketOverview() },
  { key: 'sentiment', name: 'Sentiment Shift', hint: 'rotation & mood', icon: Gauge, tone: 'cyan', run: () => fetchSentimentShift() },
]

const POINT_TONE = { bull: 'up', bear: 'down', neutral: 'blue' }
const WEIGHT_TONE = { high: 'amber', medium: 'blue', low: 'violet' }

// The master desk answers with a free-form phrase ("WAIT FOR CONFIRMATION",
// "HOLD & MONITOR", …). Fold those into the safe stance vocabulary so the hero
// headline never reads as an instruction, while keeping the same intent.
const DESK_STANCE_WORDS = [
  ['SPECULATIVE', 'POSITIVE'],
  ['ACCUMULATE', 'POSITIVE'],
  ['WAIT', 'NEUTRAL'],
  ['MONITOR', 'NEUTRAL'],
  ['HOLD', 'NEUTRAL'],
  ['REDUCE', 'CAUTION'],
  ['AVOID', 'CAUTION'],
]

function deskStanceOf(raw) {
  const s = String(raw || '').toUpperCase()
  const hit = DESK_STANCE_WORDS.find(([word]) => s.includes(word))
  return stanceOf(hit ? hit[1] : raw)
}

function StepRow({ agent, state, index }) {
  const color = TONES[agent.tone] || TONES.blue
  const Icon = agent.icon
  const done = state === 'done'
  const failed = state === 'failed'
  const running = state === 'running'
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, delay: index * 0.05 }}
      className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
      style={{
        borderColor: done ? `${color}44` : failed ? 'rgba(255,92,122,0.3)' : 'rgba(255,255,255,0.07)',
        background: done ? `${color}0d` : 'rgba(255,255,255,0.025)',
      }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border"
        style={{ color, borderColor: `${color}55`, background: `${color}14` }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold leading-none" style={{ color: '#f4f8ff' }}>{agent.name}</p>
        <MicroLabel className="mt-1.5 block">{agent.hint}</MicroLabel>
      </div>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.span
            key="done"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
            className="grid h-6 w-6 place-items-center rounded-full"
            style={{ color: TONES.up, background: `${TONES.up}1a`, border: `1px solid ${TONES.up}55` }}
          >
            <Check size={13} strokeWidth={3} />
          </motion.span>
        ) : failed ? (
          <motion.span
            key="failed"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="grid h-6 w-6 place-items-center rounded-full"
            style={{ color: TONES.down, background: `${TONES.down}1a`, border: `1px solid ${TONES.down}55` }}
          >
            <X size={13} strokeWidth={3} />
          </motion.span>
        ) : (
          <motion.span
            key="running"
            className="h-4 w-4 rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${color}88`, borderTopColor: 'transparent' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function GatherPanel({ symbol, steps, settled, total, phase }) {
  const gathering = phase === 'gathering'
  const pct = gathering ? Math.round((settled / total) * 92) : null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      className="cv-panel px-6 py-8 sm:px-9 sm:py-11"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <CandleLoader />
        <motion.span
          className="mt-2 grid h-14 w-14 place-items-center rounded-2xl"
          style={{ color: TONES.amber, background: 'rgba(255,194,75,0.13)', border: '1px solid rgba(255,194,75,0.3)' }}
          animate={{ boxShadow: ['0 0 0px rgba(255,194,75,0)', '0 0 34px rgba(255,194,75,0.4)', '0 0 0px rgba(255,194,75,0)'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Crown size={24} strokeWidth={2} />
        </motion.span>
        <h2 className="mt-4 text-[20px] font-bold leading-tight tracking-tight sm:text-[24px]" style={{ color: '#f4f8ff' }}>
          {gathering ? `Gathering every agent on ${symbol}` : 'Reconciling all of it into one house view'}
        </h2>
        <p className="mt-2 max-w-lg text-[13px] leading-relaxed" style={{ color: '#8b98bd' }}>
          {gathering
            ? `${settled} of ${total} agents reported in. Nothing is skipped — the final read only lands once every desk has spoken.`
            : 'Weighing where the agents agree, where they conflict, and which evidence carries the most weight.'}
        </p>
        <div className="mt-6 w-full">
          <ProgressMeter
            value={pct}
            tone={gathering ? 'blue' : 'amber'}
            label={gathering ? 'Collecting agent output' : 'Master synthesis in progress'}
          />
        </div>
      </div>

      <div className="mx-auto mt-7 grid max-w-3xl gap-2.5 sm:grid-cols-2">
        {AGENTS.map((a, i) => (
          <StepRow key={a.key} agent={a} state={steps[a.key] || 'running'} index={i} />
        ))}
      </div>
    </motion.div>
  )
}

export default function FinalVerdict() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [phase, setPhase] = useState('gathering')
  const [steps, setSteps] = useState({})
  const [result, setResult] = useState(null)
  const [failed, setFailed] = useState(0)
  const [runKey, setRunKey] = useState(0)

  const settled = useMemo(
    () => AGENTS.filter((a) => steps[a.key] === 'done' || steps[a.key] === 'failed').length,
    [steps]
  )

  useEffect(() => {
    if (!token) return undefined
    let alive = true

    setPhase('gathering')
    setResult(null)
    setFailed(0)
    setSteps(Object.fromEntries(AGENTS.map((a) => [a.key, 'running'])))

    ;(async () => {
      const collected = {}
      let misses = 0

      await Promise.all(AGENTS.map(async (a) => {
        try {
          const data = await a.run(token)
          if (!alive) return
          collected[a.key] = data
          setSteps((s) => ({ ...s, [a.key]: 'done' }))
        } catch (err) {
          if (!alive) return
          misses += 1
          setSteps((s) => ({ ...s, [a.key]: 'failed' }))
        }
      }))

      if (!alive) return
      setFailed(misses)

      if (!Object.keys(collected).length) {
        setPhase('error')
        return
      }

      setPhase('synthesizing')
      try {
        const final = await fetchFinal(token, collected)
        if (!alive) return
        setResult(final)
        setPhase('ready')
      } catch (err) {
        if (!alive) return
        console.error('[FINAL] synthesis failed:', err)
        setPhase('error')
      }
    })()

    return () => { alive = false }
  }, [token, runKey])

  if (!token) {
    return (
      <div className="cv-panel flex flex-col items-center px-6 py-16 text-center">
        <Crown size={24} className="mb-3" style={{ color: '#66739a' }} />
        <h3 className="text-[16px] font-semibold" style={{ color: '#eef3ff' }}>Pick a token first</h3>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: '#8b98bd' }}>
          The final recommendation reads every other agent at once. Set a token in the search
          bar above and the desk will gather itself.
        </p>
        <Link to="/dashboard" className="cv-chip mt-5">Go to Your Token</Link>
      </div>
    )
  }

  const sym = token.toUpperCase()

  const header = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="cv-panel flex flex-wrap items-center justify-between gap-4 p-5"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"
          style={{ color: TONES.amber, background: 'rgba(255,194,75,0.14)', border: '1px solid rgba(255,194,75,0.3)' }}
        >
          <Crown size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight" style={{ color: '#f4f8ff' }}>
            Final Recommendation
          </h1>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#aebfe4' }}>
            {result?.name ? `${result.name} · ${result.symbol}` : sym} — every agent, one reconciled house view.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="cv-chip"><Layers size={12} /> {result?.agentsUsed || settled} agents</span>
        <button type="button" className="cv-chip" onClick={() => setRunKey((k) => k + 1)}>
          <RefreshCw size={12} /> Re-gather
        </button>
      </div>
    </motion.div>
  )

  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState error={null} onRetry={() => setRunKey((k) => k + 1)}>
          <p className="font-mono text-[11.5px] text-faint">
            The desk couldn't reconcile {sym}. One or more agents didn't report in — try again.
          </p>
        </ErrorState>
      </div>
    )
  }

  if (phase !== 'ready' || !result) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <GatherPanel symbol={sym} steps={steps} settled={settled} total={AGENTS.length} phase={phase} />
      </div>
    )
  }

  const toneColor = TONES[result.tone] || TONES.blue
  const deskStance = deskStanceOf(result.stance)
  const price = Number(result.priceUsd) || 0
  const change = Number(result.change24h)

  return (
    <div className="flex flex-col gap-4">
      {header}

      {/* ── the house view ── */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 190, damping: 22 }}
        className="cv-panel overflow-hidden px-6 py-8 sm:px-9 sm:py-10"
        style={{ borderColor: `${toneColor}3d`, boxShadow: `0 0 60px ${toneColor}14 inset` }}
      >
        <div className="flex flex-col items-center gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <MicroLabel>Master desk stance · {sym}</MicroLabel>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 200, damping: 20 }}
              className="mt-3 text-[30px] font-black uppercase leading-[1.05] tracking-[-0.02em] sm:text-[42px]"
              style={{ color: toneColor, textShadow: `0 0 44px ${toneColor}44` }}
            >
              {deskStance.label}
            </motion.p>
            <p className="mx-auto mt-2.5 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: '#8b98bd' }}>
              {deskStance.blurb}
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] font-semibold leading-snug sm:text-[17px]" style={{ color: '#f4f8ff' }}>
              {result.headline}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <span className="cv-chip"><Clock size={12} /> {result.timeframe}</span>
              <span className="cv-chip"><Layers size={12} /> {result.agentsUsed} agents consulted</span>
              {price > 0 && <span className="cv-chip">{fmtUsd(price)}</span>}
              {Number.isFinite(change) && (
                <span className="cv-chip" style={{ color: change >= 0 ? TONES.up : TONES.down }}>
                  {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <Ring value={result.conviction} size={116} stroke={9} tone={result.tone || 'blue'} label="conviction" />
            <MicroLabel>desk conviction</MicroLabel>
          </div>
        </div>

        {result.thesis && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.45 }}
            className="mt-8 border-t pt-6 text-[13.5px] leading-[1.85] sm:text-[14.5px]"
            style={{ borderColor: 'rgba(255,255,255,0.08)', color: '#c3d0ea' }}
          >
            {result.thesis}
          </motion.p>
        )}
      </motion.div>

      {/* ── what moved the call ── */}
      {result.keyPoints?.length > 0 && (
        <PanelV2 icon={ArrowRight} title="What moved the call" delay={0.05}>
          <div className="flex flex-col gap-2.5">
            {result.keyPoints.map((p, i) => {
              const c = TONES[POINT_TONE[p.w] || 'blue']
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 + i * 0.06, type: 'spring', stiffness: 240, damping: 22 }}
                  className="flex items-start gap-3 rounded-xl border px-4 py-3"
                  style={{ borderColor: `${c}2e`, background: `${c}0a` }}
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
                  <p className="text-[13px] leading-relaxed" style={{ color: '#d5e0f5' }}>{p.t}</p>
                </motion.div>
              )
            })}
          </div>
        </PanelV2>
      )}

      {/* ── what each agent said ── */}
      {result.agentDigests?.length > 0 && (
        <PanelV2
          icon={Layers}
          title="Every agent, in one line"
          delay={0.1}
          right={<MicroLabel>{failed ? `${failed} agent${failed > 1 ? 's' : ''} unavailable` : 'all agents reported'}</MicroLabel>}
        >
          <div className="grid gap-2.5 md:grid-cols-2">
            {result.agentDigests.map((d, i) => {
              const meta = AGENTS.find((a) => a.name.toLowerCase().includes(String(d.agent).toLowerCase().split(' ')[0]))
              const c = TONES[meta?.tone || 'blue']
              const Icon = meta?.icon || Target
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, duration: 0.32 }}
                  className="rounded-xl border p-3.5"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.028)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border"
                      style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}
                    >
                      <Icon size={12} strokeWidth={2.2} />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: '#f4f8ff' }}>{d.agent}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: TONES[WEIGHT_TONE[d.weight] || 'blue'], background: `${TONES[WEIGHT_TONE[d.weight] || 'blue']}14` }}
                    >
                      {d.weight} weight
                    </span>
                  </div>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: '#a6b4d4' }}>{d.read}</p>
                </motion.div>
              )
            })}
          </div>
        </PanelV2>
      )}

      {/* ── risk vs catalyst ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {(result.risks?.length > 0) && (
          <PanelV2 icon={AlertTriangle} title="What breaks this stance" delay={0.15}>
            <div className="flex flex-col gap-2">
              {result.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONES.down }} />
                  <p className="text-[12.5px] leading-relaxed" style={{ color: '#b9c6e2' }}>{r}</p>
                </div>
              ))}
            </div>
          </PanelV2>
        )}
        {(result.catalysts?.length > 0) && (
          <PanelV2 icon={Zap} title="What could accelerate it" delay={0.2}>
            <div className="flex flex-col gap-2">
              {result.catalysts.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONES.up }} />
                  <p className="text-[12.5px] leading-relaxed" style={{ color: '#b9c6e2' }}>{c}</p>
                </div>
              ))}
            </div>
          </PanelV2>
        )}
      </div>

      {/* ── levels & discipline ── */}
      <PanelV2 icon={Target} title="Levels the desk is watching" delay={0.25}>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {[
            { label: 'Support', value: result.levels?.support, tone: 'up' },
            { label: 'Resistance', value: result.levels?.resistance, tone: 'down' },
            { label: 'Invalidation', value: result.levels?.invalidation, tone: 'amber' },
          ].map((l) => (
            <div
              key={l.label}
              className="rounded-xl border px-4 py-3.5"
              style={{ borderColor: `${TONES[l.tone]}30`, background: `${TONES[l.tone]}0a` }}
            >
              <MicroLabel>{l.label}</MicroLabel>
              <p className="mt-2 font-mono text-[13px] leading-snug" style={{ color: TONES[l.tone] }}>{l.value || '—'}</p>
            </div>
          ))}
        </div>
        {result.sizeNote && (
          <p className="mt-4 rounded-xl border px-4 py-3.5 text-[12.5px] leading-relaxed"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', color: '#a6b4d4' }}>
            {result.sizeNote}
          </p>
        )}
      </PanelV2>

      {/* ── next steps + disclaimer ── */}
      <div className="cv-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/dashboard/deep?token=${sym}`} className="cv-chip"><Microscope size={12} /> Deep Analysis</Link>
          <Link to={`/dashboard/council?token=${sym}`} className="cv-chip"><Swords size={12} /> Bull vs Bear</Link>
          <Link to={`/dashboard/risk?token=${sym}`} className="cv-chip"><ShieldAlert size={12} /> Risk Desk</Link>
          <Link to={`/dashboard/studio/image?token=${sym}`} className="cv-chip"><Zap size={12} /> Studio</Link>
        </div>
        <MicroLabel>educational analysis · not financial advice</MicroLabel>
      </div>

      <DyorNote />
    </div>
  )
}
