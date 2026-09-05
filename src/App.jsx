import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Component, useState, useEffect } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import GlobalBackground from './components/GlobalBackground'
import DashboardShell from './components/DashboardShell'
import CautionPage from './pages/CautionPage'
import LandingPage from './pages/LandingPage'
import VerdictPage from './pages/VerdictPage'
import YourToken from './pages/dashboard/YourToken'
import Scout from './pages/dashboard/Scout'
import MarketOverview from './pages/dashboard/MarketOverview'
import TokenAnalysis from './pages/dashboard/TokenAnalysis'
import DeepAnalysis from './pages/dashboard/DeepAnalysis'
import Compare from './pages/dashboard/Compare'
import SentimentShift from './pages/dashboard/SentimentShift'
import Council from './pages/dashboard/Council'
import Narrative from './pages/dashboard/Narrative'
import ImageStudio from './pages/dashboard/ImageStudio'
import VideoStudio from './pages/dashboard/VideoStudio'
import VoiceStudio from './pages/dashboard/VoiceStudio'
import RiskDesk from './pages/dashboard/RiskDesk'
import HistoryPage from './pages/dashboard/HistoryPage'

// Marketing pages keep the navbar / footer chrome.
function SiteFrame() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  return (
    <>
      <Navbar />
      <main className={isLanding ? '' : 'pt-24 md:pt-28'}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

// The dashboard owns its own frame (sidebar + topbar), no marketing chrome.
function DashboardArea() {
  return (
    <Routes>
      <Route element={<DashboardShell />}>
        <Route index element={<YourToken />} />
        <Route path="scout" element={<Scout />} />
        <Route path="overview" element={<MarketOverview />} />
        <Route path="analysis" element={<TokenAnalysis />} />
        <Route path="deep" element={<DeepAnalysis />} />
        <Route path="compare" element={<Compare />} />
        <Route path="sentiment" element={<SentimentShift />} />
        <Route path="council" element={<Council />} />
        <Route path="narrative" element={<Narrative />} />
        <Route path="studio/image" element={<ImageStudio />} />
        <Route path="studio/video" element={<VideoStudio />} />
        <Route path="studio/voice" element={<VoiceStudio />} />
        <Route path="risk" element={<RiskDesk />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

// Council moved into the dashboard as a skill — keep old links alive.
function CouncilRedirect() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/dashboard/council', search: location.search }} replace />
}

// If any screen throws while rendering, React unmounts the whole tree and the user
// is left staring at the dark body colour. This keeps the last good frame on screen
// and shows a recoverable message instead of a black page.
class CrashGuard extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('[verdict] screen failed to render:', error)
  }

  reset() {
    this.setState({ failed: false })
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center px-6">
          <div className="max-w-md w-full rounded-2xl border border-line bg-panel/70 backdrop-blur p-6 text-center">
            <p className="text-sm font-semibold text-snow">This screen hit a snag</p>
            <p className="mt-2 text-xs text-faint leading-relaxed">
              The data on this page could not be displayed. Nothing was lost — your
              analysis is still running in the background.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={this.reset}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-accent text-night hover:opacity-90"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="text-xs font-semibold px-4 py-2 rounded-lg border border-line text-snow hover:bg-panel"
              >
                Back to console
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Shell() {
  return (
    <Routes>
      <Route element={<SiteFrame />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/verdict" element={<VerdictPage />} />
      </Route>
      <Route path="/dashboard/*" element={<DashboardArea />} />
      <Route path="/council" element={<CouncilRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  const [hasAcceptedDisclaimer, setHasAcceptedDisclaimer] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem('verdict_disclaimer_accepted')
    if (accepted === 'true') {
      setHasAcceptedDisclaimer(true)
    }
  }, [])

  const handleAcceptDisclaimer = () => {
    localStorage.setItem('verdict_disclaimer_accepted', 'true')
    setHasAcceptedDisclaimer(true)
  }

  return (
    <Router>
      <div className="min-h-screen bg-night text-snow font-sans">
        <GlobalBackground />
        <div className="relative z-10">
          <CrashGuard key={hasAcceptedDisclaimer ? 'console' : 'intro'}>
            {!hasAcceptedDisclaimer ? (
              <CautionPage onAccept={handleAcceptDisclaimer} />
            ) : (
              <Shell />
            )}
          </CrashGuard>
        </div>
      </div>
    </Router>
  )
}

export default App
