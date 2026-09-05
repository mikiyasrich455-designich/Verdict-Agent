import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toPng } from 'html-to-image'
import { Download, Link2, RotateCcw, MessagesSquare, Check, Gauge } from 'lucide-react'
import TokenSearch from '../components/TokenSearch'
import VerdictCard, { ShareCard, POINT_LABELS } from '../components/VerdictCard'
import ReasoningPanel from '../components/ReasoningPanel'
import { fetchVerdict } from '../lib/api'
import { friendlyError } from '../components/DashUI'
import { resolveTokenInput } from '../components/DashboardShell'
import { setActiveToken, tokenQuery } from '../lib/activeToken'

export default function VerdictPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [verdict, setVerdict] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const cardRef = useRef(null)
  const runningRef = useRef(false)
  const startTimeRef = useRef(null)

  // Real-time elapsed time counter
  useEffect(() => {
    if (state !== 'loading') return
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [state])

  const runAnalysis = useCallback(
    async (rawInput) => {
      if (runningRef.current) return
      runningRef.current = true
      setState('loading')
      setVerdict(null)
      setError('')
      setElapsed(0)
      startTimeRef.current = Date.now()
      try {
        // Resolve CA / name / ticker to a live identity before running the verdict
        const identity = await resolveTokenInput(rawInput)
        setActiveToken(identity)
        setSearchParams(tokenQuery(identity), { replace: true })
        const result = await fetchVerdict(identity.symbol)
        setVerdict(result)
        setState('done')
      } catch (err) {
        setError(friendlyError(err) || 'Analysis failed — try again')
        setState('error')
      } finally {
        runningRef.current = false
      }
    },
    [setSearchParams]
  )

  // Auto-run when URL has ?token= — a ?ca= in the URL pins the exact contract.
  useEffect(() => {
    const token = searchParams.get('token')
    if (token && state === 'idle') runAnalysis(searchParams.get('ca') || token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const downloadCard = async () => {
    if (!cardRef.current || !verdict) return
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#05050e' })
    const link = document.createElement('a')
    link.download = `VERDICT-${verdict.symbol}.png`
    link.href = dataUrl
    link.click()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — silently ignore in demo
    }
  }

  const reset = () => {
    setState('idle')
    setVerdict(null)
    setSearchParams({}, { replace: true })
  }

  return (
    <div className="relative px-4 sm:px-6 lg:px-8 py-10 md:py-16">
      <div className="trace w-40 top-[12%] left-0 hidden lg:block" />
      <div className="trace trace-l w-52 top-[22%] right-0 hidden lg:block" />

      <div className="max-w-4xl mx-auto relative">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <span className="pill-badge">
            <Gauge size={12} /> quick verdict
          </span>
          <h1 className="mt-5 text-3xl md:text-5xl font-extrabold tracking-tight text-snow">
            Weigh The Evidence.
            <br />
            <span className="text-gradient">Get The Verdict.</span>
          </h1>
          <p className="mt-4 text-muted text-sm md:text-base max-w-xl mx-auto">
            Multi-source intelligence. Transparent reasoning. One defensible verdict.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TokenSearch size="lg" onSubmit={runAnalysis} />
            </motion.div>
          )}

          {state === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-10 text-center"
            >
              <div className="inline-flex items-center gap-3 text-snow">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm">
                  analyzing {(searchParams.get('token') || '').toUpperCase()}...
                </span>
                <span className="font-mono text-muted text-sm">
                  {elapsed}s
                </span>
              </div>
              <p className="mt-4 text-faint text-xs font-mono">
                GATHERING LIVE MARKET DATA · AI REASONING
              </p>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-10 text-center"
            >
              <div className="glass-panel max-w-md mx-auto px-6 py-8">
                <p className="text-[13px] text-red-300 mb-1">Couldn't get a verdict</p>
                <p className="text-[12px] text-muted mb-6">{error}</p>
                <button onClick={reset} className="btn-primary px-5 py-2.5 text-sm">
                  <RotateCcw className="w-4 h-4" /> Try Another Token
                </button>
              </div>
            </motion.div>
          )}

          {state === 'done' && verdict && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <VerdictCard data={verdict} />

              {/* Action bar */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button onClick={downloadCard} className="btn-primary px-5 py-2.5 text-sm">
                  <Download className="w-4 h-4" /> Download Card
                </button>
                <button onClick={copyLink} className="btn-ghost px-5 py-2.5 text-sm text-muted">
                  {copied ? <Check className="w-4 h-4 text-success" /> : <Link2 className="w-4 h-4" />}
                  {copied ? 'Link copied' : 'Copy Link'}
                </button>
                <button
                  onClick={() => navigate(`/dashboard/analysis?token=${verdict.symbol}`)}
                  className="btn-primary px-5 py-2.5 text-sm"
                >
                  <MessagesSquare className="w-4 h-4" /> Open Full Dashboard
                </button>
                <button
                  onClick={() => navigate(`/dashboard/council?token=${verdict.symbol}`)}
                  className="btn-ghost px-5 py-2.5 text-sm text-warning"
                >
                  <MessagesSquare className="w-4 h-4" /> Send to Council
                </button>
                <button onClick={reset} className="btn-ghost px-5 py-2.5 text-sm text-muted">
                  <RotateCcw className="w-4 h-4" /> New Verdict
                </button>
              </div>

              {/* Reasoning trail */}
              <div className="mt-12">
                <h2 className="text-[11px] uppercase tracking-[0.3em] text-faint mb-5 text-center font-mono">
                  the reasoning trail
                </h2>
                <div className="space-y-3">
                  {Object.entries(verdict.scores).map(([key, { score, reasoning }], i) => (
                    <ReasoningPanel
                      key={key}
                      title={POINT_LABELS[key]}
                      score={score}
                      reasoning={reasoning}
                      delay={0.1 + i * 0.08}
                    />
                  ))}
                </div>
              </div>

              {/* Hidden export card (exact share-card layout) */}
              <div className="fixed -left-[9999px] top-0" aria-hidden="true">
                <ShareCard ref={cardRef} data={verdict} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
