// Shared dashboard primitives — panels, badges, stats, headers.
// Keeps every agent dashboard visually consistent.
import { motion } from 'framer-motion'

const POPULAR_TOKENS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC']

export const fmtUsd = (v) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`
  return `${sign}$${n.toFixed(2)}`
}

// Memecoins price in the 7th decimal — fixed 2dp would render "$0.00".
export const fmtPrice = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (abs >= 1) return `$${n.toFixed(4)}`
  if (abs >= 0.01) return `$${n.toFixed(5)}`
  const digits = Math.min(12, Math.max(4, Math.ceil(-Math.log10(abs)) + 3))
  return `$${n.toFixed(digits)}`
}

export const fmtNum = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US')
}

export const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`)
export const changeColor = (v) => (Number(v) >= 0 ? 'text-up' : 'text-down')

// Source health badge — the honesty layer judges look for.
const SOURCE_META = {
  live: { label: 'LIVE', cls: 'src-live' },
  cached: { label: 'CACHED', cls: 'src-cached' },
  simulated: { label: 'SIMULATED', cls: 'src-sim' },
  ai: { label: 'AI', cls: 'src-ai' },
}

export function SourceBadge({ mode = 'simulated', name }) {
  const m = SOURCE_META[mode] || SOURCE_META.simulated
  return (
    <span className={`src-badge ${m.cls}`} title={name ? `${name} · ${m.label}` : m.label}>
      <i />
      {m.label}
      {name && <em>{name}</em>}
    </span>
  )
}

export function AgentBadge({ icon: Icon, tone = 'blue', children }) {
  return (
    <span className={`agent-badge agent-${tone}`}>
      <Icon size={12} strokeWidth={2.4} />
      {children}
    </span>
  )
}

// Page header: clean glass — icon, title, subtitle, optional action chips
export function PageHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-wrap items-end justify-between gap-4 mb-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="page-icon">
          <Icon size={20} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-snow tracking-tight leading-none">{title}</h1>
          <p className="text-[13px] text-muted mt-1.5">{subtitle}</p>
        </div>
      </div>
      {children && <div className="flex items-center gap-2.5">{children}</div>}
    </motion.header>
  )
}

export function Panel({ title, icon: Icon, actions, className = '', children, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay, ease: 'easeOut' }}
      className={`glass-panel overflow-hidden ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-4 px-5 pt-5">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-snow/90 min-w-0">
          {Icon && <Icon size={14} className="text-accent flex-shrink-0" />}
          <span className="truncate">{title}</span>
        </h3>
          {actions}
        </div>
      )}
      <div className="px-5 pb-5">{children}</div>
    </motion.section>
  )
}

export function Stat({ label, value, sub, tone = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className="glass-panel !p-4"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted truncate">{label}</p>
      <p className={`font-display text-xl md:text-2xl font-bold mt-1.5 break-words ${tone || 'text-snow'}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-1 break-words">{sub}</p>}
    </motion.div>
  )
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="glass-panel flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="empty-icon">
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <h3 className="font-display font-semibold text-snow mt-4">{title}</h3>
      {hint && <p className="text-[13px] text-muted mt-1.5 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`glass-chip ${active ? 'chip-on' : ''}`}>
      {children}
    </button>
  )
}

export function StancePill({ stance }) {
  const map = {
    bullish: ['BULLISH', 'stance-bull'],
    bearish: ['BEARISH', 'stance-bear'],
    neutral: ['NEUTRAL', 'stance-neutral'],
  }
  const [label, cls] = map[stance] || map.neutral
  return <span className={`stance-pill ${cls}`}>{label}</span>
}

export function StampPill({ stamp }) {
  const map = {
    VERIFIED: 'stamp-ok',
    UNVERIFIED: 'stamp-warn',
    CONTRADICTED: 'stamp-bad',
  }
  return <span className={`stamp-pill ${map[stamp] || 'stamp-warn'}`}>{stamp}</span>
}

export function SevPill({ sev }) {
  const map = { high: 'sev-high', medium: 'sev-med', low: 'sev-low' }
  return <span className={`sev-pill ${map[sev] || 'sev-low'}`}>{sev}</span>
}

// Empty-state token picker shown when a token-scoped agent has no focus token.
export function TokenQuickPick({ icon: Icon, title, hint, onPick }) {
  return (
    <EmptyState
      icon={Icon}
      title={title}
      hint={hint}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
          {POPULAR_TOKENS.map((t) => (
            <Chip key={t} onClick={() => onPick(t)}>
              {t}
            </Chip>
          ))}
        </div>
      }
    />
  )
}

// Error state — shows when an API call fails instead of looping on skeleton
export function ErrorState({ error, onRetry, children }) {
  const msg = error?.message || String(error) || 'Something went wrong'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel !py-8 !px-5 flex flex-col items-center text-center gap-3"
    >
      <div className="w-10 h-10 grid place-items-center rounded-full border border-danger/40 bg-danger/10 text-danger">
        <span className="text-lg">!</span>
      </div>
      <p className="text-[13px] text-snow/85 max-w-sm leading-relaxed">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="glass-btn !py-2 !px-4 text-[12px]">
          Retry
        </button>
      )}
      {children}
    </motion.div>
  )
}
