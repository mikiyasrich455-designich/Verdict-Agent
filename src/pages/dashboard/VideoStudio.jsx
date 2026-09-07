// Studio · Video — a 25s cinematic news package from two shots (15s + 10s) played back-to-back
import { useRef, useState } from 'react'
import { Video, RefreshCw, Play, Pause, Download, Sparkles, Clock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge from '../../components/VerdictBadge'
import { useAgentData } from '../../hooks/useAgentData'
import { fetchStudioScript, generateStudioVideo } from '../../lib/api'
import { PageHeader, EmptyState, ErrorState, friendlyError } from '../../components/DashUI'
import GenLoader from '../../components/loaders/GenLoader'
import CandleLoader from '../../components/loaders/CandleLoader'
import { useStudioHistory, downloadDataUrl, StudioHistoryStrip, coverFor } from './StudioShared'
import { recallStudio, rememberStudio } from '../../lib/studioCache'

export default function VideoStudio() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')

  return <VideoStudioInner key={token || 'none'} token={token} pick={(t) => setSearchParams({ token: t })} />
}

function VideoStudioInner({ token, pick }) {
  const { status, data: script, error: fetchError } = useAgentData(() => (token ? fetchStudioScript(token) : null), [token])
  const history = useStudioHistory('video')
  // A clip already generated for this token comes back with the page —
  // no re-render, no lost work, until the user picks a different token.
  const [output, setOutput] = useState(() => recallStudio('video', token))
  const [phase, setPhase] = useState(() => (recallStudio('video', token) ? 'done' : 'idle')) // idle | generating | done
  const [error, setError] = useState(null)
  const [clipIndex, setClipIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef(null)

  const header = (
    <PageHeader
      icon={Video}
      title={script ? `Studio · Video · ${script.symbol}` : 'Studio · Video'}
      subtitle="Turn a verdict into a short motion clip."
      source={{ mode: 'live', name: 'AI video' }}
    >
      {script && <VerdictBadge verdict={script.verdict} size="sm" animate={false} />}
    </PageHeader>
  )

  if (!token) {
    return (
      <>
        {header}
        <EmptyState
          icon={Video}
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
        {header}
        <ErrorState error={fetchError} onRetry={() => window.location.reload()}>
          <p className="text-[11px] text-faint font-mono">Script fetch failed — the analysis may be rate-limited.</p>
        </ErrorState>
      </>
    )
  }

  if (status !== 'ready' || !script) {
    return (
      <>
        {header}
        <div className="min-h-[46vh] flex items-center justify-center">
          <CandleLoader />
        </div>
      </>
    )
  }

  const generate = async () => {
    setPhase('generating')
    setError(null)
    setOutput(null)
    setClipIndex(0)
    setPlaying(false)
    try {
      const res = await generateStudioVideo(script)
      const entry = {
        symbol: script.symbol,
        verdict: script.verdict,
        poster: res.poster,
        videoUrl: res.videoUrl,
        clips: res.clips,
        duration: res.duration,
        resolution: res.resolution,
        format: res.format,
      }
      const saved = history.push(entry) || entry
      rememberStudio('video', script.symbol, saved)
      setOutput(saved)
      setPhase('done')
    } catch (err) {
      console.error('[VIDEO-GEN] Error:', err)
      setError(err.message || 'Video generation failed')
      setPhase('idle')
    }
  }

  // The 25s package arrives as two shots played back-to-back; the local
  // motion-card fallback is a single clip, so normalise both into one list.
  const clips = output?.clips?.length ? output.clips : output?.videoUrl ? [output.videoUrl] : []
  const shot = clips.length ? clips[Math.min(clipIndex, clips.length - 1)] : null
  const shotName = clips.length > 1 ? `shot${clipIndex + 1}-` : 'clip-'

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const saveClip = () => {
    if (!output) return
    downloadDataUrl(shot || output.poster, `verdict-${output.symbol.toLowerCase()}-${shotName}${output.format || 'mp4'}`)
  }

  return (
    <>
      {header}

      <div className="cv-panel st-panel">
        {/* the stage — media on top, loader centered while rendering */}
        <div className="st-stage">
          <AnimatePresence mode="wait">
            {phase === 'generating' && (
              <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex items-center justify-center">
                <GenLoader />
              </motion.div>
            )}
            {phase === 'done' && output && (
              <motion.div key="out" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full h-full">
                {shot ? (
                  <video
                    ref={videoRef}
                    key={shot}
                    src={shot}
                    poster={coverFor(output.poster)}
                    controls
                    autoPlay
                    playsInline
                    className="st-media"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                      setPlaying(false)
                      if (clipIndex < clips.length - 1) setClipIndex(clipIndex + 1)
                    }}
                  />
                ) : (
                  <img src={coverFor(output.poster)} alt={`${output.symbol} verdict clip`} className="st-media ken-burns" />
                )}
                {clips.length > 1 && (
                  <div className="st-shots">
                    {clips.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Shot ${i + 1}`}
                        onClick={() => setClipIndex(i)}
                        className={`st-shot ${i === clipIndex ? 'on' : ''}`}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
            {phase === 'idle' && !error && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                <p className="text-[13px] text-muted">Your clip premieres here.</p>
              </motion.div>
            )}
            {error && (
              <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6 max-w-md">
                <p className="text-[13px] text-danger mb-3">{friendlyError(error)}</p>
                <button onClick={generate} className="glass-btn !py-2.5 !text-xs"><RefreshCw size={12} /> Retry</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* three compact tiles: play · runtime · save */}
        <div className="st-tiles">
          <button type="button" className="st-tile" disabled={phase !== 'done' || !shot} onClick={togglePlay}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
            <span className="st-tile-value">{playing ? 'Pause' : 'Play'}</span>
            <span className="st-tile-label">stage</span>
          </button>
          <div className="st-tile info">
            <Clock size={16} />
            <span className="st-tile-value">{output?.duration ?? '—'}</span>
            <span className="st-tile-label">sec</span>
          </div>
          <button type="button" className="st-tile" disabled={phase !== 'done'} onClick={saveClip}>
            <Download size={16} />
            <span className="st-tile-value">Save</span>
            <span className="st-tile-label">{output?.format || 'mp4'}</span>
          </button>
        </div>

        {/* one brief line + one CTA */}
        <p className="st-brief">Turn {script.symbol}&apos;s live verdict into a clip worth sharing.</p>
        <button type="button" className="st-cta" onClick={generate} disabled={phase === 'generating'}>
          <Sparkles size={15} /> {phase === 'generating' ? 'Generating…' : output ? 'Generate Again' : 'Generate Now'}
        </button>
      </div>

      <StudioHistoryStrip
        items={history.items}
        activeId={output?.id}
        onPick={(it) => { setOutput(it); setClipIndex(0); setPlaying(false); setPhase('done') }}
        renderThumb={(it) => ({ backgroundImage: `url(${coverFor(it.poster)})` })}
      />
    </>
  )
}
