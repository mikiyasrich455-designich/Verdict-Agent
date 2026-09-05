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

export default function TokenSearch({ placeholder = 'Enter a token symbol or contract address…', onSubmit }) {
  const [value, setValue] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [uploadFeedback, setUploadFeedback] = useState(null)
  const taRef = useRef(null)
  const fileInputRef = useRef(null)

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

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Mock: show analyzing state
    setAnalyzing(true)
    setUploadFeedback({ type: 'scanning', text: 'Scanning image for token...' })

    // Simulate AI recognition delay
    setTimeout(() => {
      // Pick a random token as "recognized"
      const randomToken = POPULAR_TOKENS[Math.floor(Math.random() * POPULAR_TOKENS.length)]
      setAnalyzing(false)
      setUploadFeedback({ type: 'found', text: `Detected: ${randomToken}` })

      // Auto-submit after brief delay
      setTimeout(() => {
        submit(randomToken)
        setUploadFeedback(null)
      }, 800)
    }, 1500)

    // Reset file input
    e.target.value = ''
  }

  const triggerImageUpload = () => {
    if (analyzing) return
    fileInputRef.current?.click()
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
              aria-label="Token symbol or contract address"
              rows={1}
            />
            <div className="chat-input-row">
              <div className="icon-btns">
                {/* Image upload button */}
                <button
                  className={analyzing ? 'analyzing' : ''}
                  onClick={triggerImageUpload}
                  aria-label="Upload image"
                  title="Upload image to detect token"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 8v8a5 5 0 1 0 10 0V6.5a3.5 3.5 0 1 0-7 0V15a2 2 0 0 0 4 0V8"
                    />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />

                {/* Network / Grid icon */}
                <button aria-label="Network" title="Network">
                  <svg viewBox="0 0 24 24" height="18" width="18" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm0 10a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zm0-8h6m-3-3v6"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                    />
                  </svg>
                </button>
              </div>
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

        {/* Image upload feedback */}
        {uploadFeedback && (
          <div className="image-upload-feedback">
            <div className="scan-line" />
            <span>{uploadFeedback.text}</span>
          </div>
        )}

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
