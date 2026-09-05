// Middleware: if a route receives a contract address in { symbol }, resolve it
// live (DexScreener) and swap in the real ticker before RYO/Grok are called.
// RYO's analyze_token only accepts symbols, so CA support is added here once.
import { resolveToken, looksLikeContractAddress } from './tokenResolver.js'

export async function resolveCaInBody(req, res, next) {
  try {
    const sym = String(req.body?.symbol || '').trim()
    if (sym && looksLikeContractAddress(sym)) {
      const r = await resolveToken(sym)
      req.body.symbol = r.symbol
      req.body.ca = sym
      if (r.chain) req.body.chain = r.chain
    }
    next()
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
}
