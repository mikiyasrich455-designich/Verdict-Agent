// VERDICT loader kit — uiverse-style CSS loaders + skeleton system.
// Pure CSS animations defined in index.css; no JS timers needed.

export function OrbitLoader({ size = 44, label = 'Generating' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="uv-orbit" style={{ width: size, height: size }}>
        <span /><span /><span />
      </div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

export function CubeLoader({ size = 38, label = 'Processing' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="uv-cube" style={{ width: size, height: size }} />
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

export function DnaLoader({ size = 40, label = 'Synthesizing' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="uv-dna" style={{ width: size, height: size }}>
        <span /><span /><span /><span /><span />
      </div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

export function WaveLoader({ label = 'Rendering' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="uv-bars" style={{ '--uv-speed': '0.9s' }}>
        <span /><span /><span /><span /><span />
      </div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

export function WaveformLoader({ label = 'Composing narration' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="uv-waveform">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} style={{ '--wf-delay': `${i * 0.07}s`, '--wf-h': `${8 + ((i * 13) % 22)}px` }} />
        ))}
      </div>
      {label && <p className="text-xs font-mono text-faint tracking-widest uppercase">{label}</p>}
    </div>
  )
}

// Progress ring with percent (used for studio generation flows)
export function ProgressRing({ percent = 0, size = 84, stroke = 5, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(91,147,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="url(#pr-grad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(percent, 100)) / 100}
          style={{ transition: 'stroke-dashoffset 0.25s ease' }}
        />
        <defs>
          <linearGradient id="pr-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7aa2ff" />
            <stop offset="100%" stopColor="#5b93ff" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute font-mono text-sm text-snow">{Math.round(percent)}%</span>
      {label && <span className="absolute translate-y-6 text-[10px] text-faint font-mono uppercase tracking-wider">{label}</span>}
    </div>
  )
}

// YouTube/Telegram-style skeleton blocks with shimmer
export function Skeleton({ className = '', w, h, r = 8 }) {
  return <div className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r }} />
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skel" style={{ height: 12, width: `${100 - i * 14}%`, borderRadius: 6 }} />
      ))}
    </div>
  )
}

export function SkeletonStat({ className = '' }) {
  return (
    <div className={`skel-panel ${className}`}>
      <div className="skel" style={{ width: '40%', height: 10 }} />
      <div className="skel mt-2.5" style={{ width: '65%', height: 22 }} />
    </div>
  )
}

export function SkeletonChart({ className = '', h = 180 }) {
  return (
    <div className={`skel-panel relative overflow-hidden ${className}`} style={{ height: h }}>
      <svg className="absolute inset-x-0 bottom-4 w-full" height={h * 0.55} preserveAspectRatio="none" viewBox="0 0 100 40">
        <path d="M0 32 L12 26 L24 29 L36 18 L48 22 L60 12 L72 16 L84 8 L100 12" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="1.4" strokeDasharray="3 3" />
      </svg>
    </div>
  )
}

// Full-page skeleton shown while switching between agent dashboards
export function PageSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skel" style={{ width: 220, height: 20 }} />
          <div className="skel" style={{ width: 140, height: 11 }} />
        </div>
        <div className="skel" style={{ width: 110, height: 34, borderRadius: 999 }} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <SkeletonStat key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2"><SkeletonChart h={220} /></div>
        <SkeletonText lines={8} className="skel-panel" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SkeletonText lines={4} className="skel-panel" />
        <SkeletonText lines={4} className="skel-panel" />
      </div>
    </div>
  )
}

// Compact inline spinner for buttons
export function SpinDot({ className = '' }) {
  return <span className={`spin-dot ${className}`} />
}
