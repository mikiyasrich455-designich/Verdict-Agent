// Ambient page background.
// Defaults to the console artwork, then cross-fades to the active token's own
// banner/logo (GeckoTerminal / DexScreener) so the whole UI takes on the asset
// the user is actually looking at.
import { useEffect, useState } from 'react'
import { getActiveToken, TOKEN_EVENT } from '../lib/activeToken'

const BASE_URL =
  'https://res.cloudinary.com/dguexkgjw/image/upload/v1788446321/ChatGPT_Image_Sep_3_2026_07_29_26_AM_pw7tle.png'

export default function GlobalBackground() {
  const [token, setToken] = useState(() => getActiveToken())

  useEffect(() => {
    const sync = (e) => setToken(e.detail || getActiveToken())
    window.addEventListener(TOKEN_EVENT, sync)
    return () => window.removeEventListener(TOKEN_EVENT, sync)
  }, [])

  const art = token?.banner || token?.logo || ''

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
      {art && (
        <>
          <div
            className="absolute inset-0 opacity-30 transition-opacity duration-700"
            style={{
              backgroundImage: `url(${art})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: token?.banner ? 'cover' : '480px',
              backgroundPosition: 'center top',
              filter: token?.banner ? 'blur(2px) saturate(1.2)' : 'blur(60px) saturate(1.6)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-night/40 via-night/85 to-night" />
        </>
      )}
    </div>
  )
}
