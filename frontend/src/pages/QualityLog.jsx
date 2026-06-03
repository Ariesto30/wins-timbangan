import { useEffect, useState } from 'react'
import { FlaskConical, Plus, X, Save, Trash2, AlertTriangle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import api from '../utils/api'

const PRODUK = ['CPO', 'RBDPL', 'RBDPS', 'PFAD', 'Stearin', 'Olein', 'RBDPO']
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const tt = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }

export default function QualityLog() {
  const [data, setData] = useState(null)
  const [filterProduk, setFilterProduk] = useState('Semua')
  const [showForm, setShowForm] = useState(false)
  const [edit, setEdit] = useState(null)

  function load() { api.get('/quality', { params: { produk: filterProduk } }).then(r => setData(r.data)) }
  useEffect(() => { load() }, [filterProduk])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' }}>
            <FlaskConical size={22} className="text-white" />
          </div>
          <div>
            <h1 className="page-title">Quality Log</h1>
            <p className="page-subtitle">Parameter lab (FFA, M&I, IV, DOBI) + deteksi off-spec</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={filterProduk} onChange={e => setFilterProduk(e.target.value)} className="input w-auto">
            <option>Semua</option>{PRODUK.map(p => <option key={p}>{p}</option>)}
          </select>
          <button onClick={() => { setEdit({ tanggal: new Date().toISOString().slice(0, 10), produk: 'CPO' }); setShowForm(true) }} className="btn-primary flex items-center gap-2"><Plus size={15} /> Input Lab</button>
        </div>
      </div>

      {!data ? <div className="text-gray-500 py-10 text-center">Memuat...</div> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KpiBox label="Total Sampel" value={data.summary.total} />
            <KpiBox label="Off-Spec" value={data.summary.off_spec} color={data.summary.off_spec > 0 ? 'red' : 'green'} />
            <KpiBox label="Rata FFA" value={data.summary.avg_ffa != null ? `${data.summary.avg_ffa}%` : '–'} />
          </div>

          {data.trend.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Trend FFA per Bulan</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={pivotTrend(data.trend)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bulan" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} unit="%" />
                  <Tooltip contentStyle={tt} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {PRODUK.filter(p => data.trend.some(t => t.produk === p)).map((p, i) => (
                    <Line key={p} type="monotone" dataKey={p} stroke={['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444'][i % 5]} strokeWidth={2} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0"><tr className="border-b border-gray-200 bg-gray-50">
                  {['Tanggal', 'Produk', 'Relasi/Sampel', 'FFA', 'M&I', 'IV', 'DOBI', 'Color', 'Status', ''].map(h => <th key={h} className="table-header">{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.rows.length === 0 && <tr><td colSpan={10} className="text-center text-gray-400 py-8">Belum ada data lab. Klik "Input Lab".</td></tr>}
                  {data.rows.map(r => (
                    <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${r.off_spec ? 'bg-red-50/40' : ''}`}>
                      <td className="table-cell text-xs">{r.tanggal}</td>
                      <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                      <td className="table-cell text-xs">{r.relasi_nama || r.sampel || '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.ffa ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.mni ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.iv ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.dobi ?? '–'}</td>
                      <td className="table-cell text-xs">{r.color || '–'}</td>
                      <td className="table-cell">{r.off_spec ? <span className="badge-danger" title={r.flags.join('; ')}>OFF-SPEC</span> : <span className="badge-success">OK</span>}</td>
                      <td className="table-cell">
                        <button onClick={() => { setEdit(r); setShowForm(true) }} className="text-gray-400 hover:text-gray-700 text-xs mr-2">edit</button>
                        <button onClick={async () => { if (confirm('Hapus?')) { await api.delete(`/quality/${r.id}`); load() } }} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && <QualityForm rec={edit} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function pivotTrend(trend) {
  const byBulan = {}
  trend.forEach(t => {
    const key = t.bulan
    if (!byBulan[key]) byBulan[key] = { bulan: t.bulan.slice(2) }
    byBulan[key][t.produk] = t.avg_ffa
  })
  return Object.values(byBulan).sort((a, b) => a.bulan.localeCompare(b.bulan))
}

function QualityForm({ rec, onClose, onSaved }) {
  const [f, setF] = useState(rec)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!f.tanggal) { alert('Tanggal wajib'); return }
    setSaving(true)
    try {
      if (f.id) await api.put(`/quality/${f.id}`, f); else await api.post('/quality', f)
      onSaved()
    } catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{f.id ? 'Edit' : 'Input'} Hasil Lab</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Fld label="Tanggal *"><input type="date" value={f.tanggal || ''} onChange={e => set('tanggal', e.target.value)} className="input w-full" /></Fld>
          <Fld label="Produk"><select value={f.produk || ''} onChange={e => set('produk', e.target.value)} className="input w-full"><option value="">—</option>{PRODUK.map(p => <option key={p}>{p}</option>)}</select></Fld>
          <Fld label="Relasi/Supplier"><input value={f.relasi_nama || ''} onChange={e => set('relasi_nama', e.target.value)} className="input w-full" /></Fld>
          <Fld label="Sampel/Batch"><input value={f.sampel || ''} onChange={e => set('sampel', e.target.value)} className="input w-full" /></Fld>
          <Fld label="FFA (%)"><input type="number" step="any" value={f.ffa ?? ''} onChange={e => set('ffa', e.target.value)} className="input w-full" /></Fld>
          <Fld label="M&I (%)"><input type="number" step="any" value={f.mni ?? ''} onChange={e => set('mni', e.target.value)} className="input w-full" /></Fld>
          <Fld label="IV"><input type="number" step="any" value={f.iv ?? ''} onChange={e => set('iv', e.target.value)} className="input w-full" /></Fld>
          <Fld label="DOBI"><input type="number" step="any" value={f.dobi ?? ''} onChange={e => set('dobi', e.target.value)} className="input w-full" /></Fld>
          <Fld label="Color"><input value={f.color || ''} onChange={e => set('color', e.target.value)} placeholder="cth 3.0 R" className="input w-full" /></Fld>
          <div className="col-span-full"><Fld label="Catatan"><input value={f.catatan || ''} onChange={e => set('catatan', e.target.value)} className="input w-full" /></Fld></div>
        </div>
        <div className="px-5 pb-5 flex items-center gap-3">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button>
          <span className="text-xs text-gray-400 flex items-center gap-1"><AlertTriangle size={12} /> Spec CPO: FFA &lt;5%, M&I &lt;0.25%</span>
        </div>
      </div>
    </div>
  )
}

function Fld({ label, children }) { return <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div> }
function KpiBox({ label, value, color }) {
  const txt = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : 'text-gray-800'
  return <div className="card"><div className="text-xs text-gray-500">{label}</div><div className={`text-xl font-bold mt-1 ${txt}`}>{value}</div></div>
}
