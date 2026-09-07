// Studio · Voice — Qwen writes the narration from the live verdict, a deep male
// voice synthesizes it, browser TTS is the last resort. Clean stage: waveform
// dances only while the narration plays; no prompt dumps, no info walls.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Play, Pause, RefreshCw, Download, Sparkles, Clock, Radio } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import VerdictBadge from '../../components/VerdictBadge'
import { fetchStudioScript, generateStudioVoice, fetchVerdict } from '../../lib/api'
import { stanceOf } from '../../lib/stance'
import { PageHeader, EmptyState, friendlyError } from '../../components/DashUI'
import GenLoader from '../../components/loaders/GenLoader'
import CandleLoader from '../../components/loaders/CandleLoader'
import { downloadDataUrl } from './StudioShared'
import { recallStudio, rememberStudio } from '../../lib/studioCache'

export default function VoiceStudio() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  return <VoiceStudioInner key={token || 'none'} token={token} />
}

function VoiceStudioInner({ token }) {
  const [script, setScript] = useState(null)
  const [loadState, setLoadState] = useState('loading') // loading | ready | error
  const [loadMsg, setLoadMsg] = useState('')
  // A narration already generated for this token comes back with the page —
  // no re-synthesis, no lost work, until the user picks a different token.
  const [output, setOutput] = useState(() => recallStudio('voice', token))
  const [phase, setPhase] = useState(() => (recallStudio('voice', token) ? 'done' : 'idle')) // idle | generating | done
  const [error, setError] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const audioRef = useRef(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoadState('loading')
    setLoadMsg('')
    try {
      const s = await fetchStudioScript(token)
      setScript(s)
      setLoadState('ready')
    } catch (err) {
      setLoadMsg(err?.message || 'Script fetch failed')
      setLoadState('error')
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Never leave audio running across unmounts. (The inner component remounts
  // per token via key=, so stopping here is enough — no state wipe needed.)
  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis?.cancel() }, [])

  // Last-resort narration: assembled from the live verdict payload, word for word real.
  const useVerdictFallback = async () => {
    setLoadState('loading')
    setLoadMsg('')
    try {
      const v = await fetchVerdict(token)
      const text =
        `Research stance: ${stanceOf(v.verdict).label} on ${v.name || v.symbol}. ` +
        `Confidence ${v.confidence} out of 100 — bull case ${v.bullScore} against bear case ${v.bearScore}. ` +
        `${v.finalThesis || ''}`.trim()
      setScript({ symbol: v.symbol, name: v.name, verdict: v.verdict, confidence: v.confidence, bullScore: v.bullScore, bearScore: v.bearScore, script: text, fallback: true })
      setLoadState('ready')
    } catch (err) {
      setLoadMsg(err?.message || 'Verdict fetch failed')
      setLoadState('error')
    }
  }

  const generate = async () => {
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setPhase('generating')
    setOutput(null)
    setError(null)
    try {
      const res = await generateStudioVoice(script)
      const entry = {
        symbol: script.symbol,
        verdict: script.verdict,
        script: res.script,
        audioUrl: res.audioUrl,
        tone: res.tone,
        duration: res.duration,
        format: res.format,
      }
      rememberStudio('voice', script.symbol, entry)
      setOutput(entry)
      setPhase('done')
    } catch (err) {
      setError(err?.message || 'Voice generation failed')
      setPhase('idle')
    }
  }

  const togglePlay = (item) => {
    if (speaking) {
      audioRef.current?.pause()
      window.speechSynthesis?.cancel()
      setSpeaking(false)
      return
    }
    if (!item?.audioUrl) {
      const synth = window.speechSynthesis
      if (!synth) return
      const utter = new SpeechSynthesisUtterance(String(item?.script || ''))
      utter.rate = 0.95
      utter.pitch = 0.8
      utter.onend = () => setSpeaking(false)
      utter.onerror = () => setSpeaking(false)
      synth.cancel()
      synth.speak(utter)
      setSpeaking(true)
      return
    }
    const audio = new Audio(item.audioUrl)
    audio.onended = () => setSpeaking(false)
    audio.onerror = () => setSpeaking(false)
    audioRef.current = audio
    audio.play()
    setSpeaking(true)
  }

  const header = (
    <PageHeader
      icon={Mic}
      title={script ? `Studio · Voice · ${script.symbol}` : 'Studio · Voice'}
      subtitle="Turn a verdict into a spoken brief."
      source={{ mode: 'live', name: 'AI voice' }}
    >
      {script?.verdict && <VerdictBadge verdict={script.verdict} size="sm" animate={false} />}
    </PageHeader>
  )

  if (!token) {
    return (
      <>
        {header}
        <EmptyState
          icon={Mic}
          title="Set a token first"
          hint="Enter a token on the Your Token page or use the search bar above to begin."
          action={<a href="/dashboard" className="glass-btn">Go to Your Token</a>}
        />
      </>
    )
  }

  if (loadState === 'loading') {
    return (
      <>
        {header}
        <div className="min-h-[46vh] flex items-center justify-center">
          <CandleLoader />
        </div>
      </>
    )
  }

  if (loadState === 'error') {
    return (
      <>
        {header}
        <div className="cv-panel st-panel !items-center text-center">
          <p className="st-brief">The writer didn&apos;t answer this time. Retry, or narrate the live verdict as-is.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={load} className="glass-btn !py-2.5 !text-xs"><RefreshCw size={12} /> Retry</button>
            <button onClick={useVerdictFallback} className="glass-btn !py-2.5 !text-xs"><Radio size={12} /> Narrate live verdict</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {header}

      <div className="cv-panel st-panel">
        {/* the stage — waveform on top, loader centered while synthesizing */}
        <div className="st-stage st-voice-stage">
          <AnimatePresence mode="wait">
            {phase === 'generating' && (
              <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex items-center justify-center">
                <GenLoader />
              </motion.div>
            )}
            {phase === 'done' && output && (
              <motion.div key="out" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full h-full flex flex-col items-center justify-center gap-7 px-8">
                <div className={`st-wave ${speaking ? 'live' : ''}`}>
                  {Array.from({ length: 36 }, (_, i) => (
                    <span key={i} style={{ '--d': `${i * 0.05}s`, '--peak': 0.45 + ((i * 7) % 50) / 100 }} />
                  ))}
                </div>
                <button type="button" className="st-play" onClick={() => togglePlay(output)} aria-label={speaking ? 'Pause narration' : 'Play narration'}>
                  {speaking ? <Pause size={20} /> : <Play size={20} />}
                </button>
              </motion.div>
            )}
            {phase === 'idle' && !error && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                <p className="text-[13px] text-muted">Your narration plays here.</p>
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
          <button type="button" className="st-tile" disabled={phase !== 'done'} onClick={() => togglePlay(output)}>
            {speaking ? <Pause size={16} /> : <Play size={16} />}
            <span className="st-tile-value">{speaking ? 'Pause' : 'Play'}</span>
            <span className="st-tile-label">voice</span>
          </button>
          <div className="st-tile info">
            <Clock size={16} />
            <span className="st-tile-value">{output?.duration ?? '—'}</span>
            <span className="st-tile-label">sec</span>
          </div>
          <button
            type="button"
            className="st-tile"
            disabled={phase !== 'done' || !output?.audioUrl}
            onClick={() => output && downloadDataUrl(output.audioUrl, `verdict-${output.symbol.toLowerCase()}-voice.${output.format || 'mp3'}`)}
          >
            <Download size={16} />
            <span className="st-tile-value">Save</span>
            <span className="st-tile-label">{output?.format || 'mp3'}</span>
          </button>
        </div>

        {/* one brief line + one CTA */}
        <p className="st-brief">Turn {script.symbol}&apos;s live verdict into a voice brief worth sharing.</p>
        <button type="button" className="st-cta" onClick={generate} disabled={phase === 'generating'}>
          <Sparkles size={15} /> {phase === 'generating' ? 'Generating…' : output ? 'Generate Again' : 'Generate Now'}
        </button>
      </div>
    </>
  )
}
