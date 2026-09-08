// Deep Analysis agent — forensic five-pillar read with full reasoning.
// Runs a visible staged pipeline (the generation flow), then renders
// the evidence pack. Same symbol → same verdict, every time.
import { useEffect, useState, useRef } from 'react'
import {
  Microscope, RefreshCw, Swords, ShieldAlert, ImageIcon,
  Gauge, TrendingUp, TrendingDown, Activity, Search, Sparkles, Timer, ExternalLink,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fetchVerdict, peekVerdict } from '../../lib/api'
import { stanceOf } from '../../lib/stance'
import { plain, prose, asList, level } from '../../lib/text'
import { fmtPrice, fmtPct, fmtNum, ErrorState } from '../../components/DashUI'
import DyorNote from '../../components/DyorNote'
import PercentLoader from '../../components/loaders/PercentLoader'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow, SourceRow,
  MicroLabel, ProgressMeter, TONES,
} from '../../components/ConsoleUI'

const PILLAR_LABELS = {
  technical: 'Technical',
  market: 'Market Position',
  risk: 'Risk Profile',
  catalyst: 'Catalyst Density',
  sentiment: 'Sentiment Drift',
}

// stance.tone → ConsoleUI TONES key (same green / amber / red intent as before)
const STANCE_TONE = { positive: 'up', neutral: 'amber', risk: 'down' }

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

function scoreTone(score) {
  return score >= 70 ? 'up' : score >= 50 ? 'amber' : 'down'
}

function DeepSkeleton() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <PercentLoader label="Opening the deep research file" />
    </div>
  )
}

function RunningFlow() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <PercentLoader label="Deep research running" />
    </div>
  )
}

