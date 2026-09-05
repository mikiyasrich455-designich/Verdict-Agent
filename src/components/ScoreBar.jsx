import { motion } from 'framer-motion'

function barColor(score) {
  if (score >= 70) return '#34d399'
  if (score >= 50) return '#fbbf24'
  return '#f87171'
}

export default function ScoreBar({ label, score, delay = 0 }) {
  const color = barColor(score)
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-medium text-muted tracking-wide">{label}</span>
        <span className="text-sm font-bold font-mono text-snow tabular-nums">
          {score}
          <span className="text-faint text-[10px] font-normal ml-0.5">/100</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.04]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full relative"
          style={{
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            boxShadow: `0 0 16px ${color}55, 0 0 4px ${color}88`,
          }}
        />
      </div>
    </div>
  )
}
