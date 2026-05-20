import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import api, { fmt } from '../utils/api'
import { hasRole } from '../utils/auth'

export default function DataTimbangan() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [relasi, setRelasi] = useState([])
  const LIMIT = 50

  const [filters, setFilters] = useState({ search: '', produk: '', relasi_id: '', bulan: '', tahun: '' })

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
          <h1 className="text-xl font-bold text-white">Data Timbangan</h1>
          <p className="text-sm text-slate-500">{total.toLocaleString('id-ID')} total record</p>
        </div>
        <button onClick={() => navigate('/input')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Input Baru
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="Cari no polisi, relasi, driver, kontrak..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
          </div>
          <select className="input" value={filters.produk} onChange={e => setFilters(f => ({ ...f, produk: e.target.value }))}>
            <option value="">Semua Produk</option>
            <option>CPO</option><option>RBDPL</option><option>B-40</option><option>BE</option>
          </select>
          <select className="input" value={filters.relasi_id} onChange={e => setFilters(f => ({ ...f, relasi_id: e.target.value }))}>
            <option value="">Semua Relasi</option>
            {relasi.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="input" value={filters.bulan} onChange={e => setFilters(f => ({ ...f, bulan: e.target.value }))}>
              <option value="">Semua Bln</option>
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map((m, i) => (
                <option key={m} value={m}>{['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][i]}</option>
              ))}
            </select>
            <select className="input" value={filters.tahun} onChange={e => setFilters(f => ({ ...f, tahun: e.target.value }))}>
              <option value="">Semua Thn</option>
              <option>2025</option><option>2026</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-wins-border">
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
                <tr><td colSpan={14} className="text-center py-12 text-slate-500">Memuat data...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-12 text-slate-500">Belum ada data</td></tr>
              ) : rows.map(r => {
                const selisih = r.berat_relasi ? r.berat_netto_wins - r.berat_relasi : null
                const varPct = r.berat_relasi && r.berat_relasi > 0
                  ? ((r.berat_netto_wins - r.berat_relasi) / r.berat_relasi) * 100
                  : null
                const absVar = varPct !== null ? Math.abs(varPct) : null
                const varCls = absVar === null ? 'text-slate-500'
                  : absVar <= 0.30 ? 'text-green-400'
                  : absVar <= 1.00 ? 'text-yellow-400'
                  : 'text-red-400'
                return (
                  <tr key={r.id} className="hover:bg-wins-border/30 transition-colors">
                    <td className="table-cell font-mono text-xs text-slate-400">{r.no_seri}</td>
                    <td className="table-cell whitespace-nowrap">{fmt.tgl(r.tanggal_masuk)}</td>
                    <td className="table-cell font-medium text-primary-400">{r.no_polisi || '—'}</td>
                    <td className="table-cell max-w-[150px] truncate text-xs">{r.relasi_nama}</td>
                    <td className="table-cell">
                      <span className={`badge-${r.produk === 'CPO' ? 'success' : r.produk === 'RBDPL' ? 'info' : 'neutral'}`}>{r.produk}</span>
                    </td>
                    <td className="table-cell text-xs text-slate-400">{r.truck_type}</td>
                    <td className="table-cell text-right font-mono text-xs">{r.berat_masuk?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-mono text-xs">{r.berat_keluar?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-mono font-semibold text-white">{r.berat_netto_wins?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-mono text-xs text-slate-300">{r.berat_relasi ? r.berat_relasi.toLocaleString('id-ID') : '—'}</td>
                    <td className="table-cell text-right text-xs">
                      {selisih !== null ? (
                        <span className={selisih > 0 ? 'text-yellow-400' : selisih < 0 ? 'text-red-400' : 'text-slate-500'}>
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
                        <button onClick={() => navigate(`/input/${r.id}`)} className="text-slate-400 hover:text-primary-400 transition-colors"><Edit2 size={14} /></button>
                        {hasRole('admin', 'manajer') && (
                          <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-wins-border">
            <span className="text-sm text-slate-500">Halaman {page} dari {totalPages} · {total.toLocaleString('id-ID')} data</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1.5 px-3 disabled:opacity-30"><ChevronLeft size={15} /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1.5 px-3 disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