export default function DeepAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [result, setResult] = useState(null)
  const [runKey, setRunKey] = useState(0)
  const forceRef = useRef(false)

  useEffect(() => {
    if (!token) return undefined
    let alive = true
    // Saved read: a previous run for this token lives in the cache mirror —
    // render it at once (no spinner theatre on revisit) while the fetch below
    // silently keeps the mirror current for the next open.
    const force = forceRef.current
    forceRef.current = false
    const saved = force ? null : peekVerdict(token)
    if (saved?.value && !saved.value.error) {
      setResult(saved.value)
      setPhase('done')
    } else {
      setPhase('running')
      setResult(null)
    }
    fetchVerdict(token, force ? { force: true } : undefined).then((r) => {
      if (!alive) return
      setResult(r)
      setPhase('done')
    }).catch((err) => {
      if (!alive) return
      if (saved?.value) return // keep the saved read on a transient failure
      setResult({ error: err.message })
      setPhase('error')
    })
    return () => {
      alive = false
    }
  }, [token, runKey])

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <div className="cv-panel flex flex-col items-center px-6 py-14 text-center">
        <Search size={22} className="mb-3" style={{ color: '#66739a' }} />
        <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>Set a token first</h3>
        <p className="mt-1.5 max-w-sm text-[13px]" style={{ color: '#8b98bd' }}>
          Enter a token on the Your Token page or use the search bar above to begin.
        </p>
        <a href="/dashboard" className="cv-chip mt-5">Go to Your Token</a>
      </div>
    )
  }

  if (phase === 'running') {
    return <RunningFlow symbol={token.toUpperCase()} />
  }

  if (phase === 'error') {
    return <ErrorState error={result?.error} onRetry={() => setRunKey((k) => k + 1)} />
  }

  if (!result) return <DeepSkeleton />

  const v = result
  const pillarEntries = Object.entries(v.scores || {})
  const strong = Object.values(v.scores).filter((p) => p.score >= 70).length
  const stance = stanceOf(v.verdict)
  const verdictTone = STANCE_TONE[stance.tone] || 'blue'
  const price = fmtPrice(v.priceUsd)
  const bullReasons = asList(v.bullReasons)
  const bearReasons = asList(v.bearReasons)
  const sources = Array.isArray(v.sources) ? v.sources.filter((s) => s?.url) : []
  const keyLevels = v.keyLevels && typeof v.keyLevels === 'object' ? v.keyLevels : {}
  const hasKeyLevels = ['support', 'resistance', 'stopLoss', 'target'].some((k) => keyLevels[k])
  const risk = v.riskAssessment && typeof v.riskAssessment === 'object' ? v.riskAssessment : null
  const riskMetrics = (Array.isArray(risk?.metrics) ? risk.metrics : [])
    .map((m) => ({ ...m, label: plain(m?.label), text: plain(m?.text) }))
  const riskDataGaps = asList(risk?.dataGaps)
  const summary = plain(v.summary)
  const gradeNote = plain(risk?.gradeNote)
  const finalThesis = prose(v.finalThesis)
  const GRADE_TONE = { SEVERE: 'down', ELEVATED: 'down', MODERATE: 'amber', GUARDED: 'amber', CONTAINED: 'up' }
  const sideTone = (side) => (side === 'risk' ? 'down' : side === 'positive' ? 'up' : 'amber')
  const answer = `${v.name || v.symbol} shows ${stance.label} at ${price === '—' ? 'no published price' : price}, ${fmtPct(v.change24h)} on the day. `
    + `The model scores the bull case ${v.bullScore} against a bear case of ${v.bearScore}, with ${strong} of 5 pillars in the strong band.`

  return (
    <div className="flex flex-col gap-4">
      <AnswerBanner
        icon={Microscope}
        kicker={`Deep analysis · ${v.symbol}`}
        answer={answer}
        stance={<StancePill label={stance.label} tone={verdictTone} />}
        confidence={v.confidence}
        confidenceTone={verdictTone}
        chips={[
          `bull ${v.bullScore} · bear ${v.bearScore}`,
          `${strong} strong pillars`,
          risk ? `structural risk ${risk.riskScore}/100 · ${risk.grade}` : null,
          `as of ${new Date(v.asOf).toLocaleTimeString()}`,
        ].filter(Boolean)}
      >
        <button type="button" onClick={() => { forceRef.current = true; setRunKey((k) => k + 1) }} className="cv-chip">
          <RefreshCw size={12} /> Re-run
        </button>
      </AnswerBanner>

      <div className="cv-grid-stats">
        <StatTile
          icon={Sparkles}
          label="Price"
          value={price}
          delta={v.change24h}
          deltaTone={Number(v.change24h) >= 0 ? 'up' : 'down'}
          foot="live 24h change"
          delay={0.02}
        />
        <StatTile icon={TrendingUp} label="Bull Case" value={v.bullScore} foot="model-scored upside" delay={0.06} />
        <StatTile icon={TrendingDown} label="Bear Case" value={v.bearScore} foot="model-scored downside" delay={0.1} />
        <StatTile icon={Gauge} label="Confidence" value={`${v.confidence}/100`} foot="AI reasoning" delay={0.14} />
      </div>

      <PanelV2 icon={Activity} title="Bull vs Bear Tension" right={<MicroLabel>scored evidence</MicroLabel>} delay={0.18}>
        <ScoreBar left={v.bullScore} right={v.bearScore} leftLabel="Bull" rightLabel="Bear" leftTone="up" rightTone="down" />
        <InsightRow icon={Microscope} tone={verdictTone} title={stance.label} body={summary} />
      </PanelV2>

      {risk && (
        <PanelV2
          icon={ShieldAlert}
          title="Structural Memecoin Risk Read"
          right={<StancePill label={`${risk.grade} · risk ${risk.riskScore}/100`} tone={GRADE_TONE[risk.grade] || 'amber'} />}
          delay={0.2}
        >
          <ScoreBar
            left={risk.positivityScore}
            right={risk.riskScore}
            leftLabel="Positivity"
            rightLabel="Risk"
            leftTone="up"
            rightTone="down"
          />
          {gradeNote && (
            <InsightRow icon={ShieldAlert} tone={GRADE_TONE[risk.grade] || 'amber'} title={`${risk.grade} structural grade`} body={gradeNote} />
          )}
          <div className="mt-2 flex flex-col">
            {riskMetrics.map((m) => (
              <div key={m.id}>
                <div className="cv-rowline">
                  <span className="cv-rowline-label">{m.label}</span>
                  <span className="cv-rowline-cell text-right font-mono text-[12px]" style={{ color: TONES[sideTone(m.side)] || TONES.blue }}>
                    {m.value} · risk {m.score}/100
                  </span>
                </div>
                <InsightRow icon={Activity} tone={sideTone(m.side)} title={m.label} body={m.text} />
              </div>
            ))}
          </div>
          {riskDataGaps.length > 0 && (
            <p className="mt-3 font-mono text-[10.5px] leading-relaxed" style={{ color: '#66739a' }}>
              DATA GAPS: {riskDataGaps.join(' · ')}
            </p>
          )}
        </PanelV2>
      )}

      <div className="cv-grid-2">
        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2 icon={Gauge} title="Five-Pillar Scores" right={<MicroLabel>{strong} of 5 strong</MicroLabel>} delay={0.22}>
            {pillarEntries.map(([k, pillar], i) => {
              const tone = scoreTone(pillar.score)
              const color = TONES[tone]
              return (
                <div key={k}>
                  <div className="cv-rowline">
                    <span className="cv-rowline-label">{PILLAR_LABELS[k] || k}</span>
                    <span className="cv-rowline-cell flex items-center justify-end gap-3">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/8">
                        <motion.span
                          initial={{ width: 0 }}
                          animate={{ width: `${pillar.score}%` }}
                          transition={{ duration: 0.8, delay: 0.2 + i * 0.07, ease: 'easeOut' }}
                          className="block h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${color}66, ${color})` }}
                        />
                      </span>
                      <span className={`w-8 text-right font-mono text-[14px] font-bold ${pillar.score >= 70 ? 'win' : ''}`} style={{ color }}>
                        {pillar.score}
                      </span>
                    </span>
                  </div>
                  <InsightRow icon={Activity} tone={tone} title={PILLAR_LABELS[k] || k} body={plain(pillar.reasoning)} />
                </div>
              )
            })}
          </PanelV2>

          <PanelV2 icon={Timer} title="Key Levels" right={<MicroLabel>{hasKeyLevels ? 'published targets' : 'no levels published'}</MicroLabel>} delay={0.3}>
            {hasKeyLevels ? (
              [
                ['Support', keyLevels.support],
                ['Resistance', keyLevels.resistance],
                ['Stop Loss', keyLevels.stopLoss],
                ['Target', keyLevels.target],
              ].map(([label, value]) => (
                <div key={label} className="cv-rowline">
                  <span className="cv-rowline-label">{label}</span>
                  <span className="cv-rowline-cell text-right font-mono text-[12px]">{level(value)}</span>
                </div>
              ))
            ) : (
              <p className="text-[12px]" style={{ color: '#66739a' }}>No key levels were published with this analysis run.</p>
            )}
          </PanelV2>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <PanelV2 icon={TrendingUp} title="Bull Case" right={<MicroLabel>{fmtNum(bullReasons.length)} bullets</MicroLabel>} delay={0.26}>
              {bullReasons.length === 0 ? (
                <p className="text-[12px]" style={{ color: '#66739a' }}>No bullish evidence bullets were published for this run.</p>
              ) : (
                bullReasons.map((reason, i) => <InsightRow key={i} icon={TrendingUp} tone="up" title={reason} />)
              )}
            </PanelV2>

            <PanelV2 icon={TrendingDown} title="Bear Case" right={<MicroLabel>{fmtNum(bearReasons.length)} bullets</MicroLabel>} delay={0.32}>
              {bearReasons.length === 0 ? (
                <p className="text-[12px]" style={{ color: '#66739a' }}>No bearish evidence bullets were published for this run.</p>
              ) : (
                bearReasons.map((reason, i) => <InsightRow key={i} icon={TrendingDown} tone="down" title={reason} />)
              )}
            </PanelV2>
          </div>

          <PanelV2 icon={Microscope} title="Final Thesis" delay={0.36}>
            {finalThesis.length > 0 ? (
              <div className="flex flex-col gap-2">
                {finalThesis.map((t, i) => (
                  <p key={i} className="text-[13px] leading-relaxed" style={{ color: '#aebfe4' }}>{t}</p>
                ))}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: '#66739a' }}>No final thesis was published for this analysis run.</p>
            )}
          </PanelV2>

          <PanelV2 icon={ExternalLink} title="Sources" right={<MicroLabel>{sources.length} links</MicroLabel>} delay={0.4}>
            {sources.length === 0 ? (
              <p className="text-[12px]" style={{ color: '#66739a' }}>
                This verdict payload does not publish source URLs. The reasoning above is grounded in the fetched market data and model analysis.
              </p>
            ) : (
              sources.map((s, i) => (
                <SourceRow key={`${s.url}-${i}`} title={s.title || s.name} url={s.url} tag={s.tag || 'source'} />
              ))
            )}
          </PanelV2>

          <PanelV2 icon={Timer} title="Live Reasoning" delay={0.44}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: '#8b98bd' }}>
              Grounded in real-time market data and live web research for {v.symbol}, then reasoned through the AI analyst on every run — never a cached template.
            </p>
            <p className="mt-3 font-mono text-[10px] tracking-[0.14em]" style={{ color: '#66739a' }}>
              {v.timing ? `RESEARCH ${v.timing.dataFetchMs || 0}ms · REASONING ${v.timing.llmMs || 0}ms` : `AS OF ${new Date(v.asOf).toLocaleTimeString()}`}
            </p>
          </PanelV2>

          <PanelV2 icon={Swords} title={`Run the stack on ${v.symbol}`} delay={0.48}>
            <div className="flex flex-wrap gap-2">
              <Link to={`/dashboard/council?token=${v.symbol}`} className="cv-chip"><Swords size={12} /> Debate it</Link>
              <Link to={`/dashboard/risk?token=${v.symbol}`} className="cv-chip"><ShieldAlert size={12} /> Size the trade</Link>
              <Link to={`/dashboard/studio/image?token=${v.symbol}`} className="cv-chip"><ImageIcon size={12} /> Make it shareable</Link>
            </div>
          </PanelV2>
        </div>
      </div>

      <DyorNote />
    </div>
  )
}
