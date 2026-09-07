// Council agent — Bull vs Bear debate, migrated from the dedicated
// page into the dashboard as a skill. Staged playback + judge ruling.
import { useEffect, useRef, useState } from 'react'
import {
  Swords, RefreshCw, Gavel, Check, Receipt, ShieldAlert, ImageIcon,
  TrendingUp, TrendingDown, Scale,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { buildReceipt, saveReceipt } from '../../data/receipts'
import { fetchCouncil } from '../../lib/api'
import { stanceOf } from '../../lib/stance'
import { ErrorState } from '../../components/DashUI'
import DyorNote from '../../components/DyorNote'
import { BullMascot, BearMascot } from '../../components/CouncilMascots'
import { CouncilLoader } from '../../components/ShadcnLoaders'
import CandleLoader from '../../components/loaders/CandleLoader'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow, AgentRow,
  MicroLabel, LivePill, ProgressMeter, TONES,
} from '../../components/ConsoleUI'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The council bench — three independent agents arguing the same tape.
const AGENT_META = {
  bull: { name: 'Bull advocate', desc: 'argues the positive case', icon: TrendingUp, tone: 'up' },
  bear: { name: 'Bear advocate', desc: 'argues the risk case', icon: TrendingDown, tone: 'down' },
  judge: { name: 'Judge', desc: 'rules on evidence, not vibes', icon: Gavel, tone: 'amber' },
}

// stance.tone → ConsoleUI TONES key (same green / amber / red intent as before)
const STANCE_TONE = { positive: 'up', neutral: 'amber', risk: 'down' }

function TonePill({ label, tone }) {
  const color = TONES[tone] || TONES.blue
  return (
    <span
      className="rounded-full px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]"
      style={{ color, background: `${color}14`, border: `1px solid ${color}55`, boxShadow: `0 0 18px ${color}33` }}
    >
      {label}
    </span>
  )
}

function DebateCard({ role, text, thinking, round }) {
  const meta = AGENT_META[role] || AGENT_META.judge
  const color = TONES[meta.tone] || TONES.blue
  const Icon = meta.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="rounded-2xl border p-4"
      style={{ borderColor: `${color}33`, background: 'rgba(255,255,255,0.03)' }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border"
          style={{ color, borderColor: `${color}55`, background: `${color}14` }}
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold leading-none" style={{ color: '#f4f8ff' }}>{meta.name}</p>
          {round && <MicroLabel className="mt-1.5 block">{round}</MicroLabel>}
        </div>
      </div>
      {thinking ? (
        <span className="typing-dots mt-3.5 inline-flex gap-1.5" style={{ color }}>
          <span /><span /><span />
        </span>
      ) : (
        <p className="mt-3 whitespace-pre-line break-words text-[12.5px] leading-relaxed" style={{ color: '#aebfe4' }}>
          {text}
        </p>
      )}
    </motion.div>
  )
}

function CouncilLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="cv-panel cv-ghost h-[112px]" />
      <div className="cv-grid-stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[92px]" />)}
      </div>
      <div className="cv-panel flex min-h-[46vh] flex-col items-center justify-center px-6 py-9">
        <CandleLoader />
      </div>
    </div>
  )
}

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
        sleep(350).then(() => {
          if (!alive) return
          setPhase('debating')
          ;(async () => {
            const msgs = Array.isArray(d?.messages) ? d.messages : []
            for (let i = 0; i < msgs.length; i++) {
              if (!alive) return
              setTyping(msgs[i].role)
              await sleep(400)
              if (!alive) return
              setTyping(null)
              setVisible(i + 1)
              await sleep(400)
            }
            if (!alive) return
            await sleep(250)
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

  if (!token) {
    return (
      <div className="cv-panel flex flex-col items-center px-6 py-14 text-center">
        <Swords size={22} className="mb-3" style={{ color: '#66739a' }} />
        <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>Set a token first</h3>
        <p className="mt-1.5 max-w-sm text-[13px]" style={{ color: '#8b98bd' }}>
          Enter a token on the Your Token page or use the search bar above to begin.
        </p>
        <a href="/dashboard" className="cv-chip mt-4">Go to Your Token</a>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <ErrorState error={null} onRetry={() => setRunKey((k) => k + 1)}>
        <p className="font-mono text-[11.5px] text-faint">
          The council couldn't fetch the debate evidence for {token.toUpperCase()}. Try again in a moment.
        </p>
      </ErrorState>
    )
  }

  if (phase === 'collecting' || !data) {
    return <CouncilLoading symbol={token.toUpperCase()} />
  }

  const judge = data.judge
  const saveThis = () => {
    saveReceipt(buildReceipt(data.verdictData, { sources: ['Council bull-agent', 'Council bear-agent', 'Judge ruling'] }))
    setSaved(true)
  }

  const messages = Array.isArray(data.messages) ? data.messages : []
  const judged = phase === 'judged'
  const bull100 = Math.round((judge?.bullScore ?? 0) * 100)
  const bear100 = Math.round((judge?.bearScore ?? 0) * 100)
  const decisive = judge ? Math.abs(judge.diff) > judge.threshold : false
  const stance = stanceOf(judge?.verdict)
  const verdictTone = STANCE_TONE[stance.tone] || 'blue'
  const conf = typeof judge?.confidence === 'number' ? Math.round(judge.confidence) : null
  const roundOf = (i) => (i < 2
    ? 'Round 1 · Opening'
    : i < 4
      ? 'Round 2 · Cross-examination'
      : i < 6
        ? 'Round 3 · Rebuttal'
        : 'Round 4 · Closing')

  return (
    <div className="flex flex-col gap-4">
      {/* ── identity: the council is in session ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="cv-panel flex flex-wrap items-center justify-between gap-4 p-5"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border"
            style={{ color: TONES.blue, borderColor: `${TONES.blue}44`, background: `${TONES.blue}14` }}
          >
            <Swords size={19} strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight" style={{ color: '#f4f8ff' }}>
                Council · {data.symbol}
              </h1>
              <LivePill label={judged ? 'Ruled' : 'In session'} />
            </div>
            <p className="mt-1 text-[12.5px]" style={{ color: '#aebfe4' }}>
              Two agents argue the tape. The judge rules on evidence, not vibes.
            </p>
          </div>
        </div>
        <button onClick={() => setRunKey((k) => k + 1)} className="cv-chip">
          <RefreshCw size={12} /> Re-open session
        </button>
      </motion.div>

      {/* ── the arena: bull vs bear face-off, hyped while they speak ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.05 }}
        className="cv-panel flex items-center justify-between gap-4 px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <BullMascot size={44} hype={typing === 'bull' || (judged && stance.key === 'POSITIVE')} />
          <div>
            <p className="text-[12.5px] font-bold leading-none" style={{ color: TONES.up }}>BULL</p>
            <MicroLabel className="mt-1.5 block">argues the positives</MicroLabel>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <Gavel size={17} className="mb-1" style={{ color: TONES.amber }} />
          <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: '#66739a' }}>
            {judged ? 'RULED' : 'IN SESSION'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <p className="text-[12.5px] font-bold leading-none" style={{ color: TONES.down }}>BEAR</p>
            <MicroLabel className="mt-1.5 block">argues the risks</MicroLabel>
          </div>
          <BearMascot size={44} hype={typing === 'bear' || (judged && stance.key === 'CAUTION')} />
        </div>
      </motion.div>

      {/* ── the answer, first ── */}
      {judged ? (
        <AnswerBanner
          icon={Gavel}
          kicker={`Council ruling · ${data.symbol}`}
          answer={`The council's read on ${data.symbol}${data.name && data.name !== data.symbol ? ` (${data.name})` : ''} is ${stance.label} — bull case ${bull100} vs bear case ${bear100} on evidence grounding.`}
          stance={<TonePill label={stance.label} tone={verdictTone} />}
          confidence={conf}
          confidenceTone={verdictTone}
          chips={[
            `${messages.length} arguments heard`,
            `spread ${judge.diff > 0 ? '+' : ''}${judge.diff.toFixed(2)} vs ±${judge.threshold}`,
          ]}
        />
      ) : (
        <AnswerBanner
          icon={Swords}
          kicker={`Council in session · ${data.symbol}`}
          answer={`The council is mid-debate on ${data.symbol} — ${visible} of ${messages.length} arguments heard so far. The judge rules once both advocates have finished.`}
          stance={<TonePill label="In session" tone="amber" />}
          confidence={null}
          chips={['Bull argues the positives', 'Bear argues the risks']}
        />
      )}

      {/* ── the ruling numbers as glowing tiles ── */}
      {judged ? (
        <div className="cv-grid-stats">
          <StatTile icon={TrendingUp} label="Bull Case" value={bull100} foot="judge-scored grounding" delay={0.02} />
          <StatTile icon={TrendingDown} label="Bear Case" value={bear100} foot="judge-scored grounding" delay={0.06} />
          <StatTile
            icon={Scale}
            label="Spread"
            value={`${judge.diff > 0 ? '+' : ''}${judge.diff.toFixed(2)}`}
            foot={`conviction threshold ±${judge.threshold}`}
            delay={0.1}
          />
          <StatTile
            icon={Gavel}
            label="Confidence"
            value={conf !== null ? conf : '—'}
            foot={decisive ? 'ruling is decisive' : 'defaults to discipline'}
            delay={0.14}
          />
        </div>
      ) : (
        <div className="cv-grid-stats">
          {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[92px]" />)}
        </div>
      )}

      {/* ── the judge's ruling ── */}
      {judged ? (
        <PanelV2 icon={Gavel} title="Judge Ruling" right={<TonePill label={stance.label} tone={verdictTone} />} delay={0.18}>
          <ScoreBar
            left={judge.bullScore * 100}
            right={judge.bearScore * 100}
            leftLabel="Bull case"
            rightLabel="Bear case"
            leftTone="up"
            rightTone="down"
          />
          <div className="mt-3 flex flex-col">
            <InsightRow icon={Gavel} tone={verdictTone} title="The judge's ruling" body={judge.text} />
            <InsightRow
              icon={Scale}
              tone={decisive ? 'up' : 'amber'}
              title={`Spread ${judge.diff > 0 ? '+' : ''}${judge.diff.toFixed(2)} vs conviction threshold ±${judge.threshold}`}
              body={decisive ? 'Cleared — the ruling is decisive.' : 'Inside the threshold — the ruling defaults to discipline.'}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={saveThis} disabled={saved} className={`cv-chip ${saved ? 'opacity-60' : ''}`}>
              {saved ? <Check size={12} /> : <Receipt size={12} />} {saved ? 'Receipt saved' : 'Save receipt'}
            </button>
            <Link to={`/dashboard/risk?token=${data.symbol}`} className="cv-chip"><ShieldAlert size={12} /> Risk Desk</Link>
            <Link to={`/dashboard/final?token=${data.symbol}`} className="cv-chip"><Scale size={12} /> Final Verdict</Link>
            <Link to={`/dashboard/studio/image?token=${data.symbol}`} className="cv-chip"><ImageIcon size={12} /> Studio</Link>
          </div>
        </PanelV2>
      ) : (
        <PanelV2 icon={Gavel} title="Judge Ruling" right={<MicroLabel>pending</MicroLabel>} delay={0.18}>
          <p className="text-[12.5px] leading-relaxed" style={{ color: '#8b98bd' }}>
            No verdict is shown until the debate finishes and the judge scores it — the ruling appears here with real numbers only.
          </p>
          <div className="cv-ghost mt-3 h-[64px]" />
        </PanelV2>
      )}

      {/* ── transcript: every argument pops in as its own card ── */}
      <PanelV2
        icon={Swords}
        title="Debate Transcript"
        right={<MicroLabel>{visible} / {messages.length} arguments</MicroLabel>}
        delay={0.24}
      >
        <div ref={scrollRef} className="flex max-h-[430px] flex-col gap-3 overflow-y-auto pr-1">
          {messages.slice(0, visible).map((m, i) => (
            <DebateCard key={i} role={m.role} text={m.text} round={roundOf(i)} />
          ))}
          {typing && <DebateCard role={typing} thinking round={roundOf(visible)} />}
        </div>
      </PanelV2>

      {/* ── the bench: who argued ── */}
      <PanelV2 icon={Scale} title="The Bench" right={<MicroLabel>independent agents</MicroLabel>} delay={0.3}>
        <div className="grid gap-1 sm:grid-cols-3">
          {['bull', 'bear', 'judge'].map((role) => {
            const meta = AGENT_META[role]
            const active = typing === role || (judged && role === 'judge')
            return (
              <AgentRow
                key={role}
                icon={meta.icon}
                name={meta.name}
                desc={meta.desc}
                state={active ? 'active' : 'ready'}
                tone={meta.tone}
              />
            )
          })}
        </div>
      </PanelV2>

      <DyorNote />
    </div>
  )
}
