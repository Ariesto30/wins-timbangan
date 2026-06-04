import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts'
import api, { fmt } from '../utils/api'
import MonthRange from '../components/MonthRange'

const tooltipStyle = { backgroundColor: '#1a2632', border: '1px solid #2a3a4a', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }

export default function Laporan() {
  const [tab, setTab] = useState('relasi')
  const [relasiData, setRelasiData] = useState([])
  const [selisihData, setSelisihData] = useState(null)
  const [harianData, setHarianData] = useState([])
  const [filter, setFilter] = useState({ tahun: '2026', bulan_start: '', bulan_end: '' })

  useEffect(() => {
    const p = filter
    api.get('/reports/relasi', { params: p }).then(r => setRelasiData(r.data))
    api.get('/reports/selisih', { params: p }).then(r => setSelisihData(r.data))
    api.get('/reports/harian', { params: p }).then(r => setHarianData(r.data))
  }, [filter])

  const relasiSummary = Object.values(
    relasiData.reduce((acc, r) => {
      if (!acc[r.relasi_nama]) acc[r.relasi_nama] = { relasi_nama: r.relasi_nama, trip: 0, netto_kg: 0 }
      acc[r.relasi_nama].trip += r.trip
      acc[r.relasi_nama].netto_kg += r.netto_kg
      return acc
    }, {})
  ).sort((a, b) => b.netto_kg - a.netto_kg)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Laporan & Analisa</h1>
          <p className="text-sm text-gray-400">Analisis mendalam data timbangan</p>
        </div>
        <div className="flex gap-3">
          <select className="input w-auto" value={filter.tahun} onChange={e => setFilter(f => ({ ...f, tahun: e.target.value }))}>
            <option value="">Semua Tahun</option><option>2025</option><option>2026</option>
          </select>
          <MonthRange start={filter.bulan_start} end={filter.bulan_end}
            onStart={v => setFilter(f => ({ ...f, bulan_start: v }))}
            onEnd={v => setFilter(f => ({ ...f, bulan_end: v }))} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {[
          { id: 'relasi', label: 'Per Relasi' },
          { id: 'harian', label: 'Tren Harian' },
          { id: 'selisih', label: 'Analisa Selisih Timbang' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Relasi Tab */}
      {tab === 'relasi' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Volume per Relasi (Ton)</h2>
            <ResponsiveContainer width="100%" height={Math.max(400, relasiSummary.length * 36)}>
              <BarChart data={relasiSummary} layout="vertical" margin={{ left: 8, right: 70, top: 8, bottom: 8 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v} />
                <YAxis type="category" dataKey="relasi_nama" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={210} interval={0} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [`${(v/1000).toFixed(2)} ton`, 'Netto']} />
                <Bar dataKey="netto_kg" fill="#22c55e" radius={[0,4,4,0]} barSize={18}>
                  <LabelList dataKey="netto_kg" position="right" style={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} formatter={v => (v/1000).toFixed(1)+'t'} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="table-header">Relasi</th>
                  <th className="table-header text-right">Trip</th>
                  <th className="table-header text-right">Netto (Ton)</th>
                  <th className="table-header text-right">Avg/Trip (Kg)</th>
                  <th className="table-header text-right">Netto Relasi</th>
                  <th className="table-header text-right">Total Selisih</th>
                </tr>
              </thead>
              <tbody>
                {relasiData.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                    <td className="table-cell text-sm">{r.relasi_nama}<br/><span className="text-xs text-gray-400">{r.produk}</span></td>
                    <td className="table-cell text-right">{r.trip}</td>
                    <td className="table-cell text-right font-semibold">{fmt.tonRaw(r.netto_kg)}</td>
                    <td className="table-cell text-right text-xs">{fmt.num(r.avg_trip)}</td>
                    <td className="table-cell text-right text-xs text-gray-500">{r.netto_relasi_kg ? fmt.tonRaw(r.netto_relasi_kg) : '—'}</td>
                    <td className={`table-cell text-right text-xs font-mono ${r.selisih_total > 0 ? 'text-yellow-600' : r.selisih_total < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {r.netto_relasi_kg ? (r.selisih_total > 0 ? '+' : '') + r.selisih_total?.toLocaleString('id-ID') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Harian Tab */}
      {tab === 'harian' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Tren Harian — Netto (Ton)</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={harianData.map(d => ({ ...d, netto_ton: +(d.netto_kg/1000).toFixed(2) }))} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" />
              <XAxis dataKey="tanggal" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => new Date(v).toLocaleDateString('id-ID', { day:'2-digit', month:'short' })} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={v => new Date(v).toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })} formatter={v => [`${v} ton`, 'Netto']} />
              <Line type="monotone" dataKey="netto_ton" stroke="#22c55e" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Selisih Tab */}
      {tab === 'selisih' && selisihData && (
        <div className="space-y-4">
          {/* Info Toleransi */}
          <div className="card bg-blue-50 border-blue-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-blue-700">Standar Toleransi: ≤ 0.30%</h3>
              <p className="text-xs text-gray-500 mt-1">Var % dihitung dari (Netto WINS − Netto Relasi) ÷ Netto Relasi × 100%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Compliance Rate</p>
              <p className="text-2xl font-bold" style={{ color: (selisihData.summary?.dalam_toleransi / selisihData.summary?.total) >= 0.7 ? '#22c55e' : (selisihData.summary?.dalam_toleransi / selisihData.summary?.total) >= 0.5 ? '#facc15' : '#ef4444' }}>
                {selisihData.summary?.total ? ((selisihData.summary.dalam_toleransi / selisihData.summary.total) * 100).toFixed(1) : 0}%
              </p>
            </div>
          </div>

          {/* 4 KPI baris */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card border-l-4 border-l-green-500">
              <p className="text-xs text-gray-500">✓ Dalam Toleransi (≤0.30%)</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{selisihData.summary?.dalam_toleransi || 0}</p>
              <p className="text-[10px] text-gray-400 mt-1">trip aman dalam toleransi</p>
            </div>
            <div className="card border-l-4 border-l-yellow-500">
              <p className="text-xs text-gray-500">⚠ Luar Toleransi Ringan (0.30–1%)</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{selisihData.summary?.luar_toleransi_ringan || 0}</p>
              <p className="text-[10px] text-gray-400 mt-1">perlu kalibrasi ulang</p>
            </div>
            <div className="card border-l-4 border-l-red-500">
              <p className="text-xs text-gray-500">✗ Jauh Toleransi (&gt;1%)</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{selisihData.summary?.luar_toleransi_berat || 0}</p>
              <p className="text-[10px] text-gray-400 mt-1">perlu investigasi mendalam</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500">Var % Rata-rata</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{selisihData.summary?.avg_var_pct?.toFixed(3) || 0}%</p>
              <p className="text-[10px] text-gray-400 mt-1">Maks: {selisihData.summary?.max_var_pct?.toFixed(2) || 0}%</p>
            </div>
          </div>

          {/* Summary tambahan */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card">
              <p className="text-xs text-gray-500">Total Data Relasi</p>
              <p className="text-lg font-semibold text-gray-800">{selisihData.summary?.total || 0}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500">WINS &gt; Relasi</p>
              <p className="text-lg font-semibold text-yellow-600">{selisihData.summary?.wins_lebih_berat || 0}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500">WINS &lt; Relasi</p>
              <p className="text-lg font-semibold text-red-600">{selisihData.summary?.wins_lebih_ringan || 0}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500">Total Selisih (Kg)</p>
              <p className={`text-lg font-semibold ${selisihData.summary?.total_selisih_kg >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                {selisihData.summary?.total_selisih_kg?.toLocaleString('id-ID') || 0}
              </p>
            </div>
          </div>

          {/* Tabel Per Relasi (compliance) */}
          {selisihData.perRelasi?.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">Compliance per Relasi</h3>
                <p className="text-xs text-gray-400">% trip yang dalam toleransi 0.30%, diurutkan dari Var rata-rata terbesar</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr><th className="table-header">Relasi</th><th className="table-header text-right">Trip</th><th className="table-header text-right">Dalam Tol.</th><th className="table-header text-right">Compliance %</th><th className="table-header text-right">Avg Var %</th></tr>
                  </thead>
                  <tbody>
                    {selisihData.perRelasi.map((r, i) => {
                      const compliance = r.trip > 0 ? (r.dalam_toleransi / r.trip * 100) : 0
                      return (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="table-cell text-sm">{r.relasi_nama}</td>
                          <td className="table-cell text-right">{r.trip}</td>
                          <td className="table-cell text-right">{r.dalam_toleransi}</td>
                          <td className={`table-cell text-right font-bold ${compliance >= 70 ? 'text-green-600' : compliance >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {compliance.toFixed(1)}%
                          </td>
                          <td className={`table-cell text-right font-bold ${r.avg_var_pct <= 0.3 ? 'text-green-600' : r.avg_var_pct <= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {r.avg_var_pct?.toFixed(3) || 0}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabel 100 Selisih Terbesar */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">100 Var Terbesar</h3>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr><th className="table-header">No. Seri</th><th className="table-header">No. Polisi</th><th className="table-header">Relasi</th><th className="table-header">Produk</th><th className="table-header">Tanggal</th><th className="table-header text-right">WINS</th><th className="table-header text-right">Relasi</th><th className="table-header text-right">Selisih</th><th className="table-header text-right">Var %</th></tr>
                </thead>
                <tbody>
                  {selisihData.detail?.map((d, i) => {
                    const absVar = Math.abs(d.var_pct || 0)
                    const varCls = absVar <= 0.30 ? 'text-green-600' : absVar <= 1 ? 'text-yellow-600' : 'text-red-600'
                    return (
                      <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                        <td className="table-cell text-xs font-mono text-gray-500">{d.no_seri}</td>
                        <td className="table-cell text-sm text-purple-600">{d.no_polisi}</td>
                        <td className="table-cell text-xs">{d.relasi_nama}</td>
                        <td className="table-cell"><span className="badge-neutral">{d.produk}</span></td>
                        <td className="table-cell text-xs">{fmt.tgl(d.tanggal_masuk)}</td>
                        <td className="table-cell text-right font-mono text-sm">{d.berat_netto_wins?.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-right font-mono text-sm text-gray-500">{d.berat_relasi?.toLocaleString('id-ID')}</td>
                        <td className={`table-cell text-right font-mono font-semibold text-sm ${d.selisih > 0 ? 'text-yellow-600' : d.selisih < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {d.selisih > 0 ? '+' : ''}{d.selisih?.toLocaleString('id-ID')}
                        </td>
                        <td className={`table-cell text-right font-mono font-bold text-sm ${varCls}`}>
                          {d.var_pct > 0 ? '+' : ''}{d.var_pct?.toFixed(3)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
