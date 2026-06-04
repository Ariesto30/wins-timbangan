import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, Area, AreaChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid, LabelList
} from 'recharts'
import { TrendingUp, TrendingDown, RefreshCw, Filter, BarChart2, Box, Zap, RotateCcw } from 'lucide-react'
import api, { fmt } from '../utils/api'
import MonthRange from '../components/MonthRange'

const BLUE = '#1565C0'
const BLUE_LIGHT = '#2196F3'
const TEAL = '#00897B'
const PRODUK_COLORS = { CPO: '#1565C0', RBDPL: '#00BCD4', RBDPS: '#0EA5E9', 'B-40': '#FFC107', BE: '#FF5722', PFAD: '#9C27B0' }
const PRODUK_ORDER = ['CPO', 'RBDPL', 'RBDPS', 'B-40', 'BE', 'PFAD']

const BLN_MAP = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'Mei','06':'Jun','07':'Jul','08':'Agu','09':'Sep','10':'Okt','11':'Nov','12':'Des' }
const monthLabel = (str) => {
  if (!str) return ''
  const [m, y] = str.split('-')
  return (BLN_MAP[m] || m) + " '" + (y?.slice(2) || '')
}
const TT = { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#1e293b', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }

/* ─── KPI CARD (FULL GRADIENT) ───────────────────────── */
function KpiCard({ label, value, sub, icon, gradient }) {
  return (
    <div className="rounded-2xl shadow-lg p-4 flex flex-col gap-2 min-w-0 text-white relative overflow-hidden"
      style={{ background: gradient }}>
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10"></div>
      <div className="absolute -right-8 -bottom-8 w-20 h-20 rounded-full bg-white/5"></div>
      <div className="flex items-center justify-between relative z-10">
        <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider leading-tight">{label}</span>
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
      </div>
      <div className="text-[28px] font-extrabold leading-tight truncate text-white relative z-10">{value}</div>
      {sub && <div className="text-[11px] text-white/75 leading-tight relative z-10">{sub}</div>}
    </div>
  )
}

/* ─── CHART CARD ─────────────────────────────────────── */
function ChartCard({ title, sub, children, footer, height = 270 }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <div className="text-xs font-bold text-gray-600 uppercase tracking-widest">{title}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <div className="flex-1 px-2 pb-2" style={{ minHeight: height }}>{children}</div>
      {footer && <div className="px-4 py-2 border-t border-gray-50 text-[11px] text-gray-400 font-semibold">{footer}</div>}
    </div>
  )
}

