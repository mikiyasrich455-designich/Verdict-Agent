// Data hook shared by every agent dashboard.
// Shows a YouTube-style skeleton while "switching dashboards",
// then resolves the live feed the instant it arrives — no artificial
// delay. Repeat visits are served from the client cache in lib/api.js.
import { useEffect, useRef, useState } from 'react'

export function useAgentData(fetcher, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setState((s) => ({ ...s, status: 'loading' }))

    Promise.resolve(fetcher())
      .then((data) => {
        if (alive.current) setState({ status: 'ready', data, error: null })
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
