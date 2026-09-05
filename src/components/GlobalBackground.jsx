const BG_URL =
  'https://res.cloudinary.com/dguexkgjw/image/upload/v1788446321/ChatGPT_Image_Sep_3_2026_07_29_26_AM_pw7tle.png'

export default function GlobalBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 w-full h-full z-0 pointer-events-none"
      style={{
        backgroundImage: `url(${BG_URL})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
      }}
    />
  )
}
