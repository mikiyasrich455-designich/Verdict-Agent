// Ambient page background.
// Defaults to the console artwork, then tints it with the active token's own
// banner/logo so the UI picks up the asset the user is looking at. The token art
// is deliberately a *tint*, never a replacement: it fades in at low opacity over
// the base artwork and the veil on top stays translucent, so the page can never
// collapse into a flat black screen mid-analysis.
import { useEffect, useState } from 'react'
import { getActiveToken, TOKEN_EVENT } from '../lib/activeToken'

const BASE_URL =
  'https://res.cloudinary.com/dguexkgjw/image/upload/v1788446321/ChatGPT_Image_Sep_3_2026_07_29_26_AM_pw7tle.png'

// Only ever paint an art layer we have actually seen load. A 403/expired CDN link
// would otherwise add a broken-image layer plus its dark veil.
function UsableArt({ url, children }) {
  const [ok, setOk] = useState(null)

  useEffect(() => {
    setOk(null)
    if (!url || !/^https?:\/\//i.test(url)) {
      setOk(false)
      return
    }
    let alive = true
    const img = new Image()
    img.onload = () => alive && setOk(true)
    img.onerror = () => alive && setOk(false)
    img.src = url
    return () => {
      alive = false
    }
  }, [url])

  if (!ok) return null
  return children(url)
}

export default function GlobalBackground() {
  const [token, setToken] = useState(() => getActiveToken())

  useEffect(() => {
    const sync = (e) => setToken(e.detail || getActiveToken())
    window.addEventListener(TOKEN_EVENT, sync)
    return () => window.removeEventListener(TOKEN_EVENT, sync)
  }, [])

  const banner = token?.banner || ''
  const logo = token?.logo || ''

  return (
    <div aria-hidden="true" className="fixed inset-0 w-full h-full z-0 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${BASE_URL})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      />
      {banner ? (
        <UsableArt url={banner}>
          {(u) => (
            <div
              className="absolute inset-0 opacity-20 transition-opacity duration-700"
              style={{
                backgroundImage: `url(${u})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
                filter: 'blur(3px) saturate(1.15)',
              }}
            />
          )}
        </UsableArt>
      ) : (
        <UsableArt url={logo}>
          {(u) => (
            <div
              className="absolute inset-0 opacity-10 transition-opacity duration-700"
              style={{
                backgroundImage: `url(${u})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: '460px',
                backgroundPosition: 'center top',
                filter: 'blur(70px) saturate(1.5)',
              }}
            />
          )}
        </UsableArt>
      )}
      {/* Readability veil: strongest at the top where the content starts, but it
          never reaches full opacity, so the base art always stays visible. */}
      <div className="absolute inset-0 bg-gradient-to-b from-night/70 via-night/55 to-night/75" />
    </div>
  )
}
