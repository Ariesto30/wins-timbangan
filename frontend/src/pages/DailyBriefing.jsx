import { useEffect, useState } from 'react'
import api from '../utils/api'
import { getUser } from '../utils/auth'

const fmt = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })

export default function DailyBriefing() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)
  const user = getUser()
  function load() {
    setErr(null); setRefreshing(true)
    return api.get('/insight/briefing')
      .then(r => { setD(r.data); setUpdatedAt(new Date()) })
      .catch(e => setErr(e.response?.data?.error || e.message))
      .finally(() => setRefreshing(false))
  }
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
        <div className="relative flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-white">{salam}, {(user?.nama || user?.username || 'Owner')}</h1>
            <p className="text-sm text-teal-50/90">{hari} · <span className="font-semibold">{fokus}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {updatedAt && <span className="text-[10px] text-teal-50/70">diperbarui {updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            <button onClick={load} disabled={refreshing} className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 ring-1 ring-white/20 text-white text-xs font-semibold disabled:opacity-60">
              {refreshing ? 'Memuat...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Aktivitas terakhir */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Aktivitas Terakhir {d.ref_date && <span className="text-gray-300">· {d.ref_date}</span>}</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Bahan Masuk" value={`${fmt(y.in_mt)} MT`} sub={`${y.in_trip} trip`} />
          <MiniCard label="Dispatch" value={`${fmt(y.out_mt)} MT`} sub={`${y.out_trip} trip`} />
          <MiniCard label="Transfer Tangki" value={`${y.transfer}`} sub="pergerakan" />
          <MiniCard label="Perubahan Stok" value={`${y.delta_inv_mt >= 0 ? '+' : ''}${fmt(y.delta_inv_mt)} MT`} sub={y.delta_inv_mt >= 0 ? 'stok naik' : 'stok turun'} accent={y.delta_inv_mt >= 0 ? 'green' : 'red'} />
        </div>
      </div>

      {/* Situasi saat ini */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Situasi Tank Farm Saat Ini</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniCard label="Total Stok" value={`${fmt(c.total_stok_mt)} MT`} />
          <MiniCard label="Utilisasi" value={`${c.util_total}%`} accent={c.util_total > 85 ? 'red' : 'green'} />
          <MiniCard label="Produk Dominan" value={c.produk_dominan} />
          <MiniCard label="Tangki Kritis" value={`${c.tangki_kritis.length}`} sub={c.tangki_kritis.slice(0, 2).join(', ')} accent={c.tangki_kritis.length ? 'red' : 'green'} />
        </div>
      </div>

      {/* Produksi & Yield (30 hari) */}
      {d.production && (
        <div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Kinerja Produksi · 30 Hari Terakhir <span className="text-gray-300">· s/d {d.production.sampai}</span></div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MiniCard label="Refining Yield" value={`${fmt(d.production.refining_yield)}%`} sub={`rata-rata ${fmt(d.production.refining_overall)}%`} accent={d.production.refining_yield >= 90 ? 'green' : 'red'} />
            <MiniCard label="Olein Yield" value={`${fmt(d.production.olein_yield)}%`} />
            <MiniCard label="Stearin Yield" value={`${fmt(d.production.stearin_yield)}%`} />
            <MiniCard label="Loss Refining" value={`${fmt(d.production.refining_loss)}%`} accent={d.production.refining_loss > 2 ? 'red' : undefined} />
            <MiniCard label="Reject CPO" value={`${fmt(d.production.cpo_reject)}%`} accent={d.production.cpo_reject > 3 ? 'red' : undefined} />
          </div>
        </div>
      )}

      {/* Risk + Rekomendasi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Risk Alert ({d.risks.length})</h3>
          {d.risks.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">Tidak ada risiko terdeteksi</div> :
          <div className="space-y-2">
            {d.risks.map((r, i) => {
              const hi = r.level === 'tinggi'
              return (
                <div key={i} className={`p-2.5 rounded-lg border-l-4 ${hi ? 'bg-red-50 border-red-400' : 'bg-orange-50 border-orange-300'}`}>
                  <div className={`text-xs font-semibold ${hi ? 'text-red-700' : 'text-orange-700'}`}>{r.msg}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{r.hint}</div>
                </div>
              )
            })}
          </div>}
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Rekomendasi Otomatis ({d.recommendations.length})</h3>
          {d.recommendations.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada rekomendasi khusus hari ini</div> :
          <div className="space-y-2">
            {d.recommendations.map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-amber-50 border-l-4 border-amber-300">
                <span className="text-xs text-gray-700">{r}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center">Briefing dihitung otomatis dari data timbangan, tangki, produksi & harga pasar. Makin lengkap data harian, makin akurat.</p>
    </div>
  )
}

function MiniCard({ label, value, sub, accent }) {
  const txt = accent === 'red' ? 'text-red-600' : accent === 'green' ? 'text-green-600' : 'text-gray-800'
  return (
    <div className="card">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${txt}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 truncate">{sub}</div>}
    </div>
  )
}
