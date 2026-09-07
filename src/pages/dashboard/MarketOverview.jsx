// Market Overview agent — regime, fear & greed, breadth, movers.
import { Globe, RefreshCw, TrendingUp, TrendingDown, ArrowRight, Crosshair, Activity, Coins, Gauge, Layers } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchMarketOverview, fetchVerdict, fetchTokenProfile } from '../../lib/api'
import { fmtUsd, fmtPrice, fmtPct, ErrorState } from '../../components/DashUI'
import {
  PanelV2, StatTile, ScoreBar, AnswerBanner, InsightRow,
  TokenLogo, MicroLabel, Spark, Ring, TONES,
} from '../../components/ConsoleUI'
import { getStoredToken } from '../../components/DashboardShell'
import { stanceOf } from '../../lib/stance'
import BookLoader from '../../components/loaders/BookLoader'

const REGIME_TONE = { 'risk-on': 'up', neutral: 'amber', 'risk-off': 'down' }
// Stance tone → ConsoleUI tone bridge: POSITIVE reads teal-up, NEUTRAL amber, CAUTION red-down.
const STANCE_TONE = { positive: 'up', neutral: 'amber', risk: 'down' }

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

function MarketSkeleton() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <BookLoader />
    </div>
  )
}

function TokenFocusStrip({ token, focus }) {
  const focusSymbol = token.toUpperCase()

  if (focus.status === 'error') {
    return (
      <PanelV2 icon={Crosshair} title={`Token in focus · ${focusSymbol}`} delay={0.04}>
        <ErrorState error={focus.error}>
          <p className="font-mono text-[11.5px]" style={{ color: '#66739a' }}>
            The market overview can still load even when the focused-token engine is unavailable.
          </p>
        </ErrorState>
      </PanelV2>
    )
  }

  if (focus.status !== 'ready' || !focus.data) {
    return (
      <PanelV2 icon={Crosshair} title={`Token in focus · ${focusSymbol}`} delay={0.04}>
        <div className="flex flex-col gap-4">
          <div className="cv-ghost h-[92px]" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="cv-ghost h-[58px]" />)}
          </div>
          <p className="text-[12px]" style={{ color: '#8b98bd' }}>
            Running {focusSymbol} through the verdict engine — verdict, price and confidence for your token in this market context…
          </p>
        </div>
      </PanelV2>
    )
  }

  const { v, p } = focus.data
  const displaySymbol = p.symbol || focusSymbol
  const sparkPts = (p.priceHistory || []).slice(-24).map((x) => Number(x.price)).filter((n) => Number.isFinite(n))
  const upTone = Number(v.change24h) >= 0 ? 'up' : 'down'
  const stance = stanceOf(v.verdict)
  const verdictTone = STANCE_TONE[stance.tone] || 'blue'
  const price = fmtPrice(v.priceUsd)

  return (
    <PanelV2 icon={Crosshair} title={`Token in focus · ${displaySymbol}`} right={<MicroLabel>{p.name || displaySymbol}</MicroLabel>} delay={0.04}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <TokenLogo src={p.logo} symbol={displaySymbol} size={48} />
          <div className="min-w-0">
            <StancePill label={stance.label} tone={verdictTone} />
            <div className="mt-2.5">
              <MicroLabel>Price</MicroLabel>
              <p className="mt-1 text-2xl font-bold leading-none" style={{ color: '#f4f8ff' }}>{price === '—' ? 'no price published' : price}</p>
            </div>
            <p className={`cv-delta mt-1.5 !text-[12px] ${upTone}`}>{fmtPct(v.change24h)} · 24h</p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[rgba(126,156,255,0.14)] bg-[rgba(255,255,255,0.03)] p-3">
            <MicroLabel>Bull score</MicroLabel>
            <p className="mt-1 text-[18px] font-bold" style={{ color: TONES.up }}>{v.bullScore}</p>
          </div>
          <div className="rounded-xl border border-[rgba(126,156,255,0.14)] bg-[rgba(255,255,255,0.03)] p-3">
            <MicroLabel>Bear score</MicroLabel>
            <p className="mt-1 text-[18px] font-bold" style={{ color: TONES.down }}>{v.bearScore}</p>
          </div>
          <div className="rounded-xl border border-[rgba(126,156,255,0.14)] bg-[rgba(255,255,255,0.03)] p-3">
            <MicroLabel>24h tape</MicroLabel>
            {sparkPts.length > 1 ? (
              <div className="mt-1"><Spark points={sparkPts} tone={upTone} w={72} h={28} /></div>
            ) : (
              <p className="mt-1 text-[12px]" style={{ color: '#66739a' }}>no hourly series published</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-end">
          <Ring value={v.confidence} size={72} tone={verdictTone} label="conf" sub="verdict confidence" />
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link to={`/dashboard/analysis?token=${displaySymbol}`} className="cv-chip">Full analysis <ArrowRight size={12} /></Link>
            <Link to={`/dashboard/council?token=${displaySymbol}`} className="cv-chip">Send to Council</Link>
          </div>
        </div>
      </div>
    </PanelV2>
  )
}

export default function MarketOverview() {
  const [runKey, rerun] = useRunKey()
  const { status, data, error: agentError } = useAgentData(() => fetchMarketOverview(), [runKey])
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || getStoredToken()
  const focus = useAgentData(
    () => (token
      ? Promise.all([fetchVerdict(token), fetchTokenProfile(token)]).then(([v, p]) => ({ v, p }))
      : Promise.resolve(null)),
    [token]
  )

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-4">
        {token && <TokenFocusStrip token={token} focus={focus} />}
        <ErrorState error={agentError} onRetry={() => rerun()} />
      </div>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <div className="flex flex-col gap-4">
        {token && <TokenFocusStrip token={token} focus={focus} />}
        <MarketSkeleton />
      </div>
    )
  }

  const d = data
  const declining = Math.max(0, 100 - d.breadth.advancing)
  const focusSymbol = focus.data?.p?.symbol || token.toUpperCase()
  const breadthConviction = Math.max(d.breadth.advancing, declining)
  const regimeTone = REGIME_TONE[d.regime] || 'blue'
  const capUsd = fmtUsd(Number(d.totalMarketCap) * 1e12)
  const volUsd = fmtUsd(Number(d.volume24h) * 1e9)
  const breadthRead = d.breadth.advancing >= 55
    ? 'Broad participation — rallies are confirmed by the tape, not just majors.'
    : d.breadth.advancing >= 40
      ? 'Mixed participation — leadership is narrow; follow the movers, not the index.'
      : 'Narrow tape — downside breadth warns against aggressive entries.'
  const fearRead = d.fearGreed >= 60
    ? 'Confidence is elevated — momentum trades work, euphoria risk rises.'
    : d.fearGreed >= 45
      ? 'Balanced sentiment — selectivity beats conviction here.'
      : 'Fear dominates — capital preservation mode, dips get bought slowly.'
  const regimeRead = d.regime === 'risk-on'
    ? 'Council and analysis agents run aggressive playbooks in this regime.'
    : d.regime === 'risk-off'
      ? 'Risk Desk tightens stops automatically when the regime flips risk-off.'
      : 'Neutral regime — agents weight catalysts over momentum.'
  const answer = `The market is ${d.regime} with Fear & Greed at ${d.fearGreed} (${d.fgLabel}). `
    + `${d.breadth.advancing}% of tracked assets are advancing against ${declining}% declining, `
    + `BTC dominance is ${d.btcDominance}%, total cap is ${capUsd}, and 24h turnover is ${volUsd}.`

  return (
    <div className="flex flex-col gap-4">
      <AnswerBanner
        icon={Globe}
        kicker="Market Overview · regime read"
        answer={answer}
        stance={<StancePill label={d.regime} tone={regimeTone} />}
        confidence={breadthConviction}
        confidenceTone={d.breadth.advancing >= declining ? 'up' : 'down'}
        chips={[
          `${d.movers.length} published movers`,
          `${d.breadth.unchanged || 0}% unchanged`,
          `as of ${new Date(d.asOf).toLocaleTimeString()}`,
        ]}
      >
        <button type="button" onClick={rerun} className="cv-chip">
          <RefreshCw size={12} /> Refresh
        </button>
      </AnswerBanner>

      {token && <TokenFocusStrip token={token} focus={focus} />}

      <div className="cv-grid-stats">
        <StatTile icon={Gauge} label="Fear & Greed" value={d.fearGreed} foot={d.fgLabel} delay={0.02} />
        <StatTile icon={Coins} label="BTC Dominance" value={`${d.btcDominance}%`} foot="share of total cap" delay={0.06} />
        <StatTile icon={Layers} label="Total Market Cap" value={capUsd} foot="all tracked crypto assets" delay={0.1} />
        <StatTile icon={Activity} label="24h Volume" value={volUsd} foot="cross-market turnover" delay={0.14} />
      </div>

      <div className="cv-grid-2">
        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2 icon={TrendingUp} title="Market Breadth" right={<MicroLabel>advancing vs declining</MicroLabel>} delay={0.18}>
            <ScoreBar
              left={d.breadth.advancing}
              right={declining}
              leftLabel="Advancing"
              rightLabel="Declining"
              leftTone="up"
              rightTone="down"
            />
            <div className="mt-4">
              <div className="cv-rowline">
                <span className="cv-rowline-label">Advancing</span>
                <span className={`cv-rowline-cell text-right font-mono ${d.breadth.advancing >= declining ? 'win' : ''}`}>{d.breadth.advancing}%</span>
              </div>
              <div className="cv-rowline">
                <span className="cv-rowline-label">Declining</span>
                <span className={`cv-rowline-cell text-right font-mono ${declining > d.breadth.advancing ? 'win' : ''}`} style={declining > d.breadth.advancing ? undefined : { color: TONES.down }}>
                  {declining}%
                </span>
              </div>
              <div className="cv-rowline">
                <span className="cv-rowline-label">Unchanged</span>
                <span className="cv-rowline-cell text-right font-mono">{d.breadth.unchanged || 0}%</span>
              </div>
            </div>
            <InsightRow icon={Activity} tone={d.breadth.advancing >= declining ? 'up' : 'down'} title="Breadth interpretation" body={breadthRead} />
          </PanelV2>

          <PanelV2 icon={TrendingDown} title="Biggest Movers" right={<MicroLabel>24h change only · no intraday series published</MicroLabel>} delay={0.24}>
            {d.movers.length === 0 ? (
              <p className="text-[12px]" style={{ color: '#66739a' }}>No movers published in this market snapshot.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {d.movers.map((m) => {
                  const isFocus = m.symbol === focusSymbol
                  const up = Number(m.change24h) >= 0
                  return (
                    <Link
                      key={m.symbol}
                      to={`/dashboard/analysis?token=${m.symbol}`}
                      className="cv-source w-full"
                      style={isFocus ? { borderColor: `${TONES.blue}66`, background: 'rgba(110,168,255,0.10)' } : undefined}
                    >
                      <TokenLogo symbol={m.symbol} size={26} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[12px] font-semibold" style={{ color: '#eaf2ff' }}>{m.symbol}</span>
                          {isFocus && <span className="cv-chip !rounded-full !px-2 !py-0 text-[8px] tracking-[0.14em]">FOCUS</span>}
                        </span>
                        <span className="block truncate font-mono text-[10px]" style={{ color: '#66739a' }}>{m.name}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[12px]" style={{ color: '#dce5f8' }}>{fmtUsd(m.priceUsd)}</span>
                        <span className={`cv-delta block ${up ? 'up' : 'down'}`}>{fmtPct(m.change24h)}</span>
                      </span>
                      <ArrowRight size={13} style={{ color: '#66739a' }} />
                    </Link>
                  )
                })}
              </div>
            )}
          </PanelV2>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PanelV2 icon={Gauge} title="Fear & Greed Index" right={<MicroLabel>{d.fgLabel}</MicroLabel>} delay={0.2}>
            <div className="flex items-center gap-5">
              <Ring value={d.fearGreed} size={92} stroke={7} tone={d.fearGreed >= 60 ? 'up' : d.fearGreed >= 45 ? 'amber' : 'down'} label="index" sub="0–100" />
              <div className="min-w-0">
                <p className="text-[13px] leading-relaxed" style={{ color: '#aebfe4' }}>{fearRead}</p>
                <p className="mt-2 text-[11px]" style={{ color: '#66739a' }}>Sentiment gauge from the live market snapshot.</p>
              </div>
            </div>
          </PanelV2>

          <PanelV2 icon={Globe} title="Agent Note" right={<MicroLabel>{d.regime}</MicroLabel>} delay={0.28}>
            <InsightRow icon={Globe} tone={regimeTone} title={`${d.regime.toUpperCase()} regime posture`} body={regimeRead} />
            <div className="mt-3">
              <div className="cv-rowline">
                <span className="cv-rowline-label">Snapshot</span>
                <span className="cv-rowline-cell text-right font-mono text-[11px]">{new Date(d.asOf).toLocaleString()}</span>
              </div>
              <div className="cv-rowline">
                <span className="cv-rowline-label">Data mode</span>
                <span className="cv-rowline-cell text-right">live market data</span>
              </div>
            </div>
          </PanelV2>
        </div>
      </div>
    </div>
  )
}
