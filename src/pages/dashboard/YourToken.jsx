// Your Token — console home. Drop ONE token and every agent skill works for it.
// The token is stored (localStorage) and carried through every sidebar skill link.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Boxes, ArrowRight, Crosshair, Zap, Activity, BarChart3, Radio,
  ShieldAlert, MessageSquare, Microscope, Loader2, RefreshCw, Sparkles,
} from 'lucide-react'
import { PanelV2, Spark, TokenLogo, LivePill, TONES } from '../../components/ConsoleUI'
import { fmtPrice } from '../../components/DashUI'
import { resolveTokenInput } from '../../components/DashboardShell'
import { setActiveToken, getActiveToken, identityFromParams, tokenHref } from '../../lib/activeToken'
import { fetchMajors } from '../../lib/api'
import { STUDIO_COVER } from './StudioShared'

const CHIPS = [
  { icon: BarChart3, label: 'Market', to: '/dashboard/overview' },
  { icon: Boxes, label: 'On-chain', to: '/dashboard/analysis' },
  { icon: Radio, label: 'Narrative', to: '/dashboard/narrative' },
  { icon: ShieldAlert, label: 'Risk', to: '/dashboard/risk' },
  { icon: MessageSquare, label: 'Sentiment', to: '/dashboard/sentiment' },
  { icon: Microscope, label: 'Deep Research', to: '/dashboard/deep' },
]

const ACTIVITY = [
  { icon: BarChart3, name: 'Market Overview', desc: 'Market structure & breadth', to: '/dashboard/overview', tone: TONES.blue },
  { icon: Microscope, name: 'Deep Analysis', desc: 'On-chain & fundamental depth', to: '/dashboard/deep', tone: TONES.violet },
  { icon: Activity, name: 'Sentiment Shift', desc: 'Social & sentiment tracking', to: '/dashboard/sentiment', tone: TONES.cyan },
  { icon: Radio, name: 'KOL Radar', desc: 'Influencer & narrative monitoring', to: '/dashboard/narrative', tone: TONES.violet },
]

export default function YourToken() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [q, setQ] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveErr, setResolveErr] = useState('')

  const [majors, setMajors] = useState(null)
  const [majorsErr, setMajorsErr] = useState('')
  const loadMajors = useCallback(async () => {
    setMajorsErr('')
    try {
      setMajors(await fetchMajors())
    } catch (e) {
      setMajors(null)
      setMajorsErr(e.message || 'Live quotes unavailable')
    }
  }, [])
  useEffect(() => { loadMajors() }, [loadMajors])

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

  const pick = (m) => {
    const identity = { symbol: m.symbol, name: m.name, logo: m.logo }
    setActiveToken(identity)
    navigate(tokenHref('/dashboard/analysis', identity))
  }

  const list = Array.isArray(majors) ? majors.slice(0, 5) : []

  return (
    <div className="flex flex-col gap-4">
      {/* ── hero: one input, whole console ── */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="cv-hero px-6 py-8 md:px-9 md:py-10"
        style={{ '--cv-hero-img': `url("${STUDIO_COVER}")` }}
      >
        <span className="cv-hero-badge"><Boxes size={12} /> AI CRYPTO INTELLIGENCE</span>
        <h1 className="cv-hero-title mt-4">Your Token</h1>
        <p className="cv-hero-sub">Real intelligence. <em>Deeper insights.</em></p>
        <p className="cv-hero-desc">
          Enter a token, contract address or ticker to get a comprehensive analysis
          from our multi-agent AI system.
        </p>

        <form className="cv-hero-search" onSubmit={(e) => { e.preventDefault(); go(q) }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[rgba(126,156,255,0.3)] bg-[rgba(78,139,255,0.14)] text-[#9db9ff]">
            <Crosshair size={15} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a token, contract address, or ticker..."
          />
          <button type="submit" className="cv-btn" disabled={resolving}>
            {resolving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Run Verdict <ArrowRight size={13} />
          </button>
        </form>
        {resolveErr && <p className="mt-3 text-[12px] text-[#ff8fa3]">{resolveErr}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <Link key={c.to} to={tokenPath(c.to)} className="cv-chip">
              <c.icon size={12} /> {c.label}
            </Link>
          ))}
        </div>
      </motion.section>

      {/* ── quick start: real live majors ── */}
      <PanelV2
        icon={Zap}
        delay={0.08}
        title={(
          <span className="flex flex-col gap-0.5">
            Quick Start
            <span className="text-[10.5px] font-normal tracking-[0.02em] text-[#7c89b0]">
              Popular tokens and recent investigations
            </span>
          </span>
        )}
        right={<Link to={tokenPath('/dashboard/overview')} className="cv-viewall">View all <ArrowRight size={12} /></Link>}
      >
        {majorsErr ? (
          <div className="flex flex-col items-start gap-2 py-1">
            <p className="text-[12px] text-[#8b98bd]">Live market quotes are unreachable right now. {majorsErr}</p>
            <button type="button" className="cv-chip" onClick={loadMajors}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : !majors ? (
          <div className="cv-quick-grid">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="cv-ghost h-[96px]" />)}
          </div>
        ) : (
          <div className="cv-quick-grid">
            {list.map((m) => {
              const up = (m.change24h || 0) >= 0
              return (
                <button key={m.symbol} type="button" className="cv-token-card text-left" onClick={() => pick(m)}>
                  <div className="cv-token-card-top">
                    <TokenLogo src={m.logo} symbol={m.symbol} size={34} />
                    <div className="min-w-0">
                      <div className="cv-token-card-sym">{m.symbol}</div>
                      <div className="cv-token-card-name truncate">{m.name}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className="cv-token-card-price">{fmtPrice(m.price)}</div>
                      <div className="text-[11px] font-semibold" style={{ color: up ? TONES.up : TONES.down }}>
                        {up ? '+' : ''}{(m.change24h || 0).toFixed(2)}%
                      </div>
                    </div>
                    <Spark points={[m.change1h, m.change24h, m.change7d]} tone={up ? 'up' : 'down'} w={62} h={26} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </PanelV2>

      {/* ── agent activity: honest live/ready states ── */}
      <PanelV2
        icon={Activity}
        delay={0.16}
        title={(
          <span className="flex flex-col gap-0.5">
            Agent Activity
            <span className="text-[10.5px] font-normal tracking-[0.02em] text-[#7c89b0]">
              Your agents are analyzing the market. Real-time insights across all layers.
            </span>
          </span>
        )}
        right={<LivePill label="All systems online" />}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ACTIVITY.map((a) => {
            const live = location.pathname === a.to
            return (
              <Link key={a.to} to={tokenPath(a.to)} className="cv-act">
                <div className="cv-act-top">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                    style={{ background: `${a.tone}1f`, color: a.tone, border: `1px solid ${a.tone}45` }}
                  >
                    <a.icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-[#eef3ff]">{a.name}</div>
                    <div className="truncate text-[10.5px] text-[#7c89b0]">{a.desc}</div>
                  </div>
                  <ArrowRight size={13} className="shrink-0 text-[#5d6a92]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="cv-act-bar flex-1">
                    {live && <span className="cv-act-fill live" />}
                  </span>
                  <span className="cv-label" style={live ? { color: TONES.up } : undefined}>
                    {live ? 'LIVE' : 'READY'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </PanelV2>
    </div>
  )
}
