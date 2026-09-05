// Data hook shared by every agent dashboard.
// Shows a YouTube-style skeleton while "switching dashboards",
// then resolves the simulated feed. Swap the fetcher for a real
// endpoint later without touching any page.
import { useEffect, useRef, useState } from 'react'

export function useAgentData(fetcher, deps = [], minDelay = 520) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setState((s) => ({ ...s, status: 'loading' }))
    const started = Date.now()

    Promise.resolve(fetcher())
      .then((data) => {
        const elapsed = Date.now() - started
        const rest = Math.max(0, minDelay - elapsed)
        setTimeout(() => {
          if (alive.current) setState({ status: 'ready', data, error: null })
        }, rest)
      })
      .catch((error) => {
        if (alive.current) setState({ status: 'error', data: null, error })
      })

    return () => {
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}

// Refresh trigger: bump the key to re-run the feed (used by Run/Refresh buttons)
export function useRunKey() {
  const [runKey, setRunKey] = useState(0)
  return [runKey, () => setRunKey((k) => k + 1)]
}
