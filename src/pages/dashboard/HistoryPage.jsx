// System · History — decision receipts + studio renders in one vault.
// Receipts can be exported as shareable PNG cards (html-to-image).
import { useRef, useState } from 'react'
import { History, Receipt, Download, ImageIcon, Film, Mic, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toPng } from 'html-to-image'
import VerdictBadge from '../../components/VerdictBadge'
import { PageHeader, Panel, EmptyState, fmtUsd, Chip } from '../../components/DashUI'
import { loadReceipts, clearReceipts } from '../../data/receipts'
import { loadStudioHistory, downloadDataUrl, ClearHistoryBtn } from './StudioShared'

export default function HistoryPage() {
  const [receipts, setReceipts] = useState(() => loadReceipts())
  const [renders, setRenders] = useState(() => loadStudioHistory())
  const cardRefs = useRef({})

  const wipeReceipts = () => {
    clearReceipts()
    setReceipts([])
  }
  const wipeRenders = () => {
    localStorage.removeItem('verdict_studio_history')
    setRenders([])
  }

  const exportReceipt = async (r) => {
    const node = cardRefs.current[r.id]
    if (!node) return
    const url = await toPng(node, { pixelRatio: 2, backgroundColor: '#020208' })
    downloadDataUrl(url, `verdict-${r.symbol.toLowerCase()}-receipt.png`)
  }

  const renderCounts = renders.reduce((acc, x) => ({ ...acc, [x.kind]: (acc[x.kind] || 0) + 1 }), {})

  return (
    <>
      <PageHeader
        icon={History}
        title="History · Receipts"
        subtitle="Every verdict the council ruled on, kept as a shareable receipt."
        source={{ mode: 'live', name: 'Local vault' }}
      >
        {receipts.length > 0 && <ClearHistoryBtn onClick={wipeReceipts} />}
      </PageHeader>

      {receipts.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No receipts yet"
          hint="Run a Deep Analysis or a Council session and save the ruling — it lands here."
          action={
            <Link to="/dashboard/deep" className="glass-btn">
              <Receipt size={13} /> Run Deep Analysis
            </Link>
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {receipts.map((r, i) => (
            <div
              key={r.id}
              ref={(el) => (cardRefs.current[r.id] = el)}
              className="glass-panel animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <Link to={`/dashboard/analysis?token=${r.symbol}`} className="text-[15px] font-bold text-snow hover:text-accent transition-colors">
                    {r.symbol}
                  </Link>
                  <p className="text-[11px] text-faint">{r.name}</p>
                </div>
                <VerdictBadge verdict={r.verdict} size="sm" animate={false} />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="glass-chip !justify-start flex-col !items-start gap-0.5">
                  <span className="text-[9px] font-mono text-faint">CONFIDENCE</span>
                  <span className="text-[12px] font-mono text-snow">{r.confidence}/100</span>
                </div>
                <div className="glass-chip !justify-start flex-col !items-start gap-0.5">
                  <span className="text-[9px] font-mono text-faint">PRICE</span>
                  <span className="text-[12px] font-mono text-snow">{fmtUsd(r.priceUsd)}</span>
                </div>
                <div className="glass-chip !justify-start flex-col !items-start gap-0.5">
                  <span className="text-[9px] font-mono text-faint">AS OF</span>
                  <span className="text-[12px] font-mono text-snow">{new Date(r.asOf).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {(r.sources || []).map((s) => (
                  <span key={s} className="src-badge src-live">{s}</span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                <span className="flex gap-1.5 mr-auto">
                  {r.media?.image && <span className="src-badge src-sim"><ImageIcon size={10} /> img</span>}
                  {r.media?.video && <span className="src-badge src-sim"><Film size={10} /> vid</span>}
                  {r.media?.voice && <span className="src-badge src-sim"><Mic size={10} /> voice</span>}
                </span>
                <button onClick={() => exportReceipt(r)} className="glass-chip">
                  <Download size={11} /> Export PNG
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* studio renders */}
      <div className="mt-6">
        <Panel
          title={`Studio Renders · ${renders.length}`}
          icon={Film}
          actions={renders.length > 0 ? <ClearHistoryBtn onClick={wipeRenders} /> : null}
        >
          {renders.length === 0 ? (
            <p className="text-[12.5px] text-faint py-4 text-center">Nothing rendered yet. The Studio keeps image, video and voice outputs here.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {['image', 'video', 'voice'].map(
                  (k) =>
                    renderCounts[k] && (
                      <Link key={k} to={`/dashboard/studio/${k}`} className="glass-chip capitalize">
                        {k} · {renderCounts[k]}
                      </Link>
                    )
                )}
              </div>
              <div className="film-strip">
                {renders.slice(0, 12).map((it) =>
                  it.url || it.poster ? (
                    <button
                      key={it.id}
                      type="button"
                      className="frame"
                      style={{ backgroundImage: `url(${it.url || it.poster})` }}
                      title={`${it.symbol} · ${it.kind}`}
                      onClick={() => window.open(it.url || it.poster, '_blank')}
                    />
                  ) : (
                    <Chip key={it.id} active>
                      <Mic size={11} /> {it.symbol}
                    </Chip>
                  )
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
