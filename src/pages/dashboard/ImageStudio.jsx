// Studio · Image — generates art via Qwen image model
import { useState } from 'react'
import { ImageIcon, RefreshCw, Download, Sparkles, Maximize2, Type } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge from '../../components/VerdictBadge'
import { useAgentData } from '../../hooks/useAgentData'
import { fetchStudioScript, generateStudioImage } from '../../lib/api'
import { PageHeader, EmptyState, ErrorState, friendlyError } from '../../components/DashUI'
import GenLoader from '../../components/loaders/GenLoader'
import CandleLoader from '../../components/loaders/CandleLoader'
import { useStudioHistory, downloadDataUrl, StudioHistoryStrip, coverFor } from './StudioShared'

export default function ImageStudio() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')

  return <ImageStudioInner key={token || 'none'} token={token} pick={(t) => setSearchParams({ token: t })} />
}

function ImageStudioInner({ token, pick }) {
  const { status, data: script, error: fetchError } = useAgentData(() => (token ? fetchStudioScript(token) : null), [token])
  const history = useStudioHistory('image')
  const [phase, setPhase] = useState('idle') // idle | generating | done
  const [error, setError] = useState(null)
  const [output, setOutput] = useState(null)

  const header = (
    <PageHeader
      icon={ImageIcon}
      title={script ? `Studio · Image · ${script.symbol}` : 'Studio · Image'}
      subtitle="Turn a verdict into shareable card art."
      source={{ mode: 'live', name: 'AI image' }}
    >
      {script && <VerdictBadge verdict={script.verdict} size="sm" animate={false} />}
    </PageHeader>
  )

  if (!token) {
    return (
      <>
        {header}
        <EmptyState
          icon={ImageIcon}
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
    try {
      const res = await generateStudioImage(script)
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
      {header}

      <div className="cv-panel st-panel">
        {/* the stage — art on top, loader centered while rendering */}
        <div className="st-stage">
          <AnimatePresence mode="wait">
            {phase === 'generating' && (
              <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex items-center justify-center">
                <GenLoader />
              </motion.div>
            )}
            {phase === 'done' && output && (
              <motion.div key="out" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full h-full">
                <img src={output.url} alt={`${output.symbol} verdict art`} className="st-media contain" />
              </motion.div>
            )}
            {phase === 'idle' && !error && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                <p className="text-[13px] text-muted">Your card art appears here.</p>
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

        {/* three compact tiles: view · format · save */}
        <div className="st-tiles">
          <button
            type="button"
            className="st-tile"
            disabled={phase !== 'done'}
            onClick={() => output && window.open(output.url, '_blank', 'noopener')}
          >
            <Maximize2 size={16} />
            <span className="st-tile-value">View</span>
            <span className="st-tile-label">full size</span>
          </button>
          <div className="st-tile info">
            <Type size={16} />
            <span className="st-tile-value">{output?.format ? output.format.toUpperCase() : '—'}</span>
            <span className="st-tile-label">format</span>
          </div>
          <button type="button" className="st-tile" disabled={phase !== 'done'} onClick={() => output && download(output)}>
            <Download size={16} />
            <span className="st-tile-value">Save</span>
            <span className="st-tile-label">{output?.format || 'img'}</span>
          </button>
        </div>

        {/* one brief line + one CTA */}
        <p className="st-brief">Turn {script.symbol}&apos;s live verdict into card art worth sharing.</p>
        <button type="button" className="st-cta" onClick={generate} disabled={phase === 'generating'}>
          <Sparkles size={15} /> {phase === 'generating' ? 'Generating…' : output ? 'Generate Again' : 'Generate Now'}
        </button>
      </div>

      <StudioHistoryStrip
        items={history.items}
        activeId={output?.id}
        onPick={(it) => { setOutput(it); setPhase('done') }}
        renderThumb={(it) => ({ backgroundImage: `url(${coverFor(it.url)})` })}
      />
    </>
  )
}
