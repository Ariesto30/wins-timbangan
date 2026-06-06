import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Brain, Factory, Package, Wallet, Target, Gauge } from 'lucide-react'
import api from '../utils/api'
import AiPanel, { AiAsk } from '../components/AiPanel'

const fmt = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })
const tt = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }

export default function InsightCenter() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('operational')
  function load() { setErr(null); api.get('/insight/center').then(r => setD(r.data)).catch(e => setErr(e.response?.data?.error || e.message)) }
  useEffect(() => { load() }, [])

  const TABS = [
    { id: 'operational', label: 'Operational', icon: Gauge },
    { id: 'production', label: 'Production', icon: Factory },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'financial', label: 'Financial', icon: Wallet },
    { id: 'strategic', label: 'Strategic', icon: Target },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0F172A,#1E293B)' }}>
          <Brain size={22} className="text-white" />
        </div>
        <div>
          <h1 className="page-title">Insight Center</h1>
          <p className="page-subtitle">Otak analitik — Operational · Production · Inventory · Financial · Strategic</p>
        </div>
      </div>

      <AiPanel endpoint="/insight/ai-owner" title="Owner Decision Insight" subtitle="Sintesis lintas-modul: stok · harga · produksi · keuangan" />
      <AiAsk />

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {err ? <div className="card bg-red-50 border-red-200 text-center py-8"><div className="text-red-600 font-semibold">Gagal memuat</div><div className="text-xs text-gray-500 mb-3">{err}</div><button onClick={load} className="btn-primary">Coba Lagi</button></div>
        : !d ? <div className="text-gray-500 py-10 text-center">Memuat insight...</div>
          : (
            <>
              {tab === 'operational' && <Operational o={d.operational} />}
              {tab === 'production' && <Production p={d.production} />}
              {tab === 'inventory' && <Inventory i={d.inventory} />}
              {tab === 'financial' && <Financial f={d.financial} />}
              {tab === 'strategic' && <Strategic s={d.strategic} />}
            </>
          )}
    </div>
  )
}

function Sec({ title, desc, children }) {
  return <div className="card"><h3 className="text-sm font-bold text-gray-700">{title}</h3>{desc && <p className="text-xs text-gray-400 mb-3">{desc}</p>}<div className={desc ? '' : 'mt-3'}>{children}</div></div>
}
function Tbl({ headers, rows }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-200 bg-gray-50">{headers.map((h, i) => <th key={i} className="table-header">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">{r.map((c, j) => <td key={j} className="table-cell text-sm">{c}</td>)}</tr>)}</tbody></table></div>
}

function Operational({ o }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Sec title="Tangki Utilisasi Terendah" desc="Kandidat realokasi / konsolidasi">
          <Tbl headers={['Tangki', 'Produk', 'Util%']} rows={o.util_terendah.map(t => [t.nama, <span className="badge-neutral">{t.produk}</span>, <span className="font-bold text-orange-500">{t.util}%</span>])} />
        </Sec>
        <Sec title="Tangki Paling Penuh" desc="Pantau risiko overflow">
          <Tbl headers={['Tangki', 'Produk', 'Util%']} rows={o.util_tertinggi.map(t => [t.nama, <span className="badge-neutral">{t.produk}</span>, <span className={`font-bold ${t.util > 100 ? 'text-red-600' : 'text-green-600'}`}>{t.util}%</span>])} />
        </Sec>
      </div>
      <Sec title="Kapasitas per Produk" desc="Produk mana yang mendominasi tank farm">
        <Tbl headers={['Produk', 'Total Kapasitas (MT)']} rows={o.produk_kapasitas.map(p => [<span className="badge-neutral">{p.produk}</span>, <span className="font-mono font-semibold">{fmt(p.kapasitas)}</span>])} />
      </Sec>
      {o.retensi_panjang.length > 0 && (
        <Sec title={`Retensi Panjang (${o.retensi_panjang.length})`} desc="Tangki tersimpan >45 hari — risiko mutu turun">
          <Tbl headers={['Tangki', 'Hari Tersimpan']} rows={o.retensi_panjang.map(t => [t.nama, <span className="font-bold text-orange-600">{t.hari} hari</span>])} />
        </Sec>
      )}
    </div>
  )
}

