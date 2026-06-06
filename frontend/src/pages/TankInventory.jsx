import { useEffect, useState } from 'react'
import { Database, Plus, X, Save, Trash2, ArrowDownCircle, ArrowUpCircle, MoveVertical, Pencil, AlertTriangle, Gauge, Layers, Droplets, Calendar, Clock, Bell, Sparkles, RefreshCw, Boxes } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api from '../utils/api'

const PRODUK = ['CPO', 'RBDPL', 'RBDPS', 'PFAD', 'Stearin', 'Olein', 'RBDPO', 'B-40', 'BE']
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000)
const fmt = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })

export default function TankInventory() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [ai, setAi] = useState(null)
  const [trend, setTrend] = useState(null)
  const [editTank, setEditTank] = useState(null)
  const [moveTank, setMoveTank] = useState(null)

  function load() {
    setErr(null)
    api.get('/tank').then(r => setData(r.data)).catch(e => setErr(e.response?.data?.error || e.message || 'Gagal memuat data tangki'))
    api.get('/insight/ai-tank').then(r => setAi(r.data)).catch(() => {})
    api.get('/tank/trend?days=7').then(r => setTrend(r.data)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  if (err) return <LoadError msg={err} onRetry={load} />
  if (!data) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = data.summary
  const now = new Date()
  const notifs = buildNotifs(data.tanks)

  return (
    <div className="space-y-5">
      {/* HERO HEADER — navy gradient + grid + glow */}
      <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#0F172A,#0B3B66)' }}>
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(59,130,246,.35), transparent 70%)' }} />
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center ring-1 ring-white/20" style={{ background: 'linear-gradient(135deg,#38bdf8,#0369a1)' }}>
              <Database size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Tank Farm — Digital Twin</h1>
              <p className="text-sm text-slate-300/80">Monitoring stok, utilisasi dan retensi secara real-time</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 ring-1 ring-white/15 text-slate-100 text-xs font-semibold"><Calendar size={13} /> {now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 ring-1 ring-white/15 text-slate-100 text-xs font-semibold"><Clock size={13} /> {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
            <span className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 ring-1 ring-white/15 text-slate-100"><Bell size={15} />{notifs.length > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{notifs.length}</span>}</span>
            <button onClick={() => setEditTank({ nama: '', produk: '', kapasitas_mt: 0, kode: '', lokasi: '', no_urut: (data?.tanks?.length || 0) + 1 })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-transform hover:scale-[1.02]" style={{ background: 'linear-gradient(135deg,#fb923c,#f59e0b)' }}><Plus size={15} /> Tangki Baru</button>
          </div>
        </div>
      </div>

      {/* KPI ROW — kartu putih executive */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCardW icon={<Layers size={18} />} label="Jumlah Tangki" value={s.total_tank} accent="#3B82F6" />
        <KpiCardW icon={<Gauge size={18} />} label="Total Kapasitas" value={fmt(s.total_kapasitas)} unit="MT" accent="#64748B" />
        <KpiCardW icon={<Droplets size={18} />} label="Total Stok" value={fmt(s.total_stok)} unit="MT" accent="#3B82F6" />
        <KpiCardW icon={<Gauge size={18} />} label="Utilisasi" value={s.util_pct} unit="%" sub={`${s.util_pct}% dari kapasitas`} accent={s.util_pct > 85 ? '#EF4444' : '#10B981'} />
        <KpiCardW icon={<AlertTriangle size={18} />} label="Hampir Penuh" value={s.penuh} sub="perlu perhatian" accent={s.penuh > 0 ? '#F59E0B' : '#10B981'} />
      </div>

      {/* AKUMULASI + AI INSIGHT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          {data.akumulasi?.length > 0 && <AkumulasiPanel akumulasi={data.akumulasi} grand={data.grand} onSavedDensity={load} />}
        </div>
        <div className="xl:col-span-1"><AiInsightPanel ai={ai} onRefresh={() => api.get('/insight/ai-tank').then(r => setAi(r.data))} /></div>
      </div>

      {/* STATUS & UTILISASI + RIGHT RAIL */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-lg font-bold text-slate-800">Status & Utilisasi Tangki</h2>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            <Legend dot="#10B981" label="Normal (≤80%)" />
            <Legend dot="#F59E0B" label="Penuh (80–95%)" />
            <Legend dot="#EF4444" label="Over Capacity (>95%)" />
            <Legend dot="#94A3B8" label="Tidak Aktif" />
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {data.tanks.length === 0 ? (
              <div className="card text-center text-gray-400 py-12">Belum ada tangki. Klik "Tangki Baru".</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.tanks.map(t => <TankCard key={t.id} t={t} onEdit={() => setEditTank(t)} onMove={() => setMoveTank(t)} />)}
              </div>
            )}
          </div>
          <div className="xl:col-span-1 space-y-4">
            <NotifPanel notifs={notifs} />
            <TrendPanel trend={trend} />
          </div>
        </div>
      </div>

      {editTank && <TankForm tank={editTank} onClose={() => setEditTank(null)} onSaved={() => { setEditTank(null); load() }} />}
      {moveTank && <MovementPanel tank={moveTank} onClose={() => setMoveTank(null)} onChanged={load} />}
    </div>
  )
}

/* ───────── KPI putih executive ───────── */
function KpiCardW({ icon, label, value, unit, sub, accent = '#3B82F6' }) {
  return (
    <div className="card flex items-center gap-3">
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: accent + '14', color: accent }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400 truncate">{label}</div>
        <div className="flex items-baseline gap-1"><span className="text-xl font-extrabold text-gray-900 tabular-nums">{value}</span>{unit && <span className="text-xs font-semibold text-gray-400">{unit}</span>}</div>
        {sub && <div className="text-[10px] text-gray-400 truncate">{sub}</div>}
      </div>
    </div>
  )
}

const Legend = ({ dot, label }) => <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: dot }} />{label}</span>

