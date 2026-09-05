/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        night: '#020208',
        panel: '#0a0a16',
        panel2: '#10101f',
        line: 'rgba(255,255,255,0.08)',
        line2: 'rgba(255,255,255,0.14)',
        snow: '#f4f4f8',
        muted: '#8f8fa8',
        faint: '#5c5c75',
        accent: {
          DEFAULT: '#6467f2',
          soft: 'rgba(100,103,242,0.12)',
          ring: 'rgba(100,103,242,0.35)',
        },
        violet2: '#8b5cf6',
        glowblue: '#4f6bff',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px rgba(0,0,0,0.5)',
        lift: '0 0 0 1px rgba(255,255,255,0.1), 0 16px 50px rgba(0,0,0,0.6)',
        glow: '0 0 40px rgba(100,103,242,0.35)',
        glowsm: '0 0 18px rgba(100,103,242,0.3)',
      },
      animation: {
        'pulse-dot': 'pulseDot 1.2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'orbit-slow': 'spin 40s linear infinite',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.3, transform: 'scale(0.75)' },
        },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(16px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
