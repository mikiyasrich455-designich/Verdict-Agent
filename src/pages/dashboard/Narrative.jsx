// Narrative agent — the Multi-KOL Narrative spotlight.
// Tracks KOL voices, flags convergence, and stamps every news item
// VERIFIED / UNVERIFIED / CONTRADICTED against on-chain evidence.
import {
  Radio, RefreshCw, Newspaper, Users, TrendingUp, TrendingDown,
  Gauge, Quote, ArrowUpRight,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchNarrative } from '../../lib/api'
import { ErrorState } from '../../components/DashUI'
import DyorNote from '../../components/DyorNote'
import CandleLoader from '../../components/loaders/CandleLoader'
import {
  PanelV2, StatTile, AnswerBanner, InsightRow, SourceRow,
  MicroLabel, LivePill, ProgressMeter, TONES,
} from '../../components/ConsoleUI'


// Platform logos as inline SVG components
function PlatformLogo({ platform, size = 14 }) {
  const icons = {
    x: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    youtube: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
    reddit: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042 1.364l-.003.014c-.254 1.295-1.132 2.439-2.376 3.144a7.689 7.689 0 0 1-.847.369c-.966.363-1.999.538-3.049.538-1.065 0-2.11-.18-3.106-.541a7.652 7.652 0 0 1-.867-.382c-1.238-.708-2.108-1.857-2.354-3.147l-.003-.015a3.12 3.12 0 0 1 .04-1.363 1.755 1.755 0 0 1-1.008-1.614c0-.968.786-1.754 1.754-1.754.476 0 .898.182 1.206.491 1.196-.858 2.855-1.418 4.683-1.486l-.784-3.668-2.588.544a1.25 1.25 0 0 1-2.494-.058c0-.688.562-1.249 1.25-1.249l3.226-.677c.833-.175 1.672.357 1.897 1.184l.941 4.409c.09.421.48.716.91.716.43 0 .82-.295.91-.716l.941-4.409c.225-.827 1.064-1.359 1.897-1.184l3.226.677z"/>
      </svg>
    ),
    tiktok: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.57-4.96 1.66-1.44 3.98-2.13 6.15-1.72.13.02.26.05.38.08-.02.78-.04 1.56-.04 2.34-.85-.24-1.75-.26-2.6-.04-1.06.28-1.99.87-2.65 1.66-.65.78-1.03 1.77-1.02 2.8 0 .29.03.58.09.86.24 1.18.93 2.22 1.9 2.88.96.65 2.16.91 3.31.71 1.15-.2 2.19-.79 2.91-1.64.72-.84 1.11-1.92 1.1-3.02-.02-2.22-.01-4.43-.02-6.65 1.42.63 2.95.97 4.51 1z"/>
      </svg>
    ),
    instagram: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
    web: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2 .9 2 2v.41c2.43.75 4.25 2.37 5.1 4.39-.64.73-1.43 1.32-2.31 1.74z"/>
      </svg>
    ),
  }
  return icons[platform] || icons.web
}

function TonePill({ label, tone }) {
  const color = TONES[tone] || TONES.blue
  return (
    <span
      className="whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={{ color, background: `${color}14`, border: `1px solid ${color}55`, boxShadow: `0 0 18px ${color}33` }}
    >
      {label}
    </span>
  )
}

function StampPill({ stamp }) {
  const tone = stamp === 'VERIFIED' ? 'up' : stamp === 'CONTRADICTED' ? 'down' : 'amber'
  const color = TONES[tone]
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em]"
      style={{ color, background: `${color}14`, border: `1px solid ${color}55` }}
    >
      {stamp}
    </span>
  )
}

function stanceTone(stance) {
  const s = String(stance || '').toLowerCase()
  if (s.includes('bull')) return 'up'
  if (s.includes('bear')) return 'down'
  return 'blue'
}

