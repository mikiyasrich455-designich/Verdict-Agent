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
import { ErrorState } from '../../components/DashUI'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow, AgentRow,
  MicroLabel, LivePill, TONES,
} from '../../components/ConsoleUI'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The real per-agent model selection — mirrors QWEN_MODELS in server/lib/llm.js,
// which is what actually serves each advocate and the judge.
const AGENT_META = {
  bull: { name: 'Bull advocate', desc: 'argues commitment', model: 'qwen3.6-flash', icon: TrendingUp, tone: 'up' },
  bear: { name: 'Bear advocate', desc: 'argues restraint', model: 'qwen3.7-flash', icon: TrendingDown, tone: 'down' },
  judge: { name: 'Judge', desc: 'rules on evidence, not vibes', model: 'qwen3.7-plus', icon: Gavel, tone: 'amber' },
}

const VERDICT_TONE = { BUY: 'up', HOLD: 'amber', AVOID: 'down' }

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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
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
        <span className="cv-chip !py-0.5 font-mono !text-[10px]" title="model serving this agent">
          {meta.model}
        </span>
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

function CouncilLoading({ symbol }) {
  const steps = [
    'Reading the evidence pack',
    'Bull advocate building the commitment case',
    'Bear advocate building the restraint case',
    'Judge weighing grounding, not vibes',
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="cv-panel cv-ghost h-[112px]" />
      <div className="cv-grid-stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[92px]" />)}
      </div>
      <div className="cv-panel flex flex-col items-center px-6 py-9">
        <div className="inline-flex items-center gap-3" style={{ color: '#eaf2ff' }}>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6ea8ff] border-t-transparent" />
          <span className="font-mono text-sm">the council is reading the evidence pack for {symbol}…</span>
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-1.5 text-center sm:grid-cols-2">
          {steps.map((s) => (
            <p key={s} className="font-mono text-[11.5px]" style={{ color: '#66739a' }}>{s}…</p>
          ))}
        </div>
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
  const verdictTone = VERDICT_TONE[judge?.verdict] || 'blue'
  const conf = typeof judge?.confidence === 'number' ? Math.round(judge.confidence) : null
  const roundOf = (i) => (i < 2 ? 'Round 1 · Opening' : 'Round 2 · Cross-examination')

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

      {/* ── the answer, first ── */}
      {judged ? (
        <AnswerBanner
          icon={Gavel}
          kicker={`Council ruling · ${data.symbol}`}
          answer={`The council rules ${judge.verdict} on ${data.symbol}${data.name && data.name !== data.symbol ? ` (${data.name})` : ''} — bull case ${bull100} vs bear case ${bear100} on evidence grounding.`}
          stance={<TonePill label={judge.verdict} tone={verdictTone} />}
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
          chips={['Bull argues commitment', 'Bear argues restraint']}
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
        <PanelV2 icon={Gavel} title="Judge Ruling" right={<TonePill label={judge.verdict} tone={verdictTone} />} delay={0.18}>
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

      {/* ── transcript: every argument as its own card ── */}
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

      {/* ── the bench: who argued, and on which model ── */}
      <PanelV2 icon={Scale} title="The Bench" right={<MicroLabel>per-agent models</MicroLabel>} delay={0.3}>
        <div className="grid gap-1 sm:grid-cols-3">
          {['bull', 'bear', 'judge'].map((role) => {
            const meta = AGENT_META[role]
            const active = typing === role || (judged && role === 'judge')
            return (
              <AgentRow
                key={role}
                icon={meta.icon}
                name={meta.name}
                desc={`${meta.desc} · ${meta.model}`}
                state={active ? 'active' : 'ready'}
                tone={meta.tone}
              />
            )
          })}
        </div>
      </PanelV2>
    </div>
  )
}
