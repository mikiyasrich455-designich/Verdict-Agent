import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

export default function ReasoningPanel({ title, score, reasoning, delay = 0 }) {
  const [open, setOpen] = useState(false)
  const scoreStyle =
    score >= 70
      ? 'text-success bg-success/10'
      : score >= 50
        ? 'text-warning bg-warning/10'
        : 'text-danger bg-danger/10'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="card-dark overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className={`font-mono text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${scoreStyle}`}>
            {score}
          </span>
          <span className="text-sm font-semibold text-snow truncate">{title}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-faint flex-shrink-0" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="px-4 pb-4 text-sm leading-relaxed text-muted border-t border-line pt-3 break-words">
              {reasoning}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
