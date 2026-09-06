# Verdict Agent Console

AI-powered crypto token analysis platform. Drop a ticker or contract address and get a full forensic profile with multi-agent analysis.

## What It Does

- **Token Analysis** — Full profile: price, market cap, volume, holders, volatility, price history, catalysts, risks, sentiment
- **Deep Analysis** — Five-pillar verdict engine (technical, market, risk, catalyst, sentiment) with BUY/HOLD/AVOID signal
- **Compare** — Side-by-side token comparison up to 4 tokens
- **Market Overview** — Market regime, fear & greed index, BTC dominance, top movers
- **Sentiment Shift** — 7-day sentiment drift tracking
- **KOL Radar** — Multi-KOL narrative spotlight with stance convergence
- **Scout** — Token scanner with momentum filtering
- **Risk Desk** — Position sizing, stops, targets, and conviction gates
- **Council** — Bull vs Bear adversarial debate with judge ruling
- **Voice Studio** — Verdict narration with browser TTS
- **Image/Video Studio** — AI-generated verdict cards and motion graphics

## Data Sources

All data is **live and real-time** from the following third-party APIs:

| Service | Purpose | Disclosure |
|---------|---------|------------|
| [RYO MCP API](https://app-ryochan.com) | Token analysis, market data, sentiment, scanning, comparison, narrative, risk | Primary data source. All prices, market caps, volumes, sentiment scores, catalysts, and risks come directly from RYO's real-time API endpoints. |
| [Qwen (Alibaba Cloud)](https://qwen.ai) | Verdict synthesis, debate, narrative, image generation, video generation | AI layer. Qwen-flash reasoning + live web search, qwen-image, wanx video. Produces verdicts, debate transcripts, narratives, verdict cards and motion graphics. |
| [CoinGecko](https://coingecko.com) | Token logos | CDN-hosted token icons. |

**No mock, fake, or simulated data is presented as real.** All financial data (prices, market caps, volumes, sentiment) is fetched from live API endpoints. The only local data stored is user receipt history in `localStorage`.

## Third-Party Libraries

| Library | Purpose | License |
|---------|---------|---------|
| [React 18](https://react.dev) | UI framework | MIT |
| [Vite 5](https://vitejs.dev) | Build tool | MIT |
| [Tailwind CSS](https://tailwindcss.com) | Styling | MIT |
| [Framer Motion](https://framer.com/motion) | Animations | MIT |
| [Recharts](https://recharts.org) | Charts | MIT |
| [Lucide React](https://lucide.dev) | Icons | ISC |
| [html-to-image](https://github.com/gre/refined-gpu) | Receipt PNG export | MIT |
| [Express](https://expressjs.com) | Backend proxy server | MIT |
| [Node.js](https://nodejs.org) | Runtime | MIT |

## Architecture

```
Frontend (Vite + React)          Backend (Express)
┌─────────────────────┐          ┌──────────────────────┐
│  Dashboard Pages    │  /api/   │  Proxy Server        │
│  - Token Analysis   │ ──────►  │  - /ryo/*            │
│  - Deep Analysis    │          │  - /studio/*         │
│  - Compare          │          │  - /synthesis/*      │
│  - Market Overview  │          └──────────┬───────────┘
│  - Scout            │                     │
│  - KOL Radar        │                     ▼
│  - Risk Desk        │          ┌──────────────────────┐
│  - Council          │          │  RYO MCP API         │
│  - Sentiment Shift  │          │  (live crypto data)  │
│  - Voice Studio     │          └──────────────────────┘
│  - Image/Video      │
└─────────────────────┘
```

The Express backend acts as a proxy to keep API keys secure. The frontend never touches API keys directly.

## Local Development

```bash
# Install dependencies
npm install

# Start both frontend and backend
npm run dev:full

# Frontend: http://localhost:3000
# Backend:  http://localhost:4000
```

Environment variables go in `server/.env`:
- `RYO_MCP_BASE` — RYO API base URL
- `RYO_MCP_KEY` — RYO API key
- `QWEN_KEY` — Qwen (DashScope intl) pay-as-you-go API key
- `QWEN_CHAT_MODEL` — optional (default `qwen-flash`)
- `QWEN_IMAGE_MODEL` — optional (default `qwen-image-2.0`)
- `QWEN_VIDEO_MODEL` — optional (default `wanx2.1-t2v-turbo`)

## Deployment

Deployed on [Vercel](https://vercel.com). Backend API keys are configured as Vercel environment variables.

## Security

- API keys are **never committed** to the repository (blocked by `.gitignore`)
- Backend proxy keeps all third-party credentials server-side
- No secrets in git history

## Disclaimer

This is not financial advice. Crypto assets are volatile and risky. Always do your own research.
