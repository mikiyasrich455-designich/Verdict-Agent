import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Activity, BarChart3, ShieldAlert, Zap, MessagesSquare,
  Radar as RadarIcon, LineChart, ScanSearch, GitCompareArrows, Gauge,
  Newspaper, Brain, Scale,
  Monitor, RefreshCw, Settings, BadgeCheck, Link2,
} from 'lucide-react'
import DashboardMock from '../components/DashboardMock'
import OpsDashboard from '../components/OpsDashboard'
import Logo from '../components/Logo'

const RYO_TOOLS = [
  { icon: ScanSearch, label: 'scan_market' },
  { icon: RadarIcon, label: 'analyze_token' },
  { icon: Brain, label: 'deep_analysis' },
  { icon: Gauge, label: 'market_overview' },
  { icon: GitCompareArrows, label: 'compare_tokens' },
  { icon: Newspaper, label: 'sentiment_shift' },
]

const NOISE = ['FOMO', 'Hype', 'Rumors', 'Copium', 'Cope', 'ExitScam', 'NGMI']
const SIGNALS = ['Momentum', 'RSI', 'Volume', 'Catalyst', 'Risk', 'Sentiment', 'Confluence']

const STEPS = [
  {
    n: '01',
    title: 'Market Scanned',
    text: 'The scanner sweeps the RYO market snapshot and ranks candidates by momentum, breadth and regime.',
  },
  {
    n: '03',
    title: 'Token Analyzed & Scored',
    text: 'Five evidence points are scored 0–100 from technicals, risk, catalysts and sentiment — every number traceable.',
  },
  {
    n: '05',
    title: 'Verdict Issued & Shared',
    text: 'A BUY / HOLD / AVOID verdict ships with a confidence score and a shareable card the whole timeline can audit.',
  },
]

function Traces() {
  return (
    <>
      <div className="trace trace-l hidden md:block" style={{ top: '18%', left: 0, width: 90 }} />
      <div className="trace hidden md:block" style={{ top: '32%', right: 0, width: 120 }} />
      <div className="trace trace-l hidden md:block" style={{ top: '64%', left: 0, width: 60 }} />
      <div className="trace hidden md:block" style={{ top: '82%', right: 0, width: 80 }} />
    </>
  )
}

function Orbit() {
  const nodes = [
    { icon: Activity, angle: -90, color: 'text-success' },
    { icon: BarChart3, angle: -18, color: 'text-accent' },
    { icon: ShieldAlert, angle: 54, color: 'text-danger' },
    { icon: Zap, angle: 126, color: 'text-warning' },
    { icon: MessagesSquare, angle: 198, color: 'text-violet2' },
  ]
  return (
    <div className="relative w-full max-w-md aspect-square mx-auto">
      <div className="absolute inset-[8%] rounded-full border border-line" />
      <div className="absolute inset-[24%] rounded-full border border-line" />
      <div className="absolute inset-0 animate-orbit-slow">
        {nodes.map(({ icon: Icon, angle, color }, i) => {
          const rad = (angle * Math.PI) / 180
          const x = 50 + 42 * Math.cos(rad)
          const y = 50 + 42 * Math.sin(rad)
          return (
            <div
              key={i}
              className="absolute w-11 h-11 -ml-5 -mt-5 rounded-xl card-dark flex items-center justify-center"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <Icon size={17} className={color} />
            </div>
          )
        })}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-20 h-20 rounded-2xl card-dark flex items-center justify-center shadow-glow">
          <Logo size={44} />
        </div>
      </div>
    </div>
  )
}

