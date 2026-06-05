import { useEffect, useState } from 'react'
import { Factory, Droplet, TrendingUp, TrendingDown, Scale, AlertTriangle, CheckCircle, Gauge, Layers, ArrowRightLeft, Plus, Save, Trash2, X } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart } from 'recharts'
import api from '../utils/api'

const fmt = (v, d = 1) => (v == null ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d }))
const fmtKg = v => (v == null ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 }))
const TABS = [
  { id: 'yield', label: 'Yield & Loss', icon: Gauge },
  { id: 'log', label: 'Log Harian', icon: Layers },
  { id: 'sounding', label: 'Rekonsiliasi Sounding', icon: Scale },
  { id: 'crosscheck', label: 'Cross-check CPO', icon: ArrowRightLeft },
]

export default function ProduksiRefinery() {
  const [tab, setTab] = useState('yield')
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: 'linear-gradient(120deg,#0f172a,#1e293b 55%,#7c2d12)' }}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center ring-1 ring-white/20" style={{ background: 'linear-gradient(135deg,#fb923c,#ea580c)' }}>
            <Factory size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Produksi Refinery <span className="text-[11px] font-semibold text-orange-300/90 align-middle ml-1">OPERASIONAL HARIAN</span></h1>
            <p className="text-sm text-slate-300/80">Neraca massa harian · yield · rekonsiliasi sounding · cross-check</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.id ? 'text-white shadow-lg shadow-orange-500/20' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-700'}`}
              style={tab === t.id ? { background: 'linear-gradient(135deg,#fb923c,#ea580c)' } : {}}>
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'yield' && <YieldTab />}
      {tab === 'log' && <LogTab />}
      {tab === 'sounding' && <SoundingTab />}
      {tab === 'crosscheck' && <CrosscheckTab />}
    </div>
  )
}