/* Notifikasi diturunkan dari kondisi tangki */
function buildNotifs(tanks) {
  const out = []
  tanks.forEach(t => {
    const pct = t.util_pct
    if (t.kapasitas_mt > 0 && pct > 100) out.push({ level: 'tinggi', nama: t.nama, msg: `Over Capacity ${pct}%`, when: t.last_update })
    else if (t.kapasitas_mt > 0 && pct >= 90) out.push({ level: 'sedang', nama: t.nama, msg: `Hampir penuh ${pct}%`, when: t.last_update })
    if (t.stok > 0 && t.hari_tersimpan != null && t.hari_tersimpan > 45) out.push({ level: 'sedang', nama: t.nama, msg: `Retensi ${t.hari_tersimpan} hari`, when: t.last_update })
  })
  return out.sort((a, b) => (a.level === 'tinggi' ? -1 : 1))
}

/* ───────── AI INSIGHT PANEL (gradient navy) ───────── */
function AiInsightPanel({ ai, onRefresh }) {
  const lvl = { tinggi: '#f87171', sedang: '#fbbf24', info: '#60a5fa' }
  return (
    <div className="rounded-2xl p-5 text-white h-full" style={{ background: 'linear-gradient(135deg,#0F172A,#312E81)', boxShadow: '0 10px 30px -10px rgba(49,46,129,.5)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Sparkles size={16} className="text-amber-300" /><span className="font-bold tracking-tight">AI Insight</span></div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{ai?.source === 'llm' ? 'AI naratif' : 'ringkasan cepat'}</span>
          {onRefresh && <button onClick={onRefresh} className="text-slate-300 hover:text-white"><RefreshCw size={13} /></button>}
        </div>
      </div>
      {!ai ? <div className="text-xs text-slate-400 py-6 text-center">Memuat insight...</div> : (
        <div className="space-y-2.5">
          {ai.items.map((it, i) => (
            <div key={i} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: lvl[it.level] || '#60a5fa' }} />
                <span className="text-xs font-bold text-slate-100">{it.title}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{it.text}</p>
            </div>
          ))}
          {ai.note && <p className="text-[10px] text-slate-500 pt-1">{ai.note}</p>}
        </div>
      )}
    </div>
  )
}