function KolCard({ k, delay }) {
  const platform = k.platform || 'web'
  const tone = stanceTone(k.stance)
  const color = TONES[tone] || TONES.blue
  const conviction = k.conviction || 50

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: 'easeOut' }}
      className="kol-card"
    >
      <div className="kol-head">
        <span
          className="kol-avatar"
          style={{ color, borderColor: `${color}55`, background: `${color}14` }}
          title={platform}
        >
          <PlatformLogo platform={platform} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="kol-handle">{k.handle}</p>
          <MicroLabel className="kol-meta">
            {platform}
            {k.posted ? ` · ${k.posted}` : ''}
            {k.source && k.source !== k.handle ? ` · ${k.source}` : k.host && k.host !== platform ? ` · ${k.host}` : ''}
          </MicroLabel>
        </div>
        <div className="kol-badges">
          {k.impact && (
            <span
              className="cv-chip !rounded-md !px-2 !py-1 font-mono !text-[9px] !whitespace-nowrap"
              style={k.impact === 'HIGH' ? { color: TONES.amber, borderColor: `${TONES.amber}55`, background: `${TONES.amber}14` } : undefined}
            >
              {k.impact}
            </span>
          )}
          <TonePill label={String(k.stance || 'neutral')} tone={tone} />
        </div>
      </div>

      {k.title && (
        <p className="kol-title">
          {k.title}{k.duration ? ` · ${k.duration}` : ''}
        </p>
      )}

      {k.quote && <blockquote className="kol-quote">{`“${k.quote}”`}</blockquote>}

      <div>
        <div className="kol-meter-head">
          <MicroLabel>Conviction</MicroLabel>
          <span className="font-mono text-[10px] font-semibold" style={{ color }}>{conviction}</span>
        </div>
        <div className="kol-meter-bar">
          <div className="kol-meter-fill" style={{ width: `${conviction}%`, background: color }} />
        </div>
      </div>

      <SourceRow title={`View ${k.handle}'s post`} url={k.url} tag={platform} />
    </motion.div>
  )
}

function convergenceTone(status) {
  const s = String(status || '').toUpperCase()
  if (s.includes('BULLISH')) return 'up'
  if (s.includes('BEARISH')) return 'down'
  if (s === 'COMPRESSION') return 'blue'
  return 'amber'
}

function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="cv-panel cv-ghost h-[112px]" />
      <div className="cv-grid-stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[92px]" />)}
      </div>
      <div className="cv-panel flex min-h-[46vh] flex-col items-center justify-center px-6 py-9">
        <CandleLoader />
      </div>
    </div>
  )
}

