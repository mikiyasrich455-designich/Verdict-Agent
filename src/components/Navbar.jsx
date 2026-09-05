import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, X, ArrowRight } from 'lucide-react'
import Logo from './Logo'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/verdict', label: 'Verdict' },
  { to: '/dashboard', label: 'Dashboard' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  const linkClass = ({ isActive }) =>
    `px-4 py-1.5 rounded-full text-[15px] font-medium ${isActive ? 'nav-active' : 'nav-link'}`

  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-4 md:top-6 inset-x-0 z-50 flex justify-center px-4"
    >
      <div className="nav-glass relative w-full max-w-[700px] h-14 rounded-full flex items-center justify-between pl-5 pr-2.5">
        {/* Logo — left */}
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={24} />
          <span className="text-[15px] font-semibold tracking-tight text-[#EAF2FF]">
            verdict<span className="text-[#4E8BFF] align-super text-[11px]">*</span>
          </span>
        </Link>

        {/* Navigation — center */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1">
          {LINKS.map((l, i) => (
            <motion.div
              key={l.to}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.07, duration: 0.4, ease: 'easeOut' }}
            >
              <NavLink to={l.to} end={l.end} className={linkClass}>
                {l.label}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        {/* Live + CTA — right */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
        >
          <Link
            to="/verdict"
            className="nav-cta hidden md:inline-flex items-center gap-2 px-5 h-9 rounded-full text-[14px] font-semibold text-white"
          >
            Get a Verdict
            <ArrowRight size={15} />
          </Link>
        </motion.div>

        {/* Mobile toggle */}
        <button
          className="md:hidden nav-link p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden nav-glass absolute top-[72px] left-4 right-4 rounded-3xl p-4 space-y-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block w-full text-left px-4 py-2.5 rounded-full text-[15px] font-medium ${
                  isActive ? 'nav-active' : 'nav-link'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <div className="pt-3">
            <Link
              to="/verdict"
              onClick={() => setOpen(false)}
              className="nav-cta flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-full text-[14px] font-semibold text-white"
            >
              Get a Verdict
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </motion.header>
  )
}
