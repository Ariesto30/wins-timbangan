import { useEffect, useState } from 'react'
import { Database, Plus, X, Save, Trash2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import api from '../utils/api'

const PRODUK = ['CPO', 'RBDPL', 'RBDPS', 'PFAD', 'Stearin', 'Olein', 'RBDPO', 'B-40', 'BE']
const fmt = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })

export default function TankInventory() {
  const [data, setData] = useState(null)
  const [editTank, setEditTank] = useState(null) // {id?,...} for tank form
  const [moveTank, setMoveTank] = useState(null) // tank for movement panel

  function load() { api.get('/tank').then(r => setData(r.data)) }
  useEffect(() => { load() }, [])

  if (!data) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = data.summary

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0ea5e9,#0369a1)' }}>
            <Database size={22} className="text-white" />
          </div>
          <div>
            <h1 className="page-title">Tank Inventory</h1>
            <p className="page-subtitle">Stok & utilisasi tangki + log pergerakan</p>
          </div>
        </div>
        <button onClick={() => setEditTank({ nama: '', produk: '', kapasitas_mt: 0, kode: '', lokasi: '' })} className="btn-primary flex items-center gap-2"><Plus size={15} /> Tangki Baru</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiBox label="Jumlah Tangki" value={s.total_tank} />
        <KpiBox label="Total Kapasitas" value={`${fmt(s.total_kapasitas)} MT`} />
        <KpiBox label="Total Stok" value={`${fmt(s.total_stok)} MT`} color="sky" />
        <KpiBox label="Utilisasi" value={`${s.util_pct}%`} color={s.util_pct > 85 ? 'red' : 'green'} />
        <KpiBox label="Tangki Penuh (≥90%)" value={s.penuh} color={s.penuh > 0 ? 'orange' : 'green'} />
      </div>

      {data.tanks.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">Belum ada tangki. Klik "Tangki Baru" untuk menambah 14 tangki Anda.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.tanks.map(t => <TankCard key={t.id} t={t} onEdit={() => setEditTank(t)} onMove={() => setMoveTank(t)} />)}
        </div>
      )}

      {editTank && <TankForm tank={editTank} onClose={() => setEditTank(null)} onSaved={() => { setEditTank(null); load() }} />}
      {moveTank && <MovementPanel tank={moveTank} onClose={() => setMoveTank(null)} onChanged={load} />}
    </div>
  )
}

function TankCard({ t, onEdit, onMove }) {
  const pct = t.util_pct
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : pct < 10 ? '#94a3b8' : '#0ea5e9'
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-bold text-gray-800">{t.kode ? `${t.kode} · ` : ''}{t.nama}</div>
          <div className="text-xs text-gray-400">{t.produk || 'belum diset'} {t.lokasi ? `· ${t.lokasi}` : ''}</div>
        </div>
        <button onClick={onEdit} className="text-gray-400 hover:text-gray-700 text-xs">edit</button>
      </div>
      {/* Gauge */}
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <div className="flex justify-between text-xs mb-3">
        <span className="font-semibold" style={{ color }}>{fmt(t.stok)} MT ({pct}%)</span>
        <span className="text-gray-400">kap. {fmt(t.kapasitas_mt)} MT</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{t.last_update ? `update ${t.last_update}` : 'belum ada gerakan'}</span>
        <button onClick={onMove} className="text-xs text-sky-600 hover:text-sky-800 font-medium">+ Pergerakan</button>
      </div>
    </div>
  )
}