export default function Narrative() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [runKey, rerun] = useRunKey()
  const { status, data, error: agentError } = useAgentData(() => (token ? fetchNarrative(token) : null), [token, runKey])

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <div className="cv-panel flex flex-col items-center px-6 py-14 text-center">
        <Radio size={22} className="mb-3" style={{ color: '#66739a' }} />
        <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>Set a token first</h3>
        <p className="mt-1.5 max-w-sm text-[13px]" style={{ color: '#8b98bd' }}>
          Enter a token on the Your Token page or use the search bar above to begin.
        </p>
        <a href="/dashboard" className="cv-chip mt-4">Go to Your Token</a>
      </div>
    )
  }

  if (status === 'error') {
    return <ErrorState error={agentError} onRetry={() => rerun()} />
  }

  if (status !== 'ready' || !data) return <Loading />

  const d = data
  const voices = d.voices_tracked ?? d.total ?? 0
  const bull = d.bullish_voices ?? d.bullish ?? 0
  const bear = d.bearish_voices ?? 0
  const convergence = d.convergence_status || 'COMPRESSION'
  const convTone = convergenceTone(convergence)
  // Confidence is derived only from the real voice counts — no invented numbers.
  const conf = bull + bear > 0 ? Math.round((Math.max(bull, bear) / (bull + bear)) * 100) : null

  return (
    <div className="flex flex-col gap-4">
      {/* ── identity: the sweep is done ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="cv-panel flex flex-wrap items-center justify-between gap-4 p-5"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border"
            style={{ color: TONES.violet, borderColor: `${TONES.violet}44`, background: `${TONES.violet}14` }}
          >
            <Radio size={19} strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight" style={{ color: '#f4f8ff' }}>
                KOL Radar · {d.symbol}
              </h1>
              <LivePill label="Sweep complete" />
            </div>
            <p className="mt-1 text-[12.5px]" style={{ color: '#aebfe4' }}>
              The Multi-KOL Narrative spotlight — what the loudest voices are really saying.
            </p>
          </div>
        </div>
        <button onClick={rerun} className="cv-chip">
          <RefreshCw size={12} /> Re-sweep
        </button>
      </motion.div>

      {/* ── the answer, first ── */}
      <AnswerBanner
        icon={Radio}
        kicker={`KOL Radar · ${d.symbol}`}
        answer={d.narrative_headline}
        stance={<TonePill label={convergence} tone={convTone} />}
        confidence={conf}
        confidenceTone={convTone}
        chips={[
          `${voices} voices tracked`,
          `${bull} bullish`,
          `${bear} bearish`,
        ]}
      />

      {/* ── headline stats ── */}
      <div className="cv-grid-stats">
        <StatTile icon={Users} label="Voices Tracked" value={voices} foot="unique accounts in sweep" delay={0.02} />
        <StatTile icon={TrendingUp} label="Bullish" value={bull} foot="macro upward conviction" delay={0.06} />
        <StatTile icon={TrendingDown} label="Bearish" value={bear} foot="fear / doubt / distribution" delay={0.1} />
        <StatTile
          icon={Gauge}
          label="Convergence"
          value={<span style={{ color: TONES[convTone], fontSize: 15 }}>{convergence}</span>}
          foot="narrative consensus"
          delay={0.14}
        />
      </div>

      <div className="cv-grid-2">
        {/* ── every real post as its own card ── */}
        <div className="min-w-0">
          <PanelV2
            icon={Users}
            title={`Voices · ${d.total}`}
            right={<MicroLabel>{d.kols.length} posts</MicroLabel>}
            delay={0.16}
          >
            <div className="flex flex-col gap-3">
              {d.kols.length === 0 && (
                <p className="col-span-full px-4 py-4 text-center text-[12px] leading-relaxed" style={{ color: '#66739a' }}>
                  {d.sentiment_summary_text || `No recent KOL posts found for ${d.symbol} — nothing is invented when the sweep comes back empty. Try re-sweeping.`}
                </p>
              )}
              {d.kols.map((k, i) => (
                <KolCard key={`${k.handle}-${i}`} k={k} delay={i * 0.04} />
              ))}
            </div>
          </PanelV2>
        </div>

        {/* ── narrative read + news column ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2 icon={Radio} title="Narrative Read" delay={0.2}>
            <InsightRow icon={Quote} tone={convTone} title={convergence} body={d.sentiment_summary_text} />
          </PanelV2>

          <PanelV2
            icon={Newspaper}
            title="News Checker"
            right={<MicroLabel>{d.news.length} items</MicroLabel>}
            delay={0.24}
          >
            <div className="flex flex-col gap-2.5">
              {d.news.map((n, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <SourceRow title={n.title} url={n.url} tag={n.source || 'news'} />
                  <div className="flex flex-wrap items-center gap-2 px-1">
                    {n.stamp && <StampPill stamp={n.stamp} />}
                    <span className="font-mono text-[9.5px]" style={{ color: '#66739a' }}>
                      {[n.source, n.author, n.age || 'recent'].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
              ))}
              {d.news.length === 0 && (
                <p className="text-[12px]" style={{ color: '#66739a' }}>
                  No recent news surfaced in this sweep.
                </p>
              )}
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed" style={{ color: '#66739a' }}>
              Every headline is stamped against on-chain evidence before it can influence a verdict.
            </p>
          </PanelV2>

          <PanelV2 icon={ArrowUpRight} title="Handoff" delay={0.28}>
            <div className="flex flex-wrap gap-2">
              <Link to={`/dashboard/council?token=${d.symbol}`} className="cv-chip">Send to the Council</Link>
              <Link to={`/dashboard/deep?token=${d.symbol}`} className="cv-chip">Run Deep Analysis</Link>
            </div>
          </PanelV2>
        </div>
      </div>

      <DyorNote />
    </div>
  )
}
