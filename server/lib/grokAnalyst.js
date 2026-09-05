// Grok AI Analyst — uses AceData Grok to analyze RYO data and produce expert verdicts
// Replaces mechanical scoring with real AI reasoning

import fetch from 'node-fetch'

const GROK_MODEL = 'grok-4'

async function callGrok(messages, maxTokens = 1500) {
  const url = `${process.env.ACEDATA_BASE}/v1/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ACEDATA_KEY}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Grok failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

// Build the analyst prompt from RYO data
function buildAnalystPrompt(ryoData) {
  const asset = ryoData.asset || {}
  const market = ryoData.market || {}
  const perf = ryoData.performance || {}
  const tech = ryoData.technical_analysis || {}
  const intel = ryoData.intelligence || {}

  return `You are an expert crypto analyst. Analyze this data and provide a verdict with bull/bear scores.

ASSET: ${asset.symbol || 'Unknown'} (${asset.name || ''})
PRICE: $${market.price_usd || 0}
24H CHANGE: ${perf.change_24h_pct || 0}%
7D CHANGE: ${perf.change_7d_pct || 0}%
30D MOMENTUM: ${perf.momentum_30d_pct || 0}%
MARKET CAP: $${(market.market_cap_usd / 1e6).toFixed(1)}M
24H VOLUME: $${(market.volume_24h_usd / 1e6).toFixed(1)}M

TECHNICALS:
- RSI(14): ${tech.rsi_14 || 'N/A'}
- ATR(14): ${tech.atr_14_pct || 'N/A'}%
- TREND: ${tech.trend || 'N/A'}

CATALYSTS: ${(intel.catalysts || []).map(c => typeof c === 'string' ? c : c.title || c.event).join('; ') || 'None detected'}

RISKS: ${(intel.risks || []).map(r => typeof r === 'string' ? r : r.title || r.description).join('; ') || 'None detected'}

NARRATIVE: ${intel.narrative || 'Developing'}

Provide your analysis in this exact JSON format:
{
  "bullScore": <0-100>,
  "bearScore": <0-100>,
  "verdict": "BUY" | "HOLD" | "AVOID",
  "confidence": <0-100>,
  "summary": "<2-3 sentences in plain English>",
  "bullReasons": ["<reason1>", "<reason2>", "<reason3>"],
  "bearReasons": ["<reason1>", "<reason2>", "<reason3>"],
  "technicalScore": <0-100>,
  "marketScore": <0-100>,
  "riskScore": <0-100>,
  "catalystScore": <0-100>,
  "sentimentScore": <0-100>
}

Rules:
- bullScore + bearScore should roughly equal 100 (allow ±10)
- verdict must match the scores (BUY if bull>bear+15, AVOID if bear>bull+15, else HOLD)
- confidence should reflect how strong the conviction is
- summary must be plain English, no jargon
- scores should be realistic based on the data`
}

// Main analyst function
export async function analyzeWithGrok(ryoData) {
  try {
    const prompt = buildAnalystPrompt(ryoData)
    const response = await callGrok([
      { role: 'system', content: 'You are an expert crypto analyst. Always respond with valid JSON.' },
      { role: 'user', content: prompt },
    ])

    // Parse JSON from response (Grok might wrap it in markdown)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Grok response did not contain valid JSON')
    }

    const analysis = JSON.parse(jsonMatch[0])

    // Validate and clamp scores
    return {
      bullScore: Math.max(0, Math.min(100, analysis.bullScore || 50)),
      bearScore: Math.max(0, Math.min(100, analysis.bearScore || 50)),
      verdict: ['BUY', 'HOLD', 'AVOID'].includes(analysis.verdict) ? analysis.verdict : 'HOLD',
      confidence: Math.max(0, Math.min(100, analysis.confidence || 50)),
      summary: analysis.summary || 'Analysis complete.',
      bullReasons: Array.isArray(analysis.bullReasons) ? analysis.bullReasons.slice(0, 5) : [],
      bearReasons: Array.isArray(analysis.bearReasons) ? analysis.bearReasons.slice(0, 5) : [],
      scores: {
        technical: { score: Math.max(0, Math.min(100, analysis.technicalScore || 50)), reasoning: '' },
        market: { score: Math.max(0, Math.min(100, analysis.marketScore || 50)), reasoning: '' },
        risk: { score: Math.max(0, Math.min(100, analysis.riskScore || 50)), reasoning: '' },
        catalyst: { score: Math.max(0, Math.min(100, analysis.catalystScore || 50)), reasoning: '' },
        sentiment: { score: Math.max(0, Math.min(100, analysis.sentimentScore || 50)), reasoning: '' },
      },
    }
  } catch (err) {
    console.error('[GROK ERROR]', err)
    throw err
  }
}
