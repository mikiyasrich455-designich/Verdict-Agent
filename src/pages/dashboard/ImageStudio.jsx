// Studio · Image — generates art via Seedream (AceData, cheapest & best)
import { useState } from 'react'
import { ImageIcon, Wand2, RefreshCw, Palette } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge, { verdictColor } from '../../components/VerdictBadge'
import { useAgentData, useRunKey } from '../../hooks/useAgentData'
import { fetchStudioScript, generateStudioImage } from '../../lib/api'
import { PageHeader, Panel, EmptyState, friendlyError } from '../../components/DashUI'
import { OrbitLoader, PageSkeleton } from '../../components/Loaders'
import { useStudioHistory, downloadDataUrl, StudioHistoryStrip, DownloadBtn } from './StudioShared'

export default function ImageStudio() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')

  return <ImageStudioInner key={token || 'none'} token={token} pick={(t) => setSearchParams({ token: t })} />
}

function ImageStudioInner({ token, pick }) {
  const { status, data: script } = useAgentData(() => (token ? fetchStudioScript(token) : null), [token])
  const history = useStudioHistory('image')
  const [phase, setPhase] = useState('idle') // idle | generating | done
  const [error, setError] = useState(null)
  const [output, setOutput] = useState(null)

  if (!token) {
    return (
      <>
        <PageHeader icon={ImageIcon} title="Studio · Image" subtitle="Turn a verdict into shareable card art." source={{ mode: 'live', name: 'AI image' }} />
        <EmptyState
          icon={ImageIcon}
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
        <PageHeader icon={ImageIcon} title="Studio · Image" subtitle="Turn a verdict into shareable card art." source={{ mode: 'live', name: 'AI image' }} />
        <PageSkeleton />
      </>
    )
  }

  const generate = async () => {
    setPhase('generating')
    setError(null)
    setOutput(null)
    try {
      const res = await generateStudioImage(script.symbol, script.verdict)
      const entry = { symbol: script.symbol, verdict: script.verdict, url: res.url, format: res.format }
      setOutput(entry)
      history.push(entry)
      setPhase('done')
    } catch (err) {
      console.error('[IMAGE-GEN] Error:', err)
      setError(err.message || 'Image generation failed')
      setPhase('idle')
    }
  }

  const download = (item) => downloadDataUrl(item.url, `verdict-${item.symbol.toLowerCase()}-image.${item.format}`)

  return (
    <>
      <PageHeader
        icon={ImageIcon}
        title={`Studio · Image · ${script.symbol}`}
        subtitle="Turn a verdict into shareable card art."
        source={{ mode: 'live', name: 'AI image' }}
      >
        <VerdictBadge verdict={script.verdict} size="sm" animate={false} />
      </PageHeader>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* art direction */}
        <Panel title="Art Direction" icon={Palette} delay={0.08} className="lg:col-span-2">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-2">Palette</p>
              <div className="flex gap-2">
                {script.artDirection.palette.map((c) => (
                  <span key={c} className="w-9 h-9 rounded-lg border border-white/10" style={{ background: c, boxShadow: `0 0 16px ${c}44` }} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-1.5">Motif</p>
              <p className="text-[12.5px] text-snow/80 leading-relaxed break-words">{script.artDirection.motif}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-1.5">Narration tone</p>
              <p className="text-[12.5px] text-muted break-words">{script.tone}</p>
            </div>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] font-mono text-faint mb-2">CONFIDENCE · {script.confidence}/100</p>
              <button onClick={generate} disabled={phase === 'generating'} className="glass-btn w-full justify-center !py-3">
                <Wand2 size={14} /> {phase === 'generating' ? 'Generating…' : output ? 'Regenerate Image' : 'Generate Image'}
              </button>
            </div>
          </div>
        </Panel>

        {/* canvas */}
        <div className="lg:col-span-3">
          <div className="studio-frame studio-vignette min-h-[320px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {phase === 'generating' && (
                <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-[320px] flex flex-col items-center justify-center gap-4">
                  <OrbitLoader label="Generating image…" />
                  <p className="font-mono text-[10px] tracking-[0.2em] text-faint">PLEASE WAIT · THIS MAY TAKE A MOMENT</p>
                </motion.div>
              )}
              {phase === 'done' && output && (
                <motion.div key="out" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full">
                  <img src={output.url} alt={`${output.symbol} verdict art`} className="w-full" />
                </motion.div>
              )}
              {phase === 'idle' && !error && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                  <div className="empty-icon mx-auto mb-4"><ImageIcon size={22} /></div>
                  <p className="text-[13px] text-muted">The canvas is empty. Generate to paint the verdict.</p>
                </motion.div>
              )}
              {error && (
                <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6 max-w-md">
                  <div className="empty-icon mx-auto mb-4"><ImageIcon size={22} className="text-danger" /></div>
                  <p className="text-[13px] text-danger mb-3">{friendlyError(error)}</p>
                  <button onClick={generate} className="glass-btn !py-2.5 !text-xs"><RefreshCw size={12} /> Retry</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {phase === 'done' && output && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 mt-3">
              <DownloadBtn onClick={() => download(output)} label={`Download .${output.format}`} />
              <button onClick={generate} className="glass-chip"><RefreshCw size={12} /> Regenerate</button>
              <span className="ml-auto font-mono text-[10px] text-faint">POWERED BY SEEDREAM · ACEDATA</span>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <StudioHistoryStrip items={history.items} activeId={output?.id} onPick={(it) => { setOutput(it); setPhase('done') }} renderThumb={(it) => ({ backgroundImage: `url(${it.url})` })} />
        </div>
      </div>
    </>
  )
}
