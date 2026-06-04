import { useEffect, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from 'recharts'
import { Truck, Settings, Fuel, DollarSign, TrendingUp, Save, X, Plus, Edit2 } from 'lucide-react'
import api, { fmt } from '../utils/api'
import { hasRole } from '../utils/auth'
import MonthRange from '../components/MonthRange'

const tooltipStyle = { backgroundColor: '#1a2632', border: '1px solid #2a3a4a', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }
const TRUCK_COLORS = { '6 Roda': '#f59e0b', '10 Roda': '#3b82f6', '12 Roda': '#22c55e' }
const MONTHS = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

export default function Armada() {
  const [tab, setTab] = useState('analisa-oat')
  const [tahun, setTahun] = useState(new Date().getFullYear().toString())
  const [bulanStart, setBulanStart] = useState('')
  const [bulanEnd, setBulanEnd] = useState('')
  const [produk, setProduk] = useState('Semua')
  const [truckType, setTruckType] = useState('Semua')
  const [relasiId, setRelasiId] = useState('')
  const [relasiList, setRelasiList] = useState([])

  // Cascading: produk → relasi
  useEffect(() => {
    const params = produk !== 'Semua' ? { produk } : {}
    api.get('/relasi', { params }).then(r => {
      setRelasiList(r.data)
      if (relasiId && !r.data.find(x => String(x.id) === String(relasiId))) setRelasiId('')
    })
  }, [produk])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Efisiensi Armada & OAT</h1>
          <p className="text-sm text-gray-400">Analisa konsumsi solar, biaya OAT, dan margin per trip</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="label">Tahun</label>
            <select className="input" value={tahun} onChange={e => setTahun(e.target.value)}>
              <option value="">Semua</option><option>2025</option><option>2026</option>
            </select>
          </div>
          <div>
            <label className="label">Bulan (rentang)</label>
            <MonthRange start={bulanStart} end={bulanEnd} onStart={setBulanStart} onEnd={setBulanEnd} />
          </div>
          <div>
            <label className="label">Produk</label>
            <select className="input" value={produk} onChange={e => setProduk(e.target.value)}>
              <option>Semua</option><option>CPO</option><option>RBDPL</option><option>RBDPS</option><option>B-40</option><option>BE</option><option>PFAD</option>
            </select>
          </div>
          <div>
            <label className="label">Jenis Truck</label>
            <select className="input" value={truckType} onChange={e => setTruckType(e.target.value)}>
              <option>Semua</option><option>6 Roda</option><option>10 Roda</option><option>12 Roda</option>
            </select>
          </div>
          <div>
            <label className="label">Relasi {produk !== 'Semua' && <span className="text-purple-600 normal-case">({produk})</span>}</label>
            <select className="input" value={relasiId} onChange={e => setRelasiId(e.target.value)}>
              <option value="">Semua Relasi</option>
              {relasiList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
        </div>
        {(produk !== 'Semua' || truckType !== 'Semua' || relasiId || bulanStart || bulanEnd) && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-gray-500">Filter aktif:</span>
            {produk !== 'Semua' && <span className="badge-info">Produk: {produk}</span>}
            {truckType !== 'Semua' && <span className="badge-info">Truck: {truckType}</span>}
            {(bulanStart || bulanEnd) && <span className="badge-info">Bulan: {MONTHS[parseInt(bulanStart)] || 'awal'} – {MONTHS[parseInt(bulanEnd)] || 'Des'}</span>}
            {relasiId && <span className="badge-info">Relasi: {relasiList.find(r => String(r.id) === String(relasiId))?.nama}</span>}
            <button onClick={() => { setProduk('Semua'); setTruckType('Semua'); setRelasiId(''); setBulanStart(''); setBulanEnd(''); }} className="text-red-600 hover:text-red-700 ml-2">✕ Reset</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'analisa-oat', label: 'Analisa OAT & Margin', icon: DollarSign },
          { id: 'efisiensi',   label: 'Efisiensi per Jenis Truck', icon: Truck },
          { id: 'kendaraan',   label: 'Per Kendaraan', icon: TrendingUp },
          { id: 'parameter',   label: 'Parameter OAT', icon: Settings },
          { id: 'tarif',       label: 'Tarif OAT per Relasi', icon: Fuel },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 ${tab === t.id ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'analisa-oat' && <AnalisaOAT tahun={tahun} bulanStart={bulanStart} bulanEnd={bulanEnd} produk={produk} truckType={truckType} relasiId={relasiId} />}
      {tab === 'efisiensi' && <EfisiensiPerJenis tahun={tahun} produk={produk} />}
      {tab === 'kendaraan' && <PerKendaraan tahun={tahun} />}
      {tab === 'parameter' && <ParameterOAT />}
      {tab === 'tarif' && <TarifOAT />}
    </div>
  )
}

/* ─── TAB 1: ANALISA OAT & MARGIN ──────────────── */
function AnalisaOAT({ tahun, bulanStart, bulanEnd, produk, truckType, relasiId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get('/armada/analisa-oat', { params: {
      tahun: tahun||undefined,
      bulan_start: bulanStart||undefined,
      bulan_end: bulanEnd||undefined,
      produk: produk!=='Semua'?produk:undefined,
      truck_type: truckType!=='Semua'?truckType:undefined,
      relasi_id: relasiId||undefined,
    } })
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [tahun, bulanStart, bulanEnd, produk, truckType, relasiId])

  if (loading) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  if (!data) return null
  const { summary, rows, param } = data

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Trip', value: fmt.num(summary.trip), color: 'text-gray-800' },
          { label: 'Total Omzet OAT', value: fmt.rp(summary.omzet), color: 'text-purple-600' },
          { label: 'Total Biaya', value: fmt.rp(summary.biaya), color: 'text-yellow-600' },
          { label: 'Total Margin', value: fmt.rp(summary.margin), color: summary.margin >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Margin %', value: summary.margin_pct + '%', color: summary.margin_pct >= 15 ? 'text-green-600' : summary.margin_pct >= 0 ? 'text-yellow-600' : 'text-red-600' },
        ].map((c, i) => (
          <div key={i} className="card">
            <p className="text-xs text-gray-400 mb-1">{c.label}</p>
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Detail Solar */}
      <div className="card flex items-center justify-between bg-orange-50 border-orange-200">
        <div className="flex items-center gap-3">
          <Fuel className="text-orange-600" size={20} />
          <div>
            <p className="text-xs text-gray-500">Konsumsi Solar Total</p>
            <p className="text-base font-bold text-orange-600">{fmt.num(summary.total_liter_solar)} liter</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Biaya Solar</p>
          <p className="text-base font-bold text-orange-600">{fmt.rp(summary.total_biaya_solar)}</p>
          <p className="text-xs text-gray-400">@ Rp {param.harga_solar.toLocaleString('id-ID')}/L</p>
        </div>
      </div>

      {/* Tabel Detail */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">Relasi</th>
                <th className="table-header">Produk</th>
                <th className="table-header">Truck</th>
                <th className="table-header">Lokasi</th>
                <th className="table-header text-right">Jarak PP</th>
                <th className="table-header text-right">Trip</th>
                <th className="table-header text-right">OAT/Kg</th>
                <th className="table-header text-right">Solar (L/trip)</th>
                <th className="table-header text-right">Biaya/Trip</th>
                <th className="table-header text-right">Omzet/Trip</th>
                <th className="table-header text-right">Margin %</th>
                <th className="table-header text-right">Total Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-400">Tidak ada data untuk filter ini</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                  <td className="table-cell text-xs max-w-[150px] truncate">{r.relasi_nama}</td>
                  <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                  <td className="table-cell text-xs" style={{ color: TRUCK_COLORS[r.truck_type] }}>{r.truck_type}</td>
                  <td className="table-cell text-xs text-gray-500">{r.lokasi || '—'}</td>
                  <td className="table-cell text-right text-xs">{r.jarak_pp ? fmt.num(r.jarak_pp) + ' km' : '—'}</td>
                  <td className="table-cell text-right">{r.trip}</td>
                  <td className="table-cell text-right text-xs font-mono">{r.oat_per_kg ? fmt.rp(r.oat_per_kg) : '—'}</td>
                  <td className="table-cell text-right text-orange-600 font-mono">{r.liter_per_trip || '—'}</td>
                  <td className="table-cell text-right text-yellow-700 font-mono text-xs">{r.total_biaya_per_trip ? fmt.rp(r.total_biaya_per_trip) : '—'}</td>
                  <td className="table-cell text-right text-purple-600 font-mono text-xs">{fmt.rp(r.omzet_per_trip)}</td>
                  <td className={`table-cell text-right font-bold ${r.margin_pct >= 15 ? 'text-green-600' : r.margin_pct >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {r.margin_pct}%
                  </td>
                  <td className={`table-cell text-right font-mono text-xs ${r.margin_total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt.rp(r.margin_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-400 italic">
          OAT/Kg = tarif input · Solar/trip = (½ jarak ÷ km/L muat) + (½ jarak ÷ km/L kosong) · Margin = (Omzet - Biaya) ÷ Omzet
        </div>
      </div>
    </div>
  )
}

/* ─── TAB 2: EFISIENSI PER JENIS TRUCK ──────────── */
function EfisiensiPerJenis({ tahun, produk }) {
  const [data, setData] = useState([])
  useEffect(() => {
    api.get('/armada/efisiensi', { params: { tahun: tahun||undefined, produk: produk!=='Semua'?produk:undefined } })
      .then(r => setData(r.data))
  }, [tahun, produk])

  const total = data.reduce((s, d) => s + d.total_netto_kg, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.map(t => (
          <div key={t.truck_type} className="card border-l-4" style={{ borderLeftColor: TRUCK_COLORS[t.truck_type] }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-gray-800 text-base">{t.truck_type}</h3>
                <p className="text-xs text-gray-400">{t.jml_kendaraan} unit kendaraan</p>
              </div>
              <Truck size={28} style={{ color: TRUCK_COLORS[t.truck_type] }} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total Trip</span><strong className="text-gray-800">{fmt.num(t.trip)}</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Netto</span><strong className="text-gray-800">{fmt.tonRaw(t.total_netto_kg)} ton</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Avg/Trip</span><strong className="text-purple-600">{fmt.kg(t.avg_netto)}</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Maks</span><strong className="text-green-600 text-xs">{fmt.num(t.maks_netto)} kg</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Min</span><strong className="text-red-600 text-xs">{fmt.num(t.min_netto)} kg</strong></div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex justify-between"><span className="text-gray-500">Share Volume</span><strong className="text-yellow-600">{total > 0 ? (t.total_netto_kg/total*100).toFixed(1) : 0}%</strong></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Perbandingan Avg Netto / Trip per Jenis Truck</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ left: -10, right: 30, top: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" />
            <XAxis dataKey="truck_type" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => (v/1000).toFixed(0)+'K'} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v.toLocaleString('id-ID')} kg`, 'Avg/Trip']} />
            <Bar dataKey="avg_netto" radius={[6,6,0,0]} barSize={50}>
              {data.map((d, i) => <Cell key={i} fill={TRUCK_COLORS[d.truck_type] || '#94a3b8'} />)}
              <LabelList dataKey="avg_netto" position="top" style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }} formatter={v => v.toLocaleString('id-ID')} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ─── TAB 3: PER KENDARAAN ───────────────────── */
function PerKendaraan({ tahun }) {
  const [data, setData] = useState([])
  useEffect(() => {
    api.get('/armada/per-kendaraan', { params: { tahun: tahun||undefined } })
      .then(r => setData(r.data))
  }, [tahun])

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-800">{data.length} Kendaraan Aktif</h3>
      </div>
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0">
            <tr>
              <th className="table-header">No. Polisi</th>
              <th className="table-header">Jenis</th>
              <th className="table-header">Driver</th>
              <th className="table-header text-right">Trip</th>
              <th className="table-header text-right">Total Netto</th>
              <th className="table-header text-right">Avg/Trip</th>
              <th className="table-header">Trip Pertama</th>
              <th className="table-header">Trip Terakhir</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="hover:bg-gray-50 border-b border-gray-100">
                <td className="table-cell font-mono font-semibold" style={{ color: TRUCK_COLORS[d.truck_type] || '#94a3b8' }}>{d.no_polisi}</td>
                <td className="table-cell text-xs">{d.truck_type}</td>
                <td className="table-cell text-xs text-gray-500">{d.driver || '—'}</td>
                <td className="table-cell text-right">{fmt.num(d.trip)}</td>
                <td className="table-cell text-right font-semibold">{fmt.tonRaw(d.netto_kg)} t</td>
                <td className="table-cell text-right text-purple-600">{fmt.kg(d.avg_trip)}</td>
                <td className="table-cell text-xs text-gray-500">{fmt.tgl(d.first_trip)}</td>
                <td className="table-cell text-xs text-gray-500">{fmt.tgl(d.last_trip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── TAB 4: PARAMETER OAT ────────────────── */
function ParameterOAT() {
  const [p, setP] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const canEdit = hasRole('admin', 'manajer')

  useEffect(() => { api.get('/armada/param').then(r => setP(r.data)) }, [])

  function set(k, v) { setP(prev => ({ ...prev, [k]: v })) }

  async function save() {
    setSaving(true)
    try {
      await api.put('/armada/param', p)
      setMsg('Parameter berhasil disimpan')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(e.response?.data?.error || 'Gagal simpan')
    } finally { setSaving(false) }
  }

  if (!p) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  return (
    <div className="card max-w-3xl">
      <div className="mb-4">
        <h2 className="text-base font-bold text-gray-800">Parameter Global OAT</h2>
        <p className="text-xs text-gray-400">Asumsi teknis kendaraan & harga solar — dipakai untuk hitung biaya per trip</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="label">Harga Solar (Rp/Liter)</label>
          <input type="number" className="input" value={p.harga_solar} onChange={e => set('harga_solar', +e.target.value)} disabled={!canEdit} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Kapasitas 6 Roda (Kg)</label><input type="number" className="input" value={p.kap_6r} onChange={e => set('kap_6r', +e.target.value)} disabled={!canEdit}/></div>
          <div><label className="label">Kapasitas 10 Roda (Kg)</label><input type="number" className="input" value={p.kap_10r} onChange={e => set('kap_10r', +e.target.value)} disabled={!canEdit}/></div>
          <div><label className="label">Kapasitas 12 Roda (Kg)</label><input type="number" className="input" value={p.kap_12r} onChange={e => set('kap_12r', +e.target.value)} disabled={!canEdit}/></div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Konsumsi Solar — Bermuatan (Km/L)</p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">6 Roda</label><input type="number" step="0.1" className="input" value={p.kml_muat_6r} onChange={e => set('kml_muat_6r', +e.target.value)} disabled={!canEdit}/></div>
            <div><label className="label">10 Roda</label><input type="number" step="0.1" className="input" value={p.kml_muat_10r} onChange={e => set('kml_muat_10r', +e.target.value)} disabled={!canEdit}/></div>
            <div><label className="label">12 Roda</label><input type="number" step="0.1" className="input" value={p.kml_muat_12r} onChange={e => set('kml_muat_12r', +e.target.value)} disabled={!canEdit}/></div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Konsumsi Solar — Kosong (Km/L)</p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">6 Roda</label><input type="number" step="0.1" className="input" value={p.kml_kosong_6r} onChange={e => set('kml_kosong_6r', +e.target.value)} disabled={!canEdit}/></div>
            <div><label className="label">10 Roda</label><input type="number" step="0.1" className="input" value={p.kml_kosong_10r} onChange={e => set('kml_kosong_10r', +e.target.value)} disabled={!canEdit}/></div>
            <div><label className="label">12 Roda</label><input type="number" step="0.1" className="input" value={p.kml_kosong_12r} onChange={e => set('kml_kosong_12r', +e.target.value)} disabled={!canEdit}/></div>
          </div>
        </div>

        <div>
          <label className="label">Target Margin (%)</label>
          <input type="number" step="0.01" className="input" value={p.target_margin} onChange={e => set('target_margin', +e.target.value)} disabled={!canEdit} />
          <p className="text-xs text-gray-400 mt-1">Format desimal — 0.15 = 15%</p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15}/>{saving ? 'Menyimpan...' : 'Simpan Parameter'}</button>
            {msg && <span className="text-sm text-purple-600">{msg}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── TAB 5: TARIF OAT PER RELASI ───────────── */
function TarifOAT() {
  const [data, setData] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ relasi_nama:'', produk:'CPO', lokasi:'', jarak_pp:0, oat_6r:0, oat_10r:0, oat_12r:0, makan_jalan:0, tol_retribusi:0, penginapan:0 })
  const canEdit = hasRole('admin', 'manajer')

  function load() { api.get('/armada/oat-relasi').then(r => setData(r.data)) }
  useEffect(() => { load() }, [])

  function startEdit(row) { setForm(row); setEditing(row.id); setShowForm(true) }
  function startNew() { setForm({ relasi_nama:'', produk:'CPO', lokasi:'', jarak_pp:0, oat_6r:0, oat_10r:0, oat_12r:0, makan_jalan:0, tol_retribusi:0, penginapan:0 }); setEditing(null); setShowForm(true) }

  async function save() {
    try {
      if (editing) await api.put(`/armada/oat-relasi/${editing}`, form)
      else await api.post('/armada/oat-relasi', form)
      setShowForm(false); load()
    } catch (e) { alert(e.response?.data?.error || 'Gagal') }
  }

  async function del(id) {
    if (!confirm('Hapus tarif ini?')) return
    await api.delete(`/armada/oat-relasi/${id}`); load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Tarif OAT (Rp / Kg) per Relasi & Produk</h3>
          <p className="text-xs text-gray-400">Tarif disepakati per relasi — tersinkron dengan kalkulasi margin di tab Analisa OAT</p>
        </div>
        {canEdit && <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus size={15}/>Tambah Tarif</button>}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="table-header">Relasi</th>
              <th className="table-header">Produk</th>
              <th className="table-header">Lokasi</th>
              <th className="table-header text-right">Jarak PP</th>
              <th className="table-header text-right">OAT 6R</th>
              <th className="table-header text-right">OAT 10R</th>
              <th className="table-header text-right">OAT 12R</th>
              <th className="table-header text-right">Lain</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 border-b border-gray-100">
                <td className="table-cell text-xs">{r.relasi_nama}</td>
                <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                <td className="table-cell text-xs text-gray-500">{r.lokasi || '—'}</td>
                <td className="table-cell text-right">{r.jarak_pp ? fmt.num(r.jarak_pp) + ' km' : '—'}</td>
                <td className="table-cell text-right font-mono text-xs">{r.oat_6r ? fmt.rp(r.oat_6r) : '—'}</td>
                <td className="table-cell text-right font-mono text-xs">{r.oat_10r ? fmt.rp(r.oat_10r) : '—'}</td>
                <td className="table-cell text-right font-mono text-xs">{r.oat_12r ? fmt.rp(r.oat_12r) : '—'}</td>
                <td className="table-cell text-right text-xs text-gray-400">{fmt.rp((r.makan_jalan||0)+(r.tol_retribusi||0)+(r.penginapan||0))}</td>
                <td className="table-cell">
                  {canEdit && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => startEdit(r)} className="text-gray-500 hover:text-purple-600"><Edit2 size={13}/></button>
                      {hasRole('admin') && <button onClick={() => del(r.id)} className="text-gray-500 hover:text-red-600"><X size={13}/></button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">{editing ? 'Edit Tarif OAT' : 'Tambah Tarif OAT'}</h2>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-500 hover:text-gray-800"/></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Relasi *</label><input className="input" value={form.relasi_nama} onChange={e => setForm({...form, relasi_nama: e.target.value})} /></div>
              <div><label className="label">Produk *</label>
                <select className="input" value={form.produk} onChange={e => setForm({...form, produk: e.target.value})}>
                  {['CPO','RBDPL','RBDPS','B-40','BE','PFAD'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label className="label">Lokasi</label><input className="input" value={form.lokasi||''} onChange={e => setForm({...form, lokasi: e.target.value})} /></div>
              <div><label className="label">Jarak PP (Km)</label><input type="number" className="input" value={form.jarak_pp} onChange={e => setForm({...form, jarak_pp: +e.target.value})} /></div>
              <div></div>
              <div><label className="label">OAT 6 Roda (Rp/Kg)</label><input type="number" className="input" value={form.oat_6r} onChange={e => setForm({...form, oat_6r: +e.target.value})} /></div>
              <div><label className="label">OAT 10 Roda (Rp/Kg)</label><input type="number" className="input" value={form.oat_10r} onChange={e => setForm({...form, oat_10r: +e.target.value})} /></div>
              <div><label className="label">OAT 12 Roda (Rp/Kg)</label><input type="number" className="input" value={form.oat_12r} onChange={e => setForm({...form, oat_12r: +e.target.value})} /></div>
              <div></div>
              <div><label className="label">Makan & Jalan (Rp/trip)</label><input type="number" className="input" value={form.makan_jalan||0} onChange={e => setForm({...form, makan_jalan: +e.target.value})} /></div>
              <div><label className="label">Tol & Retribusi (Rp/trip)</label><input type="number" className="input" value={form.tol_retribusi||0} onChange={e => setForm({...form, tol_retribusi: +e.target.value})} /></div>
              <div><label className="label">Penginapan (Rp/trip)</label><input type="number" className="input" value={form.penginapan||0} onChange={e => setForm({...form, penginapan: +e.target.value})} /></div>
              <div className="col-span-2 flex gap-3 pt-2">
                <button onClick={save} className="btn-primary flex-1 py-2.5"><Save size={15} className="inline mr-1"/>Simpan</button>
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1 py-2.5">Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

