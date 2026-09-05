// DashboardShell — the agent command center frame.
// Windows Explorer-style collapsible skill groups in the sidebar,
// a global token search topbar, and an <Outlet /> for each agent dashboard.
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Radar, Globe, Crosshair, Microscope, Scale, Gauge,
  Gavel, Swords, Megaphone, Radio, Clapperboard, ImageIcon, Film, AudioWaveform,
  Cpu, ShieldAlert, History, LayoutDashboard, ChevronRight, Menu, X,
  Search, Sparkles, CornerDownLeft,
} from 'lucide-react'
import Logo from './Logo'
import { resolveToken } from '../lib/api'

// Plain tickers that DexScreener may not know (e.g. BTC, ETH) still work
// downstream via RYO — let those through unverified.
const TICKER_LIKE = /^[A-Za-z][A-Za-z0-9.$_-]{0,11}$/

export async function resolveTokenInput(raw) {
  const input = String(raw || '').trim()
  if (!input) throw new Error('Enter a token, name, or contract address')
  try {
    const data = await resolveToken(input)
    return data.symbol || input.toUpperCase()
  } catch (err) {
    if (TICKER_LIKE.test(input) && !/[1-9A-HJ-NP-Za-km-z]{32,}/.test(input)) {
      return input.toUpperCase()
    }
    throw err
  }
}

