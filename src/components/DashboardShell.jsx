// DashboardShell — the agent console frame (Console v2).
// Flat cosmic sidebar with gradient active pill, centered global token search,
// live intelligence rail on the right, and an <Outlet /> for each agent page.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Globe, Crosshair, Microscope, Scale, Gauge,
  Gavel, Swords, Megaphone, Radio, Clapperboard, ImageIcon, Film, AudioWaveform,
  Cpu, ShieldAlert, History, LayoutDashboard, Menu, X,
  Search, Sparkles, CornerDownLeft, ArrowLeft, Bell, Plus, ChevronDown, Gem, Activity, Crown,
} from 'lucide-react'
import Logo from './Logo'
import { resolveToken } from '../lib/api'
import { fetchMajors } from '../lib/api'
import { getActiveToken, setActiveToken, identityForSymbol, tokenHref, shortCa } from '../lib/activeToken'
import { MicroLabel, LivePill, FeedRow, AgentRow, Spark, TONES } from './ConsoleUI'

// Plain tickers that DexScreener may not know (e.g. BTC, ETH) still work
// downstream via RYO — let those through unverified.
const TICKER_LIKE = /^[A-Za-z][A-Za-z0-9.$_-]{0,11}$/

const unverified = (input) => ({
  symbol: input.toUpperCase(), name: input.toUpperCase(),
  ca: '', chain: '', logo: '', banner: '', resolved: false,
})

// Resolve a pasted CA / name / ticker to a full identity — never just a ticker.
// "ACE" is a different asset on every chain, so dropping the contract address
// here is what used to hand back the wrong token.
export async function resolveTokenInput(raw) {
  const input = String(raw || '').trim()
  if (!input) throw new Error('Enter a token, name, or contract address')
  // A contract address has exactly one answer. If it can't be resolved there is
  // no safe fallback — answering for a same-ticker lookalike would be a lie.
  const mustResolve = !TICKER_LIKE.test(input)
  try {
    const data = await resolveToken(input)
    if (data?.symbol) {
      return {
        symbol: String(data.symbol).toUpperCase(),
        name: data.name || String(data.symbol).toUpperCase(),
        ca: data.ca || '',
        chain: data.chain || '',
        logo: data.logo || '',
        banner: data.banner || '',
        resolved: !!data.resolved,
      }
    }
    if (mustResolve) throw new Error(`Couldn't find "${input}" on any supported network`)
    return unverified(input)
  } catch (err) {
    if (mustResolve) throw err
    return unverified(input)
  }
}

