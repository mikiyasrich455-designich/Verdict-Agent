// ConsoleUI — the v2 design kit for every agent dashboard.
// One cosmic-glass language: answer-first banners, glowing stat tiles, real-number
// sparklines, evidence rows and source links. No page invents its own look anymore.
import { useId } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ExternalLink } from 'lucide-react'

export const TONES = {
  up: '#2FE0B0',
  down: '#FF5C7A',
  blue: '#6EA8FF',
  violet: '#9B7BFF',
  amber: '#FFC24B',
  cyan: '#4BD8FF',
}

// ── Spark — a real-number sparkline (points come from live data only) ──────
export function Spark({ points = [], tone = 'up', w = 76, h = 28, strokeWidth = 1.8 }) {
  const gid = useId().replace(/[:]/g, '')
  const nums = (points || []).map(Number).filter((n) => Number.isFinite(n))
  if (nums.length < 2) return <svg width={w} height={h} aria-hidden="true" />
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1
  const step = w / (nums.length - 1)
  const coords = nums.map((n, i) => [i * step, h - 3 - ((n - min) / span) * (h - 6)])
  const path = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = TONES[tone] || TONES.blue
  return (
    <svg width={w} height={h} className="cv-spark" aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#sg-${gid})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.2" fill={color} />
    </svg>
  )
}

