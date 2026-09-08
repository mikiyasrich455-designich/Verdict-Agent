// Final Recommendation — the master desk agent.
// It gathers every other agent's live output in parallel (each step tracked on
// screen), then reconciles all of it into ONE nuanced house view.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Crown, RefreshCw, Check, X, Microscope, Swords, Radio, ShieldAlert,
  Globe, Gauge, Zap, Clock, Layers, Download,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  fetchVerdict, fetchCouncil, fetchNarrative, fetchRiskDesk,
  fetchMarketOverview, fetchSentimentShift, fetchFinal, peekFinal,
} from '../../lib/api'
import { ErrorState, fmtUsd } from '../../components/DashUI'
import DyorNote from '../../components/DyorNote'
import { stanceOf } from '../../lib/stance'
import CandleLoader from '../../components/loaders/CandleLoader'
import {
  MicroLabel, ProgressMeter, Ring, TONES,
} from '../../components/ConsoleUI'

const DEFAULT_LIMITS = { maxPosition: 5, stopLoss: 8, minConviction: 60 }

// Every agent the desk consults, in the order the user sees them checked off.
const AGENTS = [
  { key: 'verdict', name: 'Deep Analysis', hint: 'forensic read of the tape', icon: Microscope, tone: 'violet', run: (t, o) => fetchVerdict(t, o) },
  { key: 'council', name: 'Bull vs Bear', hint: 'adversarial ruling', icon: Swords, tone: 'amber', run: (t, o) => fetchCouncil(t, o) },
  { key: 'risk', name: 'Risk Desk', hint: 'gates, sizing, invalidation', icon: ShieldAlert, tone: 'blue', run: (t, o) => fetchRiskDesk(t, DEFAULT_LIMITS, o) },
  { key: 'narrative', name: 'Narrative Radar', hint: 'voices & story flow', icon: Radio, tone: 'cyan', run: (t, o) => fetchNarrative(t, o) },
  { key: 'overview', name: 'Market Regime', hint: 'breadth & backdrop', icon: Globe, tone: 'blue', run: (t, o) => fetchMarketOverview(o) },
  { key: 'sentiment', name: 'Sentiment Shift', hint: 'rotation & mood', icon: Gauge, tone: 'cyan', run: (t, o) => fetchSentimentShift(o) },
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

function agoLabel(at) {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

// LLM fields sometimes arrive with markdown / fence dressing ("**bold**",
// "- bullets", ```json fences, raw line breaks). The desk always reads as
// clean prose, so strip the code-ish artifacts at render time.
function plain(v) {
  let s = String(v ?? '')
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`/g, '')
  s = s.replace(/^#{1,6}\s*/gm, '')
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
  s = s.replace(/^\s*[-*•]\s+/gm, '')
  s = s.replace(/^\s*\d+[.)]\s+/gm, '')
  return s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

// Multi-line prose: keep paragraph breaks, drop the code-ish dressing.
function prose(v) {
  return String(v ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim())
    .filter(Boolean)
}

// Normalize an LLM list field (array of strings | array of objects | one blob
// of text) into a clean string array.
function asList(v) {
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === 'object'
        ? plain(x.t || x.text || x.point || x.read || x.summary || '')
        : plain(x)))
      .filter(Boolean)
  }
  if (typeof v === 'string' && v.trim()) return prose(v)
  return []
}

function digestList(result) {
  return (Array.isArray(result.agentDigests) ? result.agentDigests : [])
    .map((d) => (typeof d === 'string'
      ? { agent: 'Desk', weight: 'medium', read: plain(d) }
      : {
        agent: plain(d?.agent || d?.name || 'Agent'),
        weight: d?.weight || 'medium',
        read: plain(d?.read || d?.summary || d?.text || ''),
      }))
    .filter((d) => d.agent && d.read)
}

// The savable final template: the whole desk process (every agent's read) plus
// the reconciled house view, as one markdown report the user keeps or shares.
function buildFinalReport(result, sym, savedAt) {
  const deskStance = deskStanceOf(result.stance)
  const price = Number(result.priceUsd) || 0
  const change = Number(result.change24h)
  const L = []
  L.push(`# VERDICT · FINAL TOKEN REPORT — ${result.name || sym} (${sym})`)
  L.push('')
  L.push(`Master desk stance: **${deskStance.label}** · conviction ${result.conviction ?? '—'}/100 · timeframe ${plain(result.timeframe) || '—'}`)
  if (price > 0) L.push(`Price: ${fmtUsd(price)}${Number.isFinite(change) ? ` (${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h)` : ''}`)
  L.push(`Agents consulted: ${result.agentsUsed || '—'}${savedAt ? ` · saved read from ${agoLabel(savedAt)}` : ''}`)
  L.push('')
  L.push('## Final call')
  L.push(plain(result.headline) || '—')
  const thesis = prose(result.thesis)
  if (thesis.length) {
    L.push('')
    L.push('## Thesis')
    thesis.forEach((t) => L.push(t))
  }
  L.push('')
  L.push('## Judge scores')
  L.push(`- Bull case: ${result.bullScore ?? '—'}/100`)
  L.push(`- Bear case: ${result.bearScore ?? '—'}/100`)
  const points = asList(result.keyPoints)
  if (points.length) {
    L.push('')
    L.push('## What moved the call')
    points.forEach((p) => L.push(`- ${p}`))
  }
  const digests = digestList(result)
  if (digests.length) {
    L.push('')
    L.push('## The process — every agent, in one line')
    digests.forEach((d, i) => L.push(`${i + 1}. **${d.agent}** (${d.weight} weight): ${d.read}`))
  }
  const risks = asList(result.risks)
  if (risks.length) {
    L.push('')
    L.push('## What breaks this stance')
    risks.forEach((r) => L.push(`- ${r}`))
  }
  const cats = asList(result.catalysts)
  if (cats.length) {
    L.push('')
    L.push('## What could accelerate it')
    cats.forEach((c) => L.push(`- ${c}`))
  }
  L.push('')
  L.push('## Levels & discipline')
  L.push(`- Support: ${plain(result.levels?.support) || '—'}`)
  L.push(`- Resistance: ${plain(result.levels?.resistance) || '—'}`)
  L.push(`- Invalidation: ${plain(result.levels?.invalidation) || '—'}`)
  const sizeNote = plain(result.sizeNote)
  if (sizeNote) L.push(`- Sizing note: ${sizeNote}`)
  L.push('')
  L.push('---')
  L.push(`Generated by the Verdict agent console · ${new Date().toLocaleString()} · educational analysis, do your own research (DYOR) — not financial advice.`)
  return L.join('\n')
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
        <motion.span
          className="grid h-14 w-14 place-items-center rounded-2xl"
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
  const [savedAt, setSavedAt] = useState(null)
  const [copied, setCopied] = useState(false)
  const retriedRef = useRef(false)
  const forceRef = useRef(false)

  // A new token gets a fresh auto-retry budget.
  useEffect(() => { retriedRef.current = false }, [token])

  const settled = useMemo(
    () => AGENTS.filter((a) => steps[a.key] === 'done' || steps[a.key] === 'failed').length,
    [steps]
  )

  useEffect(() => {
    if (!token) return undefined
    let alive = true

    // Saved read: a reconciled final for this token already lives in the cache
    // mirror — open straight onto it with every step checked off, instead of
    // replaying the gather theatre (and a fresh synthesis) on every visit.
    const force = forceRef.current
    forceRef.current = false
    if (!force) {
      const saved = peekFinal(token)
      if (saved?.value && !saved.value.degraded) {
        setResult(saved.value)
        setSteps(Object.fromEntries(AGENTS.map((a) => [a.key, 'done'])))
        setFailed(0)
        setSavedAt(saved.at)
        setPhase('ready')
        return () => { alive = false }
      }
    }

    setPhase('gathering')
    setResult(null)
    setFailed(0)
    setSavedAt(null)
    setSteps(Object.fromEntries(AGENTS.map((a) => [a.key, 'running'])))

    ;(async () => {
      const collected = {}
      let misses = 0
      const opts = force ? { force: true } : undefined

      await Promise.all(AGENTS.map(async (a) => {
        try {
          const data = await a.run(token, opts)
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
        const final = await fetchFinal(token, collected, opts)
        if (!alive) return
        setResult(final)
        setPhase('ready')
      } catch (err) {
        if (!alive) return
        console.error('[FINAL] synthesis failed:', err)
        // One silent auto-retry before the user ever sees an error state —
        // a transient synthesis hiccup should heal itself, not dead-end the desk.
        if (!retriedRef.current) {
          retriedRef.current = true
          setTimeout(() => { if (alive) setRunKey((k) => k + 1) }, 900)
          return
        }
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

  // Save the final template: one click downloads the full report (the whole
  // desk process + the reconciled analysis) as markdown and copies it too.
  function saveReport() {
    if (!result) return
    const md = buildFinalReport(result, sym, savedAt)
    try {
      const blob = new Blob([md], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `VERDICT-${sym}-final-report.md`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch { /* download blocked — the clipboard copy still delivers it */ }
    navigator.clipboard?.writeText(md)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
      .catch(() => {})
  }

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
        {savedAt && phase === 'ready' && (
          <span className="cv-chip" style={{ color: TONES.amber }}>
            <Clock size={12} /> saved read · {agoLabel(savedAt)}
          </span>
        )}
        <span className="cv-chip"><Layers size={12} /> {result?.agentsUsed || settled} agents</span>
        {result && phase === 'ready' && (
          <button type="button" className="cv-chip" onClick={saveReport}>
            {copied ? <Check size={12} /> : <Download size={12} />} {copied ? 'Copied' : 'Save report'}
          </button>
        )}
        <button
          type="button"
          className="cv-chip"
          onClick={() => { retriedRef.current = false; forceRef.current = true; setRunKey((k) => k + 1) }}
        >
          <RefreshCw size={12} /> Re-gather
        </button>
      </div>
    </motion.div>
  )

  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <ErrorState error={null} onRetry={() => { retriedRef.current = false; forceRef.current = true; setRunKey((k) => k + 1) }}>
          <p className="font-mono text-[11.5px] text-faint">
            The reconcile pass for {sym} didn't land on this run (it already retried once
            behind the scenes). Every agent read you gathered is intact — run it again.
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
  // Sanitized view of every LLM field — the page never renders raw dressing.
  const headline = plain(result.headline)
  const thesisLines = prose(result.thesis)
  const keyPoints = (Array.isArray(result.keyPoints) ? result.keyPoints : [])
    .map((p) => (typeof p === 'string'
      ? { t: plain(p), w: 'neutral' }
      : { t: plain(p?.t || p?.text || p?.point || ''), w: p?.w || p?.weight || 'neutral' }))
    .filter((p) => p.t)
  const digests = digestList(result)
  const risks = asList(result.risks)
  const catalysts = asList(result.catalysts)
  const levels = {
    support: plain(result.levels?.support),
    resistance: plain(result.levels?.resistance),
    invalidation: plain(result.levels?.invalidation),
  }
  const sizeNote = plain(result.sizeNote)
  const timeframe = plain(result.timeframe)

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
              {headline || 'The desk reconciled every agent pass on this token.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <span className="cv-chip"><Clock size={12} /> {timeframe || 'this session'}</span>
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

      </motion.div>

      {/* ── the final report card: every agent pass + the house view, one auto-generated view ── */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.06, type: 'spring', stiffness: 180, damping: 22 }}
        className="cv-panel overflow-hidden"
        style={{ borderColor: `${toneColor}33`, boxShadow: `0 0 46px ${toneColor}0f inset` }}
      >
        {/* header strip */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8"
          style={{ background: `${toneColor}0d`, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg"
              style={{ color: TONES.amber, background: 'rgba(255,194,75,0.14)', border: '1px solid rgba(255,194,75,0.3)' }}
            >
              <Crown size={13} strokeWidth={2.2} />
            </span>
            <p className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: '#f4f8ff' }}>
              Final report · {result.name || sym}
            </p>
          </div>
          <MicroLabel>
            auto-generated from {result.agentsUsed || settled} agent passes · {new Date(savedAt || Date.now()).toLocaleString()}
          </MicroLabel>
        </div>

        {/* body */}
        <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[1.35fr_1fr]">
          {/* left rail — thesis, what moved the call, the full process */}
          <div className="min-w-0">
            {thesisLines.length > 0 && (
              <>
                <MicroLabel>Thesis</MicroLabel>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {thesisLines.map((t, i) => (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
                      className="text-[13px] leading-relaxed"
                      style={{ color: '#c3d0ea' }}
                    >
                      {t}
                    </motion.p>
                  ))}
                </div>
              </>
            )}

            {keyPoints.length > 0 && (
              <>
                <MicroLabel className="mt-7 block">What moved the call</MicroLabel>
                <div className="mt-2.5 flex flex-col gap-2">
                  {keyPoints.map((p, i) => {
                    const c = TONES[POINT_TONE[p.w] || 'blue']
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.12 + i * 0.05, type: 'spring', stiffness: 240, damping: 22 }}
                        className="flex items-start gap-3 rounded-xl border px-3.5 py-2.5"
                        style={{ borderColor: `${c}26`, background: `${c}08` }}
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                        <p className="text-[12.5px] leading-relaxed" style={{ color: '#d5e0f5' }}>{p.t}</p>
                      </motion.div>
                    )
                  })}
                </div>
              </>
            )}

            {digests.length > 0 && (
              <>
                <div className="mt-7 flex items-baseline justify-between gap-3">
                  <MicroLabel>The process — every agent, in one line</MicroLabel>
                  <MicroLabel>{failed ? `${failed} agent${failed > 1 ? 's' : ''} unavailable` : 'all agents reported'}</MicroLabel>
                </div>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {digests.map((d, i) => {
                    const wc = TONES[WEIGHT_TONE[d.weight] || 'blue']
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.14 + i * 0.05, duration: 0.3 }}
                        className="flex items-start gap-3 rounded-xl border px-3.5 py-3"
                        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}
                      >
                        <span
                          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-bold"
                          style={{ color: wc, borderColor: `${wc}55`, background: `${wc}14` }}
                        >
                          {i + 1}
                        </span>
                        <p className="min-w-0 text-[12.5px] leading-relaxed" style={{ color: '#a6b4d4' }}>
                          <span className="font-semibold" style={{ color: '#d5e0f5' }}>{d.agent}</span>
                          <span className="mx-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: wc }}>
                            {d.weight} weight
                          </span>
                          {d.read}
                        </p>
                      </motion.div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* right rail — judge scores, risks, catalysts */}
          <div className="min-w-0">
            <MicroLabel>Judge scores — bull case vs bear case</MicroLabel>
            <div className="mt-3 flex flex-col gap-4">
              {[
                { label: 'bull case', score: result.bullScore, color: TONES.up },
                { label: 'bear case', score: result.bearScore, color: TONES.down },
              ].map((side) => (
                <div key={side.label}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <MicroLabel>{side.label}</MicroLabel>
                    <span className="font-mono text-[24px] font-black leading-none" style={{ color: side.color }}>
                      {Number.isFinite(Number(side.score)) ? side.score : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/5 bg-white/[0.07]">
                    <motion.div
                      className="h-full rounded-full"
                      animate={{ width: `${Math.max(0, Math.min(100, Number(side.score) || 0))}%` }}
                      transition={{ type: 'spring', stiffness: 120, damping: 24 }}
                      style={{
                        background: `linear-gradient(90deg, ${side.color}55, ${side.color})`,
                        boxShadow: `0 0 12px ${side.color}66`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: '#8b98bd' }}>
              One desk judged both sides on every agent's evidence —
              {' '}{Math.abs((Number(result.bullScore) || 0) - (Number(result.bearScore) || 0))} points separate the two cases on this pass.
            </p>

            {risks.length > 0 && (
              <>
                <MicroLabel className="mt-7 block">What breaks this stance</MicroLabel>
                <div className="mt-2.5 flex flex-col gap-2">
                  {risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONES.down }} />
                      <p className="text-[12.5px] leading-relaxed" style={{ color: '#b9c6e2' }}>{r}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {catalysts.length > 0 && (
              <>
                <MicroLabel className="mt-7 block">What could accelerate it</MicroLabel>
                <div className="mt-2.5 flex flex-col gap-2">
                  {catalysts.map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONES.up }} />
                      <p className="text-[12.5px] leading-relaxed" style={{ color: '#b9c6e2' }}>{c}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* levels + discipline strip */}
        <div
          className="grid gap-3 px-6 py-5 sm:px-8 lg:grid-cols-[1fr_1.2fr]"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <MicroLabel>Levels the desk is watching</MicroLabel>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
              {[
                { label: 'Support', value: levels.support, tone: 'up' },
                { label: 'Resistance', value: levels.resistance, tone: 'down' },
                { label: 'Invalidation', value: levels.invalidation, tone: 'amber' },
              ].map((l) => (
                <div
                  key={l.label}
                  className="rounded-xl border px-3.5 py-3"
                  style={{ borderColor: `${TONES[l.tone]}30`, background: `${TONES[l.tone]}0a` }}
                >
                  <MicroLabel>{l.label}</MicroLabel>
                  <p className="mt-1.5 font-mono text-[12.5px] leading-snug" style={{ color: TONES[l.tone] }}>{l.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
          {sizeNote && (
            <div className="flex items-end">
              <p
                className="w-full rounded-xl border px-4 py-3.5 text-[12.5px] leading-relaxed"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.025)', color: '#a6b4d4' }}
              >
                {sizeNote}
              </p>
            </div>
          )}
        </div>

        {/* footer strip */}
        <div className="px-6 py-3.5 sm:px-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <MicroLabel>educational analysis · do your own research · not financial advice</MicroLabel>
        </div>
      </motion.div>

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
