import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import Logo from './Logo'
import VerdictBadge, { verdictColor } from './VerdictBadge'
import ScoreBar from './ScoreBar'

export const POINT_LABELS = {
  technical: 'Technical Health',
  market: 'Market Position',
  risk: 'Risk Level',
  catalyst: 'Catalyst Strength',
  sentiment: 'Sentiment',
}

function formatPrice(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return p.toFixed(6)
}

function scoreColor(score) {
  if (score >= 70) return '#34d399'
  if (score >= 50) return '#fbbf24'
  return '#f87171'
}

// ─ Exportable social card (captured with html-to-image) — dark premium ──
const ShareCard = forwardRef(function ShareCard({ data }, ref) {
  const radarData = Object.entries(data.scores).map(([key, { score }]) => ({
    point: POINT_LABELS[key].split(' ')[0],
    score,
  }))
  const changePositive = data.change24h >= 0

  return (
    <div
      ref={ref}
      style={{
        width: 560,
        background: '#05050e',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: 36,
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#f4f4f8',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em' }}>{data.symbol}</span>
            <span style={{ fontSize: 14, color: '#8f8fa8' }}>{data.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }}>
              ${formatPrice(data.priceUsd)}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                fontWeight: 600,
                color: changePositive ? '#34d399' : '#f87171',
                background: changePositive ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                padding: '2px 8px',
                borderRadius: 6,
              }}
            >
              {changePositive ? '+' : '-'}{Math.abs(data.change24h).toFixed(2)}%
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo size={30} />
          <span style={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: 14 }}>
            verdict<span style={{ color: '#5b93ff' }}>*</span>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 24, alignItems: 'center' }}>
        <div style={{ width: 210, height: 210, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="point" tick={{ fill: '#8f8fa8', fontSize: 10 }} />
              <Radar dataKey="score" stroke="#5b93ff" fill="#5b93ff" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {Object.entries(data.scores).map(([key, { score }]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8f8fa8' }}>
                  {POINT_LABELS[key]}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700 }}>
                  {score}
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${score}%`, borderRadius: 99, background: scoreColor(score) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: '16px 20px',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.18em', color: '#8f8fa8', textTransform: 'uppercase', fontWeight: 600 }}>
            Final Verdict
          </div>
          <div style={{ fontSize: 12, color: '#8f8fa8', marginTop: 4 }}>
            Confidence{' '}
            <span style={{ color: '#f4f4f8', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
              {data.confidence}%
            </span>
          </div>
        </div>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.12em', color: verdictColor(data.verdict) }}>
          {data.verdict}
        </span>
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#5c5c75' }}>AI reasoning · Not financial advice</span>
        <span style={{ fontSize: 10, color: '#5c5c75', fontFamily: "'JetBrains Mono', monospace" }}>
          {new Date(data.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
})

// ── Interactive on-page verdict result ──
export default function VerdictCard({ data }) {
  const radarData = Object.entries(data.scores).map(([key, { score }]) => ({
    point: POINT_LABELS[key].split(' ')[0],
    score,
  }))
  const changePositive = data.change24h >= 0

  return (
    <div className="card-aurora p-6 md:p-8 w-full">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-snow">{data.symbol}</h2>
            <span className="text-sm text-muted">{data.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-2.5">
            <span className="text-lg font-mono font-semibold text-snow">${formatPrice(data.priceUsd)}</span>
            <span
              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg ${
                changePositive ? 'text-success bg-success/10 border border-success/20' : 'text-danger bg-danger/10 border border-danger/20'
              }`}
            >
              {changePositive ? '+' : '-'}{Math.abs(data.change24h).toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-[10px] uppercase tracking-[0.25em] text-faint font-mono block mb-2">
            final verdict
          </span>
          <VerdictBadge verdict={data.verdict} />
          <div className="mt-2.5 text-xs text-muted font-mono">
            confidence <span className="font-bold text-snow">{data.confidence}%</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-[240px_1fr] gap-6 mt-8 items-center">
        <div className="h-56 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="rgba(255,255,255,0.07)" />
              <PolarAngleAxis dataKey="point" tick={{ fill: '#8f8fa8', fontSize: 11 }} />
              <Radar dataKey="score" stroke="#5b93ff" fill="#5b93ff" fillOpacity={0.18} strokeWidth={2.5} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4">
          {Object.entries(data.scores).map(([key, { score }], i) => (
            <ScoreBar key={key} label={POINT_LABELS[key]} score={score} delay={0.15 + i * 0.1} />
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-8 p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
      >
        <span className="text-[10px] uppercase tracking-[0.25em] text-faint font-mono">evidence summary</span>
        <p className="mt-2 text-sm md:text-[15px] leading-relaxed text-muted break-words">{data.summary}</p>
      </motion.div>
    </div>
  )
}

export { ShareCard }
