// Narrative agent — the Multi-KOL Narrative spotlight.
// Tracks KOL voices, flags convergence, and stamps every news item
// VERIFIED / UNVERIFIED / CONTRADICTED against on-chain evidence.
import { Radio, RefreshCw, Newspaper, Users, Target } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchNarrative } from '../../lib/api'
import { PageHeader, Panel, Stat, EmptyState, StancePill, StampPill, ErrorState } from '../../components/DashUI'
import { PageSkeleton } from '../../components/Loaders'


// Platform logos as inline SVG components
function PlatformLogo({ platform, size = 14 }) {
  const icons = {
    x: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
    youtube: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
    reddit: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042 1.364l-.003.014c-.254 1.295-1.132 2.439-2.376 3.144a7.689 7.689 0 0 1-.847.369c-.966.363-1.999.538-3.049.538-1.065 0-2.11-.18-3.106-.541a7.652 7.652 0 0 1-.867-.382c-1.238-.708-2.108-1.857-2.354-3.147l-.003-.015a3.12 3.12 0 0 1 .04-1.363 1.755 1.755 0 0 1-1.008-1.614c0-.968.786-1.754 1.754-1.754.476 0 .898.182 1.206.491 1.196-.858 2.855-1.418 4.683-1.486l-.784-3.668-2.588.544a1.25 1.25 0 0 1-2.494-.058c0-.688.562-1.249 1.25-1.249l3.226-.677c.833-.175 1.672.357 1.897 1.184l.941 4.409c.09.421.48.716.91.716.43 0 .82-.295.91-.716l.941-4.409c.225-.827 1.064-1.359 1.897-1.184l3.226.677z"/>
      </svg>
    ),
    tiktok: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.57-4.96 1.66-1.44 3.98-2.13 6.15-1.72.13.02.26.05.38.08-.02.78-.04 1.56-.04 2.34-.85-.24-1.75-.26-2.6-.04-1.06.28-1.99.87-2.65 1.66-.65.78-1.03 1.77-1.02 2.8 0 .29.03.58.09.86.24 1.18.93 2.22 1.9 2.88.96.65 2.16.91 3.31.71 1.15-.2 2.19-.79 2.91-1.64.72-.84 1.11-1.92 1.1-3.02-.02-2.22-.01-4.43-.02-6.65 1.42.63 2.95.97 4.51 1z"/>
      </svg>
    ),
    instagram: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
    web: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2 .9 2 2v.41c2.43.75 4.25 2.37 5.1 4.39-.64.73-1.43 1.32-2.31 1.74z"/>
      </svg>
    ),
  }
  return icons[platform] || icons.web
}

