import { motion } from 'framer-motion'
import { Gavel } from 'lucide-react'
import { BullAvatar, BearAvatar } from './CouncilMascots'

const ROLE_META = {
  bull: { name: 'Bull', cls: 'text-success', bubble: 'border-success/30 bg-success/[0.05]' },
  bear: { name: 'Bear', cls: 'text-danger', bubble: 'border-danger/30 bg-danger/[0.05]' },
  judge: { name: 'Judge', cls: 'text-warning', bubble: 'border-warning/25 bg-warning/[0.04]' },
}

// Each agent enters from its own side of the arena
const SLIDE = {
  bull: { hidden: { opacity: 0, x: -28 }, show: { opacity: 1, x: 0 } },
  bear: { hidden: { opacity: 0, x: 28 }, show: { opacity: 1, x: 0 } },
  judge: { hidden: { opacity: 0, y: 14, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1 } },
}

export default function DebateBubble({ role, name, text, thinking, evidence }) {
  const meta = ROLE_META[role] || ROLE_META.judge
  const anim = SLIDE[role] || SLIDE.judge
  const flip = role === 'bear'

  return (
    <motion.div
      variants={anim}
      initial="hidden"
      animate="show"
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className={`flex gap-2.5 ${flip ? 'flex-row-reverse' : ''}`}
    >
      <span className="shrink-0 mt-4">
        {role === 'bull' ? (
          <BullAvatar size={28} />
        ) : role === 'bear' ? (
          <BearAvatar size={28} />
        ) : (
          <span className="w-7 h-7 rounded-full bg-warning/10 border border-warning/30 flex items-center justify-center">
            <Gavel size={13} className="text-warning" />
          </span>
        )}
      </span>

      <div className="max-w-[85%] min-w-0">
        <div className={`flex items-center gap-2 mb-1 px-0.5 ${flip ? 'justify-end' : ''}`}>
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${meta.cls}`}>{name || meta.name}</span>
        </div>

        <div className={`bubble-glass ${meta.bubble}`}>
          {thinking ? (
            <span className="typing-dots">
              <i /><i /><i />
            </span>
          ) : (
            text
          )}
        </div>

        {evidence?.length > 0 && (
          <div className={`mt-1.5 flex flex-wrap gap-1.5 ${flip ? 'justify-end' : ''}`}>
            {evidence.map((e) => (
              <span key={e} className="px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-mono text-faint">
                #{e}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
