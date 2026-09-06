// Compare agent — drop up to 3 competitor tokens/CAs and let the Qwen top agent
// + RYO compare them in real time. No demo JavaScript ranking.
import { useMemo, useState } from 'react'
import { Scale, Crown, Plus, X, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge from '../../components/VerdictBadge'
import { fetchCompare } from '../../lib/api'
import { PageHeader, Panel, fmtUsd, fmtPct, changeColor, ErrorState } from '../../components/DashUI'
import { OrbitLoader } from '../../components/Loaders'

const MAX = 3
const PILLARS = ['technical', 'market', 'risk', 'catalyst', 'sentiment']
const PILLAR_LABEL = { technical: 'TECH', market: 'MKT', risk: 'RISK', catalyst: 'CAT', sentiment: 'SENT' }

function TokenColumn({ t, winner, delay }) {
  return (
    <div
      className={`glass-panel !p-4 flex flex-col gap-3 ${winner ? 'ring-1 ring-accent/50 shadow-[0_0_30px_rgba(43,104,255,0.15)]' : ''}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-snow leading-none flex items-center gap-1.5">
            {t.symbol}
            {winner && <Crown size={13} className="text-warning" />}
          </p>
          <p className="text-[10.5px] text-faint truncate mt-1">{t.name}</p>
        </div>
        <VerdictBadge verdict={t.verdict} size="sm" animate={false} />
      </div>

      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[13px] text-snow/90">{fmtUsd(t.priceUsd)}</span>
        <span className={`font-mono text-[11.5px] ${changeColor(t.change24h)}`}>{fmtPct(t.change24h)}</span>
      </div>

      <div className="space-y-1.5">
        {PILLARS.map((k) => {
          const v = t.scores[k] ?? 0
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="font-mono text-[8.5px] tracking-[0.12em] text-faint w-9 flex-shrink-0">{PILLAR_LABEL[k]}</span>
              <div className="flex-1 h-1 rounded-full bg-white/6 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${v}%`, background: v >= 70 ? '#34d399' : v >= 50 ? '#fbbf24' : '#f87171' }}
                />
              </div>
              <span className="font-mono text-[9.5px] text-muted w-5 text-right">{v}</span>
            </div>
          )
        })}
      </div>

      {t.reason && <p className="text-[11px] text-snow/70 leading-relaxed break-words">{t.reason}</p>}

      <div className="mt-auto pt-2 border-t border-white/5 space-y-1">
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Confidence</span><span className="text-snow/85 font-mono">{t.confidence}</span></div>
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Cap</span><span className="text-snow/85 font-mono">{fmtUsd(t.marketCap)}</span></div>
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Vol</span><span className="text-snow/85 font-mono">{fmtUsd(t.volume24h)}</span></div>
        <div className="flex justify-between text-[10.5px]"><span className="text-faint">Volatility</span><span className="text-snow/85 font-mono">{t.volatility}/100</span></div>
      </div>

      <Link to={`/dashboard/deep?token=${t.symbol}`} className="text-[11px] font-semibold text-accent hover:text-[#8fb3ff] transition-colors text-center">
        Deep dive →
      </Link>
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

  return (
    <>
      <PageHeader
        icon={Scale}
        title="Compare"
        subtitle="Drop up to three competitor contracts or tickers — the agent compares them live."
        source={{ mode: 'ai', name: 'AI comparison agent' }}
      >
        <button onClick={run} disabled={!canRun || status === 'loading'} className="glass-chip disabled:opacity-50">
          <RefreshCw size={12} /> {status === 'loading' ? 'Comparing…' : 'Compare now'}
        </button>
      </PageHeader>

      {/* input section — paste CAs or tickers, max 3 */}
      <Panel title={`Competitors · max ${MAX}`} className="mb-4">
        <div className="space-y-2">
          {inputs.map((value, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-accent/10 border border-accent/25 text-accent font-mono text-[11px] flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <input
                value={value}
                onChange={(e) => setInput(i, e.target.value)}
                placeholder={i === 0 ? 'Paste a CA or token (e.g. BTC, SOL, 0x…)' : 'Add a competitor CA or token'}
                className="glass-input flex-1 !py-2.5"
                onKeyDown={(e) => { if (e.key === 'Enter') run() }}
              />
              {inputs.length > 1 && (
                <button type="button" onClick={() => removeInput(i)} className="nav-link p-2 rounded-full" aria-label="Remove">
                  <X size={15} />
                </button>
              )}
            </motion.div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={addInput}
            disabled={inputs.length >= MAX}
            className="glass-chip disabled:opacity-40"
          >
            <Plus size={12} /> Add competitor
          </button>
          <button onClick={run} disabled={!canRun || status === 'loading'} className="glass-btn disabled:opacity-50">
            <Scale size={13} /> {status === 'loading' ? 'Comparing…' : 'Run comparison'}
          </button>
          {symbols.length < 2 && (
            <p className="text-[11px] text-warning">Add at least two tokens to compare.</p>
          )}
        </div>
      </Panel>

      {status === 'error' ? (
        <ErrorState error={error} onRetry={run} />
      ) : status === 'loading' ? (
        <div className="glass-panel flex flex-col items-center justify-center py-16">
          <OrbitLoader label="Comparing evidence packs" />
          <div className="flex items-center gap-2 mt-6">
            {symbols.map((s, i) => (
              <span key={`${s}-${i}`} className="glass-chip font-mono">{s.toUpperCase()}</span>
            ))}
          </div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-faint mt-4">LIVE MARKET + RYO + AI REASONING</p>
        </div>
      ) : status === 'ready' && data ? (
        <AnimatePresence>
          {/* winner banner */}
          {data.winner && data.tokens?.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel !py-3.5 !px-5 mb-4 flex items-center gap-3">
              <Crown size={16} className="text-warning flex-shrink-0" />
              <p className="text-[12.5px] text-snow/85">
                <span className="font-semibold text-snow">{data.winner}</span> carries the strongest risk-adjusted case this round.
              </p>
              <span className="ml-auto font-mono text-[10px] text-faint tracking-[0.12em] hidden sm:block">RANKED BY AI</span>
            </motion.div>
          )}

          {data.narrative && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel !p-4 mb-4">
              <h4 className="text-[11px] font-mono uppercase tracking-[0.18em] text-faint mb-2">Comparison thesis</h4>
              <p className="text-[12.5px] text-snow/80 leading-relaxed break-words">{data.narrative}</p>
            </motion.div>
          )}

          <div className={`grid gap-4 sm:grid-cols-2 ${data.tokens?.length === 3 ? 'xl:grid-cols-3' : ''}`}>
            {data.tokens.map((t, i) => (
              <TokenColumn key={t.symbol} t={t} winner={data.winner === t.symbol} delay={i * 0.08} />
            ))}
          </div>
        </AnimatePresence>
      ) : (
        <div className="glass-panel !py-8 !px-5 text-center text-[12.5px] text-muted">
          Add competitors above and run a live AI comparison.
        </div>
      )}
    </>
  )
}