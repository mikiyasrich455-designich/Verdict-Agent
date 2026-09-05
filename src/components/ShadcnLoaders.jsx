// Loader kit adapted from shadcn/ui + originui (github.com/shadcn/originui).
// shadcn's official Spinner is Loader2 + animate-spin + role="status";
// the ring / dots / bars / dual-arc / infinity / concentric variants come
// from the shadcn loader ecosystem, recolored into the VERDICT blue glass
// design. Animations live in index.css under the sc-* namespace.
import { Loader2 } from 'lucide-react'
import { BullMascot, BearMascot } from './CouncilMascots'

// shadcn official Spinner — https://github.com/shadcn-ui/ui
export function Spinner({ className = '', size = 16 }) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      size={size}
      className={`animate-spin text-accent ${className}`}
    />
  )
}

// Dual-arc — two arcs counter-rotating
export function DualArcLoader({ size = 34, label }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="sc-dual-arc" style={{ width: size, height: size }} />
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

// Concentric rings + pulsating core
export function ConcentricLoader({ size = 56, label }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="sc-concentric grid place-items-center" style={{ width: size, height: size }}>
        <span /><span /><span />
        <div className="sc-core" style={{ width: '26%', height: '26%' }} />
      </div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

// Bouncing dots
export function DotsLoader({ label }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="sc-dots"><span /><span /><span /></div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

// Equalizer bars
export function BarsLoader({ label }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="sc-bars"><span /><span /><span /><span /><span /></div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

// Infinity loop — dash segment chasing a lemniscate
export function InfinityLoader({ width = 64, label }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <svg className="sc-infinity" width={width} height={width / 2} viewBox="0 0 40 20" fill="none">
        <path
          d="M10 10 C10 5.8 13.4 3 17 5 C21 7.2 23 12.8 27 15 C30.6 17 34 14.2 34 10 C34 5.8 30.6 3 27 5 C23 7.2 21 12.8 17 15 C13.4 17 10 14.2 10 10 Z"
          stroke="url(#sc-inf-grad)"
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength="100"
        />
        <defs>
          <linearGradient id="sc-inf-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7aa2ff" />
            <stop offset="100%" stopColor="#2b68ff" />
          </linearGradient>
        </defs>
      </svg>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

// shadcn Skeleton — card-shaped placeholder for response cards
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`glass-panel !p-4 space-y-3 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-2.5">
        <div className="skel rounded-full" style={{ width: 30, height: 30 }} />
        <div className="flex-1 space-y-1.5">
          <div className="skel" style={{ height: 11, width: '42%' }} />
          <div className="skel" style={{ height: 8, width: '26%' }} />
        </div>
        <div className="skel" style={{ height: 20, width: 54, borderRadius: 999 }} />
      </div>
      <div className="skel" style={{ height: 6, width: '100%' }} />
      <div className="skel" style={{ height: 6, width: '82%' }} />
      <div className="flex items-center justify-between pt-1">
        <div className="skel" style={{ height: 9, width: '34%' }} />
        <div className="skel" style={{ height: 9, width: '22%' }} />
      </div>
    </div>
  )
}

// Card-level loading state — glass panel with spinner + shimmer lines
export function SpinnerCard({ label = 'Agent is working', sub = 'Fetching the feed…' }) {
  return (
    <div className="glass-panel !p-5" role="status" aria-label={label}>
      <div className="flex items-center gap-3.5">
        <div className="sc-dual-arc flex-shrink-0" style={{ width: 30, height: 30 }} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-snow">{label}</p>
          <p className="text-[11px] text-faint mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="skel" style={{ height: 9, width: '92%' }} />
        <div className="skel" style={{ height: 9, width: '74%' }} />
        <div className="skel" style={{ height: 9, width: '58%' }} />
      </div>
    </div>
  )
}

// Council debate loader — bull vs bear face off while the council assembles
export function CouncilLoader({ label = 'The council is reading the evidence pack' }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4" role="status" aria-label="Council in session">
      <div className="flex items-center gap-5 md:gap-8">
        <div className="flex flex-col items-center gap-1.5">
          <BullMascot size={56} />
          <span className="font-mono text-[9px] tracking-[0.22em] text-success">BULL</span>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <div className="sc-concentric" style={{ width: 52, height: 52 }}>
            <span /><span /><span />
          </div>
          <div className="sc-dots"><span /><span /><span /></div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <BearMascot size={56} />
          <span className="font-mono text-[9px] tracking-[0.22em] text-danger">BEAR</span>
        </div>
      </div>
      <p className="text-xs font-mono text-faint tracking-widest uppercase text-center px-4">{label}</p>
    </div>
  )
}
