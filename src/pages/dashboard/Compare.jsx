// Compare agent — drop up to 3 competitor tokens/CAs and let the Qwen top agent
// + RYO compare them in real time. No demo JavaScript ranking.
import { useMemo, useState } from 'react'
import { Scale, Crown, Plus, X, RefreshCw, Coins, Gauge, Activity, ShieldAlert, Sparkles, TrendingUp, Microscope } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fetchCompare } from '../../lib/api'
import { stanceOf } from '../../lib/stance'
import { plain } from '../../lib/text'
import {
  PanelV2, StatTile, AnswerBanner, InsightRow, TokenLogo, MicroLabel, TONES,
} from '../../components/ConsoleUI'
import { fmtUsd, fmtPrice, fmtPct, fmtNum, ErrorState } from '../../components/DashUI'
import BookLoader from '../../components/loaders/BookLoader'

const MAX = 3
const PILLARS = ['technical', 'market', 'risk', 'catalyst', 'sentiment']
const PILLAR_LABEL = { technical: 'TECH', market: 'MKT', risk: 'RISK', catalyst: 'CAT', sentiment: 'SENT' }
const PILLAR_ICON = { technical: Activity, market: Coins, risk: ShieldAlert, catalyst: Sparkles, sentiment: Gauge }

// Every row is a real number that came back from the live comparison — `better`
// says which direction wins, `null` means the metric is displayed but not scored.
const METRICS = [
  { key: 'priceUsd', label: 'Price', better: null, value: (t) => Number(t.priceUsd), fmt: (t) => fmtPrice(t.priceUsd) },
  { key: 'change24h', label: '24h change', better: 'high', value: (t) => Number(t.change24h), fmt: (t) => fmtPct(t.change24h) },
  { key: 'marketCap', label: 'Market cap', better: 'high', value: (t) => Number(t.marketCap), fmt: (t) => fmtUsd(t.marketCap) },
  { key: 'volume24h', label: '24h volume', better: 'high', value: (t) => Number(t.volume24h), fmt: (t) => fmtUsd(t.volume24h) },
  { key: 'volatility', label: 'Volatility', better: 'low', value: (t) => Number(t.volatility), fmt: (t) => `${fmtNum(t.volatility)}/100` },
  { key: 'confidence', label: 'Conviction', better: 'high', value: (t) => Number(t.confidence), fmt: (t) => `${fmtNum(t.confidence)}/100` },
  ...PILLARS.map((k) => ({
    key: `scores.${k}`,
    label: PILLAR_LABEL[k],
    better: 'high',
    value: (t) => Number(t.scores?.[k]),
    fmt: (t) => `${fmtNum(t.scores?.[k] ?? 0)}/100`,
  })),
]

// Stance tone → ConsoleUI tone bridge: POSITIVE reads teal-up, NEUTRAL amber, CAUTION red-down.
const STANCE_TONE = { positive: 'up', neutral: 'amber', risk: 'down' }
const verdictTone = (v) => STANCE_TONE[stanceOf(v).tone] || 'blue'

function StancePill({ label, tone }) {
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

function Loading() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <BookLoader />
    </div>
  )
}