/* ─── INSIGHT ITEM ───────────────────────────────────── */
function InsightItem({ icon, color, text }) {
  const cls = {
    up:   { bg: 'bg-green-50',  text: 'text-green-600',  Icon: TrendingUp },
    down: { bg: 'bg-red-50',    text: 'text-red-500',    Icon: TrendingDown },
    bar:  { bg: 'bg-orange-50', text: 'text-orange-500', Icon: BarChart2 },
    box:  { bg: 'bg-blue-50',   text: 'text-blue-600',   Icon: Box },
    peak: { bg: 'bg-purple-50', text: 'text-purple-600', Icon: Zap },
  }[icon] || { bg: 'bg-gray-50', text: 'text-gray-500', Icon: BarChart2 }
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
      <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${cls.bg}`}>
        <cls.Icon size={13} className={cls.text} />
      </div>
      <p className="text-[11px] text-gray-600 leading-snug">{text}</p>
    </div>
  )
}

const renderDonutLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null
  const RADIAN = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.6
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {(percent * 100).toFixed(1)}%
    </text>
  )
}

/* ─── DASHBOARD ──────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData] = useState(null)
  const [relasis, setRelasis] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  const [filters, setFilters] = useState({
    tahun: '',           // kosong = semua tahun (match dengan Excel)
    bulan_start: '',
    bulan_end: '',
    produk: 'Semua',
    relasi_id: '',
    truck_type: 'Semua',
    tgl_start: '',
    tgl_end: '',
  })

  // Re-fetch relasi setiap kali produk berubah (cascading filter)
  useEffect(() => {
    const params = filters.produk !== 'Semua' ? { produk: filters.produk } : {}
    api.get('/relasi', { params }).then(r => {
      setRelasis(r.data)
      // Reset relasi_id jika relasi terpilih tidak lagi tersedia di produk baru
      if (filters.relasi_id && !r.data.find(x => String(x.id) === String(filters.relasi_id))) {
        setFilters(f => ({ ...f, relasi_id: '' }))
      }
    })
  }, [filters.produk])

  const load = useCallback((f) => {
    setLoading(true)
    const params = {
      tahun:      f.tahun || undefined,
      bulan_start: f.bulan_start || undefined,
      bulan_end:  f.bulan_end || undefined,
      produk:     f.produk !== 'Semua' ? f.produk : undefined,
      relasi_id:  f.relasi_id || undefined,
      truck_type: f.truck_type !== 'Semua' ? f.truck_type : undefined,
      tgl_start:  f.tgl_start || undefined,
      tgl_end:    f.tgl_end || undefined,
    }
    api.get('/reports/dashboard', { params })
      .then(r => { setData(r.data); setLastRefresh(new Date()) })
      .finally(() => setLoading(false))
  }, [])

  // Apply filter LANGSUNG saat berubah
  useEffect(() => { load(filters) }, [filters, load])

  function set(k) { return e => setFilters(f => ({ ...f, [k]: e.target.value })) }
  function resetFilter() {
    setFilters({ tahun: filters.tahun, bulan_start: '', bulan_end: '', produk: 'Semua', relasi_id: '', truck_type: 'Semua', tgl_start: '', tgl_end: '' })
  }

  const { kpi, byBulan, byRelasi, byProduk, top5Kendaraan, daily30, momPct, insights, prevNetto } = data || {}
  const totalNetto = kpi?.total_netto_kg || 0

  const trendData = (byBulan || []).map(b => ({
    label: monthLabel(b.bulan),
    netto: +(b.netto_kg / 1000).toFixed(2),
    trip: b.trip,
  }))

  const relasiData = (byRelasi || []).map(r => ({
    name: r.relasi_nama || '—',
    value: +(r.netto_kg / 1000).toFixed(3),
  }))

  const produkData = PRODUK_ORDER
    .map(p => (byProduk || []).find(x => x.produk === p))
    .filter(Boolean)
    .map(p => ({ name: p.produk, value: p.trip, netto: +(p.netto_kg / 1000).toFixed(2) }))

  const donutData = (byProduk || []).map(p => ({
    produk: p.produk,
    value: p.netto_kg,
    pct: totalNetto > 0 ? ((p.netto_kg / totalNetto) * 100).toFixed(1) : 0,
  }))

  const top5Data = (top5Kendaraan || []).map(k => ({ name: k.no_polisi, value: k.netto_kg }))
  const dailyData = (daily30 || []).map(d => ({
    label: d.tanggal?.slice(5),
    netto: +(d.netto_kg / 1000).toFixed(2),
    trip: d.trip,
  }))

  const lu = lastRefresh
    ? lastRefresh.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '—'

  // Filter chip indicator
  const activeFiltersCount = [
    !!(filters.bulan_start || filters.bulan_end),
    filters.produk !== 'Semua',
    filters.relasi_id !== '',
    filters.truck_type !== 'Semua',
    filters.tgl_start !== '',
    filters.tgl_end !== '',
  ].filter(Boolean).length

  return (
    <div className="flex gap-0 -m-6 min-h-screen bg-gray-50">

      {/* ── LEFT SIDEBAR FILTER ── */}
      <aside className="w-44 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="text-sm font-extrabold text-gray-800 leading-tight">DASHBOARD</div>
          <div className="text-[10px] font-bold tracking-widest text-blue-500">RITASI &amp; TONASE</div>
        </div>

        {/* Filter */}
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Filter size={11} className="text-blue-600" />
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Filter</span>
              {activeFiltersCount > 0 && <span className="bg-blue-100 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{activeFiltersCount}</span>}
            </div>
            <button onClick={resetFilter} className="text-[10px] text-gray-400 hover:text-blue-600 flex items-center gap-1"><RotateCcw size={9}/>Reset</button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-400 font-medium block mb-0.5">Relasi</label>
              <select className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-gray-50 text-gray-700 focus:ring-1 focus:ring-blue-400 outline-none" value={filters.relasi_id} onChange={set('relasi_id')}>
                <option value="">Semua Relasi</option>
                {relasis.map(r => <option key={r.id} value={r.id}>{r.nama.replace(/^(PT\.|CV\.)\s/, '')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-medium block mb-0.5">Produk</label>
              <select className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-gray-50 text-gray-700 focus:ring-1 focus:ring-blue-400 outline-none" value={filters.produk} onChange={set('produk')}>
                <option>Semua</option>
                {PRODUK_ORDER.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-medium block mb-0.5">Jenis Kendaraan</label>
              <select className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-gray-50 text-gray-700 focus:ring-1 focus:ring-blue-400 outline-none" value={filters.truck_type} onChange={set('truck_type')}>
                <option>Semua</option>
                <option>6 Roda</option><option>10 Roda</option><option>12 Roda</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 font-medium block mb-0.5">Periode</label>
              <input type="date" className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-gray-50 text-gray-700 mb-1" value={filters.tgl_start} onChange={set('tgl_start')} placeholder="Mulai" />
              <input type="date" className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-gray-50 text-gray-700" value={filters.tgl_end} onChange={set('tgl_end')} placeholder="Akhir" />
            </div>
          </div>
        </div>

        {/* Highlight Insight */}
        <div className="px-3 py-3 flex-1 overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={11} className="text-yellow-500" />
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Highlight Insight</span>
            <span className="text-[8px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-bold">AUTO</span>
          </div>
          {loading ? (
            <div className="text-[11px] text-gray-400">Memuat...</div>
          ) : insights?.length > 0 ? (
            <div>{insights.map((ins, i) => <InsightItem key={i} {...ins} />)}</div>
          ) : (
            <div className="text-[11px] text-gray-400">Tidak ada data insight untuk periode ini</div>
          )}
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-auto">

        {/* TOP BAR */}
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 font-semibold">Tahun</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {[{ v: '', l: 'Semua' }, { v: '2025', l: '2025' }, { v: '2026', l: '2026' }].map(y => (
                <button key={y.v} onClick={() => setFilters(f => ({ ...f, tahun: y.v }))}
                  className={`px-4 py-1.5 text-xs font-bold transition-all ${filters.tahun === y.v ? 'text-white' : 'text-gray-500 bg-white hover:bg-gray-50'}`}
                  style={filters.tahun === y.v ? { background: `linear-gradient(135deg, ${BLUE}, ${BLUE_LIGHT})` } : {}}>
                  {y.l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 font-semibold">Bulan</span>
            <MonthRange start={filters.bulan_start} end={filters.bulan_end}
              onStart={v => setFilters(f => ({ ...f, bulan_start: v }))}
              onEnd={v => setFilters(f => ({ ...f, bulan_end: v }))} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-gray-400 font-medium">Terakhir Refresh</div>
              <div className="text-[11px] font-bold text-gray-700">{lu}</div>
            </div>
            <button onClick={() => load(filters)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-blue-500">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">

          {/* 6 KPI CARDS — full gradient */}
          <div className="grid grid-cols-6 gap-3">
            <KpiCard label="Total Netto (Ton)" value={fmt.tonRaw(totalNetto)}
              sub={prevNetto > 0 ? `vs Prev: ${(prevNetto / 1000).toFixed(0)} Ton` : 'Semua periode'}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} className="w-5 h-5"><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4M21 7v10l-9 4"/></svg>}
              gradient="linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" />
            <KpiCard label="Total Netto (Kg)" value={totalNetto.toLocaleString('id-ID')} sub="Kg"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>}
              gradient="linear-gradient(135deg, #10b981 0%, #047857 100%)" />
            <KpiCard label="Total Ritasi (Trip)" value={fmt.num(kpi?.total_trip)} sub="Trip"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} className="w-5 h-5"><path d="M1 3h15l4 8H1V3z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /></svg>}
              gradient="linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)" />
            <KpiCard label="Rata-rata / Trip" value={fmt.num(kpi?.avg_netto_trip)} sub="Kg / Trip"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} className="w-5 h-5"><path d="M3 12c0-1 1-2 2-2s2 1 2 2v6h10v-6c0-1 1-2 2-2s2 1 2 2M5 18v2M19 18v2M9 6l3-3 3 3M12 3v9"/></svg>}
              gradient="linear-gradient(135deg, #ec4899 0%, #be185d 100%)" />
            <KpiCard label="Maks Netto / Trip" value={fmt.num(kpi?.maks_netto)} sub="Kg"
              icon={<TrendingUp size={18} className="text-white" strokeWidth={2.5} />}
              gradient="linear-gradient(135deg, #f97316 0%, #c2410c 100%)" />
            <KpiCard label="Min Netto / Trip" value={fmt.num(kpi?.min_netto)} sub="Kg"
              icon={<TrendingDown size={18} className="text-white" strokeWidth={2.5} />}
              gradient="linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" />
          </div>

          {/* ROW 1: Berat Netto by Relasi (2/3) | Trend Monthly Netto (1/3) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <ChartCard title="Berat Netto by Relasi (Ton)" footer={`Total Relasi  ${kpi?.relasi_unik || 0}`} height={Math.max(330, relasiData.length * 24 + 50)}>
                <ResponsiveContainer width="100%" height={Math.max(330, relasiData.length * 24 + 50)}>
                  <BarChart data={relasiData} layout="vertical" margin={{ left: 0, right: 80, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="barRelasiGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="#c4b5fd" stopOpacity={1}/>
                        <stop offset="55%"  stopColor="#a78bfa" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={1}/>
                      </linearGradient>
                    </defs>
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={210} interval={0} />
                    <Tooltip contentStyle={TT} formatter={v => [`${v} ton`, 'Netto']} cursor={{ fill: '#eff6ff', opacity: 0.6 }} />
                    <Bar dataKey="value" fill="url(#barRelasiGrad)" radius={[0, 6, 6, 0]} barSize={15}
                      animationDuration={1400} animationEasing="ease-out" animationBegin={100}>
                      <LabelList dataKey="value" position="right" style={{ fill: '#1e293b', fontSize: 12, fontWeight: 700 }}
                        formatter={v => v >= 1000 ? (v / 1000).toFixed(2).replace(/\.?0+$/, '') + 'K' : v.toFixed(0)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Trend Monthly Netto (Ton)" sub="Mengikuti filter aktif" height={Math.max(330, relasiData.length * 24 + 50)}>
              <ResponsiveContainer width="100%" height={Math.max(330, relasiData.length * 24 + 50)}>
                <AreaChart data={trendData} margin={{ left: 0, right: 15, top: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="50%" stopColor="#a855f7" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v} />
                  <Tooltip contentStyle={TT} formatter={(v, _n, p) => [`${v.toLocaleString('id-ID')} ton (${p.payload.trip} trip)`, 'Netto']} />
                  <Area type="monotone" dataKey="netto" stroke="#a855f7" strokeWidth={2.5} fill="url(#blueGrad)"
                    dot={{ fill: '#fff', stroke: '#a855f7', strokeWidth: 2, r: 3.5 }}
                    activeDot={{ r: 6, fill: '#a855f7', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={1600} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ROW 2: 4 CHARTS — Trip Produk | Komposisi | Top 5 | Daily Netto */}
          <div className="grid grid-cols-4 gap-3">
            <ChartCard title="Trip by Produk" footer={`Total Trip  ${fmt.num(kpi?.total_trip)}`} height={290}>
              <div className="space-y-3 px-2 py-3">
                {produkData.map((d, i) => {
                  const maxTrip = Math.max(...produkData.map(x => x.value))
                  const pct = maxTrip > 0 ? (d.value / maxTrip) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: (PRODUK_COLORS[d.name] || '#94a3b8') + '22' }}>
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PRODUK_COLORS[d.name] || '#94a3b8' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-gray-700">{d.name}</span>
                          <span className="text-sm font-bold text-gray-800">{d.value}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: pct + '%', backgroundColor: PRODUK_COLORS[d.name] || '#94a3b8' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ChartCard>

            <ChartCard title="Komposisi Produk (Ton)" height={290}>
              <div className="flex flex-col items-center gap-2 h-[290px] pt-1">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="produk" cx="50%" cy="50%"
                      innerRadius={48} outerRadius={80} labelLine={false} label={renderDonutLabel}
                      animationDuration={1200}>
                      {donutData.map((d, i) => <Cell key={i} fill={PRODUK_COLORS[d.produk] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip contentStyle={TT} formatter={v => [fmt.ton(v), 'Netto']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 w-full px-2">
                  {donutData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PRODUK_COLORS[d.produk] || '#94a3b8' }} />
                      <span className="text-[10px] text-gray-700 font-medium">{d.produk}</span>
                      <span className="text-[10px] text-gray-500 ml-auto font-bold">{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Top 5 Kendaraan (Ton)" height={290}>
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={top5Data} layout="vertical" margin={{ left: 4, right: 60, top: 12, bottom: 4 }}>
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => (v / 1000).toFixed(0) + 'K'} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#334155', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={75} />
                  <Tooltip contentStyle={TT} formatter={v => [fmt.ton(v), 'Netto']} cursor={{ fill: '#f1f5f9', opacity: 0.5 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}
                    animationDuration={1200} animationEasing="ease-out" animationBegin={150}>
                    {top5Data.map((_, i) => {
                      const colors = ['#3b82f6','#10b981','#f97316','#a855f7','#ef4444']
                      return <Cell key={i} fill={colors[i % colors.length]} />
                    })}
                    <LabelList dataKey="value" position="right" style={{ fill: '#1e293b', fontSize: 11, fontWeight: 700 }} formatter={v => (v / 1000).toFixed(2).replace('.',',') + 't'} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Daily Netto (30 Hari)" sub="Ton per hari" height={290}>
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={dailyData} margin={{ left: -10, right: 4, top: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#86efac" stopOpacity={1}/>
                      <stop offset="60%" stopColor="#22c55e" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#15803d" stopOpacity={0.95}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TT} formatter={(v, _n, p) => [`${v} ton (${p.payload.trip} trip)`, 'Netto']} cursor={{ fill: '#dbeafe', opacity: 0.5 }} />
                  <Bar dataKey="netto" fill="url(#dailyGrad)" radius={[4, 4, 0, 0]} barSize={7}
                    animationDuration={1400} animationEasing="ease-out" animationBegin={200} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

        </div>

        <div className="mt-auto bg-white border-t border-gray-100 px-5 py-2 flex items-center justify-between text-[10px] text-gray-400 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Data WB</span>
            <span className="mx-1">|</span>
            <span>{fmt.num(kpi?.total_trip)} Trip</span>
            <span className="mx-1">|</span>
            <span>{activeFiltersCount > 0 ? `Filter aktif: ${activeFiltersCount}` : 'Tanpa filter'}</span>
            <span className="mx-1">|</span>
            <span>Auto-refresh on filter change</span>
          </div>
          <div className="italic text-gray-300">Data realtime dari database SQLite.</div>
        </div>
      </main>
    </div>
  )
}
