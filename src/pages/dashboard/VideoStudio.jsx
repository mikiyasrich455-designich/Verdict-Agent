// Studio · Video — generates a motion clip via Seedance (AceData)
import { useState } from 'react'
import { Video, Clapperboard, RefreshCw, Film } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge from '../../components/VerdictBadge'
import { useAgentData } from '../../hooks/useAgentData'
import { fetchStudioScript, generateStudioVideo } from '../../lib/api'
import { PageHeader, Panel, EmptyState } from '../../components/DashUI'
import { OrbitLoader, PageSkeleton } from '../../components/Loaders'
import { useStudioHistory, downloadDataUrl, StudioHistoryStrip, DownloadBtn } from './StudioShared'

export default function VideoStudio() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')

  return <VideoStudioInner key={token || 'none'} token={token} pick={(t) => setSearchParams({ token: t })} />
}

function VideoStudioInner({ token, pick }) {
  const { status, data: script } = useAgentData(() => (token ? fetchStudioScript(token) : null), [token])
  const history = useStudioHistory('video')
  const [phase, setPhase] = useState('idle') // idle | generating | done
  const [error, setError] = useState(null)
  const [output, setOutput] = useState(null)
  const [stage, setStage] = useState('')

  if (!token) {
    return (
      <>
        <PageHeader icon={Video} title="Studio · Video" subtitle="Turn a verdict into a short motion clip." source={{ mode: 'live', name: 'Seedance video' }} />
        <EmptyState
          icon={Video}
          title="Set a token first"
          hint="Enter a token on the Your Token page or use the search bar above to begin."
          action={<a href="/dashboard" className="glass-btn">Go to Your Token</a>}
        />
      </>
    )
  }

  if (status !== 'ready' || !script) {
    return (
      <>
        <PageHeader icon={Video} title="Studio · Video" subtitle="Turn a verdict into a short motion clip." source={{ mode: 'live', name: 'Seedance video' }} />
        <PageSkeleton />
      </>
    )
  }

  const generate = async () => {
    setPhase('generating')
    setError(null)
    setOutput(null)
    setStage('Starting render…')
    try {
      const res = await generateStudioVideo(script.symbol, script.verdict, (msg) => setStage(msg))
      const entry = {
        symbol: script.symbol,
        verdict: script.verdict,
        poster: res.poster,
        videoUrl: res.videoUrl,
        duration: res.duration,
        resolution: res.resolution,
        format: res.format,
      }
      setOutput(entry)
      history.push(entry)
      setPhase('done')
    } catch (err) {
      console.error('[VIDEO-GEN] Error:', err)
      setError(err.message || 'Video generation failed')
      setPhase('idle')
    }
  }

  const download = (item) =>
    downloadDataUrl(item.videoUrl || item.poster, `verdict-${item.symbol.toLowerCase()}-clip.${item.format || 'mp4'}`)

  return (
    <>
      <PageHeader
        icon={Video}
        title={`Studio · Video · ${script.symbol}`}
        subtitle="Turn a verdict into a short motion clip."
        source={{ mode: 'live', name: 'Seedance video' }}
      >
        <VerdictBadge verdict={script.verdict} size="sm" animate={false} />
      </PageHeader>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* storyboard */}
        <Panel title="Storyboard" icon={Clapperboard} delay={0.08} className="lg:col-span-2">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-1.5">Scene direction</p>
              <p className="text-[12.5px] text-snow/80 leading-relaxed break-words overflow-hidden">{script.script}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-1.5">Narration tone</p>
              <p className="text-[12.5px] text-muted break-words">{script.tone}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="glass-chip"><Film size={11} /> {script.duration} narration</span>
              <span className="glass-chip">12s clip · 720p</span>
              <span className="glass-chip">16:9 · WITH AUDIO</span>
            </div>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] font-mono text-faint mb-2">CONFIDENCE · {script.confidence}/100</p>
              <button onClick={generate} disabled={phase === 'generating'} className="glass-btn w-full justify-center !py-3">
                <Clapperboard size={14} /> {phase === 'generating' ? 'Generating…' : output ? 'Regenerate Clip' : 'Generate Clip'}
              </button>
            </div>
          </div>
        </Panel>

        {/* screen */}
        <div className="lg:col-span-3">
          <div className="studio-frame studio-vignette min-h-[320px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {phase === 'generating' && (
                <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-[320px] flex flex-col items-center justify-center gap-4">
                  <OrbitLoader label="Generating video…" />
                  <p className="font-mono text-[11px] text-accent/80">{stage || 'Please wait…'}</p>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-faint">AI VIDEO RENDER · UP TO 2-3 MINUTES</p>
                </motion.div>
              )}
              {phase === 'done' && output && (
                <motion.div key="out" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full overflow-hidden">
                  {output.videoUrl ? (
                    <video src={output.videoUrl} controls className="w-full rounded-lg" />
                  ) : (
                    <img src={output.poster} alt={`${output.symbol} verdict clip`} className="w-full ken-burns" />
                  )}
                </motion.div>
              )}
              {phase === 'idle' && !error && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                  <div className="empty-icon mx-auto mb-4"><Video size={22} /></div>
                  <p className="text-[13px] text-muted">The screen is dark. Generate to roll the clip.</p>
                </motion.div>
              )}
              {error && (
                <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6 max-w-md">
                  <div className="empty-icon mx-auto mb-4"><Video size={22} className="text-danger" /></div>
                  <p className="text-[13px] text-danger mb-3">{error}</p>
                  <button onClick={generate} className="glass-btn !py-2.5 !text-xs"><RefreshCw size={12} /> Retry</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {phase === 'done' && output && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 mt-3">
              <DownloadBtn onClick={() => download(output)} label={`Download clip .${output.format || 'mp4'}`} />
              <span className="glass-chip">{output.duration}s</span>
              <span className="glass-chip">{output.resolution}</span>
              <button onClick={generate} className="glass-chip"><RefreshCw size={12} /> Regenerate</button>
              <span className="ml-auto font-mono text-[10px] text-faint">POWERED BY SEEDANCE · ACEDATA</span>
            </motion.div>
          )}
        </div>
      </div>

      <StudioHistoryStrip
        items={history.items}
        activeId={output?.id}
        onPick={(it) => { setOutput(it); setPhase('done') }}
        renderThumb={(it) => ({ backgroundImage: `url(${it.poster})` })}
      />
    </>
  )
}
