import { useEffect, useState } from 'react'
import { Plus, X, FileText, TrendingUp, AlertTriangle, Search } from 'lucide-react'
import api, { fmt } from '../utils/api'

const empty = {
  no_kontrak: '', do_number: '', relasi_id: '', relasi_nama: '', produk: '',
  quantity_kg: '', harga_satuan: '', ppn: '0.11', lokasi_penyerahan: '',
  tanggal_penyerahan: '', jatuh_tempo: '', status_pengiriman: 'Loco PKS',
  dp: '0', jatuh_tempo_dp: '', arah: 'IN', catatan: ''
}

function StatusBadge({ s }) {
  const cls = s === 'Selesai' ? 'badge-success' : s === 'Over' ? 'badge-warning' : s === 'Lewat Jatuh Tempo' ? 'badge-danger' : 'badge-info'
  return <span className={cls}>{s}</span>
}

export default function Kontrak() {
  const [data, setData] = useState([])
  const [relasi, setRelasi] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filterArah, setFilterArah] = useState('')
  const [filterProduk, setFilterProduk] = useState('')
  const [filterRelasi, setFilterRelasi] = useState('')
  const [search, setSearch] = useState('')

  function load() {
    api.get('/kontrak', { params: {
      arah: filterArah || undefined,
      produk: filterProduk || undefined,
      relasi_id: filterRelasi || undefined,
      search: search || undefined,
    } }).then(r => setData(r.data))
  }

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [filterArah, filterProduk, filterRelasi, search])

  // Cascading: saat produk berubah, refetch relasi
  useEffect(() => {
    const params = filterProduk ? { produk: filterProduk } : {}
    api.get('/relasi', { params }).then(r => {
      setRelasi(r.data)
      if (filterRelasi && !r.data.find(x => String(x.id) === String(filterRelasi))) setFilterRelasi('')
    })
  }, [filterProduk])

  function openNew() { setForm(empty); setEditId(null); setShowModal(true) }
  function openEdit(k) {
    setForm({ ...empty, ...k, ppn: k.ppn || '0.11', dp: k.dp || '0' })
    setEditId(k.id); setShowModal(true)
  }

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function save() {
    setLoading(true)
    try {
      if (editId) await api.put(`/kontrak/${editId}`, form)
      else await api.post('/kontrak', form)
      setShowModal(false); load()
    } catch (e) {
      alert(e.response?.data?.error || 'Gagal menyimpan')
    } finally { setLoading(false) }
  }

  // Summary
  const totalNilai = data.reduce((s, k) => s + (k.nilai_kontrak || 0), 0)
  const totalKuota = data.reduce((s, k) => s + (k.quantity_kg || 0), 0)
  const totalAktual = data.reduce((s, k) => s + (k.aktual_kg || 0), 0)
  const overKontrak = data.filter(k => k.pct_realisasi > 1).length
  const jatuhTempo = data.filter(k => k.status_kontrak === 'Lewat Jatuh Tempo').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Manajemen Kontrak</h1>
          <p className="text-sm text-slate-500">{data.length} kontrak terdaftar</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2"><Plus size={16} /> Tambah Kontrak</button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Nilai Kontrak', value: fmt.rp(totalNilai), color: 'text-primary-400' },
          { label: 'Total Kuota (Ton)', value: fmt.tonRaw(totalKuota), color: 'text-blue-400' },
          { label: 'Total Terkirim (Ton)', value: fmt.tonRaw(totalAktual), color: 'text-yellow-400' },
          { label: 'Perlu Perhatian', value: `${overKontrak} Over · ${jatuhTempo} Terlambat`, color: 'text-red-400' },
        ].map((c, i) => (
          <div key={i} className="card">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="Cari no kontrak, relasi, produk, DO… (mis: cpo, jas mulia)" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input" value={filterProduk} onChange={e => setFilterProduk(e.target.value)}>
            <option value="">Semua Produk</option>
            <option>CPO</option><option>RBDPL</option><option>B-40</option><option>BE</option><option>PFAD</option>
          </select>
          <select className="input" value={filterRelasi} onChange={e => setFilterRelasi(e.target.value)}>
            <option value="">Semua Relasi {filterProduk && `(filter: ${filterProduk})`}</option>
            {relasi.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-400">Arah:</span>
          {['', 'IN', 'OUT'].map(a => (
            <button key={a} onClick={() => setFilterArah(a)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filterArah === a ? 'bg-primary-600 text-white' : 'bg-wins-dark text-slate-400 hover:text-white border border-wins-border'}`}>
              {a === '' ? 'Semua' : a === 'IN' ? '↓ Masuk' : '↑ Keluar'}
            </button>
          ))}
          {(search || filterProduk || filterRelasi || filterArah) && (
            <button onClick={() => { setSearch(''); setFilterProduk(''); setFilterRelasi(''); setFilterArah('') }} className="text-xs text-red-400 hover:text-red-300 ml-auto">
              ✕ Bersihkan filter
            </button>
          )}
          <span className="text-xs text-slate-500 ml-auto">Menampilkan {data.length} kontrak</span>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-wins-border">
                <th className="table-header">No. Kontrak</th>
                <th className="table-header">Relasi</th>
                <th className="table-header">Produk</th>
                <th className="table-header text-right">Kuota (Ton)</th>
                <th className="table-header text-right">Aktual (Ton)</th>
                <th className="table-header text-right">Sisa (Ton)</th>
                <th className="table-header">Realisasi</th>
                <th className="table-header">Jatuh Tempo</th>
                <th className="table-header">Status</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {data.map(k => (
                <tr key={k.id} className="hover:bg-wins-border/30 transition-colors">
                  <td className="table-cell text-xs font-mono text-primary-300">{k.no_kontrak}</td>
                  <td className="table-cell text-xs max-w-[120px] truncate">{k.relasi_nama}</td>
                  <td className="table-cell"><span className="badge-neutral">{k.produk}</span></td>
                  <td className="table-cell text-right font-mono">{fmt.tonRaw(k.quantity_kg)}</td>
                  <td className="table-cell text-right font-mono">{fmt.tonRaw(k.aktual_kg)}</td>
                  <td className={`table-cell text-right font-mono ${k.sisa_kg < 0 ? 'text-red-400' : ''}`}>{fmt.tonRaw(k.sisa_kg)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 bg-wins-dark rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: Math.min(k.pct_realisasi * 100, 100) + '%' }} />
                      </div>
                      <span className="text-xs text-slate-400">{fmt.pct(k.pct_realisasi)}</span>
                    </div>
                  </td>
                  <td className="table-cell text-xs">{fmt.tgl(k.jatuh_tempo)}</td>
                  <td className="table-cell"><StatusBadge s={k.status_kontrak} /></td>
                  <td className="table-cell">
                    <button onClick={() => openEdit(k)} className="text-slate-400 hover:text-primary-400 text-xs transition-colors">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-wins-card border border-wins-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-wins-border sticky top-0 bg-wins-card">
              <h2 className="font-semibold text-white">{editId ? 'Edit Kontrak' : 'Tambah Kontrak'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-slate-400 hover:text-white" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="label">No. Kontrak *</label><input className="input" value={form.no_kontrak} onChange={set('no_kontrak')} /></div>
                <div><label className="label">Arah</label>
                  <select className="input" value={form.arah} onChange={set('arah')}>
                    <option value="IN">↓ Masuk (IN)</option>
                    <option value="OUT">↑ Keluar (OUT)</option>
                  </select>
                </div>
                <div><label className="label">Relasi</label>
                  <select className="input" value={form.relasi_id} onChange={e => {
                    const r = relasi.find(x => String(x.id) === e.target.value)
                    setForm(f => ({ ...f, relasi_id: e.target.value, relasi_nama: r?.nama || '' }))
                  }}>
                    <option value="">-- Pilih --</option>
                    {relasi.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                </div>
                <div><label className="label">Produk</label>
                  <select className="input" value={form.produk} onChange={set('produk')}>
                    <option value="">--</option>
                    {['CPO','RBDPL','B-40','BE','PFAD'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className="label">Kuota (Kg)</label><input type="number" className="input" value={form.quantity_kg} onChange={set('quantity_kg')} /></div>
                <div><label className="label">Harga Satuan (Rp/Kg)</label><input type="number" className="input" value={form.harga_satuan} onChange={set('harga_satuan')} /></div>
                <div><label className="label">PPN</label>
                  <select className="input" value={form.ppn} onChange={set('ppn')}>
                    <option value="0.11">11%</option><option value="0">0%</option>
                  </select>
                </div>
                {form.quantity_kg && form.harga_satuan && (
                  <div className="col-span-2 bg-wins-dark rounded-lg px-4 py-3 text-sm">
                    Nilai Kontrak: <strong className="text-primary-300">{fmt.rp(form.quantity_kg * form.harga_satuan * (1 + parseFloat(form.ppn || 0)))}</strong>
                  </div>
                )}
                <div><label className="label">Tanggal Penyerahan</label><input type="date" className="input" value={form.tanggal_penyerahan} onChange={set('tanggal_penyerahan')} /></div>
                <div><label className="label">Jatuh Tempo</label><input type="date" className="input" value={form.jatuh_tempo} onChange={set('jatuh_tempo')} /></div>
                <div><label className="label">Lokasi Penyerahan</label><input className="input" value={form.lokasi_penyerahan} onChange={set('lokasi_penyerahan')} /></div>
                <div><label className="label">Status Pengiriman</label><input className="input" value={form.status_pengiriman} onChange={set('status_pengiriman')} /></div>
                <div className="col-span-2"><label className="label">Catatan</label><textarea className="input h-16 resize-none" value={form.catatan} onChange={set('catatan')} /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={loading} className="btn-primary flex-1 py-2.5">{loading ? 'Menyimpan...' : 'Simpan'}</button>
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 py-2.5">Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
