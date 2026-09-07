// DyorNote — the standing reminder that sits under every research output.
// Muted, compact, no icons: this is a disclaimer, not a feature.
import { DYOR_TEXT, DYOR_SHORT } from '../lib/stance'

export default function DyorNote({ short = false, className = '' }) {
  return (
    <aside className={`cv-dyor ${className}`.trim()}>
      <span className="cv-dyor-tag">DYOR</span>
      <p className="cv-dyor-text">{short ? DYOR_SHORT : DYOR_TEXT}</p>
    </aside>
  )
}