function TankForm({ tank, onClose, onSaved }) {
  const [f, setF] = useState(tank)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!f.nama) { alert('Nama tangki wajib'); return }
    setSaving(true)
    try {
      if (f.id) await api.put(`/tank/${f.id}`, f)
      else await api.post('/tank', f)
      onSaved()
    } catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  async function del() {
    if (!f.id || !confirm('Hapus tangki ini beserta riwayatnya?')) return
    await api.delete(`/tank/${f.id}`); onSaved()
  }
  return (
    <Modal title={f.id ? 'Edit Tangki' : 'Tangki Baru'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kode"><input value={f.kode || ''} onChange={e => set('kode', e.target.value)} placeholder="T-01" className="input w-full" /></Field>
        <Field label="Nama *"><input value={f.nama} onChange={e => set('nama', e.target.value)} placeholder="Tangki CPO 1" className="input w-full" /></Field>
        <Field label="Produk">
          <select value={f.produk || ''} onChange={e => set('produk', e.target.value)} className="input w-full">
            <option value="">— pilih —</option>{PRODUK.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Kapasitas (MT)"><input type="number" step="any" value={f.kapasitas_mt} onChange={e => set('kapasitas_mt', e.target.value)} className="input w-full" /></Field>
        <Field label="Lokasi"><input value={f.lokasi || ''} onChange={e => set('lokasi', e.target.value)} className="input w-full" /></Field>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button>
        {f.id && <button onClick={del} className="text-red-500 hover:text-red-700 p-2"><Trash2 size={16} /></button>}
      </div>
    </Modal>
  )
}

function MovementPanel({ tank, onClose, onChanged }) {
  const [moves, setMoves] = useState([])
  const [form, setForm] = useState({ tanggal: new Date().toISOString().slice(0, 10), inbound: '', outbound: '', catatan: '' })
  const [saving, setSaving] = useState(false)
  function load() { api.get(`/tank/${tank.id}/movements`).then(r => setMoves(r.data)) }
  useEffect(() => { load() }, [])
  async function add() {
    if (!form.tanggal) return
    setSaving(true)
    try { await api.post(`/tank/${tank.id}/movements`, form); setForm({ ...form, inbound: '', outbound: '', catatan: '' }); load(); onChanged() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  async function del(id) { if (!confirm('Hapus gerakan ini?')) return; await api.delete(`/tank/movements/${id}`); load(); onChanged() }
  return (
    <Modal title={`Pergerakan — ${tank.kode || tank.nama}`} onClose={onClose} wide>
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <Field label="Tanggal"><input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} className="input w-full" /></Field>
        <Field label="Masuk (MT)"><input type="number" step="any" value={form.inbound} onChange={e => setForm({ ...form, inbound: e.target.value })} className="input w-full" /></Field>
        <Field label="Keluar (MT)"><input type="number" step="any" value={form.outbound} onChange={e => setForm({ ...form, outbound: e.target.value })} className="input w-full" /></Field>
        <Field label="Catatan"><input value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} className="input w-full" /></Field>
        <button onClick={add} disabled={saving} className="btn-primary flex items-center justify-center gap-1"><Plus size={14} /> Tambah</button>
      </div>
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 bg-gray-50">
            {['Tanggal', 'Opening', 'Masuk', 'Keluar', 'Closing', 'Catatan', ''].map(h => <th key={h} className="table-header">{h}</th>)}
          </tr></thead>
          <tbody>
            {moves.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-6">Belum ada pergerakan</td></tr>}
            {moves.map(m => (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="table-cell text-xs">{m.tanggal}</td>
                <td className="table-cell font-mono text-xs">{fmt(m.opening)}</td>
                <td className="table-cell font-mono text-xs text-green-600"><ArrowDownCircle size={11} className="inline" /> {fmt(m.inbound)}</td>
                <td className="table-cell font-mono text-xs text-orange-600"><ArrowUpCircle size={11} className="inline" /> {fmt(m.outbound)}</td>
                <td className="table-cell font-mono text-xs font-bold">{fmt(m.closing)}</td>
                <td className="table-cell text-xs text-gray-500">{m.catatan}</td>
                <td className="table-cell"><button onClick={() => del(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div>
}

function KpiBox({ label, value, color }) {
  const txt = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'sky' ? 'text-sky-600' : color === 'orange' ? 'text-orange-500' : 'text-gray-800'
  return <div className="card"><div className="text-xs text-gray-500">{label}</div><div className={`text-xl font-bold mt-1 ${txt}`}>{value}</div></div>
}
