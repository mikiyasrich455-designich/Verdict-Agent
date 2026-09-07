// PercentLoader — the agent opening state: the book loader plus a live
// percentage and progress bar. The number eases toward 92% on a time
// curve (fast start, long tail) so it never promises "done" before the
// real API sweep lands; the page swaps in the moment data arrives.
import { useEffect, useState } from 'react'
import BookLoader from './BookLoader'

export default function PercentLoader({ label = 'Live analysis running' }) {
  const [pct, setPct] = useState(2)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => {
      const t = (Date.now() - started) / 1000
      const target = 92 * (1 - Math.exp(-t / 9))
      setPct((p) => Math.min(92, Math.max(p, Math.round(target))))
    }, 160)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pct-wrap">
      <BookLoader />
      <div className="pct-num">
        {pct}
        <span className="pct-sign">%</span>
      </div>
      <div className="pct-bar">
        <div className="pct-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="pct-label">{label}</p>
    </div>
  )
}
