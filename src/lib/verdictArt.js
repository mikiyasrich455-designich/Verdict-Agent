// SVG art generator for shareable verdict cards (fallback if Flux fails)
export function verdictArt(verdict, symbol, kind) {
  const palettes = {
    BUY: ['#5b93ff', '#34d399', '#0ea5e9'],
    HOLD: ['#5b93ff', '#a78bfa', '#64748b'],
    AVOID: ['#f87171', '#5b93ff', '#334155'],
  }
  const [a, b, c] = palettes[verdict] || palettes.HOLD
  const icon = verdict === 'BUY' ? '▲' : verdict === 'AVOID' ? '▼' : '◆'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#020208"/><stop offset="1" stop-color="#0b1024"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.35" r="0.75">
        <stop offset="0" stop-color="${a}" stop-opacity="0.45"/><stop offset="1" stop-color="${a}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#bg)"/>
    <rect width="800" height="450" fill="url(#glow)"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="${60 + i * 50}" y="${280 + ((i * 37) % 90)}" width="18" height="${60 + ((i * 53) % 110)}" rx="4" fill="${i % 3 ? c : a}" opacity="0.${28 + ((i * 7) % 40)}"/>`).join('')}
    <circle cx="400" cy="180" r="86" fill="none" stroke="url(#ring)" stroke-width="3" opacity="0.9"/>
    <circle cx="400" cy="180" r="70" fill="#05070f" stroke="${b}" stroke-width="1" opacity="0.8"/>
    <text x="400" y="205" font-family="Arial" font-size="64" fill="${b}" text-anchor="middle" font-weight="bold">${icon}</text>
    <text x="400" y="330" font-family="Arial" font-size="42" fill="#eef2ff" text-anchor="middle" font-weight="bold" letter-spacing="6">${symbol}</text>
    <text x="400" y="372" font-family="Arial" font-size="24" fill="${b}" text-anchor="middle" letter-spacing="10">${verdict}${kind === 'video' ? ' · VERDICT STUDIO' : ''}</text>
    <text x="400" y="416" font-family="Arial" font-size="13" fill="#94a3b8" text-anchor="middle" letter-spacing="3">AI-GENERATED VISUAL · NOT FINANCIAL ADVICE</text>
  </svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
