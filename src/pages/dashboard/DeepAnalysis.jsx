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
import { fetchVerdict } from '../../lib/api'
import { fmtPrice, fmtPct, fmtNum, ErrorState } from '../../components/DashUI'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow, SourceRow,
  MicroLabel, TONES,
} from '../../components/ConsoleUI'

const PILLAR_LABELS = {
  technical: 'Technical',
  market: 'Market Position',
  risk: 'Risk Profile',
  catalyst: 'Catalyst Density',
  sentiment: 'Sentiment Drift',
}

const VERDICT_TONE = { BUY: 'up', HOLD: 'amber', AVOID: 'down' }

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
    <div className="flex flex-col gap-4">
      <div className="cv-panel cv-ghost h-[132px]" />
      <div className="cv-grid-stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[92px]" />)}
      </div>
      <div className="cv-panel cv-ghost h-[150px]" />
      <div className="cv-grid-2">
        <div className="cv-panel cv-ghost h-[260px]" />
        <div className="cv-panel cv-ghost h-[260px]" />
      </div>
    </div>
  )
}

function RunningFlow({ symbol }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="cv-panel flex flex-col items-center px-6 py-9">
      <div className="inline-flex items-center gap-3" style={{ color: '#eaf2ff' }}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6ea8ff] border-t-transparent" />
        <span className="font-mono text-sm">deep-scanning {symbol}…</span>
        <span className="font-mono text-sm" style={{ color: '#7c89b0' }}>{elapsed}s</span>
      </div>
      <p className="mt-4 font-mono text-[11px] tracking-[0.14em]" style={{ color: '#66739a' }}>
        GATHERING LIVE MARKET DATA · AI REASONING
      </p>
      <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="cv-ghost h-[56px]" />)}
      </div>
    </div>
  )
}

export default function DeepAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [result, setResult] = useState(null)
  const [runKey, setRunKey] = useState(0)

  useEffect(() => {
    if (!token) return undefined
    let alive = true
    setPhase('running')
    setResult(null)
    fetchVerdict(token).then((r) => {
      if (!alive) return
      setResult(r)
      setPhase('done')
    }).catch((err) => {
      if (!alive) return
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
  const verdictTone = VERDICT_TONE[v.verdict] || 'blue'
  const price = fmtPrice(v.priceUsd)
  const bullReasons = Array.isArray(v.bullReasons) ? v.bullReasons : []
  const bearReasons = Array.isArray(v.bearReasons) ? v.bearReasons : []
  const sources = Array.isArray(v.sources) ? v.sources.filter((s) => s?.url) : []
  const keyLevels = v.keyLevels && typeof v.keyLevels === 'object' ? v.keyLevels : {}
  const hasKeyLevels = ['support', 'resistance', 'stopLoss', 'target'].some((k) => keyLevels[k])
  const answer = `${v.name || v.symbol} is ${v.verdict} at ${price === '—' ? 'no published price' : price}, ${fmtPct(v.change24h)} on the day. `
    + `The model scores the bull case ${v.bullScore} against a bear case of ${v.bearScore}, with ${strong} of 5 pillars in the strong band.`

  return (
    <div className="flex flex-col gap-4">
      <AnswerBanner
        icon={Microscope}
        kicker={`Deep analysis · ${v.symbol}`}
        answer={answer}
        stance={<StancePill label={v.verdict} tone={verdictTone} />}
        confidence={v.confidence}
        confidenceTone={verdictTone}
        chips={[
          `bull ${v.bullScore} · bear ${v.bearScore}`,
          `${strong} strong pillars`,
          `as of ${new Date(v.asOf).toLocaleTimeString()}`,
        ]}
      >
        <button type="button" onClick={() => setRunKey((k) => k + 1)} className="cv-chip">
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
        <InsightRow icon={Microscope} tone={verdictTone} title={v.verdict} body={v.summary} />
      </PanelV2>

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
                  <InsightRow icon={Activity} tone={tone} title={PILLAR_LABELS[k] || k} body={pillar.reasoning} />
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
                  <span className="cv-rowline-cell text-right font-mono text-[12px]">{value || '—'}</span>
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
            {v.finalThesis ? (
              <p className="text-[13px] leading-relaxed" style={{ color: '#aebfe4' }}>{v.finalThesis}</p>
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
    </div>
  )
}