function KolCard({ k, delay }) {
  const platform = k.platform || 'web'
  
  return (
    <div className="glass-panel !p-4" style={{ transitionDelay: `${delay}s` }}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex items-center gap-2">
          <div className="text-faint" title={platform}>
            <PlatformLogo platform={platform} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-snow leading-none">{k.handle}</p>
            {k.followers && (
              <p className="text-[10px] text-faint mt-1">{k.followers} followers</p>
            )}
          </div>
        </div>
        <StancePill stance={k.stance} />
      </div>

      <p className="text-[12px] text-snow/75 leading-relaxed italic">"{k.quote}"</p>

      <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-white/5">
        <div className="flex-1">
          <div className="flex justify-between text-[9px] font-mono text-faint mb-1">
            <span>CONVICTION</span>
            <span>{k.conviction || 50}</span>
          </div>
          <div className="h-1 rounded-full bg-white/6 overflow-hidden">
            <div
              className={`h-full rounded-full ${k.stance === 'bullish' ? 'bg-[#34d399]' : k.stance === 'bearish' ? 'bg-[#f87171]' : 'bg-[#94a3b8]'}`}
              style={{ width: `${k.conviction || 50}%` }}
            />
          </div>
        </div>
        <a
          href={k.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#5b93ff] hover:underline whitespace-nowrap"
        >
          View post →
        </a>
      </div>
    </div>
  )
}

export default function Narrative() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [runKey, rerun] = useRunKey()
  const { status, data } = useAgentData(() => (token ? fetchNarrative(token) : null), [token, runKey])

  const pick = (t) => setSearchParams({ token: t })

  if (!token) {
    return (
      <>
        <PageHeader icon={Radio} title="KOL Radar" subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying." source={{ mode: 'live', name: 'narrative agent' }} />
        <EmptyState
          icon={Radio}
          title="Set a token first"
          hint="Enter a token on the Your Token page or use the search bar above to begin."
          action={<a href="/dashboard" className="glass-btn">Go to Your Token</a>}
        />
      </>
    )
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader icon={Radio} title="KOL Radar" subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying." source={{ mode: 'live', name: 'narrative agent' }} />
        <ErrorState error={data} onRetry={() => rerun()} />
      </>
    )
  }

  if (status !== 'ready' || !data) {
    return (
      <>
        <PageHeader icon={Radio} title="KOL Radar" subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying." source={{ mode: 'live', name: 'narrative agent' }} />
        <PageSkeleton />
      </>
    )
  }

  const d = data

  return (
    <>
      <PageHeader
        icon={Radio}
        title={`KOL Radar · ${d.symbol}`}
        subtitle="The Multi-KOL Narrative spotlight — what the loudest voices are really saying."
        source={{ mode: 'live', name: 'narrative agent' }}
      >
        <button onClick={rerun} className="glass-chip"><RefreshCw size={12} /> Re-sweep</button>
      </PageHeader>

      {/* headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Voices Tracked" value={d.total} sub="KOLs in the sweep" delay={0.02} />
        <Stat label="Bullish" value={d.bullish} sub={`of ${d.total} voices`} tone="text-success" delay={0.06} />
        <Stat label="Bearish" value={d.total - d.bullish} sub="incl. neutrals" tone="text-danger" delay={0.1} />
        <Stat
          label="Convergence"
          value={d.converged ? <span className="text-success">CONVERGED</span> : <span className="text-warning">CONFLICTED</span>}
          sub={d.converged ? 'majority aligns bullish' : 'no clear consensus'}
          delay={0.14}
        />
      </div>

      {/* convergence banner */}
      <div className={`glass-panel !py-3.5 !px-5 mb-4 flex items-center gap-3 ${d.converged ? 'border-success/25' : 'border-warning/25'}`}>
        <Target size={16} className={d.converged ? 'text-success' : 'text-warning'} />
        <p className="text-[12.5px] text-snow/85">
          {d.converged
            ? `${d.bullish}/${d.total} voices lean the same way — narrative convergence is a momentum accelerant, and a reversal accelerant when it breaks.`
            : 'Voices are split — the narrative has not converged. Expect chop until one side capitulates.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* KOL grid */}
        <div className="lg:col-span-2">
          <Panel title={`Voices · ${d.total}`} icon={Users} delay={0.16}>
            <div className="grid sm:grid-cols-2 gap-3">
              {d.kols.length === 0 && (
                <p className="text-[12px] text-faint col-span-full py-4 text-center">
                  No recent KOL posts found for {d.symbol} — try re-sweeping.
                </p>
              )}
              {d.kols.map((k, i) => (
                <KolCard key={`${k.handle}-${i}`} k={k} delay={i * 0.04} />
              ))}
            </div>
          </Panel>
        </div>

        {/* news column */}
        <div className="space-y-4">
          <Panel title="News Checker" icon={Newspaper} delay={0.2}>
            <div className="space-y-2.5">
              {d.news.map((n, i) => (
                <a
                  key={i}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3 py-2.5 rounded-xl bg-white/3 border border-white/5 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-[12px] text-snow/90 leading-snug flex-1">{n.title}</p>
                    {n.stamp && <StampPill stamp={n.stamp} />}
                  </div>
                  <p className="text-[9.5px] font-mono text-faint">{n.source} · {n.age || 'recent'}</p>
                </a>
              ))}
            </div>
            <p className="text-[10.5px] text-faint leading-relaxed mt-3">
              Every headline is stamped against on-chain evidence before it can influence a verdict.
            </p>
          </Panel>

          <Panel title="Handoff" delay={0.24}>
            <div className="space-y-2">
              <Link to={`/dashboard/council?token=${d.symbol}`} className="glass-chip w-full justify-center">Send to the Council</Link>
              <Link to={`/dashboard/deep?token=${d.symbol}`} className="glass-chip w-full justify-center">Run Deep Analysis</Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
