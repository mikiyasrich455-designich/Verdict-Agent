// Sentiment Shift agent — 7-day mood drift monitor.
import { useId } from 'react'
import { Gauge, RefreshCw, TrendingUp, TrendingDown, Minus, Clock, Quote, Sigma } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchSentimentShift } from '../../lib/api'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow, SourceRow,
  MicroLabel, LivePill, TONES,
} from '../../components/ConsoleUI'
import { ErrorState } from '../../components/DashUI'
import PercentLoader from '../../components/loaders/PercentLoader'

const DIR_META = {
  'risk-on rotation': { icon: TrendingUp, cls: 'text-success', note: 'Confidence is rotating in. Momentum playbooks get the green light, but watch for crowded positioning near the top of the drift.' },
  'risk-off rotation': { icon: TrendingDown, cls: 'text-danger', note: 'Confidence is rotating out. The desk shifts to capital preservation — dips are observed, not chased.' },
  'range-bound': { icon: Minus, cls: 'text-warning', note: 'Mood is flat. Range-bound sentiment favors selectivity: catalysts over momentum until the drift picks a direction.' },
}

const DIR_TONE = {
  'risk-on rotation': 'up',
  'risk-off rotation': 'down',
  'range-bound': 'amber',
}

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

// The real 7-point series drawn as an SVG area chart — fixed 0–100 index domain,
// dashed reference lines at 25 / 50 / 75, day labels straight from the payload.
function SentimentChart({ series, tone }) {
  const gid = useId().replace(/[:]/g, '')
  const pts = (series || []).map((s) => Number(s?.value))
  const ok = pts.length >= 2 && pts.every((n) => Number.isFinite(n))
  const color = TONES[tone] || TONES.blue

  if (!ok) {
    return (
      <div className="flex h-[180px] flex-col items-center justify-center px-6 text-center">
        <Gauge size={20} className="mb-2" style={{ color: '#66739a' }} />
        <p className="text-[12.5px] leading-relaxed" style={{ color: '#8b98bd' }}>
          This run returned fewer than two daily sentiment reads, so there is nothing honest to chart yet.
        </p>
      </div>
    )
  }

  const n = pts.length
  const coords = pts.map((v, i) => [
    (i / (n - 1)) * 100,
    100 - Math.max(0, Math.min(100, v)),
  ])
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
  const area = `${line} L100 100 L0 100 Z`

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[220px] w-full" aria-label="Seven-day fear and greed drift">
        <defs>
          <linearGradient id={`ss-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((v) => (
          <line
            key={v}
            x1="0" x2="100" y1={100 - v} y2={100 - v}
            stroke={v === 50 ? 'rgba(174,191,228,0.22)' : 'rgba(174,191,228,0.12)'}
            strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#ss-${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1.5 flex justify-between">
        {(series || []).map((s, i) => (
          <span key={i} className="font-mono text-[9.5px]" style={{ color: '#66739a' }}>{s?.day ?? ''}</span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
        <MicroLabel>{n} daily reads · index {pts[0]} → {pts[n - 1]} · 0 fear … 100 greed</MicroLabel>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <PercentLoader label="Scanning social & sentiment flow" />
    </div>
  )
}

export default function SentimentShift() {
  const [runKey, rerun] = useRunKey()
  const { status, data, error: agentError } = useAgentData(() => fetchSentimentShift(), [runKey])

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
          <Gauge size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold leading-tight tracking-tight" style={{ color: '#f4f8ff' }}>Sentiment Shift</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#aebfe4' }}>
            Seven-day mood drift — where the crowd is heading, not where it stood.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <LivePill label="live sentiment" />
        <button type="button" onClick={rerun} className="cv-btn">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </motion.div>
  )

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
  const meta = DIR_META[d.direction] || DIR_META['range-bound']
  const DirIcon = meta.icon
  const dirTone = DIR_TONE[d.direction] || 'amber'
  const dirColor = TONES[dirTone]
  const series = Array.isArray(d.series) ? d.series : []
  const spark = series.map((s) => Number(s?.value)).filter((n) => Number.isFinite(n))
  const driftWord = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : 'flat'
  const quotes = Array.isArray(d.quotes) ? d.quotes : Array.isArray(d.evidence) ? d.evidence : []

  return (
    <div className="flex flex-col gap-4">
      {header}

      {/* ── the answer, first ── */}
      <AnswerBanner
        icon={DirIcon}
        kicker="Sentiment shift · 7-day drift"
        answer={
          `The crowd reads ${d.now}/100 today — ${driftWord === 'flat' ? 'unchanged' : `${driftWord} ${Math.abs(d.delta)} points`} from ${d.weekAgo} a week ago across ${series.length} daily samples. The desk calls it a ${d.direction}.`
        }
        stance={<StancePill label={d.direction} tone={dirTone} />}
        confidence={null}
        chips={[
          `${series.length} daily samples`,
          `now ${d.now}/100`,
          `week ago ${d.weekAgo}/100`,
          `${d.delta >= 0 ? '+' : ''}${d.delta} pts`,
        ]}
      />

      {/* ── live numbers ── */}
      <div className="cv-grid-stats">
        <StatTile
          icon={Gauge}
          label="Now"
          value={d.now}
          spark={spark}
          sparkTone={dirTone}
          foot="fear & greed today"
          delay={0.02}
        />
        <StatTile
          icon={Clock}
          label="Week Ago"
          value={d.weekAgo}
          foot="where the drift started"
          delay={0.06}
        />
        <StatTile
          icon={Sigma}
          label="7-Day Delta"
          value={`${d.delta >= 0 ? '+' : ''}${d.delta} pts`}
          foot={driftWord === 'flat' ? 'holding steady' : `drifting ${driftWord}`}
          delay={0.1}
        />
        <StatTile
          icon={DirIcon}
          label="Rotation"
          value={<span className="text-[14px] uppercase" style={{ color: dirColor }}>{d.direction}</span>}
          foot="regime read"
          delay={0.14}
        />
      </div>

      <div className="cv-grid-2">
        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2
            icon={TrendingUp}
            title="Fear & Greed · 7 days"
            right={<MicroLabel>index 0–100</MicroLabel>}
            delay={0.16}
          >
            <SentimentChart series={series} tone={dirTone} />
            <div className="mt-4 border-t border-[rgba(126,156,255,0.14)] pt-4">
              <ScoreBar
                left={d.now}
                right={100 - d.now}
                leftLabel="Greed side"
                rightLabel="Fear side"
                leftTone="up"
                rightTone="down"
              />
            </div>
          </PanelV2>

          <PanelV2
            icon={Quote}
            title="Voices behind the drift"
            right={<MicroLabel>{quotes.length} quoted</MicroLabel>}
            delay={0.22}
          >
            {quotes.length > 0 ? (
              quotes.map((q, i) => {
                const handle = q?.handle || q?.author || q?.user || q?.source || null
                const text = q?.text || q?.quote || q?.title || q?.body || null
                const url = q?.url || q?.link || null
                return (
                  <div key={i} className="flex flex-col gap-1.5">
                    <InsightRow
                      icon={Quote}
                      tone={dirTone}
                      title={text || 'Quoted post'}
                      body={handle ? `— ${handle}` : undefined}
                    />
                    {url && <SourceRow title={handle ? `${handle}'s post` : 'Original post'} url={url} tag="source" />}
                  </div>
                )
              })
            ) : (
              <p className="text-[12px] leading-relaxed" style={{ color: '#8b98bd' }}>
                This run returned no quoted posts — the drift numbers above are the whole payload.
                Nothing here is invented to fill the gap.
              </p>
            )}
          </PanelV2>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2 icon={DirIcon} title="Rotation Read" delay={0.19}>
            <InsightRow
              icon={DirIcon}
              tone={dirTone}
              title={d.direction}
              body={meta.note}
            />
            <div className="mt-3 border-t border-[rgba(126,156,255,0.14)] pt-3">
              <InsightRow
                icon={Sigma}
                tone="blue"
                title="Agent wiring"
                body="This feed feeds the Overview regime flag and the Risk Desk sizing rules — one sentiment read, three consumers."
              />
            </div>
          </PanelV2>
        </div>
      </div>
    </div>
  )
}
