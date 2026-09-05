import {
  Search, Bell, Plus, LayoutGrid, FileCheck2, Scale, Star, ShieldAlert, Terminal, Blocks,
  ScanLine, Sparkles, Radar, Newspaper, GitCompareArrows, BrainCircuit, Gauge,
  Paperclip, ArrowUpRight, Check, MessagesSquare, ChevronDown, MoreHorizontal,
} from 'lucide-react'
import Logo from './Logo'

// ── sidebar nav (homepage mock of the dashboard) ────────────────
const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'verdicts', label: 'Verdicts', icon: FileCheck2 },
  { id: 'council', label: 'Council', icon: Scale },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
  { id: 'risk', label: 'Risk', icon: ShieldAlert },
  { id: 'logs', label: 'Logs', icon: Terminal },
  { id: 'integrations', label: 'Integrations', icon: Blocks },
]

// ── recent scans (same data as before, shown as the recents list) ─
const RECENTS = [
  { symbol: 'SOL', note: 'BUY signed · 82%', when: '2m ago' },
  { symbol: 'AVAX', note: 'Council debate closed', when: '5m ago' },
  { symbol: 'DOGE', note: 'AVOID signed · 71%', when: '12m ago' },
  { symbol: 'BTC', note: 'HOLD signed · 58%', when: '18m ago' },
]

const LOGOS = {
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
}

// ── RYO skills the engine runs ───────────────────────────────────
const RYO_TOOLS = [
  { icon: ScanLine, label: 'scan_market' },
  { icon: Radar, label: 'analyze_token' },
  { icon: BrainCircuit, label: 'deep_analysis' },
  { icon: Gauge, label: 'market_overview' },
  { icon: GitCompareArrows, label: 'compare_tokens' },
  { icon: Newspaper, label: 'sentiment_shift' },
]

// ── quick action chips + feature cards ───────────────────────────
const CHIPS = [
  { label: 'Full Scan', icon: ScanLine, tint: 'text-[#7aa2ff]' },
  { label: 'Risk Check', icon: ShieldAlert, tint: 'text-warning' },
  { label: 'Council Debate', icon: Scale, tint: 'text-success' },
  { label: 'More', icon: MoreHorizontal, tint: 'text-muted' },
]

const FEATURES = [
  { t: 'Score a token', s: '5-pillar verdict', icon: FileCheck2 },
  { t: 'Debate it', s: 'Bull vs Bear council', icon: Scale },
  { t: 'Track the risk', s: 'Flags, unlocks, liquidity', icon: ShieldAlert },
  { t: 'Read sentiment', s: 'Social pulse, hourly', icon: MessagesSquare },
]

// ── activity stats (same numbers as before) ──────────────────────
const STATS = [
  { label: 'Tokens scanned', value: '1,420' },
  { label: 'Verdicts signed', value: '318' },
  { label: 'Avg confidence', value: '86.4%' },
]

const SPARK = Array.from({ length: 24 }, (_, i) => ({ p: 42 + Math.sin(i / 2.6) * 12 + i * 0.9 }))

