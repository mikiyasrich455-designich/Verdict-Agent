import { motion } from 'framer-motion'
import { TrendingUp, PauseCircle, ShieldAlert } from 'lucide-react'

const CONFIG = {
  BUY: { icon: TrendingUp, text: 'text-success', bg: 'bg-success/10', border: 'border-success/30', glow: '0 0 24px rgba(52,211,153,0.3)' },
  HOLD: { icon: PauseCircle, text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', glow: '0 0 24px rgba(251,191,36,0.3)' },
  AVOID: { icon: ShieldAlert, text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/30', glow: '0 0 24px rgba(248,113,113,0.3)' },
}

export function verdictColor(verdict) {
  return { BUY: '#34d399', HOLD: '#fbbf24', AVOID: '#f87171' }[verdict] || '#8f8fa8'
}

export function verdictBg(verdict) {
  return { BUY: 'rgba(52,211,153,0.1)', HOLD: 'rgba(251,191,36,0.1)', AVOID: 'rgba(248,113,113,0.1)' }[verdict] || 'rgba(255,255,255,0.05)'
}

export default function VerdictBadge({ verdict, size = 'md', animate = true }) {
  const cfg = CONFIG[verdict] || CONFIG.HOLD
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
    >
      <Icon size={iconSize} />
      {verdict}
    </motion.span>
  )
}