// ── Ring — confidence / score dial (conic gradient, pure CSS) ───────────────
export function Ring({ value = 0, size = 74, stroke = 6, tone = 'blue', label, sub }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  const color = TONES[tone] || TONES.blue
  return (
    <div className="cv-ring-wrap" style={{ width: size, height: size }}>
      <div
        className="cv-ring"
        style={{
          background: `conic-gradient(${color} ${v * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
          padding: stroke,
        }}
      >
        <div className="cv-ring-core">
          <span className="cv-ring-val" style={{ color }}>{Math.round(v)}</span>
          {label && <span className="cv-ring-label">{label}</span>}
        </div>
      </div>
      {sub && <span className="cv-ring-sub">{sub}</span>}
    </div>
  )
}

// ── Panel — the cosmic glass card every section lives in ───────────────────
export function PanelV2({ icon: Icon, title, right, children, className = '', bodyClass = '', delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={`cv-panel ${className}`}
    >
      {(title || right) && (
        <div className="cv-head">
          <h3 className="cv-title">
            {Icon && (
              <span className="cv-title-icon">
                <Icon size={13} strokeWidth={2.2} />
              </span>
            )}
            {title}
          </h3>
          {right && <div className="cv-head-right">{right}</div>}
        </div>
      )}
      <div className={`cv-body ${bodyClass}`}>{children}</div>
    </motion.section>
  )
}

export function MicroLabel({ children, className = '' }) {
  return <span className={`cv-label ${className}`}>{children}</span>
}

// ── StatTile — one glowing number with optional delta + sparkline ──────────
export function StatTile({ icon: Icon, label, value, delta, deltaTone, spark, sparkTone, foot, delay = 0 }) {
  const dTone = deltaTone || (Number(delta) >= 0 ? 'up' : 'down')
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: 'easeOut' }}
      className="cv-stat"
    >
      <div className="cv-stat-top">
        {Icon && (
          <span className="cv-stat-icon">
            <Icon size={12} strokeWidth={2.2} />
          </span>
        )}
        <MicroLabel>{label}</MicroLabel>
      </div>
      <div className="cv-stat-row">
        <span className="cv-stat-value">{value}</span>
        {spark?.length > 1 && <Spark points={spark} tone={sparkTone || dTone} w={64} h={26} />}
      </div>
      <div className="cv-stat-foot">
        {delta !== undefined && delta !== null && (
          <span className={`cv-delta ${dTone === 'up' ? 'up' : dTone === 'down' ? 'down' : ''}`}>
            {Number(delta) >= 0 ? '▲' : '▼'} {Math.abs(Number(delta)).toFixed(2)}%
          </span>
        )}
        {foot && <span className="cv-stat-sub">{foot}</span>}
      </div>
    </motion.div>
  )
}

// ── ScoreBar — bull vs bear (or any two-sided) tension bar ─────────────────
export function ScoreBar({ left = 50, right = 50, leftLabel = 'Bull case', rightLabel = 'Bear case', leftTone = 'up', rightTone = 'down' }) {
  const total = (Number(left) || 0) + (Number(right) || 0) || 1
  const lp = Math.round(((Number(left) || 0) / total) * 100)
  return (
    <div className="cv-scorebar">
      <div className="cv-scorebar-head">
        <span className="cv-scorebar-side" style={{ color: TONES[leftTone] }}>
          {leftLabel} <b>{Math.round(Number(left) || 0)}</b>
        </span>
        <span className="cv-scorebar-side" style={{ color: TONES[rightTone] }}>
          <b>{Math.round(Number(right) || 0)}</b> {rightLabel}
        </span>
      </div>
      <div className="cv-scorebar-track">
        <div className="cv-scorebar-left" style={{ width: `${lp}%`, background: `linear-gradient(90deg, ${TONES[leftTone]}55, ${TONES[leftTone]})` }} />
        <div className="cv-scorebar-right" style={{ width: `${100 - lp}%`, background: `linear-gradient(90deg, ${TONES[rightTone]}, ${TONES[rightTone]}55)` }} />
      </div>
    </div>
  )
}

// ── AnswerBanner — the first thing a judge sees: the plain-English answer ──
export function AnswerBanner({ icon: Icon, kicker, answer, stance, confidence, confidenceTone = 'blue', chips = [], children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="cv-answer"
    >
      <div className="cv-answer-left">
        {Icon && (
          <span className="cv-answer-icon">
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
        <div className="min-w-0">
          {kicker && <MicroLabel>{kicker}</MicroLabel>}
          <p className="cv-answer-text">{answer}</p>
          {chips.length > 0 && (
            <div className="cv-answer-chips">
              {chips.map((c, i) => (
                <span key={i} className="cv-chip">{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="cv-answer-right">
        {confidence !== undefined && confidence !== null && (
          <Ring value={confidence} tone={confidenceTone} label="conf" />
        )}
        {stance}
        {children}
      </div>
    </motion.div>
  )
}

// ── InsightRow — one evidence bullet: icon + claim + why ───────────────────
export function InsightRow({ icon: Icon, tone = 'blue', title, body }) {
  const color = TONES[tone] || TONES.blue
  return (
    <div className="cv-insight">
      <span className="cv-insight-icon" style={{ color, borderColor: `${color}44`, background: `${color}14` }}>
        {Icon ? <Icon size={13} strokeWidth={2.2} /> : <i />}
      </span>
      <div className="min-w-0">
        <p className="cv-insight-title">{title}</p>
        {body && <p className="cv-insight-body">{body}</p>}
      </div>
    </div>
  )
}

// ── SourceRow — a real, clickable receipt ──────────────────────────────────
export function SourceRow({ title, url, tag }) {
  if (!url) return null
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { host = '' }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="cv-source">
      <span className="cv-source-dot" />
      <span className="cv-source-title">{title || host}</span>
      {tag && <span className="cv-source-tag">{tag}</span>}
      <span className="cv-source-host">{host}</span>
      <ExternalLink size={11} className="cv-source-ext" />
    </a>
  )
}

// ── FeedRow — right-rail intelligence item ─────────────────────────────────
export function FeedRow({ img, icon: Icon, symbol, text, meta, spark, tone = 'up' }) {
  return (
    <div className="cv-feed">
      <span className="cv-feed-icon">
        {img ? <img src={img} alt="" loading="lazy" /> : Icon ? <Icon size={14} /> : null}
      </span>
      <div className="cv-feed-mid min-w-0">
        <p className="cv-feed-symbol">{symbol}</p>
        <p className="cv-feed-text">{text}</p>
        {meta && <p className="cv-feed-meta">{meta}</p>}
      </div>
      {spark?.length > 1 && <Spark points={spark} tone={tone} w={54} h={22} />}
    </div>
  )
}

// ── AgentRow — right-rail / activity agent status ──────────────────────────
export function AgentRow({ icon: Icon, name, desc, state = 'ready', to, tone = 'blue' }) {
  const color = TONES[tone] || TONES.blue
  const Inner = (
    <>
      <span className="cv-agent-icon" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
        <Icon size={15} strokeWidth={2.1} />
      </span>
      <span className="cv-agent-mid min-w-0">
        <span className="cv-agent-name">{name}</span>
        <span className="cv-agent-desc">{desc}</span>
      </span>
      <span className={`cv-agent-state ${state === 'active' ? 'active' : ''}`}>
        {state === 'active' ? 'Active' : 'Ready'}
      </span>
      <ArrowUpRight size={13} className="cv-agent-arrow" />
    </>
  )
  if (!to) return <div className="cv-agent">{Inner}</div>
  return <a href={to} className="cv-agent">{Inner}</a>
}

// ── TokenLogo — img with a lettered fallback orb ───────────────────────────
export function TokenLogo({ src, symbol = '?', size = 36 }) {
  return (
    <span className="cv-logo" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={symbol} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      ) : null}
      <span className="cv-logo-fallback" style={{ fontSize: Math.max(10, size * 0.36) }}>
        {String(symbol).slice(0, 1)}
      </span>
    </span>
  )
}

// ── SectionTitle — in-panel block heading ──────────────────────────────────
export function BlockTitle({ icon: Icon, children, right }) {
  return (
    <div className="cv-blocktitle">
      <span className="cv-blocktitle-left">
        {Icon && <Icon size={12} strokeWidth={2.4} className="text-[#6EA8FF]" />}
        <MicroLabel>{children}</MicroLabel>
      </span>
      {right}
    </div>
  )
}

// ── LivePill — honest "live" indicator ─────────────────────────────────────
export function LivePill({ label = 'Live' }) {
  return (
    <span className="cv-live">
      <i />
      {label}
    </span>
  )
}
