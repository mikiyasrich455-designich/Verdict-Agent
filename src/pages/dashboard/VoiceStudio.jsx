// Studio · Voice — cosmic-glass booth. Qwen writes the narration from the live
// verdict, AceData/Qwen synthesize a deep male voice, browser TTS is the last resort.
// No full-page error screens: every failure degrades to an inline retry or a
// narration assembled straight from the live verdict payload.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Play, Pause, RefreshCw, Volume2, Download, Sparkles, Loader2, Radio } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { PanelV2, Ring, TONES, TokenLogo, LivePill } from '../../components/ConsoleUI'
import { fetchStudioScript, generateStudioVoice, fetchVerdict } from '../../lib/api'
import { stanceOf } from '../../lib/stance'
import { downloadDataUrl } from './StudioShared'

// Stance tone → ConsoleUI tone bridge: POSITIVE reads teal-up, NEUTRAL amber, CAUTION red-down.
const STANCE_TONE = { positive: 'up', neutral: 'amber', risk: 'down' }

function StancePill({ label }) {
  const stance = stanceOf(label)
  const tone = STANCE_TONE[stance.tone] || 'blue'
  const color = TONES[tone] || TONES.blue
  return (
    <span
      className="rounded-full px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]"
      style={{ color, background: `${color}14`, border: `1px solid ${color}55`, boxShadow: `0 0 18px ${color}33` }}
    >
      {stance.label}
    </span>
  )
}

export default function VoiceStudio() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  return <VoiceStudioInner key={token || 'none'} token={token} />
}

