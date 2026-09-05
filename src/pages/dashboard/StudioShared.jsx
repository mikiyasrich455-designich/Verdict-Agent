// Shared studio machinery — per-media generation history (localStorage),
// download helper, history strip and the token gate used by all three
// studio skills (Image / Video / Voice).
import { useCallback, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'

const HISTORY_KEY = 'verdict_studio_history'

export function loadStudioHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

// Hook: history for one media kind (image | video | voice).
export function useStudioHistory(kind) {
  const [items, setItems] = useState(() => loadStudioHistory().filter((x) => x.kind === kind))

  const push = useCallback(
    (entry) => {
      const all = loadStudioHistory()
      const next = [{ ...entry, kind, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() }, ...all].slice(0, 18)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      setItems(next.filter((x) => x.kind === kind))
    },
    [kind]
  )

  const clear = useCallback(() => {
    const all = loadStudioHistory().filter((x) => x.kind !== kind)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all))
    setItems([])
  }, [kind])

  return { items, push, clear }
}

export function downloadDataUrl(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// History strip rendered under each studio output.
export function StudioHistoryStrip({ items, onPick, activeId, renderThumb }) {
  if (!items.length) return null
  return (
    <div className="glass-panel mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted">
          History · {items.length}
        </h3>
      </div>
      <div className="film-strip">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it)}
            className={`frame ${activeId === it.id ? 'on' : ''}`}
            style={renderThumb(it)}
            title={`${it.symbol} · ${new Date(it.at).toLocaleString()}`}
          />
        ))}
      </div>
    </div>
  )
}

export function DownloadBtn({ onClick, label = 'Download' }) {
  return (
    <button onClick={onClick} className="glass-btn">
      <Download size={13} /> {label}
    </button>
  )
}

export function ClearHistoryBtn({ onClick }) {
  return (
    <button onClick={onClick} className="glass-chip !text-danger">
      <Trash2 size={11} /> Clear
    </button>
  )
}
