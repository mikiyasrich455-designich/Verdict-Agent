import { Link } from 'react-router-dom'
import Logo from './Logo'

const columns = [
  {
    title: 'Product',
    items: [
      { label: 'Quick Verdict', to: '/verdict' },
      { label: 'The Council', to: '/dashboard/council' },
      { label: 'Dashboard', to: '/dashboard' },
    ],
  },
  {
    title: 'Research Layer',
    items: [
      { label: 'Token Analysis', to: '/verdict' },
      { label: 'Deep Analysis', to: '/verdict' },
      { label: 'Market Scan', to: '/dashboard' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'About', to: '/' },
      { label: 'Hackathon', to: '/' },
      { label: 'Contact', to: '/' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden">
      <div className="border-t border-line bg-black/10 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-10">
            <div>
              <div className="flex items-center gap-2.5">
                <Logo size={28} />
                <span className="text-[17px] font-bold tracking-tight text-snow">
                  verdict<span className="text-accent">*</span>
                </span>
              </div>
              <p className="mt-4 text-sm text-muted leading-relaxed max-w-xs">
                Your token research layer for agentic SocialFi. Evidence in, verdicts out.
              </p>
              <div className="mt-6 flex gap-2">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 max-w-[200px] bg-white/5 border border-line rounded-md px-3 py-2 text-xs text-snow placeholder-faint outline-none focus:border-accent-ring"
                />
                <button className="btn-ghost px-4 py-2 text-xs">Subscribe</button>
              </div>
            </div>

            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="text-[11px] font-mono uppercase tracking-[0.2em] text-faint mb-4">
                  {col.title}
                </h4>
                <ul className="space-y-2.5">
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <Link to={item.to} className="text-sm text-muted hover:text-snow transition-colors">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-faint font-mono">
              Built for the RYO-CHAN Hackathon 2026
            </span>
            <span className="text-xs text-faint">Not financial advice. © 2026 VERDICT</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
