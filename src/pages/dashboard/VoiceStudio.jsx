// Studio · Voice — the user presses generate, a waveform loader runs,
// and the verdict narration lands with browser TTS playback + script download.
import { useEffect, useRef, useState } from 'react'
import { Mic, Play, Pause, RefreshCw, Volume2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge from '../../components/VerdictBadge'
import { useAgentData } from '../../hooks/useAgentData'
import { fetchStudioScript, generateStudioVoice } from '../../lib/api'
import { PageHeader, Panel, EmptyState, ErrorState } from '../../components/DashUI'
import { WaveformLoader, ProgressRing, PageSkeleton } from '../../components/Loaders'
import { useStudioHistory, downloadText, StudioHistoryStrip, DownloadBtn } from './StudioShared'

export default function VoiceStudio() {
  const [searchParams, setSearchParams] = useSearchParams()
  const token = searchParams.get('token')

  return <VoiceStudioInner key={token || 'none'} token={token} pick={(t) => setSearchParams({ token: t })} />
}

function VoiceStudioInner({ token, pick }) {
  const { status, data: script, error: fetchError } = useAgentData(() => (token ? fetchStudioScript(token) : null), [token])
  const history = useStudioHistory('voice')
  const [phase, setPhase] = useState('idle') // idle | generating | done
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [output, setOutput] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const utterRef = useRef(null)

  // stop narration whenever the token / run changes or we unmount
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  useEffect(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [token])

  if (!token) {
    return (
      <>
        <PageHeader icon={Mic} title="Studio · Voice" subtitle="Turn a verdict into spoken narration." source={{ mode: 'live', name: 'TTS voice' }} />
        <EmptyState
          icon={Mic}
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
        <PageHeader icon={Mic} title="Studio · Voice" subtitle="Turn a verdict into spoken narration." source={{ mode: 'live', name: 'TTS voice' }} />
        <ErrorState error={fetchError} onRetry={() => window.location.reload()}>
          <p className="text-[11px] text-faint font-mono">Script fetch failed — the analysis may be rate-limited.</p>
        </ErrorState>
      </>
    )
  }

  const generate = async () => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setPhase('generating')
    setProgress(0)
    setOutput(null)
    setError(null)
    try {
      const res = await generateStudioVoice(script, { onProgress: setProgress })
      const entry = {
        symbol: script.symbol,
        verdict: script.verdict,
        script: res.script,
        tone: res.tone,
        duration: res.duration,
        format: res.format,
      }
      setOutput(entry)
      history.push(entry)
      setPhase('done')
    } catch (err) {
      console.error('[VOICE-GEN] Error:', err)
      setError(err.message || 'Voice generation failed')
      setPhase('idle')
    }
  }

  const togglePlay = (item) => {
    const synth = window.speechSynthesis
    if (!synth) return
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    const u = new SpeechSynthesisUtterance(item.script)
    u.rate = 0.98
    u.pitch = item.verdict === 'BUY' ? 1.05 : item.verdict === 'AVOID' ? 0.9 : 1
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    utterRef.current = u
    synth.cancel()
    synth.speak(u)
    setSpeaking(true)
  }

  const download = (item) => downloadText(item.script, `verdict-${item.symbol.toLowerCase()}-script.txt`)

  return (
    <>
      <PageHeader
        icon={Mic}
        title={`Studio · Voice · ${script.symbol}`}
        subtitle="Turn a verdict into spoken narration."
        source={{ mode: 'live', name: 'TTS voice' }}
      >
        <VerdictBadge verdict={script.verdict} size="sm" animate={false} />
      </PageHeader>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* tone card */}
        <Panel title="Voice Direction" icon={Volume2} delay={0.08} className="lg:col-span-2">
          <div className="space-y-4">
            <div className="tone-card">
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-1.5">Delivery</p>
              <p className="text-[12.5px] text-snow/85 leading-relaxed">{script.tone}</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint mb-1.5">Script</p>
              <p className="text-[12.5px] text-muted leading-relaxed italic break-words overflow-hidden">“{script.script}”</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="glass-chip">{script.duration}s</span>
              <span className="glass-chip">NARRATION · EN</span>
            </div>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[10px] font-mono text-faint mb-2">CONFIDENCE · {script.confidence}/100</p>
              <button onClick={generate} disabled={phase === 'generating'} className="glass-btn w-full justify-center !py-3">
                <Mic size={14} /> {phase === 'generating' ? 'Synthesizing…' : output ? 'Regenerate Voice' : 'Generate Voice'}
              </button>
            </div>
          </div>
        </Panel>

        {/* booth */}
        <div className="lg:col-span-3">
          <div className="studio-frame studio-vignette min-h-[320px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {phase === 'generating' && (
                <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-[320px] flex flex-col items-center justify-center gap-6">
                  <WaveformLoader label="Synthesizing narration" />
                  <ProgressRing percent={progress} size={76} label="VOICE" />
                  <p className="font-mono text-[10px] tracking-[0.2em] text-faint">TUNING PITCH TO THE VERDICT…</p>
                </motion.div>
              )}
              {phase === 'done' && output && (
                <motion.div key="out" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-6 px-6 text-center w-full">
                  <div className={`voice-disc ${speaking ? 'spinning' : ''}`}>
                    <span className="hole" />
                  </div>
                  <div className="uv-waveform">
                    {Array.from({ length: 28 }, (_, i) => (
                      <span
                        key={i}
                        style={{
                          '--wf-delay': `${i * 0.06}s`,
                          '--wf-h': `${8 + ((i * 11) % 24)}px`,
                          animationPlayState: speaking ? 'running' : 'paused',
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[12.5px] text-muted max-w-md italic">“{output.script}”</p>
                </motion.div>
              )}
              {phase === 'idle' && !error && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                  <div className="empty-icon mx-auto mb-4"><Mic size={22} /></div>
                  <p className="text-[13px] text-muted">The booth is silent. Generate to give the verdict a voice.</p>
                </motion.div>
              )}
              {error && (
                <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6 max-w-md">
                  <div className="empty-icon mx-auto mb-4"><Mic size={22} className="text-danger" /></div>
                  <p className="text-[13px] text-danger mb-3">{error}</p>
                  <button onClick={generate} className="glass-btn !py-2.5 !text-xs"><RefreshCw size={12} /> Retry</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {phase === 'done' && output && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={() => togglePlay(output)} className="glass-btn">
                {speaking ? <Pause size={13} /> : <Play size={13} />} {speaking ? 'Pause' : 'Play narration'}
              </button>
              <DownloadBtn onClick={() => download(output)} label="Download script .txt" />
              <button onClick={generate} className="glass-chip"><RefreshCw size={12} /> Regenerate</button>
              <span className="ml-auto font-mono text-[10px] text-faint">LIVE TTS VOICE · BROWSER NATIVE</span>
            </motion.div>
          )}
        </div>
      </div>

      <StudioHistoryStrip
        items={history.items}
        activeId={output?.id}
        onPick={(it) => { window.speechSynthesis?.cancel(); setSpeaking(false); setOutput(it); setPhase('done') }}
        renderThumb={(it) => ({ background: 'linear-gradient(135deg, rgba(91,147,255,0.28), rgba(2,2,8,0.9))' })}
      />
    </>
  )
}
