import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight, Filter, BarChart3, List } from 'lucide-react'
import api, { fmt } from '../utils/api'
import MonthRange from '../components/MonthRange'
import { hasRole } from '../utils/auth'

export default function DataTimbangan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('detail')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [relasi, setRelasi] = useState([])
  const LIMIT = 50

  // Summary state
  const [summaryRows, setSummaryRows] = useState([])
  const [summaryTotal, setSummaryTotal] = useState({ trip: 0, netto_kg: 0 })
  const [groupBy, setGroupBy] = useState('relasi-produk')

  // Initial filter dari URL ?search=xxx (untuk drill-down dari Audit Forensik)
  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    produk: searchParams.get('produk') || '',
    relasi_id: searchParams.get('relasi_id') || '',
    bulan_start: searchParams.get('bulan_start') || searchParams.get('bulan') || '',
    bulan_end: searchParams.get('bulan_end') || searchParams.get('bulan') || '',
    tahun: searchParams.get('tahun') || ''
  })

  const load = useCallback(() => {
    setLoading(true)
    api.get('/timbangan', { params: { page, limit: LIMIT, ...filters } })
      .then(r => { setRows(r.data.data); setTotal(r.data.total) })
      .finally(() => setLoading(false))
  }, [page, filters])

  useEffect(() => {
    const params = filters.produk ? { produk: filters.produk } : {}
    api.get('/relasi', { params }).then(r => {
      setRelasi(r.data)
      if (filters.relasi_id && !r.data.find(x => String(x.id) === String(filters.relasi_id))) {
        setFilters(f => ({ ...f, relasi_id: '' }))
      }
    })
  }, [filters.produk])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [filters])

  // Load summary
  const loadSummary = useCallback(() => {
    api.get('/timbangan/summary', { params: { groupBy, ...filters } })
      .then(r => { setSummaryRows(r.data.rows); setSummaryTotal(r.data.total) })
  }, [groupBy, filters])

  useEffect(() => { if (tab === 'summary') loadSummary() }, [tab, loadSummary])

  async function handleDelete(id) {
    if (!confirm('Hapus data ini?')) return
    await api.delete(`/timbangan/${id}`)
    load()
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Data Timbangan</h1>
          <p className="text-sm text-gray-400">
            {tab === 'detail' ? `${total.toLocaleString('id-ID')} total record` : `Ringkasan agregat — ${summaryTotal.trip.toLocaleString('id-ID')} trip · ${(summaryTotal.netto_kg/1000).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})} ton`}
          </p>
        </div>
        <button onClick={() => navigate('/input')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Input Baru
        </button>
      </div>

      {/* Tab Detail / Summary */}
      <div className="flex gap-2 border-b border-gray-200">
        <button onClick={() => setTab('detail')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab==='detail' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          <List size={15}/> Detail per Trip
        </button>
        <button onClick={() => setTab('summary')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab==='summary' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          <BarChart3 size={15}/> Summary (Ringkasan)
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Cari no polisi, relasi, driver, kontrak..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <select className="input" value={filters.produk} onChange={e => setFilters(f => ({ ...f, produk: e.target.value }))}>
            <option value="">Semua Produk</option>
            <option>CPO</option><option>RBDPL</option><option>RBDPS</option><option>B-40</option><option>BE</option>
          </select>
          <select className="input" value={filters.relasi_id} onChange={e => setFilters(f => ({ ...f, relasi_id: e.target.value }))}>
            <option value="">Semua Relasi</option>
            {relasi.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </select>
          <div className="flex gap-2 items-center">
            <MonthRange start={filters.bulan_start} end={filters.bulan_end}
              onStart={v => setFilters(f => ({ ...f, bulan_start: v }))}
              onEnd={v => setFilters(f => ({ ...f, bulan_end: v }))} />
            <select className="input" value={filters.tahun} onChange={e => setFilters(f => ({ ...f, tahun: e.target.value }))}>
              <option value="">Semua Thn</option>
              <option>2025</option><option>2026</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Tab Content */}
      {tab === 'summary' && (
        <div className="space-y-3">
          <div className="card flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-700">Grup berdasarkan:</span>
            {[
              { id: 'relasi', label: 'Relasi' },
              { id: 'produk', label: 'Produk' },
              { id: 'kontrak', label: 'Kontrak' },
              { id: 'do', label: 'DO' },
              { id: 'relasi-produk', label: 'Relasi + Produk' },
              { id: 'relasi-kontrak', label: 'Relasi + Kontrak' },
              { id: 'relasi-do', label: 'Relasi + DO' },
            ].map(g => (
              <button key={g.id} onClick={() => setGroupBy(g.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${groupBy===g.id ? 'bg-purple-600 text-white' : 'bg-gray-50 text-gray-500 hover:text-gray-800 border border-gray-200'}`}>
                {g.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-500">
              Total: <strong className="text-gray-800">{summaryTotal.trip.toLocaleString('id-ID')} trip</strong> · <strong className="text-purple-600">{(summaryTotal.netto_kg/1000).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})} ton</strong>
            </span>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full min-w-[700px]">
                <thead className="sticky top-0">
                  <tr className="border-b border-gray-200">
                    {groupBy.includes('relasi') && <th className="table-header">Relasi</th>}
                    {(groupBy === 'produk' || groupBy.includes('produk') || groupBy === 'kontrak' || groupBy === 'do' || groupBy === 'relasi-kontrak' || groupBy === 'relasi-do') && <th className="table-header">Produk</th>}
                    {(groupBy === 'kontrak' || groupBy === 'do' || groupBy === 'relasi-kontrak' || groupBy === 'relasi-do') && <th className="table-header">No. Kontrak</th>}
                    {(groupBy === 'do' || groupBy === 'relasi-do') && <th className="table-header">DO</th>}
                    <th className="table-header text-right">Trip</th>
                    <th className="table-header text-right">Netto (Ton)</th>
                    <th className="table-header text-right">Netto (Kg)</th>
                    <th className="table-header text-right">Avg/Trip (Kg)</th>
                    <th className="table-header text-right">Armada</th>
                    <th className="table-header">Tgl Pertama</th>
                    <th className="table-header">Tgl Terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-12 text-gray-400">Tidak ada data untuk filter ini</td></tr>
                  ) : summaryRows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                      {groupBy.includes('relasi') && <td className="table-cell text-sm">{r.relasi_nama || '—'}</td>}
                      {(groupBy === 'produk' || groupBy.includes('produk') || groupBy === 'kontrak' || groupBy === 'do' || groupBy === 'relasi-kontrak' || groupBy === 'relasi-do') && <td className="table-cell"><span className={`badge-${r.produk === 'CPO' ? 'success' : r.produk === 'RBDPL' ? 'info' : 'neutral'}`}>{r.produk || '—'}</span></td>}
                      {(groupBy === 'kontrak' || groupBy === 'do' || groupBy === 'relasi-kontrak' || groupBy === 'relasi-do') && <td className="table-cell text-xs font-mono text-purple-700 max-w-[180px] truncate" title={r.no_kontrak}>{r.no_kontrak || '—'}</td>}
                      {(groupBy === 'do' || groupBy === 'relasi-do') && <td className="table-cell text-xs font-mono text-gray-700 max-w-[180px] truncate" title={r.do_number}>{r.do_number || '—'}</td>}
                      <td className="table-cell text-right font-semibold">{r.trip.toLocaleString('id-ID')}</td>
                      <td className="table-cell text-right font-semibold text-gray-800">{(r.netto_kg/1000).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td className="table-cell text-right font-mono text-xs">{r.netto_kg.toLocaleString('id-ID')}</td>
                      <td className="table-cell text-right text-purple-600">{r.avg_trip?.toLocaleString('id-ID')}</td>
                      <td className="table-cell text-right text-xs">{r.armada || 0}</td>
                      <td className="table-cell text-xs text-gray-500">{fmt.tgl(r.tgl_pertama)}</td>
                      <td className="table-cell text-xs text-gray-500">{fmt.tgl(r.tgl_terakhir)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50/50 text-xs text-gray-400 flex justify-between">
              <span>{summaryRows.length} grup ditemukan</span>
              <span>Filter di atas juga berlaku untuk Summary</span>
            </div>
          </div>
        </div>
      )}

      {/* Table Detail (hanya tampil di tab detail) */}
      {tab === 'detail' && (
      <>
      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">No. Seri</th>
                <th className="table-header">Tanggal</th>
                <th className="table-header">No. Polisi</th>
                <th className="table-header">Relasi</th>
                <th className="table-header">Produk</th>
                <th className="table-header">Truck</th>
                <th className="table-header text-right">B. Masuk</th>
                <th className="table-header text-right">B. Keluar</th>
                <th className="table-header text-right">Netto WINS</th>
                <th className="table-header text-right">Netto Relasi</th>
                <th className="table-header text-right">Selisih</th>
                <th className="table-header text-right">Var %</th>
                <th className="table-header">Penimbang</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="text-center py-12 text-gray-400">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-12 text-gray-400">Belum ada data</td></tr>
              ) : rows.map(r => {
                const selisih = r.berat_relasi ? r.berat_netto_wins - r.berat_relasi : null
                const varPct = r.berat_relasi && r.berat_relasi > 0
                  ? ((r.berat_netto_wins - r.berat_relasi) / r.berat_relasi) * 100
                  : null
                const absVar = varPct !== null ? Math.abs(varPct) : null
                const varCls = absVar === null ? 'text-gray-400'
                  : absVar <= 0.30 ? 'text-green-600'
                  : absVar <= 1.00 ? 'text-yellow-600'
                  : 'text-red-600'
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-mono text-xs text-gray-500">{r.no_seri}</td>
                    <td className="table-cell whitespace-nowrap">{fmt.tgl(r.tanggal_masuk)}</td>
                    <td className="table-cell font-medium text-purple-600">{r.no_polisi || '—'}</td>
                    <td className="table-cell max-w-[150px] truncate text-xs">{r.relasi_nama}</td>
                    <td className="table-cell">
                      <span className={`badge-${r.produk === 'CPO' ? 'success' : r.produk === 'RBDPL' ? 'info' : 'neutral'}`}>{r.produk}</span>
                    </td>
                    <td className="table-cell text-xs text-gray-500">{r.truck_type}</td>
                    <td className="table-cell text-right font-mono text-xs">{r.berat_masuk?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-mono text-xs">{r.berat_keluar?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-mono font-semibold text-gray-800">{r.berat_netto_wins?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-mono text-xs text-gray-700">{r.berat_relasi ? r.berat_relasi.toLocaleString('id-ID') : '—'}</td>
                    <td className="table-cell text-right text-xs">
                      {selisih !== null ? (
                        <span className={selisih > 0 ? 'text-yellow-600' : selisih < 0 ? 'text-red-600' : 'text-gray-400'}>
                          {selisih > 0 ? '+' : ''}{selisih.toLocaleString('id-ID')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className={`table-cell text-right text-xs font-bold ${varCls}`} title={absVar !== null ? (absVar <= 0.30 ? 'Dalam toleransi (≤0.30%)' : absVar <= 1 ? 'Di luar toleransi (0.30-1%)' : 'Jauh dari toleransi (>1%)') : ''}>
                      {varPct !== null ? (varPct > 0 ? '+' : '') + varPct.toFixed(2) + '%' : '—'}
                    </td>
                    <td className="table-cell text-xs capitalize">{r.penimbang}</td>
                    <td className="table-cell">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => navigate(`/input/${r.id}`)} className="text-gray-500 hover:text-purple-600 transition-colors"><Edit2 size={14} /></button>
                        {hasRole('admin', 'manajer') && (
                          <button onClick={() => handleDelete(r.id)} className="text-gray-500 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-400">Halaman {page} dari {totalPages} · {total.toLocaleString('id-ID')} data</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1.5 px-3 disabled:opacity-30"><ChevronLeft size={15} /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1.5 px-3 disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