function VerdictFilter() {
  return (
    <div className="relative w-[264px] md:w-[300px] mx-auto">
      {/* ambient glow */}
      <div className="absolute -inset-8 bg-accent/25 blur-[70px] rounded-full" />

      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-2xl border border-white/10 bg-[#0b0d1c]/85 backdrop-blur-xl p-5 text-left overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.55),0_0_44px_rgba(100,103,242,0.18)]"
      >
        {/* header */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b93a7]">
            verdict engine
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-success">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-60 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
            </span>
            live
          </span>
        </div>

        {/* noise in */}
        <div className="mt-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-danger/80">noise in</p>
          <div className="mt-2 h-8 flex items-center gap-2 overflow-hidden">
            {['FOMO', 'HYPE', 'COPE'].map((n, i) => (
              <motion.span
                key={n}
                animate={{ opacity: [0, 1, 1, 0], y: [-8, 0, 6, 14] }}
                transition={{ duration: 2.8, times: [0, 0.3, 0.7, 1], repeat: Infinity, delay: i * 0.55, ease: 'easeInOut' }}
                className="px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold text-danger bg-danger/10 border border-danger/25 line-through decoration-danger/60"
              >
                {n}
              </motion.span>
            ))}
          </div>
        </div>

        {/* evidence filter line */}
        <div className="relative mt-4 h-px bg-white/10">
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 h-[3px] w-16 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent"
            animate={{ left: ['-25%', '100%'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="absolute left-1/2 -translate-x-1/2 -top-[9px] px-2 bg-[#0b0d1c] font-mono text-[9px] uppercase tracking-[0.22em] text-[#8b93a7]">
            evidence filter
          </span>
        </div>

        {/* five evidence points */}
        <div className="mt-6 flex items-end justify-between px-1">
          {['TEC', 'MKT', 'RSK', 'CAT', 'SNT'].map((l, i) => (
            <div key={l} className="flex flex-col items-center gap-1.5">
              <motion.span
                className="w-2 h-2 rounded-full bg-accent"
                animate={{ opacity: [0.25, 1, 0.25], scale: [1, 1.4, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.28, ease: 'easeInOut' }}
              />
              <span className="font-mono text-[8px] tracking-[0.14em] text-[#8b93a7]">{l}</span>
            </div>
          ))}
        </div>

        {/* verdict out */}
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-snow">SOL</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-success bg-success/10 border border-success/30">
                BUY
              </span>
            </div>
            <span className="font-mono text-xs text-snow">82%</span>
          </div>
          <div className="mt-2.5 h-1 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-success"
              initial={{ width: '0%' }}
              whileInView={{ width: '82%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
          <p className="mt-2 font-mono text-[9px] text-[#8b93a7]">confidence · 5/5 evidence points</p>
        </div>
      </motion.div>
    </div>
  )
}

const MONITOR_COLS = [
  { t: 'Monitoring & Logs', d: 'Trace every agent action with clear logs and replay visibility.' },
  { t: 'Live Operations', hl: true, d: 'Track activity, debates, failures, and verdict health in real time.' },
  { t: 'Governance', d: 'Manage policies, conviction thresholds, approvals, and audit trails by default.' },
  { t: 'Agent Registry', d: 'Keep every agent versioned, owned, and clearly scoped.' },
]

function RegistryDiagram() {
  const left = [
    { icon: Link2, l: 'Integration' },
    { icon: Monitor, l: 'Monitor' },
    { icon: RefreshCw, l: 'Sync' },
  ]
  const right = [
    { icon: Settings, l: 'Control' },
    { icon: Gauge, l: 'Performance' },
    { icon: BadgeCheck, l: 'Auditable' },
  ]
  return (
    <div className="relative mt-20">
      <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-0">
        {/* left stack */}
        <motion.div
          initial={{ opacity: 0, x: -18 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="rounded-xl border border-line bg-[#0b0d1c]/85 backdrop-blur-md p-3 space-y-2.5 shadow-[0_16px_44px_rgba(0,0,0,0.5)]"
        >
          {left.map(({ icon: Icon, l }) => (
            <div key={l} className="flex items-center gap-2.5 px-4 py-2 rounded-lg border border-line bg-white/[0.04]">
              <Icon size={13} className="text-accent" />
              <span className="font-mono text-[11px] text-snow">{l}</span>
            </div>
          ))}
        </motion.div>

        {/* connector */}
        <div className="hidden lg:block flex-1 h-px relative bg-gradient-to-r from-transparent via-[#5871ff]/40 to-[#5871ff]/60">
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#7c9bff] shadow-[0_0_10px_rgba(124,155,255,0.9)]" />
        </div>

        {/* center registry panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full max-w-md mx-auto lg:mx-8"
        >
          <div className="rounded-2xl border border-line bg-[#0b0d1c]/85 backdrop-blur-xl p-4 shadow-[0_28px_80px_rgba(0,0,0,0.55),0_0_50px_rgba(88,113,255,0.12)]">
            <span className="inline-block px-2.5 py-1 rounded-md border border-line bg-white/[0.05] font-mono text-[10px] text-snow">
              verdict*
            </span>
            <div className="mt-3 flex items-center justify-between px-1">
              <span className="font-mono text-[10px] text-muted">• Used 6</span>
              <span className="font-mono text-[10px] text-success">Connected</span>
            </div>
            <div className="mt-2 rounded-xl border border-line overflow-hidden">
              {RYO_TOOLS.slice(0, 4).map(({ icon: Icon, label }, i) => (
                <div key={label} className={`flex items-center gap-3 px-4 py-3 bg-white/[0.02] ${i ? 'border-t border-line' : ''}`}>
                  <Icon size={14} className="text-accent flex-shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-snow font-mono">{label}</div>
                    <div className="text-[10px] font-mono text-faint">ryo.{label.split('_')[0]} · v1</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block mx-auto w-px h-10 bg-gradient-to-b from-[#5871ff]/60 to-transparent" />
        </motion.div>

        {/* connector */}
        <div className="hidden lg:block flex-1 h-px relative bg-gradient-to-l from-transparent via-[#5871ff]/40 to-[#5871ff]/60">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#7c9bff] shadow-[0_0_10px_rgba(124,155,255,0.9)]" />
        </div>

        {/* right stack */}
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="rounded-xl border border-line bg-[#0b0d1c]/85 backdrop-blur-md p-3 space-y-2.5 shadow-[0_16px_44px_rgba(0,0,0,0.5)]"
        >
          {right.map(({ icon: Icon, l }) => (
            <div key={l} className="flex items-center gap-2.5 px-4 py-2 rounded-lg border border-line bg-white/[0.04]">
              <Icon size={13} className="text-accent" />
              <span className="font-mono text-[11px] text-snow">{l}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="relative">
      {/* ── HERO ── */}
      <section className="relative min-h-screen pt-32 md:pt-40 pb-16 overflow-hidden">
        {/* hero backdrop — glowing blue horizon, homepage only */}
        <div className="hero-bg absolute inset-0 pointer-events-none" aria-hidden="true" />
        {/* wider, brighter center glow framing the headline */}
        <div className="hero-glow absolute inset-x-0 top-0 h-[85vh] pointer-events-none" aria-hidden="true" />
        {/* readability washes: dark top for the headline, fade into page bg at the bottom */}
        <div className="absolute inset-x-0 top-0 h-[62vh] bg-gradient-to-b from-[#020208]/85 via-[#020208]/45 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-b from-transparent to-[#020208] pointer-events-none" />
        <Traces />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="hero-title text-4xl md:text-[56px] font-semibold tracking-[-0.03em] leading-[1.08] text-white antialiased"
          >
            Trade The Evidence.
            <br />
            <span className="text-[#c7d3f8]">Not The Noise.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="hero-sub mt-8 text-[14px] md:text-[15px] font-medium max-w-lg mx-auto leading-relaxed"
          >
            Every token scored across five pillars, stress-tested by a bull
            and a bear, and delivered as one auditable call — BUY, HOLD, or AVOID.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              to="/verdict"
              className="btn-primary hero-cta inline-flex items-center gap-2 px-7 h-12 rounded-full text-[14px] font-semibold text-white"
            >
              Explore Verdict
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/dashboard/council"
              className="btn-ghost hero-cta inline-flex items-center px-7 h-12 rounded-full text-[14px] font-semibold text-[#e2e9ff]"
            >
              Watch the Council
            </Link>
          </motion.div>
        </div>

        {/* Operations Command Center dashboard */}
        <div className="relative mt-16 md:mt-24 max-w-6xl mx-auto px-4">
          {/* dashed arcs above the frame */}
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-28 w-[880px] h-[440px] rounded-[100%] border border-dashed border-[#5871ff]/15" />
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-16 w-[660px] h-[330px] rounded-[100%] border border-dashed border-[#5871ff]/10" />
          {/* periwinkle side bands + horizon glow behind the frame */}
          <div className="pointer-events-none absolute -inset-x-16 md:-inset-x-44 top-8 -bottom-28 blur-2xl bg-[radial-gradient(24%_55%_at_0%_60%,rgba(124,140,255,0.5),transparent_70%),radial-gradient(24%_55%_at_100%_60%,rgba(124,140,255,0.5),transparent_70%),radial-gradient(55%_45%_at_50%_100%,rgba(88,113,255,0.38),transparent_72%)]" />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="relative z-10 pointer-events-none select-none"
            aria-hidden="true"
          >
            <OpsDashboard />
          </motion.div>
        </div>
      </section>

      {/* ── TOOL MARQUEE ── */}
      <section className="py-14 border-y border-line bg-white/[0.015] overflow-hidden">
        <div className="ticker-track">
          {[...RYO_TOOLS, ...RYO_TOOLS, ...RYO_TOOLS].map(({ icon: Icon, label }, i) => (
            <div key={i} className="flex items-center gap-2.5 mx-4 px-5 py-3 rounded-lg border border-line bg-white/[0.04] backdrop-blur-md">
              <Icon size={16} className="text-accent" />
              <span className="text-sm font-mono text-snow whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── ORBIT SECTION ── */}
      <section id="about" className="relative py-24 scroll-mt-24">
        <Traces />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <span className="pill-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> agent architecture
            </span>
            <h2 className="mt-6 text-3xl md:text-4xl font-extrabold tracking-tight text-snow leading-tight">
              Built Around the Way
              <br />
              Traders Actually Decide.
            </h2>
            <p className="mt-5 text-sm text-muted leading-relaxed">
              Verdict chains research agents into one pipeline. Each agent owns one job,
              hands its evidence to the next, and the whole chain stays auditable.
            </p>
          </div>

          <div className="mt-16 grid md:grid-cols-[1fr_1.2fr] gap-12 items-center">
            <div className="space-y-8">
              {[
                {
                  t: 'Signals',
                  d: 'Five scored evidence points per token — technical, market, risk, catalyst, sentiment. No score without a reason.',
                },
                {
                  t: 'Agents',
                  d: 'Scanner, analysts, bull, bear and judge. Task-specific agents argue with evidence, not vibes.',
                },
                {
                  t: 'Governance',
                  d: 'Conviction thresholds, failure fallbacks and repeatable reasoning paths. Discipline is code.',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.t}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                >
                  <h3 className="text-sm font-bold text-snow font-mono uppercase tracking-[0.18em]">{item.t}</h3>
                  <div className="mt-2 card-dark card-dark-hover card-spotlight p-4">
                    <p className="text-xs text-muted leading-relaxed font-mono">{item.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <Orbit />
          </div>
        </div>
      </section>

      {/* ── HAND / NOISE VS SIGNAL ── */}
      <section className="relative py-24 overflow-hidden">
        <Traces />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="pill-badge">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" /> agent discipline
          </span>
          <h2 className="mt-6 text-3xl md:text-4xl font-extrabold tracking-tight text-snow">
            Every Verdict Starts
            <br />
            With a Clear Job.
          </h2>
          <p className="mt-5 text-sm text-muted max-w-xl mx-auto leading-relaxed">
            Verdict strips the noise out of crypto research — the hype, the cope, the rumors —
            and keeps only what the evidence supports.
          </p>

          <div className="mt-14 grid lg:grid-cols-[1fr_auto_1fr] gap-10 items-center">
            {/* Noise chips */}
            <div className="flex flex-wrap justify-center lg:justify-end gap-2.5 max-w-sm mx-auto lg:mx-0">
              {NOISE.map((n, i) => (
                <motion.span
                  key={n}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="px-4 py-2 rounded-md text-xs font-mono font-semibold text-danger bg-danger/10 border border-danger/25 line-through decoration-danger/60"
                >
                  {n}
                </motion.span>
              ))}
            </div>

            {/* Verdict engine card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <VerdictFilter />
            </motion.div>

            {/* Signal chips */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-2.5 max-w-sm mx-auto lg:mx-0">
              {SIGNALS.map((s, i) => (
                <motion.span
                  key={s}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="px-4 py-2 rounded-md text-xs font-mono font-semibold text-snow bg-white/[0.05] border border-line2"
                >
                  {s}
                </motion.span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MONITOR SECTION ── */}
      <section id="product" className="relative py-24 border-t border-line scroll-mt-24 overflow-hidden">
        <Traces />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-snow leading-tight">
              Monitor Agents, Debates, Verdicts,
              <br />
              and Failures From One Clear View.
            </h2>
          </div>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-2">
            {MONITOR_COLS.map((c, i) => (
              <motion.div
                key={c.t}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={
                  c.hl
                    ? 'px-5 py-4 rounded-r-xl bg-gradient-to-br from-[#161d4a]/90 to-[#0b0d1c]/50 border-l-2 border-accent shadow-[0_0_44px_rgba(88,113,255,0.16)]'
                    : 'px-5 py-4'
                }
              >
                <h3 className="text-sm font-semibold text-snow">{c.t}</h3>
                <p className="mt-2.5 text-[11px] font-mono text-muted leading-relaxed">{c.d}</p>
              </motion.div>
            ))}
          </div>

          <div className="relative mt-16">
            <RegistryDiagram />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(88,113,255,0.3),transparent_72%)]" />
      </section>

      {/* ── WORKFLOW STEPS ── */}
      <section className="relative py-24 border-t border-line">
        <Traces />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-14 items-start">
          <div className="lg:sticky lg:top-28">
            <span className="pill-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> workflow trace
            </span>
            <h2 className="mt-6 text-3xl md:text-4xl font-extrabold tracking-tight text-snow leading-tight">
              See How a Verdict
              <br />
              Runs in Practice.
            </h2>
            <p className="mt-5 text-sm text-muted leading-relaxed max-w-md">
              A live trace of the verdict pipeline: from raw market scan to a shareable,
              auditable call. Every step shows the tool, the evidence and the reason.
            </p>
            <Link to="/dashboard" className="btn-ghost px-5 py-2.5 text-sm mt-8 inline-flex">
              Open the Dashboard <ArrowRight size={14} />
            </Link>
          </div>

          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card-dark card-dark-hover card-spotlight p-6"
              >
                <span className="text-xs font-mono text-accent">{s.n}</span>
                <h3 className="mt-2 text-base font-bold text-snow">{s.title}</h3>
                <p className="mt-2 text-xs text-muted leading-relaxed font-mono">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="pricing" className="relative py-24 overflow-hidden scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-2xl overflow-hidden border border-line bg-white/[0.05] backdrop-blur-sm p-10 md:p-14">
            <div className="relative z-10 grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-snow leading-tight">
                  Make AI verdicts part
                  <br />
                  of how you trade.
                </h2>
                <p className="mt-4 text-sm text-muted max-w-sm leading-relaxed">
                  Deploy evidence, debate and discipline across your whole watchlist.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/verdict" className="btn-primary px-6 py-3 text-sm">
                    <span>Get a Verdict</span>
                  </Link>
                  <Link to="/dashboard/council" className="btn-ghost px-6 py-3 text-sm">
                    Start a Debate
                  </Link>
                </div>
              </div>
              <div className="hidden lg:block">
                <DashboardMock compact />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
