import { motion } from 'framer-motion'
import { TrendingUp, PauseCircle, ShieldAlert } from 'lucide-react'
import { stanceOf } from '../lib/stance'

const CONFIG = {
  POSITIVE: { icon: TrendingUp, text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', glow: '0 0 24px rgba(52,211,153,0.3)' },
  NEUTRAL: { icon: PauseCircle, text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', glow: '0 0 24px rgba(251,191,36,0.3)' },
  CAUTION: { icon: ShieldAlert, text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', glow: '0 0 24px rgba(248,113,113,0.3)' },
}

export function verdictColor(verdict) {
  const stance = stanceOf(verdict)
  return { POSITIVE: '#34d399', NEUTRAL: '#fbbf24', CAUTION: '#f87171' }[stance.key] || '#8f8fa8'
}

export function verdictBg(verdict) {
  const stance = stanceOf(verdict)
  return { POSITIVE: 'rgba(52,211,153,0.1)', NEUTRAL: 'rgba(251,191,36,0.1)', CAUTION: 'rgba(248,113,113,0.1)' }[stance.key] || 'rgba(255,255,255,0.05)'
}

export default function VerdictBadge({ verdict, size = 'md', animate = true }) {
  const stance = stanceOf(verdict)
  const cfg = CONFIG[stance.key] || CONFIG.NEUTRAL
  const Icon = cfg.icon
  const sizing =
    size === 'lg' ? 'text-xl px-7 py-3.5' : size === 'sm' ? 'text-[11px] px-3.5 py-1.5' : 'text-sm px-5 py-2.5'
  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 12 : 16

  return (
    <motion.span
      initial={animate ? { scale: 0.7, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`inline-flex items-center gap-2 rounded-full font-bold tracking-[0.12em] border backdrop-blur-sm ${sizing} ${cfg.text} ${cfg.bg} ${cfg.border}`}
      style={{ boxShadow: cfg.glow }}
      title={stance.label}
    >
      <Icon size={iconSize} />
      {stance.label}
    </motion.span>
  )
}