function VoiceStudioInner({ token }) {
  const [script, setScript] = useState(null)
  const [loadState, setLoadState] = useState('loading') // loading | ready | error
  const [loadMsg, setLoadMsg] = useState('')
  const [phase, setPhase] = useState('idle') // idle | generating | done
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [output, setOutput] = useState(null)
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

  // Never leave audio running across runs or unmounts.
  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis?.cancel() }, [])
  useEffect(() => {
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setPhase('idle')
    setOutput(null)
  }, [token])

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
    setProgress(0)
    setOutput(null)
    setError(null)
    try {
      const res = await generateStudioVoice(script, { onProgress: setProgress })
      setOutput({
        symbol: script.symbol,
        verdict: script.verdict,
        script: res.script,
        audioUrl: res.audioUrl,
        tone: res.tone,
        duration: res.duration,
        format: res.format,
        provider: res.provider,
      })
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

  if (!token) {
    return (
      <PanelV2 icon={Mic} title="Studio · Voice">
        <div className="py-6 text-center space-y-3">
          <p className="text-[13px] text-snow/70">Pick a token first — the booth narrates whatever the agents conclude.</p>
          <a href="/dashboard" className="cv-chip inline-flex">Go to Your Token</a>
        </div>
      </PanelV2>
    )
  }

  const providerLabel = output?.audioUrl ? 'STUDIO VOICE' : 'BROWSER VOICE'

  return (
    <div className="space-y-4">
      {/* identity strip */}
      <div className="cv-panel relative overflow-hidden !p-5">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(100deg, rgba(6,9,22,0.94) 30%, rgba(78,139,255,0.10) 70%, rgba(124,92,255,0.14))' }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <TokenLogo size={46} symbol={script?.symbol || token} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[17px] font-bold text-snow">{script?.name || token}</h2>
              <span className="cv-chip">${(script?.symbol || token).toUpperCase()}</span>
              {script?.verdict && <StancePill label={script.verdict} />}
            </div>
            <p className="text-[11.5px] text-snow/55 mt-1">Studio · Voice — the verdict, spoken word for word.</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {typeof script?.confidence === 'number' && (
              <Ring value={script.confidence} size={62} stroke={6} tone={STANCE_TONE[stanceOf(script.verdict).tone] || 'blue'} label="CONF" />
            )}
            <LivePill label="Live narration pipeline" />
          </div>
        </div>
      </div>

      <div className="cv-grid-2">
        {/* brief + booth */}
        <PanelV2 icon={Volume2} title="Voice Brief" right={<span className="cv-chip">DEEP MALE · EN</span>}>
          {loadState === 'loading' && <div className="cv-ghost h-[120px]" />}
          {loadState === 'error' && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-snow/70 leading-relaxed">
                The narration writer didn't answer this time ({loadMsg}). Nothing is broken — retry, or speak the live verdict as-is.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={load} className="cv-chip"><RefreshCw size={12} /> Retry writer</button>
                <button onClick={useVerdictFallback} className="cv-chip"><Radio size={12} /> Narrate live verdict</button>
              </div>
            </div>
          )}
          {loadState === 'ready' && script && (
            <div className="space-y-4">
              <div className="cv-rowline"><span className="cv-rowline-label">Delivery</span><span className="cv-rowline-cell">Clean, deep male analyst voice</span></div>
              <div className="cv-rowline"><span className="cv-rowline-label">Coverage</span><span className="cv-rowline-cell">Full briefing — price, tape, bull &amp; bear, thesis</span></div>
              <div className="cv-rowline"><span className="cv-rowline-label">Bull / Bear</span><span className="cv-rowline-cell font-mono">{script.bullScore} / {script.bearScore}</span></div>
              {script.fallback && (
                <p className="text-[11px] text-snow/50">Narration assembled directly from the live verdict payload.</p>
              )}
              <button onClick={generate} disabled={phase === 'generating'} className="cv-btn w-full justify-center !py-3 disabled:opacity-60">
                {phase === 'generating' ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                {phase === 'generating' ? 'Synthesizing…' : output ? 'Regenerate Voice' : 'Generate Voice'}
              </button>
            </div>
          )}
        </PanelV2>

        <PanelV2 icon={Mic} title="The Booth" right={output ? <span className="cv-chip font-mono">{providerLabel}</span> : undefined}>
          <div className="cv-panel min-h-[240px] flex items-center justify-center !bg-[rgba(4,7,18,0.55)]">
            <AnimatePresence mode="wait">
              {phase === 'generating' && (
                <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center gap-5 py-6">
                  <div className="uv-waveform">
                    {Array.from({ length: 28 }, (_, i) => (
                      <span key={i} style={{ '--wf-delay': `${i * 0.06}s`, '--wf-h': `${8 + ((i * 11) % 24)}px`, animationPlayState: 'running' }} />
                    ))}
                  </div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-snow/45">SYNTHESIZING · {Math.round(progress)}%</p>
                </motion.div>
              )}
              {phase === 'done' && output && (
                <motion.div key="out" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-6 px-6 text-center w-full">
                  <div className={`voice-disc ${speaking ? 'spinning' : ''}`}><span className="hole" /></div>
                  <div className="uv-waveform">
                    {Array.from({ length: 28 }, (_, i) => (
                      <span key={i} style={{ '--wf-delay': `${i * 0.06}s`, '--wf-h': `${8 + ((i * 11) % 24)}px`, animationPlayState: speaking ? 'running' : 'paused' }} />
                    ))}
                  </div>
                  <p className="text-[12px] text-snow/60 max-w-md">
                    {output.audioUrl ? 'Narration is ready — press play.' : 'Studio voices are busy, so your browser speaks it live.'}
                  </p>
                </motion.div>
              )}
              {phase === 'idle' && !error && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
                  <div className="mx-auto mb-3 w-11 h-11 grid place-items-center rounded-full" style={{ background: `${TONES.violet}1c`, border: `1px solid ${TONES.violet}45`, color: TONES.violet }}>
                    <Mic size={18} />
                  </div>
                  <p className="text-[12.5px] text-snow/60">The booth is silent. Generate to give the verdict a voice.</p>
                </motion.div>
              )}
              {error && (
                <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6 max-w-md space-y-3">
                  <p className="text-[12.5px]" style={{ color: TONES.down }}>{error}</p>
                  <button onClick={generate} className="cv-chip"><RefreshCw size={12} /> Retry synthesis</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {phase === 'done' && output && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={() => togglePlay(output)} className="cv-btn !py-2">
                {speaking ? <Pause size={13} /> : <Play size={13} />} {speaking ? 'Stop' : 'Play narration'}
              </button>
              {output.audioUrl && (
                <button onClick={() => downloadDataUrl(output.audioUrl, `verdict-${output.symbol.toLowerCase()}-voice.${output.format || 'mp3'}`)} className="cv-chip">
                  <Download size={12} /> Download .{output.format || 'mp3'}
                </button>
              )}
              <button onClick={generate} className="cv-chip"><RefreshCw size={12} /> Regenerate</button>
              <span className="ml-auto cv-label" style={output.audioUrl ? { color: TONES.up } : { color: TONES.amber }}>{providerLabel}</span>
            </div>
          )}
        </PanelV2>
      </div>

      {/* the spoken words — real output, visible */}
      <PanelV2 icon={Sparkles} title={<span>Narration <span className="cv-label ml-2">SPOKEN WORD FOR WORD</span></span>}>
        {loadState === 'loading' && <div className="cv-ghost h-[96px]" />}
        {loadState === 'ready' && script && (
          <p className="text-[12.5px] leading-relaxed text-snow/80 max-h-64 overflow-y-auto pr-2 whitespace-pre-wrap">{script.script}</p>
        )}
        {loadState === 'error' && <p className="text-[12px] text-snow/50">Waiting on the writer…</p>}
      </PanelV2>
    </div>
  )
}
