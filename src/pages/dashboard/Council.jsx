// Council agent — Bull vs Bear debate, migrated from the dedicated
// page into the dashboard as a skill. Staged playback + judge ruling.
import { useEffect, useRef, useState } from 'react'
import { Swords, RefreshCw, Gavel, Check, Receipt, ShieldAlert, ImageIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import DebateBubble from '../../components/DebateBubble'
import VerdictBadge, { verdictColor } from '../../components/VerdictBadge'
import { BullMascot, BearMascot } from '../../components/CouncilMascots'
import { buildReceipt, saveReceipt } from '../../data/receipts'
import { fetchCouncil } from '../../lib/api'
import { PageHeader, Panel, EmptyState } from '../../components/DashUI'
import { CouncilLoader } from '../../components/ShadcnLoaders'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Council() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [phase, setPhase] = useState('idle') // idle | collecting | debating | judged
  const [data, setData] = useState(null)
  const [visible, setVisible] = useState(0)
  const [typing, setTyping] = useState(null)
  const [runKey, setRunKey] = useState(0)
  const [saved, setSaved] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!token) return undefined
    let alive = true
    setData(null)
    setVisible(0)
    setTyping(null)
    setSaved(false)
    setPhase('collecting')

    fetchCouncil(token)
      .then((d) => {
        if (!alive) return
        setData(d)
        sleep(1000).then(() => {
          if (!alive) return
          setPhase('debating')
          ;(async () => {
            const msgs = Array.isArray(d?.messages) ? d.messages : []
            for (let i = 0; i < msgs.length; i++) {
              if (!alive) return
              setTyping(msgs[i].role)
              await sleep(900)
              if (!alive) return
              setTyping(null)
              setVisible(i + 1)
              await sleep(1000)
            }
            if (!alive) return
            await sleep(500)
            if (alive) setPhase('judged')
          })()
        })
      })
      .catch((err) => {
        if (!alive) return
        console.error('[COUNCIL] fetch failed:', err)
        setData(null)
        setPhase('error')
      })

    return () => {
      alive = false
    }
  }, [token, runKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [visible, typing, phase])

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <>
        <PageHeader icon={Swords} title="Council · Bull vs Bear" subtitle="Two agents argue the tape. The judge rules on evidence, not vibes." source={{ mode: 'ai', name: 'adversarial debate' }} />
        <EmptyState
          icon={Swords}
          title="Set a token first"
          hint="Enter a token on the Your Token page or use the search bar above to begin."
          action={<a href="/dashboard" className="glass-btn">Go to Your Token</a>}
        />
      </>
    )
  }

  if (phase === 'error') {
    return (
      <>
        <PageHeader icon={Swords} title={`Council · ${token.toUpperCase()}`} subtitle="Summoning the council…" source={{ mode: 'ai', name: 'adversarial debate' }} />
        <div className="glass-panel !py-8 !px-5 flex flex-col items-center text-center gap-3">
          <p className="text-[13px] text-snow/85 max-w-sm">The council couldn't fetch the debate evidence. Try again in a moment.</p>
          <button onClick={() => setRunKey((k) => k + 1)} className="glass-btn !py-2 !px-4 text-[12px]">
            <RefreshCw size={12} className="mr-1.5" /> Retry
          </button>
        </div>
      </>
    )
  }

  if (phase === 'collecting' || !data) {
    return (
      <>
        <PageHeader icon={Swords} title={`Council · ${token.toUpperCase()}`} subtitle="Summoning the council…" source={{ mode: 'ai', name: 'adversarial debate' }} />
        <div className="glass-panel flex flex-col items-center justify-center py-14">
          <CouncilLoader label="The council is reading the evidence pack" />
        </div>
      </>
    )
  }

  const judge = data.judge
  const saveThis = () => {
    saveReceipt(buildReceipt(data.verdictData, { sources: ['Council bull-agent', 'Council bear-agent', 'Judge ruling'] }))
    setSaved(true)
  }

  return (
    <>
      <PageHeader
        icon={Swords}
        title={`Council · ${data.symbol}`}
        subtitle="Two agents argue the tape. The judge rules on evidence, not vibes."
        source={{ mode: 'ai', name: 'adversarial debate' }}
      >
        <button onClick={() => setRunKey((k) => k + 1)} className="glass-chip">
          <RefreshCw size={12} /> Re-open session
        </button>
      </PageHeader>

      {/* arena header */}
      <div className="glass-panel !py-4 !px-5 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BullMascot size={44} hype={phase === 'judged' && judge.verdict === 'BUY'} />
          <div>
            <p className="text-[12px] font-semibold text-success">BULL</p>
            <p className="text-[10px] text-faint">argues commitment</p>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <Gavel size={17} className="text-warning mb-1" />
          <p className="font-mono text-[9px] tracking-[0.22em] text-faint">
            {phase === 'judged' ? 'RULED' : 'IN SESSION'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <p className="text-[12px] font-semibold text-danger">BEAR</p>
            <p className="text-[10px] text-faint">argues restraint</p>
          </div>
          <BearMascot size={44} hype={phase === 'judged' && judge.verdict === 'AVOID'} />
        </div>
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="glass-panel !p-5 space-y-5 mb-4 max-h-[430px] overflow-y-auto">
        <AnimatePresence>
          {data.messages.slice(0, visible).map((m, i) => (
            <DebateBubble key={i} role={m.role} text={m.text} />
          ))}
        </AnimatePresence>
        {typing && <DebateBubble role={typing} thinking />}

        {phase === 'judged' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <DebateBubble role="judge" name="Judge" text={judge.text} />
          </motion.div>
        )}
      </div>

      {/* ruling */}
      <AnimatePresence>
        {phase === 'judged' && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="glass-panel !p-6"
            style={{ borderColor: `${verdictColor(judge.verdict)}33`, boxShadow: `0 0 44px ${verdictColor(judge.verdict)}14` }}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="flex flex-col items-center gap-2">
                <VerdictBadge verdict={judge.verdict} size="lg" />
                <p className="font-mono text-[9.5px] tracking-[0.18em] text-faint">COUNCIL RULING</p>
              </div>

              <div className="flex-1 space-y-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-success w-10">BULL</span>
                  <div className="flex-1 h-2 rounded-full bg-white/6 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${judge.bullScore * 100}%` }} transition={{ duration: 0.8, delay: 0.2 }} className="h-full bg-gradient-to-r from-[#34d399] to-[#10b981]" />
                  </div>
                  <span className="font-mono text-[11px] text-snow/85 w-10 text-right">{judge.bullScore.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-danger w-10">BEAR</span>
                  <div className="flex-1 h-2 rounded-full bg-white/6 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${judge.bearScore * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} className="h-full bg-gradient-to-r from-[#f87171] to-[#ef4444]" />
                  </div>
                  <span className="font-mono text-[11px] text-snow/85 w-10 text-right">{judge.bearScore.toFixed(2)}</span>
                </div>
                <p className="text-[10.5px] text-faint pt-1">
                  Spread {judge.diff > 0 ? '+' : ''}{judge.diff.toFixed(2)} vs conviction threshold ±{judge.threshold} —{' '}
                  {Math.abs(judge.diff) > judge.threshold ? 'cleared, ruling is decisive.' : 'inside threshold, ruling defaults to discipline.'}
                </p>
              </div>

              <div className="flex md:flex-col gap-2 flex-shrink-0">
                <button onClick={saveThis} disabled={saved} className={`glass-chip justify-center ${saved ? 'opacity-60' : ''}`}>
                  {saved ? <Check size={12} /> : <Receipt size={12} />} {saved ? 'Receipt saved' : 'Save receipt'}
                </button>
                <Link to={`/dashboard/risk?token=${data.symbol}`} className="glass-chip justify-center"><ShieldAlert size={12} /> Risk Desk</Link>
                <Link to={`/dashboard/studio/image?token=${data.symbol}`} className="glass-chip justify-center"><ImageIcon size={12} /> Studio</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