// ── the skill tree (groups → skills) ────────────────────────────
export const NAV_TREE = [
  {
    id: 'market',
    label: 'MARKET',
    icon: TrendingUp,
    skills: [
      { to: '/dashboard/overview', label: 'Market Overview', icon: Globe, hint: 'Regime, breadth, movers' },
      { to: '/dashboard/analysis', label: 'Token Analysis', icon: Crosshair, hint: 'Single-token profile' },
      { to: '/dashboard/deep', label: 'Deep Analysis', icon: Microscope, hint: 'Forensic deep dive' },
      { to: '/dashboard/compare', label: 'Compare', icon: Scale, hint: 'Head-to-head tokens' },
      { to: '/dashboard/sentiment', label: 'Sentiment Shift', icon: Gauge, hint: 'Mood rotation monitor' },
    ],
  },
  {
    id: 'council',
    label: 'COUNCIL',
    icon: Gavel,
    skills: [
      { to: '/dashboard/council', label: 'Bull vs Bear', icon: Swords, hint: 'Adversarial debate' },
    ],
  },
  {
    id: 'narrative',
    label: 'NARRATIVE',
    icon: Megaphone,
    skills: [
      { to: '/dashboard/narrative', label: 'KOL Radar', icon: Radio, hint: 'Multi-KOL narrative agent' },
    ],
  },
  {
    id: 'studio',
    label: 'STUDIO',
    icon: Clapperboard,
    skills: [
      { to: '/dashboard/studio/image', label: 'Image', icon: ImageIcon, hint: 'Verdict card art' },
      { to: '/dashboard/studio/video', label: 'Video', icon: Film, hint: '15s verdict reel' },
      { to: '/dashboard/studio/voice', label: 'Voice', icon: AudioWaveform, hint: 'Narrated brief' },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    icon: Cpu,
    skills: [
      { to: '/dashboard/final', label: 'Final Verdict', icon: Crown, hint: 'Every agent, one read' },
      { to: '/dashboard/risk', label: 'Risk Desk', icon: ShieldAlert, hint: 'Position & exit plan' },
      { to: '/dashboard/history', label: 'History', icon: History, hint: 'Decision receipts' },
    ],
  },
]

// Routes that accept a ?token= focus param.
const TOKEN_SCOPED = [
  '/dashboard/analysis', '/dashboard/deep', '/dashboard/council',
  '/dashboard/narrative', '/dashboard/risk', '/dashboard/compare',
  '/dashboard/overview', '/dashboard/final',
  '/dashboard/studio/image', '/dashboard/studio/video', '/dashboard/studio/voice',
]

// One token drives the whole dashboard — it survives navigation + reloads.
// (the {symbol, ca, chain} identity itself lives in ../lib/activeToken)
export { getStoredToken, getActiveToken } from '../lib/activeToken'

export function findSkill(pathname) {
  for (const group of NAV_TREE) {
    for (const skill of group.skills) {
      if (pathname === skill.to || pathname.startsWith(skill.to + '/')) {
        return { group, skill }
      }
    }
  }
  return null
}

// Curated agent roster for the rail / activity cards.
export const RAIL_AGENTS = [
  { to: '/dashboard/overview', icon: Globe, name: 'Market Overview', desc: 'Regime, breadth & movers', tone: 'blue' },
  { to: '/dashboard/analysis', icon: Crosshair, name: 'Token Analysis', desc: 'On-chain & fundamental profile', tone: 'violet' },
  { to: '/dashboard/sentiment', icon: Gauge, name: 'Sentiment Shift', desc: 'Social & sentiment tracking', tone: 'cyan' },
  { to: '/dashboard/narrative', icon: Radio, name: 'KOL Radar', desc: 'Influencer & narrative monitoring', tone: 'violet' },
  { to: '/dashboard/council', icon: Swords, name: 'Bull vs Bear', desc: 'Adversarial council debate', tone: 'blue' },
  { to: '/dashboard/final', icon: Crown, name: 'Final Recommendation', desc: 'Every agent, one reconciled read', tone: 'amber' },
]

// ── sidebar ─────────────────────────────────────────────────────
function SideBrand() {
  return (
    <div className="flex items-center gap-3 px-4 pt-5 pb-4">
      <span className="cv-logobox">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      <div className="leading-none">
        <span className="block text-[16px] font-bold tracking-tight text-[#F2F6FF]">verdict</span>
        <MicroLabel className="mt-1 block">AGENT CONSOLE</MicroLabel>
      </div>
    </div>
  )
}

function SideNav({ onNavigate }) {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const focus = searchParams.get('token')
  const stored = getActiveToken()
  // The URL token wins, but the stored identity is what carries the CA with it.
  const active =
    focus && identityForSymbol(focus)
      ? identityForSymbol(focus)
      : focus
      ? { symbol: focus }
      : stored
  const activeSkill = findSkill(pathname)

  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-3">
      <NavLink
        to="/dashboard"
        end
        onClick={onNavigate}
        className={({ isActive }) => `cv-nav-item ${isActive && !activeSkill ? 'on' : ''}`}
      >
        <LayoutDashboard size={15} strokeWidth={2} />
        Your Token
      </NavLink>

      {NAV_TREE.map((group) => {
        const GIcon = group.icon
        return (
          <div key={group.id}>
            <div className="cv-nav-label">
              <GIcon size={11} strokeWidth={2.2} className="text-[#5b6890]" />
              <MicroLabel>{group.label}</MicroLabel>
            </div>
            <div className="space-y-0.5">
              {group.skills.map((skill) => {
                const SIcon = skill.icon
                const to =
                  active?.symbol && TOKEN_SCOPED.includes(skill.to)
                    ? tokenHref(skill.to, active)
                    : skill.to
                return (
                  <NavLink
                    key={skill.to}
                    to={to}
                    onClick={onNavigate}
                    title={skill.hint}
                    className={({ isActive }) => `cv-nav-item ${isActive ? 'on' : ''}`}
                  >
                    <SIcon size={15} strokeWidth={2} />
                    {skill.label}
                  </NavLink>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function SideFooter() {
  return (
    <div className="mt-auto">
      <div className="cv-syscard">
        <i />
        <div>
          <b>System Online</b>
          <span>All agents operational</span>
        </div>
      </div>
      <p className="px-5 pb-4 text-[10px] text-[#5b6890]">Verdict v2.0</p>
    </div>
  )
}

// ── topbar ──────────────────────────────────────────────────────
function Topbar({ onMenu }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const focusToken = searchParams.get('token') || ''
  const activeToken = useMemo(
    () => (focusToken ? identityForSymbol(focusToken) || { symbol: focusToken } : getActiveToken()),
    [focusToken, searchParams]
  )
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const found = useMemo(() => findSkill(pathname), [pathname])
  const isHome = pathname === '/dashboard'

  const [resolving, setResolving] = useState(false)
  const [resolveErr, setResolveErr] = useState('')

  // remember whatever token lands in the URL — the CA travels with it so the
  // dashboard never forgets which "ACE" the user actually asked about.
  useEffect(() => {
    const t = searchParams.get('token')
    if (!t) return
    const ca = searchParams.get('ca') || ''
    const chain = searchParams.get('chain') || ''
    if (ca) {
      setActiveToken({ symbol: t, ca, chain, name: searchParams.get('name') || '' })
      return
    }
    // URL carries a bare ticker: re-attach the stored CA, and keep the logo in
    // the store fresh for the header.
    const stored = identityForSymbol(t)
    if (stored?.ca) {
      setSearchParams(
        (prev) => {
          prev.set('ca', stored.ca)
          if (stored.chain) prev.set('chain', stored.chain)
          return prev
        },
        { replace: true }
      )
    } else if (stored) {
      setActiveToken(stored)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // token-scoped skill with no token? restore the saved one so the page just works
  useEffect(() => {
    if (!focusToken && TOKEN_SCOPED.includes(pathname)) {
      const stored = getActiveToken()
      if (stored?.symbol) {
        setSearchParams(
          (prev) => {
            prev.set('token', stored.symbol)
            if (stored.ca) {
              prev.set('ca', stored.ca)
              if (stored.chain) prev.set('chain', stored.chain)
            }
            return prev
          },
          { replace: true }
        )
      }
    }
  }, [pathname, focusToken, setSearchParams])

  const submit = async (e) => {
    e.preventDefault()
    const raw = query.trim()
    if (!raw || resolving) return
    setResolveErr('')
    setResolving(true)
    try {
      const identity = await resolveTokenInput(raw)
      setActiveToken(identity)
      setQuery('')
      setResolving(false)
      if (TOKEN_SCOPED.includes(pathname)) {
        setSearchParams(
          (prev) => {
            prev.set('token', identity.symbol)
            if (identity.ca) {
              prev.set('ca', identity.ca)
              prev.set('chain', identity.chain)
            } else {
              prev.delete('ca')
              prev.delete('chain')
            }
            return prev
          }
        )
      } else {
        navigate(tokenHref('/dashboard/analysis', identity))
      }
    } catch (err) {
      setResolving(false)
      setResolveErr(err.message || 'Could not resolve that token')
    }
  }

  return (
    <header className="cv-topbar">
      <Link to={isHome ? '/' : '/dashboard'} className="cv-iconbtn" aria-label={isHome ? 'Back to home' : 'Back to console'} title={isHome ? 'Back to home' : 'Back to console'}>
        <ArrowLeft size={16} />
      </Link>
      <span className="hidden md:block w-[118px] truncate text-[13px] font-semibold text-[#E8EFFF]">
        {isHome ? 'Home' : found ? found.skill.label : 'Console'}
      </span>

      <button type="button" className="cv-iconbtn lg:hidden" onClick={onMenu} aria-label="Open skill tree">
        <Menu size={16} />
      </button>

      {/* global token search */}
      <form onSubmit={submit} className="relative mx-auto w-full max-w-[560px] flex-1">
        <div className="cv-top-search">
          <Search size={14} className="flex-shrink-0 text-[#66739A]" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setResolveErr('') }}
            placeholder="Search token, contract address, ticker..."
            aria-label="Search token"
          />
          {resolving ? (
            <span className="kbd">
              <span className="block h-3 w-3 animate-spin rounded-full border-2 border-[#6EA8FF]/30 border-t-[#6EA8FF]" />
            </span>
          ) : (
            <button type="submit" className="kbd" aria-label="Focus token" title="Focus this token">
              <CornerDownLeft size={12} />
            </button>
          )}
        </div>
        {resolveErr && (
          <div className="absolute left-0 top-full z-50 mt-1.5 max-w-full rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300 shadow-lg">
            {resolveErr}
          </div>
        )}
      </form>

      {focusToken && (
        <span
          title={activeToken?.ca ? `Pinned to ${activeToken.ca}` : activeToken?.name || focusToken}
          className="hidden xl:inline-flex max-w-[190px] items-center gap-1.5 rounded-full border border-[#7E9CFF]/25 bg-[#6EA8FF]/10 px-3 py-1.5 font-mono text-[11px] text-[#9DC0FF]"
        >
          {activeToken?.logo ? (
            <img src={activeToken.logo} alt="" className="h-4 w-4 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <Crosshair size={11} className="flex-shrink-0" />
          )}
          <span className="truncate">{focusToken}</span>
          {activeToken?.ca && <span className="text-[#66739A]">· {shortCa(activeToken.ca)}</span>}
        </span>
      )}

      <button type="button" className="cv-iconbtn" title="Live intelligence feed" aria-label="Live intelligence feed">
        <Bell size={16} />
        <span className="cv-bell-dot" />
      </button>

      <Link to="/verdict" className="cv-btn !rounded-full !px-3 sm:!px-4 !py-2" title="New verdict">
        <Plus size={14} strokeWidth={2.6} />
        <span className="hidden sm:inline">New Verdict</span>
      </Link>

      <div className="relative flex items-center">
        <button type="button" className="cv-avatar" onClick={() => setMenuOpen((o) => !o)} aria-label="Account menu">
          M
        </button>
        <ChevronDown size={13} className="ml-1 hidden text-[#66739A] sm:block" />
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="cv-menu">
              <Link className="cv-menu-item" to="/dashboard/history" onClick={() => setMenuOpen(false)}>
                <History size={13} /> Decision history
              </Link>
              <Link className="cv-menu-item" to="/dashboard" onClick={() => setMenuOpen(false)}>
                <LayoutDashboard size={13} /> Console home
              </Link>
              <Link className="cv-menu-item" to="/" onClick={() => setMenuOpen(false)}>
                <Globe size={13} /> Landing page
              </Link>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

// ── right rail: live intelligence + agent roster ────────────────
function eventLine(m) {
  const picks = [
    { k: '1h', v: Number(m.change1h) || 0 },
    { k: '24h', v: Number(m.change24h) || 0 },
    { k: '7d', v: Number(m.change7d) || 0 },
  ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
  const top = picks[0]
  const noun = top.k === '1h' ? 'Sharp 1h move' : top.k === '7d' ? '7d trend shift' : '24h momentum'
  return `${noun} ${top.v >= 0 ? '+' : ''}${top.v.toFixed(2)}%`
}

function agoText(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function IntelRail() {
  const { pathname } = useLocation()
  const [majors, setMajors] = useState(null)
  const [loadedAt, setLoadedAt] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('latest')
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      const m = await fetchMajors()
      setMajors(Array.isArray(m) ? m : null)
      setLoadedAt(Date.now())
      setErr('')
    } catch (e) {
      setErr(e?.message || 'feed offline')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(t)
  }, [])

  const ago = loadedAt ? agoText(now - loadedAt) : ''

  return (
    <aside className="cv-rail hidden xl:flex">
      <section className="cv-panel">
        <div className="cv-head">
          <h3 className="cv-title">
            <span className="cv-title-icon"><Activity size={13} strokeWidth={2.2} /></span>
            INTELLIGENCE
          </h3>
          <div className="cv-head-right"><LivePill /></div>
        </div>
        <div className="cv-body !pt-1">
          <div className="cv-tabs mb-1">
            <button type="button" className={`cv-tab ${tab === 'latest' ? 'on' : ''}`} onClick={() => setTab('latest')}>Latest</button>
            <button type="button" className={`cv-tab ${tab === 'agents' ? 'on' : ''}`} onClick={() => setTab('agents')}>Agents</button>
          </div>
          {tab === 'latest' ? (
            !majors ? (
              err ? (
                <p className="py-4 text-center text-[11px] text-[#7C89B0]">Intelligence feed offline — {err}</p>
              ) : (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="cv-ghost h-[52px]" />)}
                </div>
              )
            ) : (
              majors.map((m) => (
                <FeedRow
                  key={m.symbol}
                  img={m.logo}
                  symbol={m.symbol}
                  text={eventLine(m)}
                  meta={`updated ${ago} · rank #${m.rank ?? '—'}`}
                  spark={[m.change1h, m.change24h, m.change7d]}
                  tone={(Number(m.change24h) || 0) >= 0 ? 'up' : 'down'}
                />
              ))
            )
          ) : (
            <div className="pt-1">
              {NAV_TREE.flatMap((g) => g.skills).map((s) => {
                const SIcon = s.icon
                const on = pathname === s.to || pathname.startsWith(`${s.to}/`)
                return (
                  <AgentRow
                    key={s.to}
                    icon={SIcon}
                    name={s.label}
                    desc={s.hint}
                    state={on ? 'active' : 'ready'}
                    to={s.to}
                    tone={on ? 'up' : 'blue'}
                  />
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="cv-panel">
        <div className="cv-head">
          <h3 className="cv-title">
            <span className="cv-title-icon"><Sparkles size={13} strokeWidth={2.2} /></span>
            AGENTS
          </h3>
          <div className="cv-head-right">
            <Link to="/dashboard" className="cv-viewall">View all →</Link>
          </div>
        </div>
        <div className="cv-body !pt-1">
          {RAIL_AGENTS.map((a) => (
            <AgentRow
              key={a.to}
              icon={a.icon}
              name={a.name}
              desc={a.desc}
              tone={a.tone}
              state={pathname === a.to || pathname.startsWith(`${a.to}/`) ? 'active' : 'ready'}
              to={a.to}
            />
          ))}
        </div>
      </section>

      <div className="cv-railfoot">
        <span className="cv-railfoot-gem"><Gem size={17} /></span>
        <div>
          <p className="text-[12px] font-semibold text-[#E6EDFF]">Real-time intelligence.</p>
          <p className="mt-0.5 text-[10.5px] text-[#7C89B0]">Powered by AI agents.</p>
        </div>
      </div>
    </aside>
  )
}

// ── shell ───────────────────────────────────────────────────────
export default function DashboardShell() {
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="cv-root fixed inset-0 z-20 flex bg-[#05070F]">
      {/* desktop sidebar */}
      <aside className="cv-side hidden w-[248px] flex-shrink-0 flex-col lg:flex">
        <SideBrand />
        <SideNav />
        <SideFooter />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div
            className="dash-mobile-nav lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="dash-mobile-back" onClick={() => setDrawer(false)} />
            <motion.aside
              className="dash-mobile-panel cv-side flex flex-col"
              initial={{ x: -48 }}
              animate={{ x: 0 }}
              exit={{ x: -48 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between px-3 pb-2">
                <SideBrand />
                <button type="button" className="cv-iconbtn" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <X size={16} />
                </button>
              </div>
              <SideNav onNavigate={() => setDrawer(false)} />
              <SideFooter />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setDrawer(true)} />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="px-4 py-5 md:px-6"
            >
              <Outlet />
            </motion.div>
          </main>
          <IntelRail />
        </div>
      </div>
    </div>
  )
}