function Sparkline({ data, stroke = '#7aa2ff' }) {
  const prices = data.map((d) => d.p)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const pts = prices
    .map((p, i) => `${(i / (prices.length - 1)) * 100},${26 - ((p - min) / (max - min || 1)) * 22 - 2}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 28" className="w-full h-8" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.6" />
    </svg>
  )
}

// Static mock of the dashboard — mirrors the reference layout 1:1.
export default function OpsDashboard() {
  return (
    <div className="glass-shell overflow-hidden">
      <div className="flex items-stretch">
        {/* ── SIDEBAR ── */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-white/[0.015] border-r border-white/[0.04] p-4">
          <div className="flex items-center gap-2.5 px-2 pt-1 pb-5">
            <Logo size={26} />
            <span className="font-extrabold tracking-[0.06em] text-snow text-sm">
              verdict<span className="text-accent">*</span>
            </span>
          </div>

          <nav className="space-y-1">
            {NAV.map(({ id, label, icon: Icon }) => (
              <span
                key={id}
                className={`side-link w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium ${
                  id === 'overview' ? 'side-active' : ''
                }`}
              >
                <Icon size={14} className={id === 'overview' ? 'text-[#7aa2ff]' : ''} />
                {label}
                {id === 'council' && (
                  <span className="ml-auto px-1.5 rounded-full bg-[#2b68ff]/30 text-[#c7d6ff] text-[10px]">3</span>
                )}
              </span>
            ))}
          </nav>

          <div className="flex items-center justify-between px-2 pt-6 pb-2">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-faint">Recent Scans</span>
            <Plus size={11} className="text-faint" />
          </div>
          <div className="space-y-0.5">
            {RECENTS.map((r) => (
              <span key={r.symbol} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left">
                <img
                  src={LOGOS[r.symbol]}
                  alt={r.symbol}
                  className="w-5 h-5 rounded-full object-contain bg-white/[0.04] p-0.5"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] text-muted truncate">{r.symbol} · {r.note}</span>
                  <span className="block text-[9px] font-mono text-faint">{r.when}</span>
                </span>
              </span>
            ))}
          </div>

          <div className="mt-auto pt-5">
            <span className="glass-btn w-full h-10 rounded-full text-[11px] font-semibold text-muted flex items-center justify-center gap-2">
              View all scans
              <ArrowUpRight size={12} />
            </span>
          </div>
        </aside>

        {/* ── CENTER + RIGHT RAIL ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* topbar */}
          <div className="flex items-center gap-3 px-4 h-14 glass-topbar">
            <div className="md:hidden flex items-center gap-2 shrink-0">
              <Logo size={22} />
            </div>
            <div className="flex-1 max-w-xl mx-auto flex items-center gap-2 glass-input pl-4 pr-1.5 h-9">
              <Search size={13} className="text-faint shrink-0" />
              <span className="flex-1 text-xs font-mono text-faint truncate">Search any token or CA…</span>
              <kbd className="hidden md:block px-1.5 py-0.5 rounded border border-white/[0.08] text-[9px] font-mono text-faint">⌘K</kbd>
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <span className="pill-cta h-9 px-4 rounded-full text-[11px] font-bold flex items-center gap-1.5">
                <Plus size={13} />
                <span className="hidden sm:inline">New Scan</span>
              </span>
              <span className="w-9 h-9 glass-btn rounded-full flex items-center justify-center text-muted">
                <Bell size={14} />
              </span>
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5b93ff] to-[#2b68ff] text-[10px] font-bold text-white flex items-center justify-center shadow-[0_0_16px_rgba(43,104,255,0.4)]">
                OP
              </span>
            </div>
          </div>

          {/* mobile tab strip */}
          <div className="md:hidden flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-white/5">
            {NAV.map(({ id, label }) => (
              <span
                key={id}
                className={`side-link shrink-0 px-3 py-1.5 text-[10px] font-mono ${id === 'overview' ? 'side-active' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex-1 min-w-0 flex items-stretch">
            {/* ── MAIN: idle hero ── */}
            <main className="flex-1 min-w-0 p-5 md:p-7">
              <div className="h-full flex flex-col">
                <div className="flex-1 flex flex-col items-center justify-center text-center px-2 py-8">
                  <h3 className="text-3xl md:text-[40px] font-extrabold tracking-tight text-snow leading-tight">
                    What token shall we
                    <br />
                    judge today?
                  </h3>

                  <div className="mt-8 w-full max-w-xl glass-panel rounded-2xl p-3 text-left">
                    <div className="w-full text-sm text-faint px-2 pt-1.5">
                      Message the engine… ticker or contract address
                    </div>
                    <div className="mt-2 flex items-center justify-between px-1 pb-0.5">
                      <span className="w-8 h-8 rounded-full glass-btn-sm flex items-center justify-center text-muted">
                        <Paperclip size={13} />
                      </span>
                      <span className="w-10 h-8 rounded-xl pill-cta flex items-center justify-center">
                        <ScanLine size={14} />
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {CHIPS.map(({ label, icon: Icon, tint }) => (
                      <span key={label} className="glass-chip flex items-center gap-2 px-3.5 py-2 text-[11px] text-muted">
                        <Icon size={12} className={tint} /> {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="max-w-3xl mx-auto w-full pb-2">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {FEATURES.map((c) => {
                      const Icon = c.icon
                      return (
                        <span key={c.t} className="glass-panel rounded-2xl p-4 text-left flex flex-col">
                          <span className="text-[13px] font-semibold text-snow leading-snug">{c.t}</span>
                          <span className="mt-1 text-[10px] text-faint">{c.s}</span>
                          <span className="mt-6 w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-muted">
                            <Icon size={13} />
                          </span>
                        </span>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex justify-center text-faint">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>
            </main>

            {/* ── RIGHT RAIL ── */}
            <aside className="hidden xl:flex w-72 shrink-0 flex-col gap-4 p-5 border-l border-white/[0.04] bg-white/[0.015]">
              {/* engine card */}
              <div className="glass-panel rounded-2xl p-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-snow">VERDICT-1</span>
                  <Sparkles size={12} className="text-[#7aa2ff]" />
                </div>
                <p className="mt-1 text-[10px] text-faint leading-relaxed">
                  Our most advanced scoring engine for token calls.
                </p>
                <div className="relative h-28 mt-3 rounded-xl overflow-hidden bg-[#0a0d20] border border-white/[0.06]">
                  <div
                    className="absolute inset-0"
                    style={{ background: 'radial-gradient(70% 90% at 68% 30%, rgba(91,147,255,0.3), transparent 70%)' }}
                  />
                  <div className="absolute left-1/2 top-1/2 w-16 h-16 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-lg bg-gradient-to-br from-[#5b93ff]/60 to-[#2b68ff]/20 border border-[#7aa2ff]/40" />
                  <div className="absolute left-1/2 top-1/2 w-12 h-12 -translate-x-[38%] -translate-y-[62%] rotate-12 rounded-lg bg-gradient-to-br from-[#8fb2ff]/50 to-[#2b68ff]/15 border border-white/20" />
                  <div
                    className="absolute w-6 h-6 rounded-full"
                    style={{
                      left: '58%',
                      top: '24%',
                      background: 'radial-gradient(circle at 35% 30%, #fff, #9db9ff 45%, #2b68ff 85%)',
                      boxShadow: '0 0 18px rgba(122,162,255,0.8)',
                    }}
                  />
                </div>
              </div>

              {/* RYO skills */}
              <div className="glass-panel rounded-2xl p-3">
                <div className="px-2 pt-1 pb-2 text-[11px] font-semibold text-snow">RYO Skills</div>
                <div className="space-y-0.5">
                  {RYO_TOOLS.map(({ icon: Icon, label }) => (
                    <span key={label} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                      <span className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#7c9bff] shrink-0">
                        <Icon size={12} />
                      </span>
                      <span className="flex-1 text-left font-mono text-[10.5px] text-muted truncate">{label}</span>
                      <Check size={13} className="text-success" />
                    </span>
                  ))}
                </div>
              </div>

              {/* activity */}
              <div className="glass-panel rounded-2xl p-4">
                <div className="text-[11px] font-semibold text-snow">Your Activity</div>
                <div className="mt-3 space-y-2 text-[10.5px] font-mono">
                  {STATS.map((s) => (
                    <div key={s.label} className="flex justify-between">
                      <span className="text-faint">{s.label}</span>
                      <span className="text-snow">{s.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Sparkline data={SPARK} />
                </div>
              </div>

              {/* pro card */}
              <span className="glass-panel rounded-2xl p-3.5 flex items-center gap-3 text-left">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5b93ff] to-[#2b68ff] flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(43,104,255,0.4)]">
                  <Star size={13} className="text-white" />
                </span>
                <span>
                  <span className="block text-[11px] font-bold text-snow">Verdict Pro</span>
                  <span className="block text-[9.5px] text-faint">Upgrade for evidence packs</span>
                </span>
              </span>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
