import { useEffect, useState } from 'react'
import { Sunrise, ArrowDownCircle, ArrowUpCircle, Repeat, Layers, AlertTriangle, Lightbulb, Gauge, Boxes, RefreshCw } from 'lucide-react'
import api from '../utils/api'
import { getUser } from '../utils/auth'

const fmt = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })

export default function DailyBriefing() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const user = getUser()
  function load() { setErr(null); api.get('/insight/briefing').then(r => setD(r.data)).catch(e => setErr(e.response?.data?.error || e.message)) }
  useEffect(() => { load() }, [])

  if (err) return <div className="card bg-red-50 border-red-200 text-center py-10"><div className="text-red-600 font-semibold">Gagal memuat</div><div className="text-xs text-gray-500 mb-3">{err}</div><button onClick={load} className="btn-primary">Coba Lagi</button></div>
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat briefing...</div>

  const y = d.yesterday, c = d.current
  const now = new Date()
  const hari = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const jam = now.getHours()
  const salam = jam < 11 ? 'Selamat Pagi' : jam < 15 ? 'Selamat Siang' : jam < 19 ? 'Selamat Sore' : 'Selamat Malam'
  const fokus = d.risks.length ? `${d.risks.length} hal butuh perhatian Anda` : 'Semua dalam kondisi normal'

  return (
    <div className="space-y-4">
      {/* Header sapaan */}
      <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: 'linear-gradient(120deg,#0f766e,#0d9488 55%,#0891b2)' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px,#fff 1px,transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Sunrise size={30} className="text-amber-200" />
            <div>
              <h1 className="text-xl font-bold text-white">{salam}, {(user?.nama || user?.username || 'Owner')}</h1>
              <p className="text-sm text-teal-50/90">{hari} · <span className="font-semibold">{fokus}</span></p>
            </div>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 ring-1 ring-white/20 text-white text-xs font-semibold"><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>

      {/* Aktivitas terakhir */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Aktivitas Terakhir {d.ref_date && <span className="text-gray-300">· {d.ref_date}</span>}</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard icon={<ArrowDownCircle size={16} className="text-teal-600" />} label="Bahan Masuk" value={`${fmt(y.in_mt)} MT`} sub={`${y.in_trip} trip`} />
          <MiniCard icon={<ArrowUpCircle size={16} className="text-amber-600" />} label="Dispatch" value={`${fmt(y.out_mt)} MT`} sub={`${y.out_trip} trip`} />
          <MiniCard icon={<Repeat size={16} className="text-sky-600" />} label="Transfer Tangki" value={`${y.transfer}`} sub="pergerakan" />
          <MiniCard icon={<Layers size={16} className={y.delta_inv_mt >= 0 ? 'text-green-600' : 'text-red-600'} />} label="Δ Inventory" value={`${y.delta_inv_mt >= 0 ? '+' : ''}${fmt(y.delta_inv_mt)} MT`} sub={y.delta_inv_mt >= 0 ? 'stok naik' : 'stok turun'} />
        </div>
      </div>

      {/* Situasi saat ini */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Situasi Tank Farm Saat Ini</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard icon={<Boxes size={16} className="text-gray-600" />} label="Total Stok" value={`${fmt(c.total_stok_mt)} MT`} />
          <MiniCard icon={<Gauge size={16} className={c.util_total > 85 ? 'text-red-600' : 'text-green-600'} />} label="Utilisasi" value={`${c.util_total}%`} accent={c.util_total > 85 ? 'red' : 'green'} />
          <MiniCard icon={<Layers size={16} className="text-amber-600" />} label="Produk Dominan" value={c.produk_dominan} />
          <MiniCard icon={<AlertTriangle size={16} className={c.tangki_kritis.length ? 'text-red-600' : 'text-green-600'} />} label="Tangki Kritis" value={`${c.tangki_kritis.length}`} sub={c.tangki_kritis.slice(0, 2).join(', ')} />
        </div>
      </div>

      {/* Produksi & Yield (30 hari) */}
      {d.production && (
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Kinerja Produksi · 30 Hari Terakhir <span className="text-gray-300">· s/d {d.production.sampai}</span></div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MiniCard icon={<Gauge size={16} className="text-green-600" />} label="Refining Yield" value={`${fmt(d.production.refining_yield)}%`} sub={`overall ${fmt(d.production.refining_overall)}%`} accent={d.production.refining_yield >= 90 ? 'green' : 'red'} />
            <MiniCard icon={<Layers size={16} className="text-sky-600" />} label="Olein Yield" value={`${fmt(d.production.olein_yield)}%`} />
            <MiniCard icon={<Layers size={16} className="text-purple-600" />} label="Stearin Yield" value={`${fmt(d.production.stearin_yield)}%`} />
            <MiniCard icon={<AlertTriangle size={16} className={d.production.refining_loss > 2 ? 'text-red-600' : 'text-amber-500'} />} label="Loss Refining" value={`${fmt(d.production.refining_loss)}%`} accent={d.production.refining_loss > 2 ? 'red' : undefined} />
            <MiniCard icon={<AlertTriangle size={16} className={d.production.cpo_reject > 3 ? 'text-red-600' : 'text-gray-500'} />} label="Reject CPO" value={`${fmt(d.production.cpo_reject)}%`} accent={d.production.cpo_reject > 3 ? 'red' : undefined} />
          </div>
        </div>
      )}

      {/* Risk + Rekomendasi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><AlertTriangle size={15} className="text-orange-500" /> Risk Alert ({d.risks.length})</h3>
          {d.risks.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Tidak ada risiko terdeteksi</div> :
          <div className="space-y-2">
            {d.risks.map((r, i) => {
              const hi = r.level === 'tinggi'
              return (
                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${hi ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${hi ? 'bg-red-500' : 'bg-orange-500'}`} />
                  <div><div className={`text-xs font-semibold ${hi ? 'text-red-700' : 'text-orange-700'}`}>{r.msg}</div><div className="text-[11px] text-gray-500">→ {r.hint}</div></div>
                </div>
              )
            })}
          </div>}
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Lightbulb size={15} className="text-amber-500" /> Rekomendasi Otomatis ({d.recommendations.length})</h3>
          {d.recommendations.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada rekomendasi khusus hari ini</div> :
          <div className="space-y-2">
            {d.recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <Lightbulb size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-gray-700">{r}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center">Briefing dihitung otomatis dari data timbangan, tangki & harga pasar. Makin lengkap data (mutasi stok harian), makin akurat.</p>
    </div>
  )
}

function MiniCard({ icon, label, value, sub, accent }) {
  const txt = accent === 'red' ? 'text-red-600' : accent === 'green' ? 'text-green-600' : 'text-gray-800'
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">{icon} {label}</div>
      <div className={`text-xl font-bold ${txt}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 truncate">{sub}</div>}
    </div>
  )
}
