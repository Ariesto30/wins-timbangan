import { useEffect, useState } from 'react'
import api from '../utils/api'

const fmt = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })

/* Owner Decision Insight — panel ringkas eksekutif (gradient navy).
   Menarik data dari /insight/briefing: stok, utilisasi, yield, risiko, rekomendasi. */
export default function OwnerInsight() {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/insight/briefing').then(r => setD(r.data)).catch(() => {}) }, [])
  if (!d) return null
  const c = d.current || {}, p = d.production || null
  const topRec = (d.recommendations || [])[0]
  const risks = d.risks?.length || 0

  const chips = [
    { label: 'Total Stok', value: `${fmt(c.total_stok_mt)} MT`, tone: 'flame' },
    { label: 'Utilisasi Tangki', value: `${c.util_total ?? 0}%`, tone: c.util_total > 85 ? 'danger' : 'success' },
    p && { label: 'Refining Yield 30h', value: `${fmt(p.refining_yield)}%`, tone: p.refining_yield >= 90 ? 'success' : 'warning' },
    { label: 'Risiko Operasional', value: `${risks}`, tone: risks ? 'danger' : 'success' },
  ].filter(Boolean)

  const toneText = { flame: 'text-amber-300', success: 'text-emerald-300', warning: 'text-amber-300', danger: 'text-red-300' }

  return (
    <div className="owner-insight">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase text-amber-300">Owner Decision Insight</span>
          <span className="text-[10px] text-slate-400">· ringkasan eksekutif otomatis</span>
        </div>
        {d.ref_date && <span className="text-[10px] text-slate-400">data s/d {d.ref_date}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {chips.map(ch => (
          <div key={ch.label} className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2.5">
            <div className="text-[10px] text-slate-400 mb-0.5">{ch.label}</div>
            <div className={`text-lg font-extrabold tabular-nums ${toneText[ch.tone] || 'text-white'}`}>{ch.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3 border-l-4 border-amber-400">
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-0.5">Rekomendasi Utama</div>
        <div className="text-sm text-slate-100">{topRec || 'Kondisi operasional dalam batas normal. Tidak ada tindakan mendesak.'}</div>
        {risks > 0 && <div className="text-[11px] text-slate-400 mt-1">{risks} hal butuh perhatian — lihat Daily Briefing untuk detail.</div>}
      </div>
    </div>
  )
}
