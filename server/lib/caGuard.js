// Identity guard — runs in front of every RYO route.
//
// RYO's tools only accept tickers, and a ticker is not an identity: "ACE" is both
// Fusionist (Ethereum, $19M cap) and Ace Data Cloud (Solana, $24K cap). So before any
// handler runs we resolve whatever the client sent through the live resolver and attach
// the canonical profile to req.tokenIdentity. The body is then normalised to
// { symbol, ca, chain } — the contract address is never thrown away again.
//
// Rules:
//   • a contract address anywhere in the input IS the identity (hard requirement)
//   • a bare ticker resolves live too, but a resolution failure is fail-soft
//   • req.tokenIdentity feeds the live overlay in normalizers.applyLiveData()
import { resolveToken, extractContractAddress } from './tokenResolver.js'

function firstAddress(...values) {
  for (const v of values) {
    const addr = extractContractAddress(v)
    if (addr) return addr
  }
  return null
}

// A pasted address can arrive in `ca`, embedded in `symbol`, or as an explorer URL.
function identityInput(body) {
  const pasted = firstAddress(body?.ca, body?.symbol, body?.q)
  if (pasted) return { input: pasted, fromCA: true }
  const plain = String(body?.symbol || body?.q || '').trim()
  return plain ? { input: plain, fromCA: false } : null
}

export async function resolveCaInBody(req, res, next) {
  const target = identityInput(req.body)
  if (!target) return next()

  try {
    const live = await resolveToken(target.input)
    req.tokenIdentity = live
    req.body = {
      ...req.body,
      symbol: live.symbol,
      name: live.name,
      ca: live.ca || null,
      chain: live.chain || null,
    }
    next()
  } catch (err) {
    // A contract address that resolves to nothing is a real error — answering with a
    // same-ticker lookalike would be worse than failing.
    if (target.fromCA) return res.status(404).json({ error: err.message })
    next()
  }
}

// Compare-style batch input: { symbols: ["ACE", "0x…", "WIF"] }
export async function resolveCaInList(req, res, next) {
  const list = req.body?.symbols
  if (!Array.isArray(list) || !list.length) return next()

  try {
    const resolved = await Promise.all(
      list.slice(0, 4).map(async (raw) => {
        const item = String(raw || '').trim()
        const addr = firstAddress(item)
        try {
          const live = await resolveToken(addr || item)
          return { requested: item, live, symbol: live.symbol, ca: live.ca || null, chain: live.chain || null }
        } catch (err) {
          if (addr) throw err
          return { requested: item, symbol: item, live: null }
        }
      })
    )
    req.tokenIdentities = resolved
    req.body = { ...req.body, symbols: resolved.map((r) => r.symbol) }
    next()
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
}
