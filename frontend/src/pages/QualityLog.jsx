import { useEffect, useState } from 'react'
import { FlaskConical, Plus, X, Save, Trash2, AlertTriangle, Activity, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import api from '../utils/api'

const PRODUK = ['CPO', 'RBDPL', 'RBDPS', 'PFAD', 'Stearin', 'Olein', 'RBDPO']
const tt = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }

export default function QualityLog() {
  const [tab, setTab] = useState('log')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0F172A,#1E293B)' }}>
          <FlaskConical size={22} className="text-white" />
        </div>
        <div>
          <h1 className="page-title">Quality & Stability</h1>
          <p className="page-subtitle">Lab harian per tangki + evaluasi stabilitas mutu penyimpanan</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        {[{ id: 'log', label: 'Input & Log Lab', icon: FlaskConical }, { id: 'stability', label: 'Evaluasi Stabilitas', icon: Activity }].map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>
      {tab === 'log' ? <QualityLogTab /> : <StabilityTab />}
    </div>
  )
}

/* ───── TAB 1: Input & Log ───── */
function QualityLogTab() {
  const [data, setData] = useState(null)
  const [tanks, setTanks] = useState([])
  const [filterProduk, setFilterProduk] = useState('Semua')
  const [edit, setEdit] = useState(null)

  const [err, setErr] = useState(null)
  function load() {
    setErr(null)
    api.get('/quality', { params: { produk: filterProduk } }).then(r => setData(r.data)).catch(e => setErr(e.response?.data?.error || e.message || 'Gagal memuat'))
  }
  useEffect(() => { load() }, [filterProduk])
  useEffect(() => { api.get('/tank').then(r => setTanks(r.data.tanks)).catch(() => {}) }, [])

  if (err) return (
    <div className="card bg-red-50 border-red-200 text-center py-10">
      <div className="text-red-600 font-semibold mb-1">Gagal memuat data</div>
      <div className="text-xs text-gray-500 mb-4">{err}</div>
      <button onClick={load} className="btn-primary">Coba Lagi</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select value={filterProduk} onChange={e => setFilterProduk(e.target.value)} className="input w-auto">
          <option>Semua</option>{PRODUK.map(p => <option key={p}>{p}</option>)}
        </select>
        <button onClick={() => setEdit({ tanggal: new Date().toISOString().slice(0, 10), produk: 'CPO' })} className="btn-primary flex items-center gap-2"><Plus size={15} /> Input Lab</button>
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
                  {['Tanggal', 'Tangki', 'Produk', 'FFA', 'M+I', 'IV', 'DOBI', 'PV', 'CP', 'MP', 'Status', ''].map(h => <th key={h} className="table-header">{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.rows.length === 0 && <tr><td colSpan={12} className="text-center text-gray-400 py-8">Belum ada data lab. Klik "Input Lab".</td></tr>}
                  {data.rows.map(r => (
                    <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${r.off_spec ? 'bg-red-50/40' : ''}`}>
                      <td className="table-cell text-xs">{r.tanggal}</td>
                      <td className="table-cell text-xs">{r.tank_nama || r.tank_kode || '–'}</td>
                      <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                      <td className="table-cell font-mono text-xs">{r.ffa ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.mni ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.iv ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.dobi ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.pv ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.cp ?? '–'}</td>
                      <td className="table-cell font-mono text-xs">{r.mp ?? '–'}</td>
                      <td className="table-cell">{r.off_spec ? <span className="badge-danger" title={r.flags.join('; ')}>OFF-SPEC</span> : <span className="badge-success">OK</span>}</td>
                      <td className="table-cell">
                        <button onClick={() => setEdit(r)} className="text-gray-400 hover:text-gray-700 text-xs mr-2">edit</button>
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

      {edit && <QualityForm rec={edit} tanks={tanks} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function pivotTrend(trend) {
  const byBulan = {}
  trend.forEach(t => { const k = t.bulan; if (!byBulan[k]) byBulan[k] = { bulan: t.bulan.slice(2) }; byBulan[k][t.produk] = t.avg_ffa })
  return Object.values(byBulan).sort((a, b) => a.bulan.localeCompare(b.bulan))
}

function QualityForm({ rec, tanks, onClose, onSaved }) {
  const [f, setF] = useState(rec)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  function onTank(id) {
    const t = tanks.find(x => String(x.id) === String(id))
    setF(p => ({ ...p, tank_id: id, produk: t?.produk || p.produk }))
  }
  async function save() {
    if (!f.tanggal) { alert('Tanggal wajib'); return }
    setSaving(true)
    try { if (f.id) await api.put(`/quality/${f.id}`, f); else await api.post('/quality', f); onSaved() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  const np = ['ffa', 'mni', 'iv', 'dobi', 'pv', 'anv', 'tox', 'cp', 'mp']
  const npLabel = { ffa: 'FFA (%)', mni: 'M+I (%)', iv: 'IV', dobi: 'DOBI', pv: 'PV', anv: 'ANV', tox: 'TOX', cp: 'CP (°C)', mp: 'MP (°C)' }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{f.id ? 'Edit' : 'Input'} Hasil Lab</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <Fld label="Tanggal *"><input type="date" value={f.tanggal || ''} onChange={e => set('tanggal', e.target.value)} className="input w-full" /></Fld>
            <Fld label="Tangki">
              <select value={f.tank_id || ''} onChange={e => onTank(e.target.value)} className="input w-full">
                <option value="">— pilih —</option>{tanks.map(t => <option key={t.id} value={t.id}>{t.no_urut}. {t.nama}</option>)}
              </select>
            </Fld>
            <Fld label="Produk"><select value={f.produk || ''} onChange={e => set('produk', e.target.value)} className="input w-full"><option value="">—</option>{PRODUK.map(p => <option key={p}>{p}</option>)}</select></Fld>
            <Fld label="Tonase (kg)"><input type="number" step="any" value={f.tonase ?? ''} onChange={e => set('tonase', e.target.value)} className="input w-full" /></Fld>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mb-3">
            {np.map(k => <Fld key={k} label={npLabel[k]}><input type="number" step="any" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} className="input w-full" /></Fld>)}
            <Fld label="Color"><input value={f.color || ''} onChange={e => set('color', e.target.value)} placeholder="3.0 R" className="input w-full" /></Fld>
          </div>
          <Fld label="Catatan / Sampel"><input value={f.catatan || ''} onChange={e => set('catatan', e.target.value)} className="input w-full" /></Fld>
        </div>
        <div className="px-5 pb-5 flex items-center gap-3 flex-wrap">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button>
          <span className="text-[11px] text-gray-400 flex items-center gap-1"><AlertTriangle size={11} /> Spec: CPO FFA≤5%, DOBI≥2.31 · Olein FFA≤0.1%, CP≤10° · RBDPO PV≤2 · Stearin MP≥48°</span>
        </div>
      </div>
    </div>
  )
}

/* ───── TAB 2: Stability Evaluation ───── */
function StabilityTab() {
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { api.get('/quality/stability').then(r => setData(r.data)).catch(e => setErr(e.response?.data?.error || e.message)) }, [])
  if (err) return <div className="card bg-red-50 border-red-200 text-center py-8"><div className="text-red-600 font-semibold mb-1">Gagal memuat</div><div className="text-xs text-gray-500">{err}</div></div>
  if (!data) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = data.summary
  const badge = st => {
    const m = { 'OVER SPEC': 'badge-danger', 'MENDEKATI BATAS': 'badge-warning', 'DRIFT': 'badge-warning', 'STABIL': 'badge-success', 'DATA KURANG': 'badge-neutral' }
    return <span className={m[st] || 'badge-neutral'}>{st}</span>
  }
  return (
    <div className="space-y-4">
      <div className="card bg-purple-50 border-purple-200 flex items-start gap-3">
        <TrendingUp className="text-purple-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-xs text-purple-700">
          <strong>Evaluasi Stabilitas Mutu</strong> — Memantau perubahan FFA & parameter mutu selama produk disimpan di tangki. Laju kenaikan FFA/minggu dihitung otomatis dari riwayat lab. Butuh ≥2 input lab per tangki. Isi data di tab "Input & Log".
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiBox label="Total Tangki" value={s.total} />
        <KpiBox label="Stabil" value={s.stabil} color="green" />
        <KpiBox label="Drift FFA" value={s.drift} color={s.drift > 0 ? 'orange' : 'green'} />
        <KpiBox label="Mendekati Batas" value={s.mendekati} color={s.mendekati > 0 ? 'orange' : 'green'} />
        <KpiBox label="Over Spec" value={s.over_spec} color={s.over_spec > 0 ? 'red' : 'green'} />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50">
              {['#', 'Tangki', 'Produk', 'Data', 'FFA Awal→Akhir', 'Δ/Minggu', 'Tersimpan', '~Minggu ke Batas', 'Status', 'Evaluasi'].map(h => <th key={h} className="table-header">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.results.map(r => (
                <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${r.status === 'OVER SPEC' ? 'bg-red-50/40' : ''}`} onClick={() => r.n >= 2 && setDetail(r)}>
                  <td className="table-cell text-xs text-gray-400">{r.no_urut}</td>
                  <td className="table-cell text-xs font-medium">{r.nama}</td>
                  <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                  <td className="table-cell text-xs text-gray-500">{r.n}×</td>
                  <td className="table-cell font-mono text-xs">{r.ffa_awal != null ? `${r.ffa_awal} → ${r.ffa_akhir}` : '–'}</td>
                  <td className="table-cell font-mono text-xs">{r.ffa_per_minggu != null ? <span className={r.ffa_per_minggu > 0.01 ? 'text-orange-600 font-bold' : 'text-gray-500'}>{r.ffa_per_minggu >= 0 ? '+' : ''}{r.ffa_per_minggu}</span> : '–'}</td>
                  <td className="table-cell text-xs">{r.hari_tersimpan != null ? `${r.hari_tersimpan} hr` : '–'}</td>
                  <td className="table-cell text-xs">{r.minggu_ke_batas != null ? <span className={r.minggu_ke_batas < 4 ? 'text-red-600 font-bold' : 'text-gray-600'}>{r.minggu_ke_batas} mgg</span> : '–'}</td>
                  <td className="table-cell">{badge(r.status)}</td>
                  <td className="table-cell text-[11px] text-gray-500 max-w-xs">{r.evaluasi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">💡 Klik baris tangki (yang punya ≥2 data) untuk melihat grafik tren FFA.</p>

      {detail && <StabilityDetail r={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function StabilityDetail({ r, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">{r.nama} — Tren FFA</h3>
            <p className="text-xs text-gray-400">{r.produk} · {r.tgl_awal} → {r.tgl_akhir} ({r.rentang_hari} hari)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={r.series.map(x => ({ ...x, tgl: x.tanggal?.slice(5) }))} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tgl" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} unit="%" domain={['auto', 'auto']} />
              <Tooltip contentStyle={tt} formatter={v => [v + '%', 'FFA']} />
              {r.ffa_max != null && <ReferenceLine y={r.ffa_max} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Batas ${r.ffa_max}%`, fill: '#ef4444', fontSize: 10 }} />}
              <Line type="monotone" dataKey="ffa" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
            <Mini label="FFA Awal" value={`${r.ffa_awal}%`} />
            <Mini label="FFA Akhir" value={`${r.ffa_akhir}%`} />
            <Mini label="Δ/Minggu" value={`${r.ffa_per_minggu >= 0 ? '+' : ''}${r.ffa_per_minggu}`} />
            <Mini label="Hari Tersimpan" value={r.hari_tersimpan != null ? `${r.hari_tersimpan} hr` : '–'} />
          </div>
          <div className="mt-3 p-3 rounded-lg bg-gray-50 text-xs text-gray-600">
            <strong>Kesimpulan:</strong> {r.evaluasi}
            {r.minggu_ke_batas != null && <div className="mt-1 text-orange-600">⏳ Proyeksi: ~{r.minggu_ke_batas} minggu lagi FFA mencapai batas {r.ffa_max}% bila laju bertahan.</div>}
            {r.be_digunakan && <div className="mt-1 text-gray-400">🧪 BE: {r.be_digunakan}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value }) { return <div className="bg-gray-50 rounded-lg p-2"><div className="text-gray-400 text-[10px]">{label}</div><div className="font-bold text-gray-800">{value}</div></div> }
function Fld({ label, children }) { return <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div> }
function KpiBox({ label, value, color }) {
  const txt = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'orange' ? 'text-orange-500' : 'text-gray-800'
  return <div className="card"><div className="text-xs text-gray-500">{label}</div><div className={`text-xl font-bold mt-1 ${txt}`}>{value}</div></div>
}
