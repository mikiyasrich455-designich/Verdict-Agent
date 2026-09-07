# Verdict Agent

**Live crypto token forensics, decided by an agent council — not by hype.**
Drop in a ticker or contract address and Verdict Agent assembles real-time market, on-chain, news and social evidence, runs adversarial bull/bear reasoning over it, and issues a single defensible verdict with risk sizing and shareable media.

- **Live demo:** https://verdict-agent-p1mj.onrender.com
- **Demo video:** _(link added at submission — see `APPLICATION_FORM` commit)_
- **Stack:** React 18 + Vite · Express proxy · live third-party APIs only (zero mock data)

---

## Purpose

Retail crypto research is fragmented: price on one site, holders on another, sentiment on a third, and "analysis" usually means someone's thread. Verdict Agent compresses the whole research loop into one console where every number is fetched live, every claim is sourced, and every conclusion is the output of an explicit, auditable reasoning pipeline. The product never tells you what to do — it shows the evidence, the debate, and the confidence, and ends every screen with **DYOR**.

## Key Features

| Agent / Page | What it does |
|---|---|
| **Market Overview** | Regime, breadth, fear & greed, BTC dominance, top movers — the macro frame before any token call |
| **Token Analysis** | Full forensic profile: price, market cap, volume, holders, volatility, history, catalysts, risks |
| **Deep Analysis** | Five-pillar verdict engine (technical · market · risk · catalyst · sentiment) with reasoned signal |
| **Bull vs Bear (Council)** | Adversarial debate: a bull desk and a bear desk argue the same live evidence; a judge model rules and writes the verdict |
| **Sentiment Shift** | 7-day social/news sentiment drift with turning-point detection |
| **KOL Radar** | Real posts from real voices, swept live, each stamped with stance, impact and conviction; narrative convergence read |
| **Risk Desk** | If you were going to act: position sizing, invalidation stops, targets and conviction gates |
| **Final Verdict** | The signed receipt — one page that merges every agent into a single ruling with confidence |
| **Compare / Scout** | Side-by-side token comparison and momentum scanning |
| **Studios (Video · Image · Voice)** | Turn the live verdict into shareable media: motion clip, verdict card art, narrated brief |

Every loading state is a live progress readout (percentage loader while evidence is gathered, generation loader while media renders). No screen ever shows placeholder or invented data.

## How It Works

1. **Resolve** — the ticker/address is resolved to a canonical token identity (sticky-cached).
2. **Gather evidence** — the Express backend pulls live market structure (CoinMarketCap, GeckoTerminal, DexScreener, CoinGecko), news and web search (SERP), and social/KOL sweeps, each endpoint TTL-cached server-side to respect API credits.
3. **Reason** — separate LLM personas (bull desk, bear desk, judge, narrative analyst) run over the *same* evidence bundle with tool-grade prompts; prompts are never exposed in the UI.
4. **Rule** — the judge synthesizes a stance (`POSITIVE / NEUTRAL / CAUTION`) plus confidence and reasoning trace.
5. **Act & share** — Risk Desk converts the verdict into sizing guidance; Studios render it into video, card art or narration.
6. **Disclose** — every page carries the DYOR disclaimer; nothing is financial advice.

## Architecture

```
Frontend (React + Vite, deployed on Render)
        │  same-origin /api/proxy/*
        ▼
Backend (Express, deployed on Render)
   ├─ /ryo/*        evidence tool-calls      → RYO MCP API
   ├─ /synthesis/*  verdict & debate engine  → Qwen (DashScope) models
   ├─ /studio/*     media generation         → Qwen image/voice · AceDataCloud video/TTS
   └─ market lib    prices/on-chain          → CoinMarketCap · GeckoTerminal · DexScreener · CoinGecko
```

- **Keys never leave the server.** The frontend only talks to our own proxy; all vendor credentials are server-side environment variables (`RYO_MCP_KEY`, `QWEN_KEY`, `CMC_API_KEY`, `ACEDATA_KEY`, …). Nothing secret is committed — `.gitignore` blocks every env file.
- **Credit-conscious caching.** In-memory TTL cache (5–30 min per endpoint) means repeat opens are instant and vendor calls are not wasted.
- **Real data only.** If a source fails, the UI says so; it never substitutes fake numbers.

## Data Sources

| Service | Role |
|---|---|
| CoinMarketCap (pro API) | Primary market data: price, cap, volume, supply |
| GeckoTerminal / DexScreener / CoinGecko | On-chain pools, DEX pairs, token metadata & logos |
| RYO MCP API | Evidence tool-calls: analysis, sentiment, narrative, risk, scanning |
| Qwen (Alibaba DashScope) | Reasoning layer: bull/bear/judge personas, narrative, image & voice generation |
| AceDataCloud | Video generation and TTS fallback models |
| SERP (live web search) | News and KOL post discovery |

## Third-Party Libraries

React 18 (MIT) · Vite 5 (MIT) · Tailwind CSS (MIT) · Framer Motion (MIT) · Recharts (MIT) · Lucide React (ISC) · html-to-image (MIT) · Express (MIT) · Node.js (MIT)

## Local Development

```bash
npm install          # root (frontend) and server/
npm run dev:full     # frontend :3000 + backend :4000
```

Environment variables live in `server/.env` (gitignored) — names only:
`RYO_MCP_BASE`, `RYO_MCP_KEY`, `QWEN_KEY`, `CMC_API_KEY`, `ACEDATA_KEY`, plus optional model overrides (`QWEN_CHAT_MODEL`, `QWEN_IMAGE_MODEL`, `ACEDATA_VIDEO_MODEL`, …).

## Hackathon Submission

- **Track:** stated in the committed Application Form (see repository root).
- **Application Form:** downloaded from the organizer channel, completed, and committed to `main` as required.
- **Demo video:** uploaded to cloud storage; link (and password, if any) recorded in the Application Form.
- **Repository:** all final code, docs and required files are on the `main` branch of the provided repository.

## Security

- API keys are never committed (enforced by `.gitignore`); no secrets in git history.
- Backend proxy keeps every third-party credential server-side.
- Studio prompts and model routing are internal; the UI shows outputs, not plumbing.

## Disclaimer

Not financial advice. Crypto assets are volatile and can go to zero. Every screen says it and means it: **do your own research.**