/* ───────── NOTIFIKASI & PERINGATAN ───────── */
function NotifPanel({ notifs }) {
  const c = { tinggi: { b: 'border-red-400', t: 'text-red-700', bg: 'bg-red-50' }, sedang: { b: 'border-amber-300', t: 'text-amber-700', bg: 'bg-amber-50' } }
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Bell size={15} className="text-orange-500" /> Notifikasi & Peringatan</h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{notifs.length}</span>
      </div>
      {notifs.length === 0 ? <div className="text-center text-emerald-600 py-6 text-sm">Tidak ada peringatan</div> : (
        <div className="space-y-2">
          {notifs.slice(0, 8).map((n, i) => {
            const s = c[n.level] || c.sedang
            return (
              <div key={i} className={`p-2.5 rounded-lg border-l-4 ${s.b} ${s.bg}`}>
                <div className={`text-xs font-semibold ${s.t}`}>{n.nama}</div>
                <div className="flex items-center justify-between"><span className="text-[11px] text-gray-500">{n.msg}</span>{n.when && <span className="text-[10px] text-gray-400">{String(n.when).slice(0, 10)}</span>}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ───────── TREN UTILISASI 7 HARI ───────── */
function TrendPanel({ trend }) {
  const series = trend?.series || []
  return (
    <div className="card">
      <h3 className="text-sm font-bold text-gray-700 mb-1">Tren Utilisasi (7 Hari)</h3>
      <p className="text-[11px] text-gray-400 mb-3">Utilisasi total tank farm · terisi otomatis tiap hari</p>
      {series.length < 2 ? (
        <div className="text-center text-gray-400 py-10 text-xs">Data tren terkumpul harian.<br />Saat ini {series.length} hari — chart aktif setelah ≥2 hari.</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={series} margin={{ left: -14, right: 8, top: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} />
            <Tooltip formatter={v => v + '%'} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="Total" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// Palet produk: [warna utama, warna terang (meniscus/gradient atas)]
const PRODUK_PALETTE = {
  CPO:     ['#f59e0b', '#fcd34d'],
  RBDPO:   ['#0d9488', '#2dd4bf'],
  RBDPL:   ['#16a34a', '#4ade80'],
  Olein:   ['#16a34a', '#4ade80'],
  RBDPS:   ['#7c3aed', '#a78bfa'],
  Stearin: ['#7c3aed', '#a78bfa'],
  PFAD:    ['#db2777', '#f472b6'],
  'B-40':  ['#475569', '#94a3b8'],
  BE:      ['#475569', '#94a3b8'],
}
const palette = p => PRODUK_PALETTE[p] || ['#64748b', '#94a3b8']

// Status operasional berdasar utilisasi
function tankStatus(pct) {
  if (pct > 100) return { label: 'Over Capacity', cls: 'bg-red-100 text-red-700 ring-red-200', dot: '#dc2626' }
  if (pct >= 90) return { label: 'Hampir Penuh', cls: 'bg-orange-100 text-orange-700 ring-orange-200', dot: '#f97316' }
  if (pct >= 70) return { label: 'Perhatian', cls: 'bg-yellow-100 text-yellow-700 ring-yellow-200', dot: '#eab308' }
  if (pct < 8) return { label: 'Hampir Kosong', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: '#94a3b8' }
  return { label: 'Normal', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200', dot: '#10b981' }
}

/* Tank silinder 2.5D dengan permukaan cairan beranimasi + shimmer + bubble */
function IsoTank({ pct, produk }) {
  const [c, cLight] = palette(produk)
  const frac = Math.max(0, Math.min(pct, 100)) / 100
  const TOP = 24, BOT = 146, H = BOT - TOP        // body 24..146
  const surfaceY = BOT - frac * H
  const hasLiquid = frac > 0.01
  const uid = `tk${produk || 'x'}${Math.round(pct)}`
  const bodyPath = `M22,${TOP} A38,11 0 0 1 98,${TOP} L98,${BOT} A38,11 0 0 1 22,${BOT} Z`
  return (
    <svg viewBox="0 0 120 178" className="w-full h-44" role="img" aria-label={`Tangki ${produk} ${Math.round(pct)}%`}>
      <defs>
        <linearGradient id={`${uid}-liq`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cLight} />
          <stop offset="100%" stopColor={c} />
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,.55)" />
          <stop offset="22%" stopColor="rgba(255,255,255,.05)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
          <stop offset="82%" stopColor="rgba(15,23,42,.06)" />
          <stop offset="100%" stopColor="rgba(15,23,42,.14)" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}><path d={bodyPath} /></clipPath>
      </defs>

      {/* Bayangan platform (digital-twin pad) */}
      <ellipse cx="60" cy="165" rx="44" ry="9" fill="rgba(15,23,42,.10)" />
      <ellipse cx="60" cy="163" rx="40" ry="7.5" fill="rgba(148,163,184,.18)" />

      {/* Dinding belakang tabung (rim bawah) */}
      <path d={bodyPath} fill="#eef2f7" />

      {/* Cairan + animasi (di-clip ke badan tabung) */}
      <g clipPath={`url(#${uid}-clip)`}>
        {hasLiquid && <>
          <rect x="22" y={surfaceY} width="76" height={BOT - surfaceY + 2} fill={`url(#${uid}-liq)`} />
          {/* permukaan meniscus 3D */}
          <ellipse className="tank-liquid-surface" cx="60" cy={surfaceY} rx="38" ry="10.5" fill={cLight} opacity="0.95" />
          <ellipse className="tank-liquid-surface" cx="60" cy={surfaceY} rx="30" ry="7" fill="#ffffff" opacity="0.18" />
          {/* shimmer sweep */}
          <rect className="tank-shimmer" x="22" y={surfaceY} width="34" height={BOT - surfaceY} fill="rgba(255,255,255,.35)" />
          {/* bubbles (hanya jika ada cukup cairan) */}
          {frac > 0.12 && <>
            <circle className="tank-bubble" cx="38" cy={BOT - 7} r="2.3" fill="rgba(255,255,255,.6)"  style={{ animationDelay: '0s' }} />
            <circle className="tank-bubble" cx="50" cy={BOT - 5} r="1.6" fill="rgba(255,255,255,.5)"  style={{ animationDelay: '0.5s' }} />
            <circle className="tank-bubble" cx="60" cy={BOT - 9} r="2.0" fill="rgba(255,255,255,.55)" style={{ animationDelay: '1.0s' }} />
            <circle className="tank-bubble" cx="72" cy={BOT - 6} r="1.5" fill="rgba(255,255,255,.5)"  style={{ animationDelay: '1.5s' }} />
            <circle className="tank-bubble" cx="84" cy={BOT - 8} r="1.9" fill="rgba(255,255,255,.55)" style={{ animationDelay: '2.0s' }} />
            <circle className="tank-bubble" cx="54" cy={BOT - 4} r="1.4" fill="rgba(255,255,255,.5)"  style={{ animationDelay: '2.4s' }} />
          </>}
        </>}
      </g>

      {/* Lapisan kaca tabung */}
      <path d={bodyPath} fill={`url(#${uid}-glass)`} stroke="rgba(15,23,42,.16)" strokeWidth="1" />
      {/* Garis ukur 25/50/75 di sisi kiri */}
      {[0.25, 0.5, 0.75].map((g, i) => (
        <line key={i} x1="23" y1={BOT - g * H} x2="31" y2={BOT - g * H} stroke="rgba(15,23,42,.18)" strokeWidth="1" />
      ))}
      {/* Rim atas (bukaan tangki) */}
      <ellipse cx="60" cy={TOP} rx="38" ry="11" fill="#f8fafc" stroke="rgba(15,23,42,.22)" strokeWidth="1.2" />
      <ellipse cx="60" cy={TOP} rx="30" ry="8" fill="none" stroke="rgba(15,23,42,.10)" strokeWidth="1" />
      {/* Nozzle/manhole kecil di atas */}
      <rect x="55" y={TOP - 9} width="10" height="6" rx="1.5" fill="#cbd5e1" stroke="rgba(15,23,42,.2)" strokeWidth=".8" />
    </svg>
  )
}

/* Akumulasi total per produk: MT / Kg / Liter (Liter = Kg ÷ density) */
function AkumulasiPanel({ akumulasi, grand, onSavedDensity }) {
  const [editD, setEditD] = useState(false)
  const fmt0 = v => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Droplets size={16} className="text-sky-600" />
          <span className="font-bold text-slate-800 text-sm">Akumulasi Stok per Produk</span>
          <span className="text-[11px] text-slate-400">— MT · Kg · Liter (konversi density)</span>
        </div>
        <button onClick={() => setEditD(true)} className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 underline decoration-dotted">Atur Density</button>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {akumulasi.map(a => {
          const [c, cLight] = palette(a.produk)
          return (
            <div key={a.produk} className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
              <div className="h-1" style={{ background: `linear-gradient(90deg,${c},${cLight})` }} />
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white tracking-wide" style={{ background: c }}>{a.produk}</span>
                  <span className="text-[10px] text-slate-400">ρ {a.density.toFixed(4)} kg/L</span>
                </div>
                <div className="space-y-1">
                  <Row label="MT" value={`${fmt0(a.total_mt)} MT`} strong />
                  <Row label="Kilogram" value={`${fmt0(a.total_kg)} Kg`} />
                  <Row label="Liter" value={`${fmt0(a.total_liter)} L`} accent="#0ea5e9" />
                </div>
              </div>
            </div>
          )
        })}
        {/* Grand total */}
        <div className="rounded-xl ring-1 ring-slate-300 bg-slate-50 p-3 flex flex-col justify-center">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Total Seluruh Tangki</div>
          <Row label="MT" value={`${fmt0(grand.total_mt)} MT`} strong />
          <Row label="Kilogram" value={`${fmt0(grand.total_kg)} Kg`} />
          <Row label="Liter" value={`${fmt0(grand.total_liter)} L`} accent="#0ea5e9" />
        </div>
      </div>
      {editD && <DensityEditor onClose={() => setEditD(false)} onSaved={() => { setEditD(false); onSavedDensity() }} />}
    </div>
  )
}
function Row({ label, value, strong, accent }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${strong ? 'font-extrabold text-slate-800 text-sm' : 'font-semibold'}`} style={accent ? { color: accent } : {}}>{value}</span>
    </div>
  )
}
function DensityEditor({ onClose, onSaved }) {
  const [list, setList] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get('/tank/density').then(r => setList(r.data)) }, [])
  async function save() {
    setSaving(true)
    try { await api.put('/tank/density', { list: list.map(d => ({ produk: d.produk, density: Number(d.density) })) }); onSaved() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  return (
    <Modal title="Atur Density Produk (kg/Liter)" onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">Liter = Kg ÷ density. Sesuaikan dengan nilai aktual pabrik Anda (density berubah menurut suhu & jenis produk).</p>
      {!list ? <div className="text-gray-400 text-sm py-4 text-center">Memuat...</div> : (
        <div className="grid grid-cols-2 gap-2">
          {list.map((d, i) => (
            <div key={d.produk} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-600 w-20">{d.produk}</span>
              <input type="number" step="0.0001" value={d.density} onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, density: e.target.value } : x))} className="input flex-1" />
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-4"><button onClick={save} disabled={saving || !list} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button></div>
    </Modal>
  )
}

function TankCard({ t, onEdit, onMove }) {
  const pct = t.util_pct
  const [c] = palette(t.produk)
  const noCap = !t.kapasitas_mt || t.kapasitas_mt <= 0
  const st = noCap ? { label: 'Set Kapasitas', cls: 'bg-amber-100 text-amber-700 ring-amber-200', dot: '#f59e0b' } : tankStatus(pct)
  const retHigh = t.hari_tersimpan != null && t.hari_tersimpan > 45
  return (
    <div className="tank-card relative rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* aksen warna produk di tepi atas */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${c}, ${palette(t.produk)[1]})` }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl text-white text-sm font-extrabold flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: `linear-gradient(135deg, ${palette(t.produk)[1]}, ${c})` }}>{t.no_urut ?? '?'}</span>
            <div>
              <div className="font-bold text-slate-800 leading-tight">{t.nama}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white tracking-wide" style={{ background: c }}>{t.produk || 'N/A'}</span>
                {t.lokasi && <span className="text-[10px] text-slate-400">{t.lokasi}</span>}
              </div>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${st.cls} flex items-center gap-1`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
          </span>
        </div>

        {/* Tank visual + metrik */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-shrink-0" style={{ width: 116 }}>
            <IsoTank pct={pct} produk={t.produk} />
            {/* Quick actions hover overlay */}
            <div className="tank-actions absolute inset-x-0 bottom-1 flex justify-center gap-1.5">
              <button onClick={onMove} title="Pergerakan stok" className="px-2 py-1 rounded-lg bg-white/95 shadow ring-1 ring-slate-200 text-[10px] font-semibold text-sky-700 hover:bg-sky-50 flex items-center gap-1"><MoveVertical size={11} /> Gerakan</button>
              <button onClick={onEdit} title="Edit tangki" className="px-2 py-1 rounded-lg bg-white/95 shadow ring-1 ring-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1"><Pencil size={11} /> Edit</button>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Utilisasi besar */}
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tabular-nums" style={{ color: st.dot }}>{pct}</span>
              <span className="text-sm font-bold text-slate-400">%</span>
              {pct > 100 && <AlertTriangle size={14} className="text-red-500 ml-0.5" />}
            </div>
            <div className="text-xs text-slate-500 -mt-0.5 mb-2">utilisasi</div>

            {/* Volume */}
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 px-2.5 py-2 space-y-1">
              <div className="flex justify-between text-xs"><span className="text-slate-400">Stok</span><span className="font-bold font-mono text-slate-700">{fmt(t.stok)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400">Kapasitas</span>{noCap ? <button onClick={onEdit} className="text-amber-600 font-semibold underline decoration-dotted">belum diset → isi</button> : <span className="font-mono text-slate-500">{fmt(t.kapasitas_mt)} MT</span>}</div>
              {t.hari_tersimpan != null && (
                <div className="flex justify-between text-xs pt-1 border-t border-slate-200/70">
                  <span className="text-slate-400">Retensi</span>
                  <span className={`font-semibold ${retHigh ? 'text-orange-600' : 'text-slate-600'}`}>{t.hari_tersimpan} hari{retHigh ? ' ⚠' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400">{t.be_digunakan ? `🧪 ${t.be_digunakan}` : (t.last_update ? `↻ ${t.last_update}` : 'belum ada gerakan')}</span>
          {retHigh && <span className="text-[10px] font-semibold text-orange-600">Retensi Tinggi</span>}
        </div>
      </div>
    </div>
  )
}

function TankForm({ tank, onClose, onSaved }) {
  const [f, setF] = useState({ ...tank, stok_set: tank.stok ?? '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const kap = Number(f.kapasitas_mt) || 0
  const stk = Number(f.stok_set) || 0
  const previewPct = kap > 0 ? +(stk / kap * 100).toFixed(1) : null
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
    <Modal title={f.id ? `Ubah Peruntukan Tangki No. ${f.no_urut ?? ''}` : 'Tangki Baru'} onClose={onClose}>
      {f.id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-3 text-[11px] text-blue-700">
          💡 Nomor tangki <strong>#{f.no_urut}</strong> tetap. Anda bebas mengubah produk, kapasitas, dan nama — riwayat tangki lain tidak terpengaruh.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="No. Tangki"><input type="number" value={f.no_urut ?? ''} onChange={e => set('no_urut', e.target.value)} className="input w-full" /></Field>
        <Field label="Kode"><input value={f.kode || ''} onChange={e => set('kode', e.target.value)} placeholder="ST01" className="input w-full" /></Field>
        <Field label="Nama / Peruntukan *"><input value={f.nama} onChange={e => set('nama', e.target.value)} placeholder="CPO ST01" className="input w-full" /></Field>
        <Field label="Produk">
          <select value={f.produk || ''} onChange={e => set('produk', e.target.value)} className="input w-full">
            <option value="">— pilih —</option>{PRODUK.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Kapasitas (MT)"><input type="number" step="any" value={f.kapasitas_mt ?? ''} onChange={e => set('kapasitas_mt', e.target.value)} placeholder="mis. 2500" className="input w-full" /></Field>
        <Field label="Lokasi"><input value={f.lokasi || ''} onChange={e => set('lokasi', e.target.value)} className="input w-full" /></Field>
      </div>

      {/* Stok saat ini — langsung menggerakkan gauge */}
      <div className="mt-3 rounded-xl bg-sky-50 ring-1 ring-sky-200 p-3">
        <div className="text-[11px] font-bold text-sky-700 mb-2 flex items-center gap-1"><Droplets size={13} /> ISI TANGKI (STOK SAAT INI)</div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Stok Saat Ini (MT)">
            <input type="number" step="any" value={f.stok_set ?? ''} onChange={e => set('stok_set', e.target.value)} placeholder="mis. 1500" className="input w-full" />
          </Field>
          <div className="pb-1">
            {kap > 0 ? (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold tabular-nums" style={{ color: previewPct > 100 ? '#dc2626' : previewPct >= 90 ? '#f97316' : '#0ea5e9' }}>{previewPct}</span>
                <span className="text-sm font-bold text-slate-400">% terisi</span>
              </div>
            ) : <span className="text-[11px] text-amber-600 font-semibold">Isi kapasitas dulu agar % muncul</span>}
          </div>
        </div>
        <div className="text-[10px] text-slate-500 mt-1.5">Mengetik stok di sini otomatis membuat pergerakan penyesuaian — tinggi cairan di kartu langsung terisi.</div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="text-[11px] font-bold text-gray-500 mb-2">RETENSI & STABILITAS (opsional)</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Awal Filling"><input type="date" value={f.awal_filling || ''} onChange={e => set('awal_filling', e.target.value)} className="input w-full" /></Field>
          <Field label="Akhir Filling"><input type="date" value={f.akhir_filling || ''} onChange={e => set('akhir_filling', e.target.value)} className="input w-full" /></Field>
          <Field label="BE Digunakan"><input value={f.be_digunakan || ''} onChange={e => set('be_digunakan', e.target.value)} placeholder="CLARIANT OPTIMUM" className="input w-full" /></Field>
        </div>
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
  const blank = { tanggal: new Date().toISOString().slice(0, 10), inbound: '', outbound: '', catatan: '' }
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)   // null = mode tambah; angka = mode edit
  const [saving, setSaving] = useState(false)
  function load() { api.get(`/tank/${tank.id}/movements`).then(r => setMoves(r.data)) }
  useEffect(() => { load() }, [])
  function startEdit(m) {
    setEditId(m.id)
    setForm({ tanggal: String(m.tanggal).slice(0, 10), inbound: m.inbound || '', outbound: m.outbound || '', catatan: m.catatan || '' })
  }
  function cancelEdit() { setEditId(null); setForm(blank) }
  async function save() {
    if (!form.tanggal) return
    setSaving(true)
    try {
      if (editId) await api.put(`/tank/movements/${editId}`, form)
      else await api.post(`/tank/${tank.id}/movements`, form)
      cancelEdit(); load(); onChanged()
    } catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  async function del(id) { if (!confirm('Hapus gerakan ini? Stok sesudahnya dihitung ulang otomatis.')) return; await api.delete(`/tank/movements/${id}`); if (editId === id) cancelEdit(); load(); onChanged() }
  return (
    <Modal title={`Pergerakan — ${tank.kode || tank.nama}`} onClose={onClose} wide>
      <div className={`rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end border ${editId ? 'bg-amber-50 border-amber-300' : 'bg-sky-50 border-sky-200'}`}>
        {editId && <div className="col-span-2 md:col-span-6 text-xs font-semibold text-amber-700 -mb-1">✏️ Mengedit pergerakan (opening/closing semua baris akan dihitung ulang otomatis)</div>}
        <Field label="Tanggal"><input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} className="input w-full" /></Field>
        <Field label="Masuk (MT)"><input type="number" step="any" value={form.inbound} onChange={e => setForm({ ...form, inbound: e.target.value })} className="input w-full" /></Field>
        <Field label="Keluar (MT)"><input type="number" step="any" value={form.outbound} onChange={e => setForm({ ...form, outbound: e.target.value })} className="input w-full" /></Field>
        <Field label="Catatan"><input value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} className="input w-full" /></Field>
        <button onClick={save} disabled={saving} className={`flex items-center justify-center gap-1 ${editId ? 'px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold' : 'btn-primary'}`}>{editId ? <><Save size={14} /> Simpan</> : <><Plus size={14} /> Tambah</>}</button>
        {editId && <button onClick={cancelEdit} className="px-3 py-2 rounded-lg bg-white ring-1 ring-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">Batal</button>}
      </div>
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-200 bg-gray-50">
            {['Tanggal', 'Opening', 'Masuk', 'Keluar', 'Closing', 'Catatan', ''].map(h => <th key={h} className="table-header">{h}</th>)}
          </tr></thead>
          <tbody>
            {moves.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-6">Belum ada pergerakan</td></tr>}
            {moves.map(m => (
              <tr key={m.id} className={`border-b border-gray-100 ${editId === m.id ? 'bg-amber-50' : ''}`}>
                <td className="table-cell text-xs">{m.tanggal}</td>
                <td className="table-cell font-mono text-xs">{fmt(m.opening)}</td>
                <td className="table-cell font-mono text-xs text-green-600"><ArrowDownCircle size={11} className="inline" /> {fmt(m.inbound)}</td>
                <td className="table-cell font-mono text-xs text-orange-600"><ArrowUpCircle size={11} className="inline" /> {fmt(m.outbound)}</td>
                <td className="table-cell font-mono text-xs font-bold">{fmt(m.closing)}</td>
                <td className="table-cell text-xs text-gray-500">{m.catatan}</td>
                <td className="table-cell whitespace-nowrap">
                  <button onClick={() => startEdit(m)} title="Edit" className="text-gray-300 hover:text-amber-500 mr-1.5"><Pencil size={12} /></button>
                  <button onClick={() => del(m.id)} title="Hapus" className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                </td>
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

function GlassKpi({ icon, label, value, unit, accent }) {
  return (
    <div className="rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-300/80 mb-1">
        <span style={{ color: accent || '#cbd5e1' }}>{icon}</span>{label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-extrabold text-white tabular-nums" style={accent ? { color: accent } : {}}>{value}</span>
        {unit && <span className="text-[11px] font-semibold text-slate-400">{unit}</span>}
      </div>
    </div>
  )
}

function LoadError({ msg, onRetry }) {
  return (
    <div className="card bg-red-50 border-red-200 text-center py-10">
      <div className="text-red-600 font-semibold mb-1">Gagal memuat data</div>
      <div className="text-xs text-gray-500 mb-4">{msg}</div>
      <button onClick={onRetry} className="btn-primary">Coba Lagi</button>
      <p className="text-[11px] text-gray-400 mt-3">Jika baru deploy, tunggu 1-2 menit lalu coba lagi.</p>
    </div>
  )
}
