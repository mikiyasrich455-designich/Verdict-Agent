// Your Token — drop ONE token and every agent skill in the dashboard works for it.
// The token is stored (localStorage) and carried through every sidebar skill link.
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowRight, Crosshair } from 'lucide-react'
import TokenSearch from '../../components/TokenSearch'
import { PageHeader } from '../../components/DashUI'
import { resolveTokenInput } from '../../components/DashboardShell'
import { setActiveToken, getActiveToken, identityFromParams, tokenHref } from '../../lib/activeToken'

const WORDS = ['Bitcoin', 'Ethereum', 'Solana', 'every token', 'every chain', 'every narrative']

const SKILLS = [
  { to: '/dashboard/analysis', label: 'Token Analysis' },
  { to: '/dashboard/deep', label: 'Deep Analysis' },
  { to: '/dashboard/council', label: 'Council Debate' },
  { to: '/dashboard/narrative', label: 'KOL Radar' },
  { to: '/dashboard/risk', label: 'Risk Desk' },
  { to: '/dashboard/studio/image', label: 'Studio · Image' },
  { to: '/dashboard/studio/video', label: 'Studio · Video' },
  { to: '/dashboard/studio/voice', label: 'Studio · Voice' },
]

export default function YourToken() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [wordIdx, setWordIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setWordIdx((i) => (i + 1) % WORDS.length), 2400)
    return () => clearInterval(interval)
  }, [])

  const [resolving, setResolving] = useState(false)
  const [resolveErr, setResolveErr] = useState('')

  const go = async (raw) => {
    const input = String(raw || '').trim()
    if (!input || resolving) return
    setResolveErr('')
    setResolving(true)
    try {
      const identity = await resolveTokenInput(input)
      setActiveToken(identity)
      setResolving(false)
      navigate(tokenHref('/dashboard/analysis', identity))
    } catch (err) {
      setResolving(false)
      setResolveErr(err.message || 'Could not resolve that token')
    }
  }

  const tokenPath = (to) =>
    tokenHref(to, identityFromParams(searchParams) || getActiveToken() || (token ? { symbol: token } : null))

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Your Token"
        subtitle="Drop it once — every agent and skill works for that token."
      />

      {/* hero: one input, whole dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="glass-panel mt-2 py-10 md:py-12 px-6 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(91,147,255,0.08), rgba(2,2,8,0.5))' }}
      >
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-accent mb-4">
          One token in · every agent on it
        </p>
        <h2 className="text-3xl md:text-[40px] font-bold text-snow tracking-tight leading-tight">
          Bring every crypto on earth{' '}
          <span className="block md:inline">
            to{' '}
            <AnimatePresence mode="wait">
              <motion.span
                key={wordIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="text-gradient inline-block"
              >
                {WORDS[wordIdx]}
              </motion.span>
            </AnimatePresence>
          </span>
        </h2>
        <p className="text-muted text-sm mt-3 mb-8">
          Drop your token. Research, Council, Narrative, Studio — everything runs on it.
        </p>

        <TokenSearch placeholder="Drop your token — ticker, name, or contract address…" onSubmit={go} />
        {resolving && (
          <p className="mt-4 text-[12px] font-mono text-accent animate-pulse">
            Finding your token live…
          </p>
        )}
        {resolveErr && (
          <p className="mt-4 inline-block text-[12px] text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-1.5">
            {resolveErr}
          </p>
        )}
      </motion.div>

      {/* active token strip */}
      {token && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel mt-4 px-5 py-4 flex flex-wrap items-center gap-3"
        >
          <span className="inline-flex items-center gap-2 font-mono text-[13px] text-accent">
            <Crosshair size={14} /> {token}
          </span>
          <span className="text-[12.5px] text-muted">
            is locked in — every skill below already works for it. No re-entry needed.
          </span>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="glass-chip ml-auto">
            Change token
          </button>
        </motion.div>
      )}

      {/* how it flows */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.55 }}
        className="glass-panel mt-4 py-6 px-6"
      >
        <div className="grid md:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-accent text-2xl font-bold mb-1">1</div>
            <p className="text-[13px] text-snow/90 font-medium">Token locked</p>
            <p className="text-[11px] text-faint mt-1">It becomes the context for every agent</p>
          </div>
          <div>
            <div className="text-accent text-2xl font-bold mb-1">2</div>
            <p className="text-[13px] text-snow/90 font-medium">Agents activate</p>
            <p className="text-[11px] text-faint mt-1">Market, Council, Narrative, Studio — all on your token</p>
          </div>
          <div>
            <div className="text-accent text-2xl font-bold mb-1">3</div>
            <p className="text-[13px] text-snow/90 font-medium">Share the result</p>
            <p className="text-[11px] text-faint mt-1">Export image, video or voice built from the full analysis</p>
          </div>
        </div>
      </motion.div>

      {/* all skills for this token */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.55 }}
        className="glass-panel mt-4 py-5 px-6"
      >
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted mb-3">
          {token ? `Every skill, ready for ${token}` : 'Pick a skill'}
        </p>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map((s) => (
            <Link key={s.to} to={tokenPath(s.to)} className="glass-chip">
              {s.label} <ArrowRight size={11} />
            </Link>
          ))}
        </div>
      </motion.div>
    </>
  )
}