// ── the skill tree (groups → skills) ────────────────────────────
export const NAV_TREE = [
  {
    id: 'market',
    label: 'MARKET',
    icon: TrendingUp,
    skills: [
      { to: '/dashboard/scout', label: 'Scout', icon: Radar, hint: 'Meme & token hunter' },
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
      { to: '/dashboard/studio/video', label: 'Video', icon: Film, hint: '5s verdict reel' },
      { to: '/dashboard/studio/voice', label: 'Voice', icon: AudioWaveform, hint: 'Narrated brief' },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    icon: Cpu,
    skills: [
      { to: '/dashboard/risk', label: 'Risk Desk', icon: ShieldAlert, hint: 'Position & exit plan' },
      { to: '/dashboard/history', label: 'History', icon: History, hint: 'Decision receipts' },
    ],
  },
]

// Routes that accept a ?token= focus param.
const TOKEN_SCOPED = [
  '/dashboard/analysis', '/dashboard/deep', '/dashboard/council',
  '/dashboard/narrative', '/dashboard/risk', '/dashboard/compare',
  '/dashboard/scout', '/dashboard/overview',
  '/dashboard/studio/image', '/dashboard/studio/video', '/dashboard/studio/voice',
]

// One token drives the whole dashboard — it survives navigation + reloads.
const TOKEN_KEY = 'verdict_active_token'
export const getStoredToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setStoredToken = (t) => localStorage.setItem(TOKEN_KEY, t)

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

// ── sidebar tree ────────────────────────────────────────────────
function SideTree({ onNavigate }) {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || getStoredToken()
  const active = findSkill(pathname)
  const [open, setOpen] = useState(() => {
    const map = {}
    for (const g of NAV_TREE) map[g.id] = true
    return map
  })

  const toggle = (id) => setOpen((m) => ({ ...m, [id]: !m[id] }))

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
      <NavLink
        to="/dashboard"
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          `ftree-item !pl-3 ${isActive && !active ? 'on' : ''}`
        }
      >
        <LayoutDashboard size={15} strokeWidth={2} />
        Your Token
      </NavLink>

      {NAV_TREE.map((group) => {
        const GIcon = group.icon
        const isOpen = open[group.id]
        return (
          <div className="ftree-group" key={group.id}>
            <button
              type="button"
              className={`ftree-head ${isOpen ? 'open' : ''}`}
              onClick={() => toggle(group.id)}
              aria-expanded={isOpen}
            >
              <ChevronRight size={11} className="chev" strokeWidth={2.4} />
              <GIcon size={13} strokeWidth={2} />
              {group.label}
              <span className="ftree-count">{group.skills.length}</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="py-0.5 space-y-0.5">
                    {group.skills.map((skill) => {
                      const SIcon = skill.icon
                      const to =
                        token && TOKEN_SCOPED.includes(skill.to)
                          ? `${skill.to}?token=${token}`
                          : skill.to
                      return (
                        <NavLink
                          key={skill.to}
                          to={to}
                          onClick={onNavigate}
                          title={skill.hint}
                          className={({ isActive }) => `ftree-item ${isActive ? 'on' : ''}`}
                        >
                          <SIcon size={14} strokeWidth={2} />
                          {skill.label}
                        </NavLink>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </nav>
  )
}

function SideFooter() {
  return (
    <div className="px-4 py-3 border-t border-white/5">
      <p className="text-[10px] text-faint leading-relaxed">
        Powered by RYO + AceData · Not financial advice.
      </p>
    </div>
  )
}

// ── topbar ──────────────────────────────────────────────────────
function Topbar({ onMenu }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const focusToken = searchParams.get('token') || ''
  const [query, setQuery] = useState('')
  const found = useMemo(() => findSkill(pathname), [pathname])

  // remember whatever token lands in the URL
  useEffect(() => {
    const t = searchParams.get('token')
    if (t) setStoredToken(t)
  }, [searchParams])

  // token-scoped skill with no token? restore the saved one so the page just works
  useEffect(() => {
    if (!focusToken && TOKEN_SCOPED.includes(pathname)) {
      const stored = getStoredToken()
      if (stored) {
        setSearchParams((prev) => {
          prev.set('token', stored)
          return prev
        }, { replace: true })
      }
    }
  }, [pathname, focusToken, setSearchParams])

  const [resolving, setResolving] = useState(false)
  const [resolveErr, setResolveErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const raw = query.trim()
    if (!raw || resolving) return
    setResolveErr('')
    setResolving(true)
    try {
      const symbol = await resolveTokenInput(raw)
      setQuery('')
      setResolving(false)
      if (TOKEN_SCOPED.includes(pathname)) {
        setSearchParams((prev) => {
          prev.set('token', symbol)
          return prev
        })
      } else {
        navigate(`/dashboard/analysis?token=${symbol}`)
      }
    } catch (err) {
      setResolving(false)
      setResolveErr(err.message || 'Could not resolve that token')
    }
  }

  return (
    <header className="h-16 flex-shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-white/5 bg-[rgba(5,7,15,0.72)] backdrop-blur-xl">
      <button
        type="button"
        className="lg:hidden nav-link p-2 rounded-full"
        onClick={onMenu}
        aria-label="Open skill tree"
      >
        <Menu size={18} />
      </button>

      {/* breadcrumb */}
      <div className="hidden md:flex items-center gap-2 min-w-0">
        {found ? (
          <>
            <span className="font-mono text-[10px] tracking-[0.18em] text-faint">{found.group.label}</span>
            <ChevronRight size={11} className="text-faint" />
            <span className="text-[13px] font-medium text-snow truncate">{found.skill.label}</span>
          </>
        ) : (
          <span className="text-[13px] font-medium text-snow">Your Token</span>
        )}
      </div>

      {/* global token search */}
      <form onSubmit={submit} className="flex-1 max-w-[420px] ml-auto md:ml-0 relative">
        <div className={`glass-input flex items-center gap-2 !py-2 ${resolveErr ? '!border-red-400/50' : ''}`}>
          <Search size={14} className="text-faint flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setResolveErr('') }}
            placeholder="Drop a token, name, or CA…"
            className="flex-1 bg-transparent outline-none text-[13px] text-snow placeholder:text-faint min-w-0"
          />
          {resolving ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin flex-shrink-0" />
          ) : (
            query && (
              <button type="submit" className="text-faint hover:text-accent transition-colors" aria-label="Focus token">
                <CornerDownLeft size={13} />
              </button>
            )
          )}
        </div>
        {resolveErr && (
          <div className="absolute top-full left-0 mt-1.5 z-50 max-w-full text-[11px] text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-1.5 shadow-lg">
            {resolveErr}
          </div>
        )}
      </form>

      {focusToken && (
        <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-accent bg-accent/10 border border-accent/25 rounded-full px-3 py-1">
          <Crosshair size={11} />
          {focusToken}
        </span>
      )}

      <Link
        to="/verdict"
        className="hidden sm:inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-gradient-to-r from-accent to-[#2b68ff] rounded-full px-4 py-2 shadow-[0_0_18px_rgba(43,104,255,0.35)] hover:shadow-[0_0_26px_rgba(43,104,255,0.55)] transition-shadow"
      >
        <Sparkles size={13} />
        New Verdict
      </Link>
    </header>
  )
}

// ── shell ───────────────────────────────────────────────────────
export default function DashboardShell() {
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="fixed inset-0 z-20 flex bg-night/80">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex w-[264px] flex-shrink-0 flex-col border-r border-white/5 bg-[rgba(7,9,20,0.72)] backdrop-blur-xl">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/5">
          <Logo size={26} />
          <div className="leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-[#EAF2FF]">
              verdict<span className="text-[#4E8BFF] align-super text-[10px]">*</span>
            </span>
            <p className="font-mono text-[8.5px] tracking-[0.22em] text-faint mt-1">AGENT CONSOLE</p>
          </div>
        </div>
        <SideTree />
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
              className="dash-mobile-panel flex flex-col"
              initial={{ x: -48 }}
              animate={{ x: 0 }}
              exit={{ x: -48 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between px-2 pb-3 mb-1 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <Logo size={24} />
                  <span className="text-[14px] font-semibold text-[#EAF2FF]">
                    verdict<span className="text-[#4E8BFF] align-super text-[10px]">*</span>
                  </span>
                </div>
                <button type="button" className="nav-link p-2 rounded-full" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <X size={17} />
                </button>
              </div>
              <SideTree onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="max-w-[1280px] mx-auto px-4 md:px-6 py-5 md:py-7"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