/* ───────── YIELD & LOSS ───────── */
function YieldTab() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { api.get('/production/summary').then(r => setD(r.data)).catch(e => setErr(e.message)) }, [])
  if (err) return <Err msg={err} />
  if (!d) return <Loading />
  const y = d.yield
  const trend = d.monthly.map(m => ({ ym: m.ym.slice(5), refining: m._yield.refining_yield, olein: m._yield.olein_yield, stearin: m._yield.stearin_yield, loss: m._yield.refining_loss }))
  const vol = d.monthly.map(m => ({ ym: m.ym.slice(5), CPO: m.cpo_feed, RBDPO: m.rbdpo, Olein: m.olein, Stearin: m.stearin, PFAD: m.pfad }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Gauge size={15} />} label="Refining Yield" value={y.refining_yield} unit="%" hint="RBDPO ÷ CPO diolah" accent="#16a34a" />
        <Kpi icon={<Droplet size={15} />} label="Olein Yield" value={y.olein_yield} unit="%" hint="Olein ÷ RBDPO" accent="#0ea5e9" />
        <Kpi icon={<Layers size={15} />} label="Stearin Yield" value={y.stearin_yield} unit="%" hint="Stearin ÷ RBDPO" accent="#7c3aed" />
        <Kpi icon={<TrendingDown size={15} />} label="Loss Refining" value={y.refining_loss} unit="%" hint="Susut proses refining" accent={y.refining_loss > 2 ? '#dc2626' : '#f59e0b'} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<TrendingUp size={15} />} label="PFAD Yield" value={y.pfad_yield} unit="%" accent="#db2777" />
        <Kpi icon={<TrendingDown size={15} />} label="Loss Fraksinasi" value={y.frac_loss} unit="%" accent={y.frac_loss > 2 ? '#dc2626' : '#f59e0b'} />
        <Kpi icon={<AlertTriangle size={15} />} label="Reject CPO" value={y.cpo_reject_pct} unit="%" accent="#ea580c" />
        <Kpi icon={<AlertTriangle size={15} />} label="Reject RBDPO" value={y.rbdpo_reject_pct} unit="%" accent="#ea580c" />
      </div>

      <div className="card">
        <div className="text-sm font-bold text-gray-700 mb-1">Tren Yield Bulanan (%)</div>
        <div className="text-xs text-gray-400 mb-3">{d.periode.hari} hari · {d.periode.dari} s/d {d.periode.sampai}</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend} margin={{ left: -10, right: 10, top: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip formatter={v => fmt(v, 2) + '%'} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="refining" name="Refining" stroke="#16a34a" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="olein" name="Olein" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="stearin" name="Stearin" stroke="#7c3aed" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="loss" name="Loss" stroke="#dc2626" strokeWidth={2} dot={false} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="text-sm font-bold text-gray-700 mb-3">Volume Produksi per Bulan (MT)</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={vol} margin={{ left: -10, right: 10, top: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => fmt(v) + ' MT'} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="CPO" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="RBDPO" fill="#0d9488" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Olein" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Stearin" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            <Bar dataKey="PFAD" fill="#db2777" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ───────── LOG HARIAN ───────── */
const todayStr = () => new Date().toISOString().slice(0, 10)
function LogTab() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const [edit, setEdit] = useState(null) // record being added/edited
  function load() { api.get('/production/daily').then(r => setRows(r.data)).catch(e => setErr(e.message)) }
  useEffect(() => { load() }, [])
  if (err) return <Err msg={err} />
  if (!rows) return <Loading />
  async function del(id) {
    if (!confirm('Hapus baris produksi ini?')) return
    await api.delete('/production/' + id); load()
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">Log Produksi Harian — <b>{rows.length}</b> hari (MT)</div>
        <button onClick={() => setEdit({ tanggal: todayStr() })} className="btn-primary flex items-center gap-1.5 text-sm"><Plus size={15} /> Input Harian</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs">
            {['Tanggal', 'CPO In', 'CPO Feed', 'CPO Rej', 'RBDPO', 'RBDPO Feed', 'Olein', 'Stearin', 'PFAD', 'Ref%', 'Olein%', ''].map(h => <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-orange-50/40 cursor-pointer" onClick={() => setEdit(r)}>
                <td className="px-2.5 py-1.5 font-medium text-gray-700">{r.tanggal}</td>
                <td className="px-2.5 py-1.5 font-mono">{fmt(r.cpo_in)}</td>
                <td className="px-2.5 py-1.5 font-mono">{fmt(r.cpo_feed)}</td>
                <td className="px-2.5 py-1.5 font-mono text-orange-600">{fmt(r.cpo_reject)}</td>
                <td className="px-2.5 py-1.5 font-mono text-teal-700">{fmt(r.rbdpo)}</td>
                <td className="px-2.5 py-1.5 font-mono">{fmt(r.rbdpo_feed)}</td>
                <td className="px-2.5 py-1.5 font-mono text-green-700">{fmt(r.olein)}</td>
                <td className="px-2.5 py-1.5 font-mono text-purple-700">{fmt(r.stearin)}</td>
                <td className="px-2.5 py-1.5 font-mono text-pink-600">{fmt(r.pfad)}</td>
                <td className="px-2.5 py-1.5 font-mono text-gray-500">{r._yield.refining_yield || '–'}</td>
                <td className="px-2.5 py-1.5 font-mono text-gray-500">{r._yield.olein_yield || '–'}</td>
                <td className="px-2.5 py-1.5"><button onClick={e => { e.stopPropagation(); del(r.id) }} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ProdForm rec={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

const PFIELDS = [
  ['cpo_in', 'CPO In'], ['cpo_feed', 'CPO Feed'], ['cpo_reject', 'CPO Reject'], ['cpo_stock_akhir', 'Stok CPO Akhir'],
  ['rbdpo', 'RBDPO'], ['rbdpo_feed', 'RBDPO Feed'], ['rbdpo_reject', 'RBDPO Reject'], ['rbdpo_stock', 'Stok RBDPO'],
  ['olein', 'Olein'], ['olein_reject', 'Olein Reject'], ['olein_despatch', 'Olein Despatch'],
  ['stearin', 'Stearin'], ['stearin_reject', 'Stearin Reject'], ['stearin_despatch', 'Stearin Despatch'], ['pfad', 'PFAD'],
]
function ProdForm({ rec, onClose, onSaved }) {
  const [f, setF] = useState({ ...rec, tanggal: (rec.tanggal || todayStr()).slice(0, 10) })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!f.tanggal) { alert('Tanggal wajib'); return }
    setSaving(true)
    try { await api.post('/production', f); onSaved() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{rec.id ? 'Ubah' : 'Input'} Produksi Harian (MT)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="mb-3 max-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">Tanggal *</label>
            <input type="date" value={f.tanggal} onChange={e => set('tanggal', e.target.value)} className="input w-full" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {PFIELDS.map(([k, lbl]) => (
              <div key={k}>
                <label className="text-xs text-gray-500 block mb-1">{lbl}</label>
                <input type="number" step="any" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} className="input w-full" placeholder="0" />
              </div>
            ))}
          </div>
          <div className="text-[11px] text-gray-400 mt-3">Tanggal yang sama akan menimpa data harian sebelumnya (upsert). Yield dihitung otomatis.</div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── SOUNDING RECONCILIATION ───────── */
function SoundingTab() {
  const [periods, setPeriods] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { api.get('/production/sounding').then(r => setPeriods(r.data)).catch(e => setErr(e.message)) }, [])
  if (err) return <Err msg={err} />
  if (!periods) return <Loading />
  if (!periods.length) return <div className="card text-center text-gray-400 py-10">Belum ada data sounding.</div>
  const badge = f => f === 'tinggi' ? 'bg-red-100 text-red-700' : f === 'sedang' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  return (
    <div className="space-y-4">
      <div className="card bg-sky-50/60 border-sky-200 text-xs text-sky-800 flex items-start gap-2">
        <Scale size={15} className="mt-0.5 flex-shrink-0" />
        <div>Membandingkan <b>sounding fisik</b> (ukur dip tangki) vs <b>stok buku (DC)</b> per bulan. Toleransi ±0,5%. Variance tinggi = perlu investigasi (kebocoran, salah catat, atau uap/penyusutan).</div>
      </div>
      {periods.map(p => (
        <div key={p.label} className="card">
          <div className="text-sm font-bold text-gray-700 mb-3">{p.label}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs">
                {['Produk', 'Sounding (kg)', 'Buku/DC (kg)', 'Variance (kg)', 'Variance %', 'Status'].map(h => <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500">{h}</th>)}
              </tr></thead>
              <tbody>
                {p.items.map(i => (
                  <tr key={i.produk} className="border-b border-gray-50">
                    <td className="px-2.5 py-1.5 font-semibold text-gray-700">{i.produk}</td>
                    <td className="px-2.5 py-1.5 font-mono">{fmtKg(i.sounding)}</td>
                    <td className="px-2.5 py-1.5 font-mono">{fmtKg(i.dc)}</td>
                    <td className={`px-2.5 py-1.5 font-mono ${i.var_kg < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{i.var_kg > 0 ? '+' : ''}{fmtKg(i.var_kg)}</td>
                    <td className={`px-2.5 py-1.5 font-mono ${Math.abs(i.var_pct) > 0.5 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>{fmt(i.var_pct, 2)}%</td>
                    <td className="px-2.5 py-1.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge(i.flag)}`}>{i.flag === 'ok' ? 'Dalam toleransi' : i.flag === 'sedang' ? 'Perhatian' : 'Investigasi'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ───────── CROSS-CHECK CPO ───────── */
function CrosscheckTab() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { api.get('/production/crosscheck').then(r => setD(r.data)).catch(e => setErr(e.message)) }, [])
  if (err) return <Err msg={err} />
  if (!d) return <Loading />
  const chart = d.rows.map(r => ({ ym: r.ym.slice(2), Produksi: r.produksi_cpo_in, Timbangan: r.timbangan_cpo }))
  const badge = f => f === 'ok' ? 'bg-emerald-100 text-emerald-700' : f === 'sedang' ? 'bg-amber-100 text-amber-700' : f === 'no-timbangan' ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'
  return (
    <div className="space-y-4">
      <div className="card bg-amber-50/60 border-amber-200 text-xs text-amber-800 flex items-start gap-2">
        <ArrowRightLeft size={15} className="mt-0.5 flex-shrink-0" />
        <div>Validasi <b>CPO IN</b> (catatan produksi refinery) vs <b>CPO diterima di timbangan</b> per bulan. Selisih besar = ada CPO masuk yang belum/salah tercatat di salah satu sistem.
          {d.rentang && <span className="block mt-1 text-amber-700/80">📅 Apple-to-apple: timbangan dibatasi rentang log produksi <b>{d.rentang.dari} s/d {d.rentang.sampai}</b> (riwayat timbangan sebelum periode ini tidak dihitung).</span>}
        </div>
      </div>
      <div className="card">
        <div className="text-sm font-bold text-gray-700 mb-3">Produksi vs Timbangan (MT)</div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chart} margin={{ left: -10, right: 10, top: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="ym" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => fmt(v) + ' MT'} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Produksi" fill="#fb923c" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Timbangan" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs">
            {['Bulan', 'Produksi CPO In', 'Timbangan CPO', 'Selisih (kg)', 'Selisih %', 'Status'].map(h => <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500">{h}</th>)}
          </tr></thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.ym} className="border-b border-gray-50">
                <td className="px-2.5 py-1.5 font-semibold text-gray-700">{r.ym}</td>
                <td className="px-2.5 py-1.5 font-mono">{fmt(r.produksi_cpo_in)}</td>
                <td className="px-2.5 py-1.5 font-mono">{fmt(r.timbangan_cpo)}</td>
                <td className={`px-2.5 py-1.5 font-mono ${r.selisih_kg < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{r.selisih_kg > 0 ? '+' : ''}{fmtKg(r.selisih_kg)}</td>
                <td className="px-2.5 py-1.5 font-mono">{r.selisih_pct == null ? '–' : fmt(r.selisih_pct, 2) + '%'}</td>
                <td className="px-2.5 py-1.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge(r.flag)}`}>{r.flag === 'ok' ? 'Cocok' : r.flag === 'sedang' ? 'Selisih kecil' : r.flag === 'no-timbangan' ? 'Tak ada timbangan' : 'Selisih besar'}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-gray-200 font-bold">
            <td className="px-2.5 py-2">TOTAL</td>
            <td className="px-2.5 py-2 font-mono">{fmt(d.total.produksi)}</td>
            <td className="px-2.5 py-2 font-mono">{fmt(d.total.timbangan)}</td>
            <td className="px-2.5 py-2 font-mono" colSpan={3}>Δ {fmt(d.total.selisih_mt)} MT</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  )
}

/* ───────── shared ───────── */
function Kpi({ icon, label, value, unit, hint, accent }) {
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1"><span style={{ color: accent }}>{icon}</span>{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold tabular-nums" style={{ color: accent }}>{fmt(value, 2)}</span>
        <span className="text-sm font-bold text-gray-400">{unit}</span>
      </div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}
const Loading = () => <div className="text-gray-400 text-center py-10">Memuat...</div>
const Err = ({ msg }) => <div className="card bg-red-50 border-red-200 text-red-700 text-sm py-6 text-center">Gagal memuat: {msg}</div>