function Production({ p }) {
  const chart = p.monthly.map(m => ({ bulan: m.bulan.slice(2), IN: m.in_mt, OUT: m.out_mt }))
  const y = p.yield
  const yChart = y ? y.trend.filter(t => t.refining > 0).map(t => ({ bulan: t.bulan.slice(2), Refining: t.refining, Olein: t.olein, Stearin: t.stearin })) : []
  return (
    <div className="space-y-3">
      {y && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <YKpi label="Refining Yield" v={y.last30.refining} sub={`overall ${fmt(y.overall.refining)}%`} good={y.last30.refining >= 90} />
            <YKpi label="Olein Yield" v={y.last30.olein} sub={`overall ${fmt(y.overall.olein)}%`} color="#0ea5e9" />
            <YKpi label="Stearin Yield" v={y.last30.stearin} sub={`overall ${fmt(y.overall.stearin)}%`} color="#7c3aed" />
            <YKpi label="Loss Refining" v={y.last30.refining_loss} sub="30 hari" good={y.last30.refining_loss <= 2} invert />
          </div>
          <Sec title="Tren Yield Bulanan (%)" desc={`Dari Log Produksi Harian · ${y.hari} hari (${y.periode})`}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={yChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bulan" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={tt} formatter={v => v + '%'} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Refining" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Olein" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Stearin" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Sec>
        </>
      )}
      <Sec title="Throughput Timbangan per Bulan (MT)" desc="IN = bahan baku masuk · OUT = produk keluar (dispatch)">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bulan" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip contentStyle={tt} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="IN" fill="#14b8a6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="OUT" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Sec>
      {!y && <p className="text-xs text-gray-400">Yield detail muncul setelah ada data di Produksi Refinery (Log Harian).</p>}
    </div>
  )
}
function YKpi({ label, v, sub, good, invert, color }) {
  const c = color || (good == null ? '#16a34a' : good ? '#16a34a' : '#dc2626')
  return (
    <div className="card">
      <div className="text-[11px] text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums" style={{ color: c }}>{fmt(v)}<span className="text-sm text-gray-400">%</span></div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}

function Inventory({ i }) {
  return (
    <div className="space-y-3">
      <Sec title={`Overstock / Hampir Penuh (${i.dead_overstock.length})`} desc="Utilisasi ≥90% — modal tertahan, risiko overflow">
        {i.dead_overstock.length === 0 ? <div className="text-center text-green-600 py-4 text-sm">✓ Tidak ada</div> :
          <Tbl headers={['Tangki', 'Produk', 'Util%', 'Stok MT']} rows={i.dead_overstock.map(t => [t.nama, <span className="badge-neutral">{t.produk}</span>, <span className="font-bold text-red-600">{t.util}%</span>, fmt(t.stok)])} />}
      </Sec>
      <Sec title={`Slow Moving / Hampir Kosong (${i.slow_low.length})`} desc="Utilisasi <12% — kandidat konsolidasi/realokasi">
        {i.slow_low.length === 0 ? <div className="text-center text-green-600 py-4 text-sm">✓ Tidak ada</div> :
          <Tbl headers={['Tangki', 'Produk', 'Util%', 'Stok MT']} rows={i.slow_low.map(t => [t.nama, <span className="badge-neutral">{t.produk}</span>, <span className="font-bold text-orange-500">{t.util}%</span>, fmt(t.stok)])} />}
      </Sec>
      {i.shortage_risk.length > 0 && (
        <Sec title={`Risiko Kekurangan Stok (${i.shortage_risk.length})`} desc="Utilisasi <8%">
          <Tbl headers={['Tangki', 'Produk', 'Util%']} rows={i.shortage_risk.map(t => [t.nama, <span className="badge-neutral">{t.produk}</span>, <span className="font-bold text-red-600">{t.util}%</span>])} />
        </Sec>
      )}
    </div>
  )
}

function Financial({ f }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card"><div className="text-xs text-gray-500">Nilai Inventory (Pasar)</div><div className="text-2xl font-extrabold text-green-600">Rp {(f.total_idr / 1e9).toFixed(2)} M</div><div className="text-[11px] text-gray-400">≈ ${f.total_usd.toLocaleString('id-ID')} · kurs {f.kurs.toLocaleString('id-ID')}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Working Capital di Stok Lambat</div><div className="text-2xl font-extrabold text-orange-500">Rp {(f.working_capital_slow * f.kurs / 1e9).toFixed(2)} M</div><div className="text-[11px] text-gray-400">tertahan di tangki util &lt;12%</div></div>
        <div className="card"><div className="text-xs text-gray-500">Jumlah Tangki Bernilai</div><div className="text-2xl font-extrabold text-gray-800">{f.rows.length}</div><div className="text-[11px] text-gray-400">punya stok & harga</div></div>
      </div>
      <Sec title="Nilai Stok per Tangki @ Harga Pasar (PORAM)" desc="Diurutkan dari nilai terbesar">
        <Tbl headers={['Tangki', 'Produk', 'Stok MT', 'Harga $/MT', 'Nilai (Rp)']} rows={f.rows.map(r => [r.nama, <span className="badge-neutral">{r.produk}</span>, fmt(r.stok_mt), r.harga_usd ? '$' + fmt(r.harga_usd) : '–', <span className="font-mono font-semibold">Rp {(r.nilai_usd * f.kurs / 1e9).toFixed(2)}M</span>])} />
      </Sec>
    </div>
  )
}

function Strategic({ s }) {
  return (
    <div className="space-y-3">
      <AiPanel endpoint="/insight/ai-strategic" title="Review Strategis Bulanan" subtitle="Analisa direksi mendalam · diperbarui bulanan" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card"><div className="text-xs text-gray-500">Utilisasi Tank Farm</div><div className={`text-2xl font-extrabold ${s.util_total > 85 ? 'text-red-600' : 'text-green-600'}`}>{s.util_total}%</div></div>
        <div className="card"><div className="text-xs text-gray-500">Tangki Hampir Penuh</div><div className="text-2xl font-extrabold text-orange-500">{s.tangki_penuh}</div></div>
        <div className="card"><div className="text-xs text-gray-500">Tangki Hampir Kosong</div><div className="text-2xl font-extrabold text-gray-700">{s.tangki_kosong}</div></div>
      </div>
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="text-sm font-bold text-blue-700 mb-1">Prediksi & Forecast</h3>
        <p className="text-xs text-blue-700">{s.catatan}</p>
      </div>
    </div>
  )
}
