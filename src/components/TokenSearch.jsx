import { useState, useRef } from 'react'
import { motion } from 'framer-motion'

const POPULAR_TOKENS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'MATIC']

// Real token logos from CoinGecko CDN
const TOKEN_LOGOS = {
  SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  TON: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png',
}

export default function TokenSearch({ placeholder = 'Enter a token symbol, name or contract address…', onSubmit }) {
  const [value, setValue] = useState('')
  const taRef = useRef(null)

  const submit = (symbol) => {
    const s = (symbol || value).trim()
    if (!s) return
    setValue('')
    if (taRef.current) taRef.current.style.height = 'auto'
    onSubmit(s)
  }

  const handleInput = (e) => {
    setValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="chat-input-wrap">
        <div className="chat-input-shell">
          <div className="chat-input-inner">
            <textarea
              ref={taRef}
              value={value}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={placeholder}
              aria-label="Token symbol, name or contract address"
              rows={1}
            />
            <div className="chat-input-row">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-faint pl-1">
                any chain · resolved live
              </span>
              <button
                className="send-btn"
                onClick={() => submit()}
                aria-label="Analyze token"
              >
                <i>
                  <svg viewBox="0 0 512 512" width="18" height="18">
                    <path
                      fill="currentColor"
                      d="M473 39.05a24 24 0 0 0-25.5-5.46L47.47 185h-.08a24 24 0 0 0 1 45.16l.41.13l137.3 58.63a16 16 0 0 0 15.54-3.59L422 80a7.07 7.07 0 0 1 10 10L226.66 310.26a16 16 0 0 0-3.59 15.54l58.65 137.38c.06.2.12.38.19.57c3.2 9.27 11.3 15.81 21.09 16.25h1a24.63 24.63 0 0 0 23-15.46L478.39 64.62A24 24 0 0 0 473 39.05"
                    />
                  </svg>
                </i>
              </button>
            </div>
          </div>
        </div>

        {/* Token logo circles */}
        <div className="chat-tags" style={{ gap: '10px', padding: '14px 0 0' }}>
          {POPULAR_TOKENS.slice(0, 8).map((t, i) => (
            <motion.button
              key={t}
              className="token-logo-btn"
              style={{ '--glow-delay': `${i * 0.3}s` }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => submit(t)}
              title={t}
            >
              <img
                src={TOKEN_LOGOS[t]}
                alt={t}
                loading="lazy"
              />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
