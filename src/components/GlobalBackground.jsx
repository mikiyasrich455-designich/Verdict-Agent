// Ambient page background.
// Console artwork only. Token banners/logos are NEVER painted here — meme-coin
// art bleeding through the whole UI (landing included) read as noise, so the
// ambient layer stays brand-only and the token's own art lives solely inside
// the analysis cards that describe it.
const BASE_URL =
  'https://res.cloudinary.com/dguexkgjw/image/upload/v1788446321/ChatGPT_Image_Sep_3_2026_07_29_26_AM_pw7tle.png'

export default function GlobalBackground() {
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
      {/* Readability veil: strongest at the top where the content starts, but it
          never reaches full opacity, so the base art always stays visible. */}
      <div className="absolute inset-0 bg-gradient-to-b from-night/70 via-night/55 to-night/75" />
    </div>
  )
}