export default function Compare() {
  const [inputs, setInputs] = useState([''])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const symbols = useMemo(() => inputs.map((s) => s.trim()).filter(Boolean), [inputs])

  const setInput = (i, v) => setInputs((prev) => prev.map((x, idx) => (idx === i ? v : x)))
  const removeInput = (i) => setInputs((prev) => prev.filter((_, idx) => idx !== i))
  const addInput = () => { if (inputs.length < MAX) setInputs((prev) => [...prev, '']) }

  const run = async () => {
    if (symbols.length < 2) return
    setStatus('loading')
    setError(null)
    setData(null)
    try {
      const res = await fetchCompare(symbols)
      setData(res)
      setStatus('ready')
    } catch (err) {
      setError(err.message || 'Compare failed')
      setStatus('error')
    }
  }

  const canRun = symbols.length >= 2
  const tokens = Array.isArray(data?.tokens) ? data.tokens.filter(Boolean) : []

  // Which token wins each scored metric — ties win nothing, so the glow is honest.
  const winners = useMemo(() => {
    const scored = METRICS.filter((m) => m.better)
    const byMetric = scored.map((m) => {
      const vals = tokens.map((t) => m.value(t))
      if (vals.length < 2 || !vals.every((v) => Number.isFinite(v))) return -1
      let best = 0
      for (let i = 1; i < vals.length; i++) {
        if (m.better === 'low' ? vals[i] < vals[best] : vals[i] > vals[best]) best = i
      }
      return vals.filter((v) => v === vals[best]).length > 1 ? -1 : best
    })
    const counts = tokens.map((_, i) => byMetric.reduce((n, b) => n + (b === i ? 1 : 0), 0))
    return { scored, byMetric, counts }
  }, [tokens])

  return (
    <div className="flex flex-col gap-4">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="cv-panel flex flex-wrap items-center justify-between gap-4 p-5"
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"
            style={{ color: TONES.blue, background: 'rgba(78,139,255,0.14)', border: '1px solid rgba(126,156,255,0.28)' }}
          >
            <Scale size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[19px] font-bold leading-tight tracking-tight" style={{ color: '#f4f8ff' }}>Compare</h1>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: '#aebfe4' }}>
              Drop up to three competitor contracts or tickers — the agent compares them live.
            </p>
          </div>
        </div>
        <button type="button" onClick={run} disabled={!canRun || status === 'loading'} className="cv-btn">
          <RefreshCw size={13} /> {status === 'loading' ? 'Comparing…' : 'Compare now'}
        </button>
      </motion.div>

      {/* ── input section — paste CAs or tickers, max 3 ─────────────────── */}
      <PanelV2
        icon={Scale}
        title={`Competitors · max ${MAX}`}
        right={<MicroLabel>{symbols.length} entered</MicroLabel>}
        delay={0.04}
      >
        <div className="flex flex-col gap-2">
          {inputs.map((value, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px]"
                style={{ color: TONES.blue, background: 'rgba(110,168,255,0.12)', border: '1px solid rgba(126,156,255,0.28)' }}
              >
                {i + 1}
              </span>
              <input
                value={value}
                onChange={(e) => setInput(i, e.target.value)}
                placeholder={i === 0 ? 'Paste a CA or token (e.g. BTC, SOL, 0x…)' : 'Add a competitor CA or token'}
                className="min-w-0 flex-1 rounded-xl border border-[rgba(126,156,255,0.18)] bg-[rgba(255,255,255,0.03)] px-3.5 py-2.5 font-mono text-[12.5px] text-[#eaf2ff] outline-none placeholder:text-[#66739a] focus:border-[rgba(110,168,255,0.5)]"
                onKeyDown={(e) => { if (e.key === 'Enter') run() }}
              />
              {inputs.length > 1 && (
                <button type="button" onClick={() => removeInput(i)} className="cv-chip !px-2" aria-label="Remove">
                  <X size={13} />
                </button>
              )}
            </motion.div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={addInput} disabled={inputs.length >= MAX} className="cv-chip disabled:opacity-40">
            <Plus size={12} /> Add competitor
          </button>
          <button type="button" onClick={run} disabled={!canRun || status === 'loading'} className="cv-btn">
            <Scale size={13} /> {status === 'loading' ? 'Comparing…' : 'Run comparison'}
          </button>
          {symbols.length < 2 && (
            <p className="text-[11.5px]" style={{ color: TONES.amber }}>Add at least two tokens to compare.</p>
          )}
        </div>
      </PanelV2>

      {status === 'error' ? (
        <ErrorState error={error} onRetry={run} />
      ) : status === 'loading' ? (
        <Loading symbols={symbols} />
      ) : status === 'ready' && data ? (
        tokens.length === 0 ? (
          <div className="cv-panel flex flex-col items-center px-6 py-12 text-center">
            <Scale size={22} className="mb-3" style={{ color: '#66739a' }} />
            <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>The agent returned no tokens</h3>
            <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed" style={{ color: '#8b98bd' }}>
              Nothing in that batch resolved to a live market. Check the tickers or paste contract addresses and run it again.
            </p>
            <button type="button" onClick={run} className="cv-chip mt-4">
              <RefreshCw size={12} /> Run comparison again
            </button>
          </div>
        ) : (
          (() => {
            const { scored, byMetric, counts } = winners
            const leadIdx = counts.indexOf(Math.max(...counts))
            const lead = tokens[leadIdx]
            const leadWins = counts[leadIdx]
            const agentPick = tokens.find((t) => String(t.symbol).toUpperCase() === String(data.winner || '').toUpperCase()) || null
            const pickStance = agentPick ? stanceOf(agentPick.verdict) : null
            const pickTone = agentPick ? verdictTone(agentPick.verdict) : 'blue'
            const answer =
              `${(agentPick || lead).symbol} takes the round`
              + (leadWins > 0 ? ` — it leads ${leadWins} of ${scored.length} scored live metrics` : ` — no token leads a clear majority of the ${scored.length} scored metrics`)
              + `: ${fmtPrice(lead.priceUsd)} at ${fmtPct(lead.change24h)} on the day, ${fmtUsd(lead.marketCap)} cap and ${fmtUsd(lead.volume24h)} of tape.`
              + (agentPick
                ? ` The agent ranks ${agentPick.symbol} ${pickStance.label} on ${fmtNum(agentPick.confidence)}/100 conviction.`
                : ' The agent did not name a winner this round.')

            return (
              <>
                {/* ── the answer, first ── */}
                <AnswerBanner
                  icon={Crown}
                  kicker={`Compare · ${tokens.length} tokens`}
                  answer={answer}
                  stance={<StancePill label={agentPick ? `${agentPick.symbol} ${pickStance.label}` : `${lead.symbol} leads`} tone={pickTone} />}
                  confidence={agentPick ? agentPick.confidence : null}
                  confidenceTone={pickTone}
                  chips={[
                    `${scored.length} scored metrics`,
                    data.winner ? `agent pick ${String(data.winner).toUpperCase()}` : 'no agent pick',
                    data.asOf ? `compared ${new Date(data.asOf).toLocaleTimeString()}` : null,
                  ].filter(Boolean)}
                />

                {/* ── live numbers per token ── */}
                <div className="cv-grid-stats">
                  {tokens.map((t, i) => (
                    <StatTile
                      key={t.symbol}
                      icon={Coins}
                      label={`${t.symbol} · ${t.name || 'unnamed'}`}
                      value={fmtPrice(t.priceUsd)}
                      delta={t.change24h}
                      deltaTone={Number(t.change24h) >= 0 ? 'up' : 'down'}
                      foot={`cap ${fmtUsd(t.marketCap)} · tape ${fmtUsd(t.volume24h)}`}
                      delay={0.02 + i * 0.04}
                    />
                  ))}
                  <StatTile
                    icon={Crown}
                    label="Agent pick"
                    value={data.winner ? String(data.winner).toUpperCase() : '—'}
                    foot={agentPick ? `${pickStance.label} · ${fmtNum(agentPick.confidence)}/100 conviction` : 'the agent named no winner'}
                    delay={0.02 + tokens.length * 0.04}
                  />
                </div>

                <div className="cv-grid-2">
                  <div className="flex min-w-0 flex-col gap-4">
                    <PanelV2
                      icon={Scale}
                      title="Head-to-head"
                      right={<MicroLabel>teal cell wins the row</MicroLabel>}
                      delay={0.14}
                    >
                      {METRICS.map((m, mi) => {
                        const best = m.better ? byMetric[scored.indexOf(m)] : -1
                        return (
                          <div key={m.key} className="cv-rowline">
                            <span className="cv-rowline-label flex items-center gap-1.5">
                              {PILLAR_ICON[m.key.replace('scores.', '')] && (
                                (() => { const I = PILLAR_ICON[m.key.replace('scores.', '')]; return <I size={11} style={{ color: '#66739a' }} /> })()
                              )}
                              {m.label}
                            </span>
                            {tokens.map((t, i) => (
                              <span
                                key={t.symbol}
                                className={`cv-rowline-cell text-right font-mono text-[12px] ${best === i ? 'win' : ''}`}
                                style={best === i ? undefined : { color: '#dce5f8' }}
                              >
                                {Number.isFinite(m.value(t)) ? m.fmt(t) : '—'}
                              </span>
                            ))}
                            <span className="sr-only">{mi}</span>
                          </div>
                        )
                      })}
                    </PanelV2>

                    <PanelV2
                      icon={Sparkles}
                      title="Why each token ranked here"
                      right={<MicroLabel>agent reasoning</MicroLabel>}
                      delay={0.2}
                    >
                      {tokens.map((t) => {
                        const ts = stanceOf(t.verdict)
                        return (
                          <InsightRow
                            key={t.symbol}
                            icon={ts.key === 'POSITIVE' ? TrendingUp : ts.key === 'CAUTION' ? ShieldAlert : Gauge}
                            tone={STANCE_TONE[ts.tone] || 'blue'}
                            title={`${t.symbol} — ${ts.label} at ${fmtNum(t.confidence)}/100 conviction`}
                            body={plain(t.reason) || 'The agent returned no written reasoning for this token.'}
                          />
                        )
                      })}
                    </PanelV2>
                  </div>

                  <div className="flex min-w-0 flex-col gap-4">
                    <PanelV2 icon={Coins} title="The field" delay={0.17}>
                      <div className="flex flex-col gap-3">
                        {tokens.map((t) => (
                          <div
                            key={t.symbol}
                            className="flex items-center gap-3 rounded-xl border p-3"
                            style={{
                              borderColor: data.winner && String(data.winner).toUpperCase() === String(t.symbol).toUpperCase() ? 'rgba(47,224,176,0.35)' : 'rgba(126,156,255,0.14)',
                              background: data.winner && String(data.winner).toUpperCase() === String(t.symbol).toUpperCase() ? 'rgba(47,224,176,0.07)' : 'rgba(255,255,255,0.03)',
                            }}
                          >
                            <TokenLogo symbol={t.symbol} size={34} />
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 truncate text-[13px] font-bold" style={{ color: '#f4f8ff' }}>
                                {t.symbol}
                                {data.winner && String(data.winner).toUpperCase() === String(t.symbol).toUpperCase() && (
                                  <Crown size={12} style={{ color: TONES.amber }} />
                                )}
                              </p>
                              <p className="truncate text-[10.5px]" style={{ color: '#7c89b0' }}>
                                {t.name || 'unnamed'}{t.chain ? ` · ${t.chain}` : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <StancePill label={stanceOf(t.verdict).label} tone={verdictTone(t.verdict)} />
                              <p className="mt-1.5 font-mono text-[10px]" style={{ color: '#66739a' }}>
                                {counts[tokens.indexOf(t)]}/{scored.length} rows won
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tokens.map((t) => (
                          <Link key={t.symbol} to={`/dashboard/deep?token=${t.symbol}`} className="cv-chip">
                            <Microscope size={12} /> Deep dive {t.symbol}
                          </Link>
                        ))}
                      </div>
                    </PanelV2>

                    <PanelV2 icon={Activity} title="Comparison thesis" delay={0.23}>
                      {data.narrative ? (
                        <p className="text-[12.5px] leading-relaxed break-words" style={{ color: '#aebfe4' }}>{plain(data.narrative)}</p>
                      ) : (
                        <p className="text-[12px]" style={{ color: '#66739a' }}>The agent returned no written thesis for this round.</p>
                      )}
                      {data.asOf && (
                        <p className="mt-3 font-mono text-[10px]" style={{ color: '#66739a' }}>
                          compared {new Date(data.asOf).toLocaleString()}
                        </p>
                      )}
                    </PanelV2>
                  </div>
                </div>
              </>
            )
          })()
        )
      ) : (
        <div className="cv-panel flex flex-col items-center px-6 py-12 text-center">
          <Scale size={22} className="mb-3" style={{ color: '#66739a' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: '#eef3ff' }}>No comparison yet</h3>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed" style={{ color: '#8b98bd' }}>
            Add competitors above and run a live comparison — price, cap, tape, volatility, conviction and all five pillars, scored head-to-head.
          </p>
        </div>
      )}
    </div>
  )
}
