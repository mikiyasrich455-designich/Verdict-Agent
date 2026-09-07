import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Menu, X, ArrowRight } from 'lucide-react'
import Logo from './Logo'

// The five landing sections, in scroll order. Each one jumps the visitor
// straight to that part of the homepage — no separate pages.
const SECTIONS = [
  { id: 'how', label: 'How It Works' },
  { id: 'discipline', label: 'The Filter' },
  { id: 'live', label: 'Live Ops' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'start', label: 'Get Started' },
]

function scrollToSection(id) {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Landing on /#workflow (or a reload with a hash) still scrolls to the section.
  useEffect(() => {
    const id = location.hash.replace('#', '')
    if (!id || location.pathname !== '/') return
    const t = setTimeout(() => scrollToSection(id), 120)
    return () => clearTimeout(t)
  }, [location.hash, location.pathname])

  const goTo = (id) => (e) => {
    e.preventDefault()
    setOpen(false)
    if (location.pathname === '/') {
      scrollToSection(id)
    } else {
      navigate('/')
      // Give the landing page a beat to mount before we look for the section.
      setTimeout(() => scrollToSection(id), 260)
    }
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-3 md:top-6 inset-x-0 z-50 flex justify-center px-3"
    >
      <div className="nav-glass relative w-full max-w-[1020px] h-14 rounded-full flex items-center justify-between pl-4 pr-2.5">
        {/* Logo — left */}
        <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
          <Logo size={24} />
          <span className="text-[15px] font-semibold tracking-tight text-[#EAF2FF]">
            verdict<span className="text-[#4E8BFF] align-super text-[11px]">*</span>
          </span>
        </Link>

        {/* Sections — center */}
        <nav className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center gap-0.5">
          {SECTIONS.map((s, i) => (
            <motion.a
              key={s.id}
              href={`#${s.id}`}
              onClick={goTo(s.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.06, duration: 0.4, ease: 'easeOut' }}
              className="nav-link px-3 py-1.5 rounded-full text-[13.5px] font-medium whitespace-nowrap"
            >
              {s.label}
            </motion.a>
          ))}
        </nav>

        {/* Dashboard — right */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4, ease: 'easeOut' }}
          className="flex-shrink-0"
        >
          <Link
            to="/dashboard"
            className="nav-cta hidden lg:inline-flex items-center gap-2 px-5 h-9 rounded-full text-[13.5px] font-semibold text-white whitespace-nowrap"
          >
            Dashboard
            <ArrowRight size={15} />
          </Link>
          <Link
            to="/dashboard"
            className="nav-cta lg:hidden inline-flex items-center px-3.5 h-8 rounded-full text-[12.5px] font-semibold text-white whitespace-nowrap"
          >
            Dashboard
          </Link>
        </motion.div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden nav-link p-2 -mr-1"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="lg:hidden nav-glass absolute top-[72px] left-3 right-3 rounded-3xl p-4 space-y-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={goTo(s.id)}
              className="block w-full text-left px-4 py-2.5 rounded-full text-[15px] font-medium nav-link"
            >
              {s.label}
            </a>
          ))}
          <div className="pt-3">
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="nav-cta flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-full text-[14px] font-semibold text-white"
            >
              Open the Dashboard
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </motion.header>
  )
}
