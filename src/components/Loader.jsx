import { Check, CircleDashed } from 'lucide-react'

// Equalizer-bar loader adapted from uiverse.io "ugly-bulldog-75"
// by satyamchaudharydev (MIT License). Styles live in index.css → .uv-bars
export default function Loader({ steps, activeStep = 0, label }) {
  return (
    <div className="max-w-sm mx-auto mt-14">
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex justify-center">
          <div className="uv-bars" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
        </div>
        {label && <div className="mt-4 text-center font-display font-bold text-snow text-sm">{label}</div>}
        <div className="mt-5 space-y-1.5">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                i === activeStep ? 'bg-white/[0.05] text-snow' : i < activeStep ? 'text-muted' : 'text-faint'
              }`}
            >
              {i < activeStep ? (
                <Check size={12} className="shrink-0 text-success" />
              ) : i === activeStep ? (
                <span className="w-3 h-3 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              ) : (
                <CircleDashed size={12} className="shrink-0 opacity-50" />
              )}
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
