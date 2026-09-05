import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, AlertTriangle, Info, CheckCircle2, Lock, ShieldCheck } from 'lucide-react'

export default function CautionPage({ onAccept }) {
  const [understood, setUnderstood] = useState(false)

  const rules = [
    {
      icon: AlertTriangle,
      title: 'Not Financial Advice',
      description:
        'Verdicts are AI-generated analysis of public market data. They are educational signals, never instructions to buy, sell, or hold.',
      tone: 'text-danger bg-danger/10 border-danger/30',
    },
    {
      icon: Info,
      title: 'Data Can Be Incomplete',
      description:
        'Market feeds may lag, contain errors, or miss context. Always verify numbers independently before making any decision.',
      tone: 'text-warning bg-warning/10 border-warning/30',
    },
    {
      icon: ShieldAlert,
      title: 'Crypto Is High Risk',
      description:
        'Digital assets are volatile. You can lose your entire position. Never commit funds you cannot afford to lose.',
      tone: 'text-danger bg-danger/10 border-danger/30',
    },
    {
      icon: Lock,
      title: 'Your Responsibility',
      description:
        'You alone are responsible for your trading decisions and their consequences. Nothing here creates an advisory relationship.',
      tone: 'text-accent bg-accent/10 border-accent/30',
    },
  ]

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-14 overflow-hidden">
      <div className="trace w-40 top-[16%] left-0 hidden md:block" />
      <div className="trace trace-l w-52 top-[28%] right-0 hidden md:block" />
      <div className="trace w-32 bottom-[20%] left-0 hidden md:block" />
      <div className="trace trace-l w-40 bottom-[32%] right-0 hidden md:block" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full relative"
      >
        <div className="text-center mb-8">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="pill-badge"
          >
            <ShieldCheck size={12} /> read before you trade
          </motion.span>
          <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight text-snow">
            Before You Proceed.
          </h1>
          <p className="text-muted mt-3 text-sm sm:text-base max-w-md mx-auto">
            VERDICT is an AI research layer, not an advisor. Four rules govern everything you see inside.
          </p>
        </div>

        <div className="card-dark p-6 sm:p-8 shadow-card">
          <div className="grid sm:grid-cols-2 gap-4">
            {rules.map((rule, index) => {
              const Icon = rule.icon
              return (
                <motion.div
                  key={rule.title}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + index * 0.08 }}
                  className="card-spotlight p-4 rounded-xl bg-white/[0.04] border border-white/10"
                >
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${rule.tone}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-snow text-sm mt-3">{rule.title}</h3>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">{rule.description}</p>
                </motion.div>
              )
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 p-4 rounded-xl border border-line bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${understood ? 'text-success' : 'text-faint'}`} />
              <span className="text-sm font-medium text-snow">I understand and accept these terms</span>
            </div>
            <button
              onClick={() => setUnderstood(!understood)}
              role="switch"
              aria-checked={understood}
              className={`relative w-12 h-7 rounded-full transition-colors duration-300 flex-shrink-0 ${
                understood ? 'bg-success' : 'bg-white/10'
              }`}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow ${understood ? 'left-6' : 'left-1'}`}
              />
            </button>
          </div>

          <button
            onClick={onAccept}
            disabled={!understood}
            className={`${
              understood ? 'btn-primary' : 'bg-white/5 text-faint cursor-not-allowed inline-flex items-center justify-center'
            } w-full mt-5 py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-300`}
          >
            {understood ? 'Enter VERDICT' : 'Toggle the switch to continue'}
          </button>
        </div>

        <p className="text-center text-[11px] text-faint mt-6 font-mono">
          educational demo · built for the RYO-CHAN hackathon 2026
        </p>
      </motion.div>
    </div>
  )
}
