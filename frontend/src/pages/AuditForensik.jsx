import { useEffect, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import { Shield, AlertTriangle, TrendingDown, Clock, Truck, Users, FileSearch, Activity, Hash, Zap, AlertOctagon, Settings, ChevronRight, ChevronDown, Copy, MapPin, Save, BarChart3, UserCheck, ExternalLink } from 'lucide-react'
import api, { fmt } from '../utils/api'

const MONTHS = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const tt = { backgroundColor:'#fff', border:'1px solid #e5e7eb', borderRadius:8, color:'#111827', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.1)' }

export default function AuditForensik() {
  const [tab, setTab] = useState('score')
  const [tahun, setTahun] = useState('')
  const [bulan, setBulan] = useState('')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:'linear-gradient(135deg,#ef4444,#b91c1c)'}}>
            <Shield size={22} className="text-white" />
          </div>
          <div>
            <h1 className="page-title">Audit Forensik</h1>
            <p className="page-subtitle">Deteksi anomali & pola manipulasi data timbangan</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto" value={tahun} onChange={e => setTahun(e.target.value)}>
            <option value="">Semua Tahun</option>
            <option>2025</option><option>2026</option>
          </select>
          <select className="input w-auto" value={bulan} onChange={e => setBulan(e.target.value)}>
            <option value="">Semua Bulan</option>
            {MONTHS.slice(1).map((m, i) => <option key={i+1} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {[
          { id:'score',     label:'Anomaly Score',    icon: AlertOctagon },
          { id:'fraudidx',  label:'Fraud Index',      icon: Zap },
          { id:'capacity',  label:'Vehicle Capacity', icon: BarChart3 },
          { id:'truck',     label:'Truck Fingerprint',icon: Truck },
          { id:'pattern',   label:'Digit Forensic',   icon: Hash },
          { id:'scorecard', label:'Scorecards',       icon: UserCheck },
          { id:'advanced',  label:'Forensik+',        icon: AlertTriangle },
          { id:'duplicate', label:'Duplicate Detect', icon: Copy },
          { id:'time',      label:'Time & Geo',       icon: MapPin },
          { id:'distrib',   label:'Distribution',     icon: Activity },
          { id:'recon',     label:'Reconciliation',   icon: FileSearch },
          { id:'settings',  label:'Settings',         icon: Settings },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap transition-colors ${tab===t.id ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon size={14}/> {t.label}
            </button>
          )
        })}
      </div>

      {tab==='score'     && <ScoreTab tahun={tahun} bulan={bulan} />}
      {tab==='fraudidx'  && <FraudIndexTab tahun={tahun} bulan={bulan} />}
      {tab==='capacity'  && <CapacityTab tahun={tahun} bulan={bulan} />}
      {tab==='truck'     && <TruckTab />}
      {tab==='pattern'   && <PatternTab tahun={tahun} bulan={bulan} />}
      {tab==='scorecard' && <ScorecardTab tahun={tahun} bulan={bulan} />}
      {tab==='advanced'  && <AdvancedTab tahun={tahun} bulan={bulan} />}
      {tab==='duplicate' && <DuplicateTab tahun={tahun} bulan={bulan} />}
      {tab==='time'      && <TimeGeoTab tahun={tahun} bulan={bulan} />}
      {tab==='distrib'   && <DistributionTab tahun={tahun} bulan={bulan} />}
      {tab==='recon'     && <ReconTab />}
      {tab==='settings'  && <SettingsTab />}
    </div>
  )
}

/* ──────────────── TAB 1: ANOMALY SCORE ──────────────── */
function ScoreTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [levelFilter, setLevelFilter] = useState('all')

  useEffect(() => {
    setLoading(true)
    api.get('/audit/anomaly-score', { params: { tahun, bulan } }).then(r => setD(r.data)).finally(() => setLoading(false))
  }, [tahun, bulan])

  if (loading) return <div className="text-gray-500 py-10 text-center">Menghitung anomaly score...</div>
  if (!d) return null

  const flagged = d.flagged.filter(f => levelFilter === 'all' || f.level === levelFilter)
  const levelColor = { aman:'#10b981', perhatian:'#f59e0b', mencurigakan:'#f97316', kritis:'#ef4444' }
  const levelLabel = { aman:'Aman', perhatian:'Perhatian', mencurigakan:'Mencurigakan', kritis:'Kritis' }

  return (
    <div className="space-y-4">
      <div className="card bg-red-50 border-red-200 flex items-start gap-3">
        <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="text-xs text-red-700">
          <strong>Anomaly Score</strong> = skor komposit 0-100 dari multiple indicator. Skor tinggi BUKAN vonis fraud — bisa error operasional, namun WAJIB diinvestigasi. Klik baris untuk lihat detail reasoning.
        </div>
      </div>

      {/* KPI level summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500">Total Trip Dianalisis</p>
          <p className="text-2xl font-bold text-gray-800">{d.stats.total_trip.toLocaleString('id-ID')}</p>
        </div>
        {['aman','perhatian','mencurigakan','kritis'].map(lv => (
          <div key={lv} className="card cursor-pointer hover:shadow-md transition-shadow" onClick={()=>setLevelFilter(lv === levelFilter ? 'all' : lv)} style={{borderLeftWidth:4, borderLeftColor:levelColor[lv]}}>
            <p className="text-xs text-gray-500">{levelLabel[lv]}</p>
            <p className="text-2xl font-bold" style={{color: levelColor[lv]}}>{d.stats[lv].toLocaleString('id-ID')}</p>
            <p className="text-[10px] text-gray-400 mt-1">{((d.stats[lv]/d.stats.total_trip)*100).toFixed(1)}%</p>
          </div>
        ))}
      </div>

      {/* Filter chip */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 font-semibold">Filter Level:</span>
        {['all','perhatian','mencurigakan','kritis'].map(lv => (
          <button key={lv} onClick={()=>setLevelFilter(lv)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${levelFilter===lv ? 'text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`} style={levelFilter===lv ? {backgroundColor: levelColor[lv] || '#6b7280'} : {}}>
            {lv === 'all' ? `Semua (${d.flagged.length})` : `${levelLabel[lv]} (${d.stats[lv]})`}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">Menampilkan {flagged.length} trip</span>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="table-header w-8"></th>
                <th className="table-header">Score</th>
                <th className="table-header">Level</th>
                <th className="table-header">No.Seri</th>
                <th className="table-header">Tanggal</th>
                <th className="table-header">No. Polisi</th>
                <th className="table-header">Relasi</th>
                <th className="table-header">Produk</th>
                <th className="table-header text-right">Netto</th>
                <th className="table-header">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {flagged.slice(0, 200).map(f => (
                <Fragment key={f.id} id={f.id} expanded={expanded[f.id]} setExpanded={(v)=>setExpanded(prev => ({...prev, [f.id]: v}))}>
                  <tr className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer`} onClick={()=>setExpanded(prev => ({...prev, [f.id]: !prev[f.id]}))}>
                    <td className="table-cell">{expanded[f.id] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                    <td className="table-cell"><span className="font-bold text-lg" style={{color: levelColor[f.level]}}>{f.anomaly_score}</span></td>
                    <td className="table-cell"><span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{backgroundColor: levelColor[f.level]}}>{f.level_label}</span></td>
                    <td className="table-cell text-xs font-mono">{f.no_seri}</td>
                    <td className="table-cell text-xs">{fmt.tgl(f.tanggal_masuk)}</td>
                    <td className="table-cell font-medium text-purple-700">{f.no_polisi}</td>
                    <td className="table-cell text-xs max-w-[160px] truncate">{f.relasi_nama}</td>
                    <td className="table-cell"><span className="badge-neutral">{f.produk}</span></td>
                    <td className="table-cell text-right font-mono font-semibold">{f.berat_netto_wins?.toLocaleString('id-ID')}</td>
                    <td className="table-cell"><span className="text-xs text-gray-500">{f.reasons.length} indikator</span></td>
                  </tr>
                  {expanded[f.id] && (
                    <tr><td colSpan={10} className="p-0">
                      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                        <h4 className="text-xs font-bold text-gray-700 mb-2">Breakdown Reasoning (skor {f.anomaly_score})</h4>
                        <div className="space-y-1">
                          {f.reasons.map((r, i) => (
                            <div key={i} className="flex items-start gap-3 text-xs">
                              <span className="px-2 py-0.5 rounded text-white font-bold flex-shrink-0" style={{backgroundColor: r.severity==='critical' ? '#ef4444' : r.severity==='alert' ? '#f97316' : r.severity==='warning' ? '#f59e0b' : '#0ea5e9'}}>+{r.points}</span>
                              <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{r.code}</span>
                              <span className="text-gray-700">{r.label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div><strong>B.Masuk:</strong> {f.berat_masuk?.toLocaleString('id-ID')}</div>
                          <div><strong>B.Keluar:</strong> {f.berat_keluar?.toLocaleString('id-ID')}</div>
                          <div><strong>B.Relasi:</strong> {f.berat_relasi?.toLocaleString('id-ID') || '—'}</div>
                          <div><strong>Truck:</strong> {f.truck_type}</div>
                          <div><strong>Jam M/K:</strong> {f.jam_masuk}/{f.jam_keluar}</div>
                          <div><strong>Penimbang:</strong> {f.penimbang}</div>
                          <div><strong>Driver:</strong> {f.driver}</div>
                          <div><strong>No.Kontrak:</strong> <span className="font-mono">{f.no_kontrak || '—'}</span></div>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Fragment({ children }) { return <>{children}</> }

/* ──────────────── TAB 2: TRUCK FINGERPRINT ──────────────── */
function TruckTab() {
  const [d, setD] = useState(null)
  const [selected, setSelected] = useState(null)
  const [showAll, setShowAll] = useState(false)  // toggle: hanya anomali vs semua trip
  const [expandedTrip, setExpandedTrip] = useState(null)
  const [timeline, setTimeline] = useState(null)
  useEffect(() => { api.get('/audit/truck-fingerprint').then(r => setD(r.data)) }, [])
  useEffect(() => {
    if (selected?.no_polisi) {
      setTimeline(null)
      api.get(`/audit/truck-timeline/${encodeURIComponent(selected.no_polisi)}`).then(r => setTimeline(r.data))
    } else setTimeline(null)
  }, [selected?.no_polisi])
  if (!d) return <div className="text-gray-500 py-10 text-center">Menganalisis tare setiap truk...</div>

  const lvColor = { perhatian:'#f59e0b', alert:'#f97316', mustahil:'#ef4444', aman:'#10b981' }
  const lvBgClass = { perhatian:'bg-yellow-50', alert:'bg-orange-50', mustahil:'bg-red-50', aman:'' }

  const tripsToShow = selected ? (showAll ? selected.all_trips : selected.flagged_trips) : []

  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <Truck className="text-blue-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-blue-700">
          <strong>Truck Fingerprint</strong> — Setiap truk punya bobot kosong (<em>tare</em>) yang harusnya stabil.
          Untuk produk MASUK (CPO/B-40/BE), tare = <code>berat_keluar</code>. Untuk produk KELUAR (RBDPL/RBDPS/PFAD/Stearin), tare = <code>berat_masuk</code>.
          Klik baris truk untuk drill-down detail trip lengkap.
        </div>
      </div>

      {/* Daftar Truk (atas) */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Daftar Truk ({d.total})</h3>
            <p className="text-xs text-gray-500">Diurut berdasarkan jumlah anomali terbanyak</p>
          </div>
          {selected && (
            <button onClick={()=>{setSelected(null); setExpandedTrip(null)}} className="text-xs text-gray-500 hover:text-red-600">✕ Tutup detail</button>
          )}
        </div>
        <div className="overflow-y-auto max-h-[35vh]">
          <table className="w-full">
            <thead className="sticky top-0 bg-white shadow-sm z-10">
              <tr>
                <th className="table-header">No. Polisi</th>
                <th className="table-header">Truck</th>
                <th className="table-header text-right">Trip</th>
                <th className="table-header text-right">Median Tare</th>
                <th className="table-header text-right">Min - Max</th>
                <th className="table-header text-right">Range %</th>
                <th className="table-header text-right">Anomali</th>
              </tr>
            </thead>
            <tbody>
              {d.trucks.map(t => (
                <tr key={t.no_polisi} onClick={()=>{setSelected(t); setExpandedTrip(null)}}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${selected?.no_polisi===t.no_polisi ? 'bg-purple-50' : ''}`}>
                  <td className="table-cell font-mono font-semibold text-purple-700">{t.no_polisi}</td>
                  <td className="table-cell text-xs text-gray-500">{t.truck_type}</td>
                  <td className="table-cell text-right">{t.trip_count}</td>
                  <td className="table-cell text-right font-mono">{t.median_tare?.toLocaleString('id-ID')}</td>
                  <td className="table-cell text-right text-xs text-gray-500">{t.min_tare?.toLocaleString('id-ID')} – {t.max_tare?.toLocaleString('id-ID')}</td>
                  <td className="table-cell text-right text-xs">{((t.max_tare - t.min_tare)/t.median_tare*100).toFixed(1)}%</td>
                  <td className={`table-cell text-right font-bold ${t.anomalies > 0 ? 'text-red-600' : 'text-green-600'}`}>{t.anomalies > 0 ? `${t.anomalies} ⚠` : '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Trip Lengkap (bawah, muncul saat truck dipilih) */}
      {selected && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-bold text-purple-700">🚚 {selected.no_polisi}</h3>
                <p className="text-xs text-gray-500">{selected.truck_type} • {selected.trip_count} trip total</p>
              </div>
              <div className="flex gap-2 text-xs">
                <div className="bg-white px-3 py-2 rounded-lg border border-gray-200"><span className="text-gray-500">Median Tare:</span> <strong className="text-gray-800">{selected.median_tare.toLocaleString('id-ID')} kg</strong></div>
                <div className="bg-white px-3 py-2 rounded-lg border border-gray-200"><span className="text-gray-500">Min:</span> <strong className="text-green-600">{selected.min_tare.toLocaleString('id-ID')}</strong></div>
                <div className="bg-white px-3 py-2 rounded-lg border border-gray-200"><span className="text-gray-500">Max:</span> <strong className="text-red-600">{selected.max_tare.toLocaleString('id-ID')}</strong></div>
                <div className="bg-white px-3 py-2 rounded-lg border border-gray-200"><span className="text-gray-500">Anomali:</span> <strong className="text-red-600">{selected.anomalies}</strong></div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs font-semibold text-gray-600">Tampilkan:</span>
              <button onClick={()=>setShowAll(false)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!showAll ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                Hanya Anomali ({selected.anomalies})
              </button>
              <button onClick={()=>setShowAll(true)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${showAll ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                Semua Trip ({selected.trip_count})
              </button>
            </div>
          </div>

          {/* Tare Drift Timeline */}
          {timeline && timeline.timeline.length > 0 && (
            <div className="p-4 border-b border-gray-100 bg-white">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h4 className="text-sm font-bold text-gray-700">📉 Tare Drift Timeline</h4>
                {timeline.driftWarning && (
                  <div className={`text-xs px-3 py-1 rounded-full font-semibold ${Math.abs(timeline.driftWarning.drift_pct) > 5 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    ⚠ Drift {timeline.driftWarning.direction}: {timeline.driftWarning.first_mean.toLocaleString('id-ID')} → {timeline.driftWarning.last_mean.toLocaleString('id-ID')} ({timeline.driftWarning.drift_pct > 0 ? '+' : ''}{timeline.driftWarning.drift_pct}%)
                  </div>
                )}
                {!timeline.driftWarning && (
                  <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-semibold">✓ Tare stabil sepanjang waktu</span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                MAD (Median Abs Deviation): <strong>{timeline.stats.mad.toLocaleString('id-ID')} kg</strong> · Range: <strong>{timeline.stats.range_pct}%</strong> ·
                Tare trip-per-trip seharusnya tetap di garis median. Naik/turun mendadak = potensi manipulasi.
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timeline.timeline} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="tanggal" tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={v => v ? new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) : ''} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['dataMin - 200', 'dataMax + 200']} tickFormatter={v => (v/1000).toFixed(1)+'k'} />
                  <Tooltip contentStyle={tt} formatter={(v, n) => n === 'tare' ? [v.toLocaleString('id-ID') + ' kg', 'Tare'] : [v, n]}
                    labelFormatter={(v, payload) => payload?.[0]?.payload ? `${new Date(payload[0].payload.tanggal).toLocaleDateString('id-ID')} · ${payload[0].payload.produk} · seri ${payload[0].payload.no_seri}` : ''} />
                  <ReferenceLine y={timeline.stats.median} stroke="#10b981" strokeDasharray="3 3" label={{ value: `median ${timeline.stats.median.toLocaleString('id-ID')}`, fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                  <Bar dataKey="tare" name="Tare">
                    {timeline.timeline.map((t, i) => (
                      <Cell key={i} fill={t.abs_dev_pct > 10 ? '#ef4444' : t.abs_dev_pct > 5 ? '#f97316' : t.abs_dev_pct > 3 ? '#fbbf24' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded" style={{background:'#10b981'}}/> ≤3%</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded" style={{background:'#fbbf24'}}/> 3-5%</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded" style={{background:'#f97316'}}/> 5-10%</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded" style={{background:'#ef4444'}}/> {`>10%`}</span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full min-w-[1400px]">
              <thead className="sticky top-0 bg-gray-50 shadow-sm z-10">
                <tr>
                  <th className="table-header w-8"></th>
                  <th className="table-header">Tgl</th>
                  <th className="table-header">No. Seri</th>
                  <th className="table-header">Relasi</th>
                  <th className="table-header">Produk</th>
                  <th className="table-header">Arah</th>
                  <th className="table-header text-right">B. Masuk</th>
                  <th className="table-header text-right">B. Keluar</th>
                  <th className="table-header text-right">Netto</th>
                  <th className="table-header text-right">B. Relasi</th>
                  <th className="table-header text-right">Var %</th>
                  <th className="table-header text-right">Tare</th>
                  <th className="table-header text-right">Dev %</th>
                  <th className="table-header">Level</th>
                  <th className="table-header">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tripsToShow.length === 0 ? (
                  <tr><td colSpan={15} className="text-center py-10 text-gray-400 text-sm">
                    {showAll ? 'Tidak ada trip' : '✓ Tidak ada anomali tare untuk truk ini'}
                  </td></tr>
                ) : tripsToShow.map((f, i) => {
                  const isExpanded = expandedTrip === f.id
                  return (
                    <Fragment key={f.id || i}>
                      <tr className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${lvBgClass[f.level] || ''}`}
                          onClick={()=>setExpandedTrip(isExpanded ? null : f.id)}>
                        <td className="table-cell">{isExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                        <td className="table-cell text-xs">{fmt.tgl(f.tanggal_masuk)}</td>
                        <td className="table-cell text-xs font-mono font-bold">{f.no_seri}</td>
                        <td className="table-cell text-xs max-w-[160px] truncate" title={f.relasi_nama}>{f.relasi_nama}</td>
                        <td className="table-cell"><span className="badge-neutral">{f.produk}</span></td>
                        <td className="table-cell text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${f.arah === 'IN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{f.arah}</span>
                        </td>
                        <td className="table-cell text-right font-mono text-xs">{f.berat_masuk?.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-right font-mono text-xs">{f.berat_keluar?.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-right font-mono font-semibold">{f.berat_netto_wins?.toLocaleString('id-ID')}</td>
                        <td className="table-cell text-right font-mono text-xs text-gray-500">{f.berat_relasi?.toLocaleString('id-ID') || '—'}</td>
                        <td className={`table-cell text-right text-xs font-bold ${f.var_pct == null ? 'text-gray-400' : Math.abs(f.var_pct) > 1 ? 'text-red-600' : Math.abs(f.var_pct) > 0.3 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {f.var_pct != null ? (f.var_pct > 0 ? '+' : '') + f.var_pct + '%' : '—'}
                        </td>
                        <td className="table-cell text-right font-mono font-bold">{f.tare?.toLocaleString('id-ID')}</td>
                        <td className={`table-cell text-right font-bold ${f.level === 'mustahil' ? 'text-red-600' : f.level === 'alert' ? 'text-orange-600' : f.level === 'perhatian' ? 'text-yellow-600' : 'text-green-600'}`}>
                          {f.dev_pct}%
                        </td>
                        <td className="table-cell">
                          {f.level !== 'aman' ? (
                            <span className="px-2 py-0.5 rounded text-white text-xs font-bold" style={{backgroundColor: lvColor[f.level]}}>{f.level}</span>
                          ) : (
                            <span className="text-green-600 text-xs">✓</span>
                          )}
                        </td>
                        <td className="table-cell">
                          <a href={`/data?search=${f.no_seri}`} onClick={e => e.stopPropagation()} target="_blank" rel="noopener" className="text-purple-600 hover:text-purple-800 text-xs font-medium underline">
                            Lihat
                          </a>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr><td colSpan={15} className="p-0">
                          <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                            <h4 className="text-xs font-bold text-gray-700 mb-2">Detail Lengkap Trip {f.no_seri}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div><span className="text-gray-500">No. Seri Relasi:</span> <strong className="font-mono">{f.no_seri_relasi || '—'}</strong></div>
                              <div><span className="text-gray-500">No. Polisi:</span> <strong>{f.no_polisi}</strong></div>
                              <div><span className="text-gray-500">No. Kontrak:</span> <strong className="font-mono text-purple-700">{f.no_kontrak || '—'}</strong></div>
                              <div><span className="text-gray-500">DO:</span> <strong className="font-mono">{f.do_number || '—'}</strong></div>
                              <div><span className="text-gray-500">Jam Masuk:</span> <strong>{f.jam_masuk || '—'}</strong></div>
                              <div><span className="text-gray-500">Jam Keluar:</span> <strong>{f.jam_keluar || '—'}</strong></div>
                              <div><span className="text-gray-500">Penimbang:</span> <strong className="capitalize">{f.penimbang || '—'}</strong></div>
                              <div><span className="text-gray-500">Driver:</span> <strong>{f.driver || '—'}</strong></div>
                              <div><span className="text-gray-500">Transportir:</span> <strong>{f.transportir || '—'}</strong></div>
                              <div><span className="text-gray-500">Lokasi:</span> <strong>{f.lokasi_pengiriman || '—'}</strong></div>
                              <div><span className="text-gray-500">Jarak:</span> <strong>{f.distance_km ? f.distance_km + ' km' : '—'}</strong></div>
                              <div><span className="text-gray-500">Gross (berisi):</span> <strong className="text-purple-700">{f.gross?.toLocaleString('id-ID')} kg</strong></div>
                            </div>
                            {f.level !== 'aman' && (
                              <div className="mt-3 px-3 py-2 rounded border" style={{backgroundColor: lvColor[f.level] + '15', borderColor: lvColor[f.level] + '40'}}>
                                <p className="text-xs"><strong style={{color: lvColor[f.level]}}>⚠ Tare Anomali ({f.level})</strong> — Tare {f.tare.toLocaleString('id-ID')} kg deviasi <strong>{f.dev_pct}%</strong> dari median truck {selected.median_tare.toLocaleString('id-ID')} kg. {f.level === 'mustahil' ? 'Sangat tidak natural — kemungkinan data salah input atau manipulasi.' : f.level === 'alert' ? 'Di luar batas wajar — perlu investigasi.' : 'Sedikit di luar pola normal.'}</p>
                              </div>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-200 text-xs text-gray-500 bg-gray-50 flex items-center justify-between">
            <span>💡 Klik baris untuk expand reasoning. Tombol "Lihat" buka di Data Timbangan (tab baru).</span>
            <span>{tripsToShow.length} {showAll ? 'trip' : 'anomali'} ditampilkan</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────── TAB 3: PATTERN (BENFORD) ──────────────── */
function PatternTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  const [dig, setDig] = useState(null)
  useEffect(() => {
    api.get('/audit/benford', { params:{ tahun, bulan } }).then(r => setD(r.data))
    api.get('/audit/digit-forensic', { params:{ tahun, bulan } }).then(r => setDig(r.data))
  }, [tahun, bulan])
  if (!d || !dig) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  return (
    <div className="space-y-4">
      {/* PRIMARY: Last-2-Digit Forensic (statistically valid) */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-bold text-blue-700 flex items-center gap-2"><Hash size={18}/> Last-2-Digit Forensic (Valid untuk Data Bounded)</h3>
        <p className="text-xs text-blue-600 mt-2">
          Distribusi 2 digit terakhir netto harus <strong>uniform</strong> jika data alami. Test ini valid meskipun netto terbatas kapasitas truk — beda dengan Benford.
          Auto-detect granularity timbangan: <strong>{dig.netto.granularity} kg</strong> (precision instrument).
        </p>
      </div>

      <div className={`card border-2 ${dig.netto.suspicious ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}`}>
        <div className="flex items-center gap-4">
          {dig.netto.suspicious ? <AlertTriangle className="text-red-600" size={36}/> : <Shield className="text-green-600" size={36}/>}
          <div className="flex-1">
            <h3 className={`text-lg font-bold ${dig.netto.suspicious ? 'text-red-700' : 'text-green-700'}`}>
              {dig.netto.suspicious ? '⚠ Pola Digit Terakhir Mencurigakan' : '✓ Distribusi Digit Uniform (Natural)'}
            </h3>
            <p className={`text-sm ${dig.netto.suspicious ? 'text-red-600' : 'text-green-600'} mt-1`}>
              Chi-square: <strong>{dig.netto.chi2}</strong> vs threshold <strong>{dig.netto.threshold}</strong> (df={dig.netto.valid_pairs_count - 1}).
              Expected per pair: <strong>{dig.netto.expected_count}</strong>. Total {dig.netto.total.toLocaleString('id-ID')} trip.
            </p>
          </div>
        </div>
        {dig.netto.suspect.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-xs text-red-700 font-bold mb-2">Digit-pair muncul {`>2×`} expected:</p>
            <div className="flex flex-wrap gap-2">
              {dig.netto.suspect.map(s => (
                <div key={s.last2} className="px-2 py-1 bg-white border border-red-300 rounded text-xs">
                  <strong>...{String(s.last2).padStart(2,'0')}</strong> → {s.count}× ({s.actual_pct}%)
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Distribusi digit puluhan (puluhan kg) */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Distribusi Digit Puluhan Netto</h3>
        <p className="text-[11px] text-gray-500 mb-3">Setelah granularity {dig.netto.granularity}kg di-normalisasi. Harusnya uniform ~10% per digit.</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dig.tens_netto.dist} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="digit" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
            <Tooltip contentStyle={tt} formatter={(v, name) => [v + '%', name === 'actual_pct' ? 'Aktual' : 'Expected']} />
            <Legend />
            <Bar dataKey="expected_pct" fill="#a78bfa" name="Expected (uniform)" radius={[4,4,0,0]} />
            <Bar dataKey="actual_pct" fill="#3b82f6" name="Aktual" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-400 mt-1 text-right">Chi-square: {dig.tens_netto.chi2} | Threshold: {dig.tens_netto.threshold} | {dig.tens_netto.suspicious ? '⚠ Suspicious' : '✓ OK'}</p>
      </div>

      {/* DEPRECATED: Benford with disclaimer */}
      <div className="card bg-amber-50 border-amber-200">
        <h3 className="font-bold text-amber-700 flex items-center gap-2"><AlertTriangle size={18}/> Benford's Law — Informasi Deskriptif Saja</h3>
        <p className="text-xs text-amber-700 mt-2">
          <strong>⚠ Disclaimer:</strong> Benford Law mensyaratkan data span minimal 3+ orde magnitudo (1 → 10.000+) tanpa cutoff fisik.
          Data weighbridge Anda <strong>bounded oleh kapasitas truk</strong> (6 roda: 9–11k, 10 roda: 13–16k, 12 roda: 26–32k),
          sehingga deviasi dari Benford <strong>diharapkan dan BUKAN indikator fraud</strong>.
          Gunakan <strong>Last-2-Digit Forensic</strong> di atas sebagai test utama.
        </p>
      </div>

      <div className="card border border-gray-300 bg-gray-50">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-gray-500" size={28}/>
          <div>
            <h3 className="text-sm font-bold text-gray-700">Benford Chi-square (Descriptive)</h3>
            <p className="text-xs text-gray-500 mt-1">
              χ² = <strong>{d.benford.chi2}</strong> dari {d.benford.total.toLocaleString('id-ID')} trip. <em>Nilai tinggi karena data bounded — bukan indikator fraud.</em>
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Distribusi Digit Pertama (Berat Netto)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={d.benford.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="digit" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip contentStyle={tt} formatter={(v, name) => [v + '%', name === 'actual_pct' ? 'Aktual' : 'Expected (Benford)']} />
            <Legend />
            <Bar dataKey="expected_pct" fill="#a78bfa" name="Expected (Benford)" radius={[4,4,0,0]} />
            <Bar dataKey="actual_pct" fill="#ef4444" name="Aktual" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown per Produk */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Benford per Produk</h3>
        <div className="space-y-3">
          {d.perProduk.map(p => (
            <div key={p.produk} className={`rounded-lg border p-3 ${p.suspicious ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-800">{p.produk}</span>
                  <span className="text-xs text-gray-500">{p.total} trip</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${p.suspicious ? 'text-red-600' : 'text-green-600'}`}>
                    χ² = {p.chi2}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.suspicious ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {p.suspicious ? '⚠ Mencurigakan' : '✓ Normal'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-9 gap-0.5">
                {p.data.map(b => {
                  const dev = b.actual_pct - b.expected_pct;
                  const isHigh = dev > 5;
                  const isLow = dev < -5;
                  return (
                    <div key={b.digit} className="text-center">
                      <div className="text-[9px] text-gray-400 mb-0.5">{b.digit}</div>
                      <div className={`text-[10px] font-bold ${isHigh ? 'text-red-600' : isLow ? 'text-blue-600' : 'text-gray-600'}`}>
                        {b.actual_pct}%
                      </div>
                      <div className="text-[9px] text-gray-400">{b.expected_pct}%</div>
                      <div className={`text-[9px] font-semibold ${isHigh ? 'text-red-500' : isLow ? 'text-blue-500' : 'text-gray-400'}`}>
                        {dev > 0 ? '+' : ''}{dev.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[9px] text-gray-400 mt-1 text-right">Baris: Aktual% / Expected% / Deviasi</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Pola Angka Bulat</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="card border-l-4 border-l-red-500">
            <p className="text-xs text-gray-500">Bulat 1.000 (xxx.000)</p>
            <p className="text-2xl font-bold text-red-600">{d.round.pct_1000}%</p>
            <p className="text-[10px] text-gray-400">{d.round.r1000} dari {d.round.total} trip</p>
          </div>
          <div className="card border-l-4 border-l-orange-500">
            <p className="text-xs text-gray-500">Bulat 500</p>
            <p className="text-2xl font-bold text-orange-600">{d.round.pct_500}%</p>
            <p className="text-[10px] text-gray-400">{d.round.r500} trip</p>
          </div>
          <div className="card border-l-4 border-l-yellow-500">
            <p className="text-xs text-gray-500">Bulat 100</p>
            <p className="text-2xl font-bold text-yellow-600">{d.round.pct_100}%</p>
            <p className="text-[10px] text-gray-400">{d.round.r100} trip</p>
          </div>
        </div>
        {d.round.suspicious && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <strong>⚠ Pola bulat mencurigakan</strong> — lebih dari 2% trip punya berat bulat 1.000. Periksa apakah operator membulatkan manual.
          </div>
        )}
      </div>
    </div>
  )
}

/* ──────────────── TAB 4: DUPLICATE ──────────────── */
function DuplicateTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/audit/duplicates', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  return (
    <div className="space-y-4">
      <div className="card bg-orange-50 border-orange-200 flex items-start gap-3">
        <Copy className="text-orange-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-orange-700">
          <strong>Duplicate Detector</strong> — Cari pola data yang persis sama (no.seri ganda, copy-paste data) atau berat netto identik berulang.
        </div>
      </div>

      <Section title={`🔴 Exact Duplicate — No. Seri Relasi Ganda (${d.exact.length})`} desc="No. Seri Relasi (DO unik dari customer) muncul lebih dari 1× di relasi & produk yang sama — impossible, kemungkinan double-input">
        {d.exact.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada duplicate no. seri relasi ✓</div> :
        <TableLite headers={['No. Seri Relasi','Relasi','Produk','Jumlah','Tanggal','No. Polisi','Seri Internal']} rows={d.exact.slice(0,20).map(e => [
          <span className="font-mono font-bold">{e.no_seri_relasi}</span>,
          <span className="text-xs">{e.relasi_nama}</span>,
          <span className="badge-neutral">{e.produk}</span>,
          <span className="font-bold text-red-600">{e.c}×</span>,
          <span className="text-xs text-gray-500">{e.tanggals.join(', ')}</span>,
          <span className="text-xs text-gray-600">{e.polisis?.join(', ')}</span>,
          <span className="text-xs text-gray-400 font-mono">{e.seris?.join(', ')}</span>
        ])} />}
      </Section>

      <Section title={`🟠 Near Duplicate — Berat Identik Berulang (${d.near.length})`} desc="Berat masuk + berat keluar + relasi persis sama di 3+ trip (highly suspicious)">
        {d.near.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada near-duplicate ✓</div> :
        <TableLite headers={['B. Masuk','B. Keluar','Relasi','Produk','Jumlah','Sample Seri']} rows={d.near.slice(0,20).map(e => [
          e.berat_masuk?.toLocaleString('id-ID'),
          e.berat_keluar?.toLocaleString('id-ID'),
          e.relasi_nama,
          <span className="badge-neutral">{e.produk}</span>,
          <span className="font-bold text-orange-600">{e.c}×</span>,
          <span className="text-xs text-gray-500">{e.seris.slice(0,3).join(', ')}{e.seris.length > 3 ? '...' : ''}</span>
        ])} />}
      </Section>

      <Section title={`🟡 Repeated Net Weight (${d.repeatedNetto.length})`} desc="Berat netto persis sama muncul ≥4× — natural data jarang berulang sama persis">
        {d.repeatedNetto.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada pengulangan netto signifikan ✓</div> :
        <TableLite headers={['Netto (Kg)','Produk','Jumlah','Truck terlibat']} rows={d.repeatedNetto.slice(0,20).map(e => [
          <span className="font-mono font-semibold">{e.berat_netto_wins?.toLocaleString('id-ID')}</span>,
          <span className="badge-neutral">{e.produk}</span>,
          <span className="font-bold text-yellow-700">{e.c}×</span>,
          <span className="text-xs text-gray-500">{e.polisis.slice(0,4).join(', ')}{e.polisis.length>4 ? `... (+${e.polisis.length-4})` : ''}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* ──────────────── TAB 5: TIME & GEO ──────────────── */
function TimeGeoTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/audit/time-geo', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  const hours = Array.from({length:24}, (_,h) => ({ hour:h, label:String(h).padStart(2,'0')+':00', trip: d.perHour.find(x => x.hour===h)?.trip || 0 }))
  const dowColors = ['#f59e0b','#a855f7','#a855f7','#a855f7','#a855f7','#a855f7','#f59e0b']

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Clock size={15}/> Distribusi Per Jam</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hours} margin={{ top:10,right:10,left:-10,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hour" tick={{ fill:'#64748b', fontSize:10 }} />
              <YAxis tick={{ fill:'#64748b', fontSize:10 }} />
              <Tooltip contentStyle={tt} formatter={v => [v + ' trip', 'Jumlah']} labelFormatter={l => 'Jam ' + l + ':00'} />
              <ReferenceLine x={5} stroke="#f97316" strokeDasharray="3 3" label={{value:'Ops Start',fill:'#f97316',fontSize:10}} />
              <ReferenceLine x={22} stroke="#f97316" strokeDasharray="3 3" label={{value:'Ops End',fill:'#f97316',fontSize:10}} />
              <Bar dataKey="trip" radius={[4,4,0,0]}>
                {hours.map((h, i) => {
                  const color = h.hour < 5 || h.hour > 22 ? '#ef4444' : '#10b981'
                  return <Cell key={i} fill={color} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-1">🔴 = di luar jam operasional (05:00-22:00)</p>
        </div>

        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Distribusi Per Hari</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.perDow} margin={{ top:10,right:10,left:-10,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day_name" tick={{ fill:'#64748b', fontSize:11 }} />
              <YAxis tick={{ fill:'#64748b', fontSize:10 }} />
              <Tooltip contentStyle={tt} formatter={v => [v + ' trip', 'Jumlah']} />
              <Bar dataKey="trip" radius={[4,4,0,0]}>
                {d.perDow.map((dd, i) => <Cell key={i} fill={dowColors[dd.dow]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-400 mt-1">🟠 = weekend</p>
        </div>
      </div>

      <Section title={`🚛 Truk Sering Late (>${d.settings.jam_ops_end}) Lebih dari ${d.settings.late_trips_threshold}× (${d.lateByTruck.length})`} desc="Truk yang sering aktif lewat jam operasional">
        {d.lateByTruck.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada anomali ✓</div> :
        <TableLite headers={['No. Polisi','Jumlah Trip Lewat Jam']} rows={d.lateByTruck.map(t => [
          <span className="font-mono font-semibold text-purple-700">{t.no_polisi}</span>,
          <span className="font-bold text-red-600">{t.late_trips}× lewat ops</span>
        ])} />}
      </Section>

      <Section title={`🗺 Geo Violation (${d.geoViolations.length}) — Truk di 2 Lokasi dalam Waktu Mustahil`} desc={`Berdasarkan jarak Haversine dengan asumsi kecepatan ${d.settings.avg_speed_kmh} km/jam`}>
        {d.geoViolations.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada geo violation ✓</div> :
        <TableLite headers={['Tgl','No. Polisi','Lokasi A → B','Jarak','Gap Waktu','Min Waktu','Seri']} rows={d.geoViolations.slice(0,20).map(g => [
          fmt.tgl(g.tanggal),
          <span className="font-mono">{g.no_polisi}</span>,
          <span className="text-xs">{g.loc_a} → {g.loc_b}</span>,
          <span className="font-mono">{g.distance_km} km</span>,
          <span className="font-bold text-red-600">{g.gap_minute} mnt</span>,
          <span className="text-xs text-gray-500">{g.min_minute} mnt</span>,
          <span className="text-xs">{g.seri_a}→{g.seri_b}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* ──────────────── TAB 6: DISTRIBUTION ──────────────── */
function DistributionTab({ tahun, bulan }) {
  const [dim, setDim] = useState('produk')
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/audit/distribution', { params:{ dim, tahun, bulan } }).then(r => setD(r.data)) }, [dim, tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[{id:'produk',label:'Per Produk'},{id:'relasi',label:'Per Relasi'},{id:'truck',label:'Per Truk'}].map(v => (
          <button key={v.id} onClick={()=>setDim(v.id)} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${dim===v.id ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>{v.label}</button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50">
              <tr><th className="table-header">{dim==='produk' ? 'Produk' : dim==='relasi' ? 'Relasi' : 'No. Polisi'}</th>
                <th className="table-header text-right">N Trip</th>
                <th className="table-header text-right">Min</th>
                <th className="table-header text-right">Q1 (25%)</th>
                <th className="table-header text-right">Median</th>
                <th className="table-header text-right">Q3 (75%)</th>
                <th className="table-header text-right">Max</th>
                <th className="table-header text-right">Avg</th>
                <th className="table-header text-right">Std Dev</th>
                <th className="table-header text-right">CV %</th>
              </tr>
            </thead>
            <tbody>
              {d.data.map((r, i) => {
                const cv = r.avg > 0 ? (r.stddev / r.avg * 100) : 0
                return (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="table-cell text-sm">{r.grp}</td>
                    <td className="table-cell text-right">{r.n}</td>
                    <td className="table-cell text-right">{r.min?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right text-xs">{r.q1?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right font-bold">{r.median?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right text-xs">{r.q3?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right">{r.max?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right">{r.avg?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-right text-gray-500">{r.stddev?.toLocaleString('id-ID')}</td>
                    <td className={`table-cell text-right font-bold ${cv > 30 ? 'text-red-600' : cv > 15 ? 'text-yellow-600' : 'text-green-600'}`}>{cv.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          💡 <strong>CV (Coefficient of Variation)</strong> = StdDev / Avg. CV &gt; 30% = variabilitas tinggi (mungkin natural untuk relasi multi-produk, atau warning untuk produk tunggal)
        </div>
      </div>
    </div>
  )
}

/* ──────────────── TAB 7: RECONCILIATION ──────────────── */
function ReconTab() {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/audit/reconciliation').then(r => setD(r.data)) }, [])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card border-l-4 border-l-blue-500">
          <p className="text-xs text-gray-500">Total Kontrak</p>
          <p className="text-2xl font-bold text-blue-600">{s.total_kontrak}</p>
        </div>
        <div className="card border-l-4 border-l-green-500">
          <p className="text-xs text-gray-500">Total Kuota</p>
          <p className="text-lg font-bold text-green-600">{(s.total_kuota/1000).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})} t</p>
        </div>
        <div className="card border-l-4 border-l-purple-500">
          <p className="text-xs text-gray-500">Realisasi</p>
          <p className="text-lg font-bold text-purple-600">{(s.total_aktual/1000).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2})} t</p>
          <p className="text-[10px] text-gray-400">{s.total_kuota > 0 ? (s.total_aktual/s.total_kuota*100).toFixed(1) : 0}%</p>
        </div>
        <div className="card border-l-4 border-l-red-500">
          <p className="text-xs text-gray-500">Perlu Investigasi</p>
          <p className="text-2xl font-bold text-red-600">{s.flagged}</p>
          <p className="text-[10px] text-gray-400">{s.over} over · {s.under} under</p>
        </div>
      </div>

      {d.flagged.length > 0 && (
        <Section title={`🚨 Kontrak Bermasalah (${d.flagged.length})`} desc="Kontrak yang over toleransi atau under tapi sudah lewat tempo">
          <TableLite headers={['No. Kontrak','Relasi','Produk','Kuota','Aktual','%','Alert']} rows={d.flagged.map(r => [
            <span className="font-mono text-xs text-purple-700">{r.no_kontrak}</span>,
            <span className="text-xs">{r.relasi_nama}</span>,
            <span className="badge-neutral">{r.produk}</span>,
            (r.kuota_kg/1000).toFixed(2)+' t',
            (r.aktual_kg/1000).toFixed(2)+' t',
            <span className={r.pct > 100 ? 'text-red-600 font-bold' : 'text-orange-600 font-bold'}>{r.pct}%</span>,
            <span className="badge-danger">{r.alert}</span>
          ])} />
        </Section>
      )}

      {d.orphan.length > 0 && (
        <Section title={`⚠ Timbangan Tanpa Kontrak (Orphan, ${d.orphan.length})`} desc="Trip yang masuk timbangan tapi tidak ada referensi kontrak — perlu trace asal usul barang">
          <TableLite headers={['Relasi','Produk','Trip','Total Netto']} rows={d.orphan.slice(0,20).map(r => [
            r.relasi_nama,
            <span className="badge-neutral">{r.produk}</span>,
            <span className="font-bold">{r.trip}</span>,
            (r.netto/1000).toFixed(2)+' t'
          ])} />
        </Section>
      )}
    </div>
  )
}

/* ──────────────── TAB 8: SETTINGS ──────────────── */
function SettingsTab() {
  const [s, setS] = useState(null)
  const [produk, setProduk] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/audit/settings').then(r => { setS(r.data.settings); setProduk(r.data.produk) })
  }, [])

  function set(k, v) { setS(prev => ({ ...prev, [k]: v })) }
  function setProdukField(idx, key, val) { setProduk(p => p.map((x, i) => i === idx ? { ...x, [key]: val } : x)) }

  async function save() {
    setSaving(true)
    try {
      await api.put('/audit/settings', { settings: s, produk })
      setMsg('✓ Settings tersimpan')
      setTimeout(()=>setMsg(''), 3000)
    } catch (e) { setMsg('Gagal: ' + (e.response?.data?.error || e.message)) }
    finally { setSaving(false) }
  }

  if (!s) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <Settings className="text-blue-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-blue-700">
          <strong>Pengaturan Threshold Audit</strong> — Sesuaikan ambang batas deteksi anomali sesuai karakteristik operasional PT WINS. Setelah save, refresh halaman Anomaly Score untuk lihat hasil baru.
        </div>
      </div>

      {/* Tare Threshold */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Truck size={16}/> Tare Threshold (Truck Fingerprint)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Perhatian (%)</label><input type="number" step="0.1" className="input" value={s.tare_threshold_perhatian} onChange={e=>set('tare_threshold_perhatian', +e.target.value)} /></div>
          <div><label className="label">Alert (%)</label><input type="number" step="0.1" className="input" value={s.tare_threshold_alert} onChange={e=>set('tare_threshold_alert', +e.target.value)} /></div>
          <div><label className="label">Mustahil (%)</label><input type="number" step="0.1" className="input" value={s.tare_threshold_mustahil} onChange={e=>set('tare_threshold_mustahil', +e.target.value)} /></div>
        </div>
      </div>

      {/* Jam Operasional */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Clock size={16}/> Jam Operasional</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="label">Ops Start</label><input type="time" className="input" value={s.jam_ops_start} onChange={e=>set('jam_ops_start', e.target.value)} /></div>
          <div><label className="label">Ops End</label><input type="time" className="input" value={s.jam_ops_end} onChange={e=>set('jam_ops_end', e.target.value)} /></div>
          <div><label className="label">Off-Hours Strict Start</label><input type="time" className="input" value={s.off_hours_strict_start} onChange={e=>set('off_hours_strict_start', e.target.value)} /></div>
          <div><label className="label">Off-Hours Strict End</label><input type="time" className="input" value={s.off_hours_strict_end} onChange={e=>set('off_hours_strict_end', e.target.value)} /></div>
          <div><label className="label">Toleransi Late Trips per Truck</label><input type="number" className="input" value={s.late_trips_threshold} onChange={e=>set('late_trips_threshold', +e.target.value)} /></div>
        </div>
      </div>

      {/* Anomaly Score Brackets */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><AlertOctagon size={16}/> Anomaly Score Levels</h3>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Perhatian (≥)</label><input type="number" className="input" value={s.score_perhatian} onChange={e=>set('score_perhatian', +e.target.value)} /></div>
          <div><label className="label">Mencurigakan (≥)</label><input type="number" className="input" value={s.score_mencurigakan} onChange={e=>set('score_mencurigakan', +e.target.value)} /></div>
          <div><label className="label">Kritis (≥)</label><input type="number" className="input" value={s.score_kritis} onChange={e=>set('score_kritis', +e.target.value)} /></div>
        </div>
      </div>

      {/* Other thresholds */}
      <div className="card">
        <h3 className="font-bold text-gray-800 mb-3">Threshold Lainnya</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="label">Weekend High %</label><input type="number" className="input" value={s.weekend_high_pct} onChange={e=>set('weekend_high_pct', +e.target.value)} /></div>
          <div><label className="label">Capacity Overflow %</label><input type="number" className="input" value={s.capacity_overflow_pct} onChange={e=>set('capacity_overflow_pct', +e.target.value)} /></div>
          <div><label className="label">Kontrak Over %</label><input type="number" className="input" value={s.kontrak_over_pct} onChange={e=>set('kontrak_over_pct', +e.target.value)} /></div>
          <div><label className="label">Avg Speed (km/jam)</label><input type="number" className="input" value={s.avg_speed_kmh} onChange={e=>set('avg_speed_kmh', +e.target.value)} /></div>
        </div>
      </div>

      {/* Produk Master */}
      <div className="card p-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Master Produk — Arah & Toleransi</h3>
          <p className="text-xs text-gray-500 mt-1">Tetapkan arah (IN/OUT) dan toleransi % selisih per produk. Toleransi kosong = tidak dicek</p>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-gray-200 bg-gray-50">
            <th className="table-header">Kode</th>
            <th className="table-header">Nama</th>
            <th className="table-header">Arah</th>
            <th className="table-header text-right">Toleransi (%)</th>
          </tr></thead>
          <tbody>
            {produk.map((p, i) => (
              <tr key={p.kode} className="border-b border-gray-100">
                <td className="table-cell font-bold">{p.kode}</td>
                <td className="table-cell">{p.nama}</td>
                <td className="table-cell">
                  <select className="input w-24" value={p.arah} onChange={e=>setProdukField(i, 'arah', e.target.value)}>
                    <option value="IN">IN</option><option value="OUT">OUT</option>
                  </select>
                </td>
                <td className="table-cell text-right">
                  <input type="number" step="0.01" className="input w-24 text-right" placeholder="—"
                    value={p.toleransi_pct ?? ''} onChange={e=>setProdukField(i, 'toleransi_pct', e.target.value === '' ? null : +e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={16}/>{saving ? 'Menyimpan...' : 'Simpan Settings'}</button>
        {msg && <span className={`text-sm font-semibold ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}

/* ──────────────── HELPERS ──────────────── */
function Section({ title, desc, children }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {desc && <p className="text-xs text-gray-500 mt-1">{desc}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function TableLite({ headers, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr className="border-b border-gray-200 bg-gray-50">
          {headers.map((h, i) => <th key={i} className="table-header">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              {row.map((cell, j) => <td key={j} className="table-cell text-sm">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ──────────────── FORENSIK+ : 5 AUDIT LANJUTAN ──────────────── */
function AdvancedTab({ tahun, bulan }) {
  const [sub, setSub] = useState('round')
  const SUBS = [
    { id:'direction',label:'Konsistensi Arah',   icon: AlertOctagon, desc:'Arah timbang vs jenis produk' },
    { id:'truckclass',label:'Konsistensi Truk',  icon: Truck,        desc:'Label jenis truk vs kelas asli (netto)' },
    { id:'round',    label:'Round-Number Bias',  icon: Hash,         desc:'Netto dibulatkan 000/500/00' },
    { id:'sequence', label:'Sequence Gap',       icon: Activity,     desc:'No. Seri yang hilang' },
    { id:'weekend',  label:'Weekend Spike',      icon: Clock,        desc:'Trip akhir pekan tak wajar' },
    { id:'velocity', label:'Turnaround Mustahil',icon: Truck,        desc:'Interval antar-trip < 30 menit' },
    { id:'duration', label:'Durasi & Jarak',     icon: TrendingDown, desc:'Durasi jembatan & jarak tak konsisten' },
    { id:'tare',     label:'Profil Tare Truk',   icon: Truck,        desc:'Stabilitas berat kosong & drift' },
    { id:'throughput',label:'Throughput Monitor',icon: BarChart3,    desc:'Volume IN vs OUT per bulan' },
    { id:'sameday',  label:'Same-Day Pair',      icon: Copy,         desc:'Truk masuk 2× netto identik' },
    { id:'benford2', label:'Benford Digit-2',    icon: Hash,         desc:'Distribusi digit kedua netto' },
    { id:'drivertruck',label:'Driver↔Truk',      icon: Users,        desc:'Pasangan driver-truk tak biasa' },
    { id:'concentration',label:'Konsentrasi',    icon: Activity,     desc:'Indikator kolusi vendor-operator' },
  ]
  return (
    <div className="space-y-4">
      <div className="card bg-purple-50 border-purple-200 flex items-start gap-3">
        <AlertTriangle className="text-purple-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-purple-700">
          <strong>Forensik Lanjutan</strong> — 5 uji statistik tambahan untuk mendeteksi pola manipulasi yang lolos dari audit dasar. Semua dihitung langsung dari data yang ada (tanpa input tambahan).
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 flex-wrap">
        {SUBS.map(s => {
          const Icon = s.icon
          return (
            <button key={s.id} onClick={() => setSub(s.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 border transition-colors ${sub===s.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}>
              <Icon size={13}/> {s.label}
            </button>
          )
        })}
      </div>

      {sub==='direction'  && <DirectionAudit tahun={tahun} bulan={bulan} />}
      {sub==='truckclass' && <TruckClassAudit tahun={tahun} bulan={bulan} />}
      {sub==='round'      && <RoundNumberAudit tahun={tahun} bulan={bulan} />}
      {sub==='sequence'   && <SequenceGapAudit />}
      {sub==='weekend'    && <WeekendSpikeAudit tahun={tahun} bulan={bulan} />}
      {sub==='velocity'   && <VelocityAudit tahun={tahun} bulan={bulan} />}
      {sub==='duration'   && <DurationAudit tahun={tahun} bulan={bulan} />}
      {sub==='tare'       && <TareProfileAudit tahun={tahun} bulan={bulan} />}
      {sub==='throughput' && <ThroughputAudit tahun={tahun} />}
      {sub==='sameday'    && <SameDayPairAudit tahun={tahun} bulan={bulan} />}
      {sub==='benford2'   && <Benford2Audit tahun={tahun} bulan={bulan} />}
      {sub==='drivertruck'&& <DriverTruckAudit tahun={tahun} bulan={bulan} />}
      {sub==='concentration' && <ConcentrationAudit tahun={tahun} bulan={bulan} />}
    </div>
  )
}

/* A2 — Same-Day Pair */
function SameDayPairAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/same-day-pair', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  return (
    <div className="space-y-4">
      <div className="card bg-orange-50 border-orange-200 flex items-start gap-3">
        <Copy className="text-orange-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-orange-700">
          <strong>Same-Day Pair</strong> — Truk yang sama tercatat 2× di hari sama dengan netto nyaris identik (≤ {s.tol_netto} kg). Bisa wajar (2 ritase ke tujuan sama), bisa double-recording. <strong>Bandingkan jam masuk</strong>: jika sangat berdekatan → mencurigakan.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KpiMini label="Pasangan Ter-flag" value={s.flagged} accent={s.flagged > 0 ? 'orange' : 'green'} />
        <KpiMini label="Truk Terlibat" value={s.trucks_affected} />
        <KpiMini label="Toleransi Netto" value={`≤ ${s.tol_netto} kg`} />
      </div>
      <Section title={`Pasangan trip hari sama (${d.flagged.length})`} desc="Diurutkan dari netto paling identik. Selisih 0 kg + jam berdekatan = paling perlu diperiksa">
        {d.flagged.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Tidak ada pasangan mencurigakan</div> :
        <TableLite headers={['No. Polisi','Tanggal','Netto A','Netto B','Selisih','Jam A','Jam B','Relasi A','Relasi B']} rows={d.flagged.map(f => [
          <span className="font-mono text-xs">{f.no_polisi}</span>,
          <span className="text-xs text-gray-500">{f.tanggal_masuk}</span>,
          <span className="font-mono text-xs">{f.netto_a?.toLocaleString('id-ID')}</span>,
          <span className="font-mono text-xs">{f.netto_b?.toLocaleString('id-ID')}</span>,
          <span className={`font-bold ${f.selisih===0 ? 'text-red-600' : 'text-orange-500'}`}>{f.selisih}</span>,
          <span className="font-mono text-xs">{f.jam_a}</span>,
          <span className="font-mono text-xs">{f.jam_b}</span>,
          <span className="text-xs">{f.relasi_a}</span>,
          <span className="text-xs text-gray-400">{f.relasi_b}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* A6 — Benford 2nd digit */
function Benford2Audit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/benford-2nd', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const chart = d.dist.map(x => ({ digit: x.digit, Observasi: x.obs_pct, Harapan: x.exp_pct }))
  return (
    <div className="space-y-4">
      <div className="card bg-yellow-50 border-yellow-200 flex items-start gap-3">
        <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-yellow-700">
          <strong>⚠️ Disclaimer penting:</strong> {d.disclaimer}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KpiMini label="Chi-Square" value={d.chi2} accent={d.suspicious ? 'red' : 'green'} />
        <KpiMini label="Ambang (df=9)" value={d.critical} />
        <KpiMini label="Sampel" value={d.total?.toLocaleString('id-ID')} />
      </div>
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Distribusi Digit Kedua: Observasi vs Harapan Benford</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart} margin={{ top:10,right:10,left:-10,bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="digit" tick={{ fill:'#64748b', fontSize:11 }} />
            <YAxis tick={{ fill:'#64748b', fontSize:10 }} unit="%" />
            <Tooltip contentStyle={tt} formatter={v => v+'%'} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <Bar dataKey="Observasi" fill="#6366f1" radius={[3,3,0,0]} />
            <Bar dataKey="Harapan" fill="#cbd5e1" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-gray-500 mt-2">
          {d.suspicious
            ? '⚠️ Chi-square tinggi — TAPI ini sangat mungkin false-positive karena data terikat kapasitas truk (lihat disclaimer). Gunakan Last-2-Digit Forensic untuk hasil lebih valid.'
            : '✓ Distribusi mendekati harapan Benford.'}
        </p>
      </div>
    </div>
  )
}

/* A7 — Driver-Truck Mismatch */
function DriverTruckAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/driver-truck', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <Users className="text-blue-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-blue-700">
          <strong>Driver ↔ Truk</strong> — Idealnya tiap truk punya driver tetap. Truk dengan banyak driver, atau driver yang muncul langka di truk bukan miliknya, patut diverifikasi (truk dipinjam / driver bukan karyawan).
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <KpiMini label="Truk Banyak Driver" value={s.trucks_many_drivers} accent={s.trucks_many_drivers > 0 ? 'orange' : 'green'} />
        <KpiMini label="Pasangan Langka" value={s.rare_pairs} accent={s.rare_pairs > 0 ? 'orange' : 'green'} />
        <KpiMini label="Driver Banyak Truk" value={s.drivers_many_trucks} accent={s.drivers_many_trucks > 0 ? 'orange' : 'green'} />
      </div>

      {d.manyDrivers.length > 0 && (
        <Section title={`Truk dengan ≥4 driver berbeda (${d.manyDrivers.length})`} desc="Truk yang dikemudikan banyak orang">
          <TableLite headers={['No. Polisi','Total Trip','Jml Driver','Driver (trip)']} rows={d.manyDrivers.map(t => [
            <span className="font-mono font-medium">{t.no_polisi}</span>, t.total,
            <span className="font-bold text-orange-600">{t.driver_count}</span>,
            <span className="text-xs text-gray-500">{t.drivers.slice(0,5).map(dr => `${dr.driver} (${dr.trip})`).join(', ')}{t.drivers.length>5?'...':''}</span>
          ])} />
        </Section>
      )}

      {d.rareTrips.length > 0 && (
        <Section title={`Pasangan driver-truk langka (${d.rareTrips.length})`} desc="Driver yang jarang di truk dengan driver dominan jelas">
          <TableLite headers={['No. Polisi','Driver Langka','Trip','% dari Truk','Driver Dominan']} rows={d.rareTrips.map(r => [
            <span className="font-mono text-xs">{r.no_polisi}</span>,
            <span className="text-xs">{r.driver}</span>,
            r.trip,
            <span className="font-bold text-orange-500">{r.pct}%</span>,
            <span className="text-xs text-gray-500">{r.dominant} ({r.dominant_trip})</span>
          ])} />
        </Section>
      )}

      {d.manyTrucks.length > 0 && (
        <Section title={`Driver dengan ≥4 truk berbeda (${d.manyTrucks.length})`} desc="Driver yang berpindah banyak truk">
          <TableLite headers={['Driver','Jml Truk','Total Trip']} rows={d.manyTrucks.map(t => [
            <span className="text-xs font-medium">{t.driver}</span>,
            <span className="font-bold text-orange-600">{t.trucks}</span>, t.total
          ])} />
        </Section>
      )}

      {d.manyDrivers.length === 0 && d.rareTrips.length === 0 && d.manyTrucks.length === 0 && (
        <div className="card text-center text-green-600 py-8 text-sm">✓ Pairing driver-truk sangat stabil — tidak ada anomali. Indikasi disiplin armada yang sehat.</div>
      )}
    </div>
  )
}

/* A11 — Concentration / Collusion */
function ConcentrationAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/concentration', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  return (
    <div className="space-y-4">
      <div className="card bg-purple-50 border-purple-200 flex items-start gap-3">
        <Activity className="text-purple-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-purple-700">
          <strong>Indikator Konsentrasi</strong> — {d.note}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KpiMini label="Vendor Dianalisis" value={s.vendors_analyzed} />
        <KpiMini label="Konsentrasi Tinggi" value={s.flagged} accent={s.flagged > 0 ? 'orange' : 'green'} />
      </div>

      <Section title={`Vendor konsentrasi tinggi (${d.flagged.length})`} desc="Transportir yang >60% tripnya lewat 1 operator & ≤2 operator total">
        {d.flagged.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Tidak ada konsentrasi vendor-operator mencurigakan</div> :
        <TableLite headers={['Transportir','Total Trip','Operator Dominan','Relasi','Konsentrasi','Jml Operator']} rows={d.flagged.map(f => [
          <span className="font-medium text-xs">{f.transportir}</span>, f.total,
          <span className="text-xs">{f.top_operator}</span>,
          <span className="text-xs text-gray-500">{f.top_relasi}</span>,
          <span className="font-bold text-purple-600">{f.concentration}%</span>,
          <span className={f.operator_count<=1 ? 'text-orange-500 font-bold' : ''}>{f.operator_count}</span>
        ])} />}
      </Section>

      <Section title="Top kombinasi Transportir × Operator × Relasi" desc="25 kombinasi paling sering — peta aliran trip">
        <TableLite headers={['Transportir','Operator','Relasi','Trip','Netto (ton)']} rows={d.topCombos.map(c => [
          <span className="text-xs font-medium">{c.transportir}</span>,
          <span className="text-xs">{c.penimbang}</span>,
          <span className="text-xs text-gray-500">{c.relasi_nama}</span>,
          <span className="font-semibold">{c.trip}</span>,
          <span className="font-mono text-xs">{(c.netto/1000).toFixed(1)}</span>
        ])} />
      </Section>
    </div>
  )
}

/* B1 — Tare Profile per Truk */
function TareProfileAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/tare-profile', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  const badge = st => st==='STABIL' ? <span className="badge-success">STABIL</span> : st==='DRIFT' ? <span className="badge-warning">DRIFT</span> : <span className="badge-danger">TIDAK STABIL</span>
  return (
    <div className="space-y-4">
      <div className="card bg-indigo-50 border-indigo-200 flex items-start gap-3">
        <Truck className="text-indigo-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-indigo-700">
          <strong>Profil Tare Truk</strong> — Berat kosong (tare) tiap truk seharusnya stabil. <strong>DRIFT</strong> = tare bergeser bertahap (kemungkinan modifikasi/manipulasi timbang). <strong>TIDAK STABIL</strong> = variasi tare besar (CV &gt; 3% atau ada outlier). Patut diverifikasi fisik.
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Truk Dianalisis" value={s.total_truck} />
        <KpiMini label="Tare Stabil" value={s.stabil} accent="green" />
        <KpiMini label="Drift Terdeteksi" value={s.drift} accent={s.drift > 0 ? 'orange' : 'green'} />
        <KpiMini label="Tidak Stabil" value={s.tidak_stabil} accent={s.tidak_stabil > 0 ? 'red' : 'green'} />
      </div>

      <Section title="Profil tare per truk" desc={`Min ${s.min_trip} trip. Diurutkan dari yang paling perlu diperiksa (drift + variasi + outlier tertinggi)`}>
        {d.profiles.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Belum ada truk dengan trip cukup</div> :
        <TableLite headers={['No. Polisi','Jenis','Trip','Tare Median','CV%','Drift (Awal→Akhir)','Outlier','Status']} rows={d.profiles.map(p => [
          <span className="font-mono font-medium">{p.no_polisi}</span>,
          <span className="text-xs text-gray-500">{p.truck_type}</span>,
          p.trip,
          <span className="font-mono">{p.tare_median?.toLocaleString('id-ID')}</span>,
          <span className={`font-bold ${p.cv > 3 ? 'text-red-600' : p.cv > 1.5 ? 'text-orange-500' : 'text-gray-500'}`}>{p.cv}%</span>,
          <span className="text-xs">{p.early_tare?.toLocaleString('id-ID')} → {p.late_tare?.toLocaleString('id-ID')} <span className={Math.abs(p.drift_pct) > 3 ? 'text-red-600 font-bold' : 'text-gray-400'}>({p.drift_pct > 0 ? '+' : ''}{p.drift_pct}%)</span></span>,
          p.outlier_count > 0 ? <span className="font-bold text-orange-600">{p.outlier_count}</span> : <span className="text-gray-300">0</span>,
          badge(p.status)
        ])} />}
      </Section>
    </div>
  )
}

/* B2 — Throughput Monitor */
function ThroughputAudit({ tahun }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/throughput', { params:{ tahun } }).then(r => setD(r.data)) }, [tahun])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  const chart = d.months.map(m => ({ bulan: m.bulan.slice(2), in_ton: m.in_ton, out_ton: m.out_ton }))
  return (
    <div className="space-y-4">
      <div className="card bg-teal-50 border-teal-200 flex items-start gap-3">
        <BarChart3 className="text-teal-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-teal-700">
          <strong>Throughput Monitor</strong> — Volume bahan baku masuk (IN) vs produk keluar (OUT) per bulan. Rasio konversi OUT/IN membantu cross-check dengan mass balance refinery. <em>Catatan: ini volume transportasi, bukan yield proses refinery.</em>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiMini label="Total IN (bahan baku)" value={`${s.total_in_ton?.toLocaleString('id-ID')} t`} />
        <KpiMini label="Total OUT (produk)" value={`${s.total_out_ton?.toLocaleString('id-ID')} t`} />
        <KpiMini label="Konversi OUT/IN" value={s.conv_pct != null ? `${s.conv_pct}%` : '–'} />
      </div>

      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Volume IN vs OUT per Bulan (ton)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chart} margin={{ top:10,right:10,left:-10,bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bulan" tick={{ fill:'#64748b', fontSize:10 }} />
            <YAxis tick={{ fill:'#64748b', fontSize:10 }} />
            <Tooltip contentStyle={tt} formatter={(v,n) => [v+' ton', n==='in_ton'?'IN (bahan baku)':'OUT (produk)']} />
            <Legend wrapperStyle={{ fontSize:11 }} formatter={v => v==='in_ton' ? 'IN (bahan baku)' : 'OUT (produk)'} />
            <Bar dataKey="in_ton" fill="#14b8a6" radius={[4,4,0,0]} />
            <Bar dataKey="out_ton" fill="#f59e0b" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Section title="Volume per produk" desc="Total keseluruhan periode, dipisah arah IN/OUT">
        <TableLite headers={['Produk','Arah','Trip','Total (ton)','Rata Netto/trip']} rows={d.perProduk.map(p => [
          <span className="badge-neutral">{p.produk}</span>,
          p.arah === 'IN' ? <span className="badge-success">IN</span> : <span className="badge-warning">OUT</span>,
          p.trip,
          <span className="font-mono font-semibold">{p.ton?.toLocaleString('id-ID')}</span>,
          <span className="font-mono text-xs text-gray-500">{p.avg_netto?.toLocaleString('id-ID')} kg</span>
        ])} />
      </Section>
    </div>
  )
}

/* D — Konsistensi Arah Timbang */
function DirectionAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  const [sel, setSel] = useState({})
  const [fixing, setFixing] = useState(false)
  function load() { setD(null); setSel({}); api.get('/audit/direction', { params:{ tahun, bulan } }).then(r => setD(r.data)).catch(e => setD({ error: e.response?.data?.error || e.message })) }
  useEffect(() => { load() }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  if (d.error) return <div className="card bg-red-50 border-red-200 text-center py-8"><div className="text-red-600 font-semibold">Gagal memuat</div><div className="text-xs text-gray-500">{d.error}</div></div>
  const s = d.summary

  const swappable = d.flagged.filter(f => f.alasan.includes('tertukar'))
  const allSel = swappable.length > 0 && swappable.every(f => sel[f.id])
  const selCount = Object.values(sel).filter(Boolean).length
  function toggleAll() { if (allSel) setSel({}); else setSel(Object.fromEntries(swappable.map(f => [f.id, true]))) }

  async function fix() {
    const ids = Object.entries(sel).filter(([, v]) => v).map(([k]) => parseInt(k))
    if (ids.length === 0) return
    if (!confirm(`Tukar masuk↔keluar untuk ${ids.length} trip? Netto tidak berubah, arah jadi benar.`)) return
    setFixing(true)
    try { const r = await api.post('/audit/direction/fix', { ids }); alert(r.data.message); load() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setFixing(false) }
  }

  return (
    <div className="space-y-4">
      <div className="card bg-red-50 border-red-200 flex items-start gap-3">
        <AlertOctagon className="text-red-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-red-700">
          <strong>Konsistensi Arah Timbang</strong> — Produk OUT (RBDPL/RBDPS/PFAD) harus <strong>berat keluar &gt; masuk</strong>; produk IN (CPO/BE/B-40) harus <strong>masuk &gt; keluar</strong>. Arah terbalik = kemungkinan kolom masuk/keluar tertukar saat input. Netto tetap benar (ABS), tapi arah & tare jadi salah. <em>Centang baris lalu klik "Perbaiki" untuk menukar otomatis.</em>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total Trip" value={s.total?.toLocaleString('id-ID')} />
        <KpiMini label="Arah Terbalik" value={s.terbalik} accent={s.terbalik > 0 ? 'red' : 'green'} />
        <KpiMini label="Berat Sama (netto 0)" value={s.flat} accent={s.flat > 0 ? 'red' : 'green'} />
        <KpiMini label="Konsisten" value={s.ok?.toLocaleString('id-ID')} accent="green" />
      </div>

      {d.byProduk.length > 0 && (
        <Section title="Ringkasan per produk" desc="Produk dengan trip arah-terbalik">
          <TableLite headers={['Produk','Arah Seharusnya','Total','Terbalik','% Terbalik']} rows={d.byProduk.map(p => [
            <span className="badge-neutral">{p.produk}</span>,
            <span className={`font-bold ${p.arah_master==='OUT' ? 'text-amber-600' : 'text-teal-600'}`}>{p.arah_master}</span>,
            p.total, <span className="font-bold text-red-600">{p.terbalik}</span>,
            <span className="font-bold text-red-600">{(p.terbalik/p.total*100).toFixed(1)}%</span>
          ])} />
        </Section>
      )}

      {swappable.length > 0 && (
        <div className="card bg-amber-50 border-amber-200 flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-amber-700"><strong>{selCount}</strong> dari {swappable.length} trip terpilih untuk diperbaiki</span>
          <div className="flex gap-2">
            <button onClick={toggleAll} className="btn-secondary text-xs">{allSel ? 'Batal pilih semua' : 'Pilih semua'}</button>
            <button onClick={fix} disabled={fixing || selCount === 0} className="btn-primary text-xs flex items-center gap-1">
              {fixing ? 'Memperbaiki...' : `Perbaiki ${selCount} trip (tukar M↔K)`}
            </button>
          </div>
        </div>
      )}

      <Section title={`Detail trip arah-terbalik (${d.flagged.length})`} desc="Centang untuk pilih. Netto tidak berubah saat diperbaiki.">
        {d.flagged.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Semua arah timbang konsisten</div> :
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-gray-200 bg-gray-50">
              <th className="table-header w-8"></th>
              {['Seri','Polisi','Produk','Arah(seharusnya→fisik)','Masuk','Keluar','Netto','Alasan'].map(h => <th key={h} className="table-header">{h}</th>)}
            </tr></thead>
            <tbody>
              {d.flagged.map(f => {
                const canFix = f.alasan.includes('tertukar')
                return (
                  <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="table-cell">{canFix && <input type="checkbox" checked={!!sel[f.id]} onChange={e => setSel(s => ({ ...s, [f.id]: e.target.checked }))} />}</td>
                    <td className="table-cell font-mono text-xs">{f.no_seri}</td>
                    <td className="table-cell font-mono text-xs">{f.no_polisi}</td>
                    <td className="table-cell"><span className="badge-neutral">{f.produk}</span></td>
                    <td className="table-cell text-xs"><span className="text-teal-600">{f.arah_master}</span> → <span className="text-red-600 font-bold">{f.arah_fisik}</span></td>
                    <td className="table-cell font-mono text-xs">{f.berat_masuk?.toLocaleString('id-ID')}</td>
                    <td className="table-cell font-mono text-xs">{f.berat_keluar?.toLocaleString('id-ID')}</td>
                    <td className="table-cell font-mono text-xs font-semibold">{f.berat_netto_wins?.toLocaleString('id-ID')}</td>
                    <td className="table-cell text-[11px] text-gray-500 max-w-xs">{f.alasan}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>}
      </Section>
    </div>
  )
}

/* Konsistensi Truk — kelas truk berbasis plat */
function TruckClassAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  const [sel, setSel] = useState({})
  const [fixing, setFixing] = useState(false)
  function load() { setD(null); setSel({}); api.get('/audit/truck-class', { params:{ tahun, bulan } }).then(r => setD(r.data)).catch(e => setD({ error: e.response?.data?.error || e.message })) }
  useEffect(() => { load() }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  if (d.error) return <div className="card bg-red-50 border-red-200 text-center py-8"><div className="text-red-600 font-semibold">Gagal memuat</div><div className="text-xs text-gray-500">{d.error}</div></div>
  const s = d.summary
  const mm = d.mismatchTrips
  const allSel = mm.length > 0 && mm.every(t => sel[t.id])
  const selCount = Object.values(sel).filter(Boolean).length
  function toggleAll() { if (allSel) setSel({}); else setSel(Object.fromEntries(mm.map(t => [t.id, true]))) }

  async function fix() {
    const items = mm.filter(t => sel[t.id]).map(t => ({ id: t.id, truck_type: t.kelas_asli }))
    if (items.length === 0) return
    if (!confirm(`Koreksi label ${items.length} trip ke kelas asli (berbasis median netto plat)?`)) return
    setFixing(true)
    try { const r = await api.post('/audit/truck-class/fix', { items }); alert(r.data.message); load() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setFixing(false) }
  }

  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <Truck className="text-blue-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-blue-700">
          <strong>Konsistensi Truk</strong> — Sistem percaya field jenis truk yang diketik operator. <strong>Kelas asli</strong> dihitung dari median netto historis tiap plat (6R ±9.5t, 10R ±14t, 12R ±28t). Trip yang labelnya beda dari kelas asli = kemungkinan salah ketik. <em>{d.note}</em>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Plat Dianalisis" value={s.plat_total} />
        <KpiMini label="Label Tidak Konsisten" value={s.plat_inconsistent} accent={s.plat_inconsistent > 0 ? 'orange' : 'green'} />
        <KpiMini label="Trip Salah Label" value={s.mismatch_trips} accent={s.mismatch_trips > 0 ? 'red' : 'green'} />
        <KpiMini label="Plat AMBIGU (band gap)" value={s.plat_ambigu} accent={s.plat_ambigu > 0 ? 'orange' : 'green'} />
      </div>

      <Section title="Ringkasan per plat" desc="Kelas asli dari median netto · label yang dipakai · jumlah trip salah-label">
        {d.plates.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Semua label truk konsisten</div> :
        <TableLite headers={['No. Polisi','Trip','Median Netto','Kelas Asli','Label Dipakai','Salah Label']} rows={d.plates.map(p => [
          <span className="font-mono font-medium">{p.no_polisi}</span>, p.trip,
          <span className="font-mono text-xs">{p.median?.toLocaleString('id-ID')}</span>,
          p.kelas_asli === 'AMBIGU' ? <span className="badge-warning">AMBIGU</span> : <span className="badge-info">{p.kelas_asli}</span>,
          <span className="text-xs text-gray-500">{p.labels}</span>,
          p.mismatch > 0 ? <span className="font-bold text-red-600">{p.mismatch}</span> : <span className="text-gray-300">0</span>
        ])} />}
      </Section>

      {mm.length > 0 && (
        <>
          <div className="card bg-amber-50 border-amber-200 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-amber-700"><strong>{selCount}</strong> dari {mm.length} trip terpilih untuk koreksi label</span>
            <div className="flex gap-2">
              <button onClick={toggleAll} className="btn-secondary text-xs">{allSel ? 'Batal pilih semua' : 'Pilih semua'}</button>
              <button onClick={fix} disabled={fixing || selCount === 0} className="btn-primary text-xs">{fixing ? 'Memperbaiki...' : `Koreksi ${selCount} label`}</button>
            </div>
          </div>

          <Section title={`Detail trip salah-label (${mm.length})`} desc="Centang untuk koreksi ke kelas asli plat. Netto tidak berubah, hanya label jenis truk.">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-200 bg-gray-50">
                  <th className="table-header w-8"></th>
                  {['Seri','Polisi','Produk','Netto','Label Sekarang','→ Kelas Asli'].map(h => <th key={h} className="table-header">{h}</th>)}
                </tr></thead>
                <tbody>
                  {mm.map(t => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="table-cell"><input type="checkbox" checked={!!sel[t.id]} onChange={e => setSel(s => ({ ...s, [t.id]: e.target.checked }))} /></td>
                      <td className="table-cell font-mono text-xs">{t.no_seri}</td>
                      <td className="table-cell font-mono text-xs">{t.no_polisi}</td>
                      <td className="table-cell"><span className="badge-neutral">{t.produk}</span></td>
                      <td className="table-cell font-mono text-xs">{t.netto?.toLocaleString('id-ID')}</td>
                      <td className="table-cell text-xs text-red-600 font-medium">{t.label_input}</td>
                      <td className="table-cell text-xs"><span className="font-bold text-green-600">{t.kelas_asli}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

/* A1 — Round-Number Bias */
function RoundNumberAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/round-number', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  const cards = [
    { label:'Berakhir 00', s: d.stats.end_00,  hint:'cth: 14.200' },
    { label:'Berakhir 000', s: d.stats.end_000, hint:'cth: 28.000' },
    { label:'Berakhir 500', s: d.stats.end_500, hint:'cth: 27.500' },
    { label:'Berakhir 0',  s: d.stats.end_0,   hint:'cth: 14.260' },
  ]
  return (
    <div className="space-y-4">
      <div className={`card ${d.suspicious ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${d.suspicious ? 'text-red-700' : 'text-green-700'}`}>{d.suspicious ? '⚠️ PERHATIAN' : '✓ NORMAL'}</span>
          <span className="text-xs text-gray-500">dari {d.stats.total.toLocaleString('id-ID')} trip</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          Pada data jujur, netto berakhir "00" wajar ~1%. Bila jauh di atas itu → indikasi angka dibulatkan manual (estimasi, bukan timbang riil). <strong>Patut diverifikasi</strong>, bukan tuduhan.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => {
          const high = c.s.ratio >= 2
          return (
            <div key={i} className={`card ${high ? 'border-red-200 bg-red-50/40' : ''}`}>
              <div className="text-xs text-gray-500">{c.label} <span className="text-gray-300">({c.hint})</span></div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-bold ${high ? 'text-red-600' : 'text-gray-800'}`}>{c.s.pct}%</span>
                <span className="text-xs text-gray-400">vs {c.s.expected_pct}%</span>
              </div>
              <div className={`text-xs mt-1 font-medium ${high ? 'text-red-600' : 'text-gray-400'}`}>
                {c.s.count.toLocaleString('id-ID')} trip · {c.s.ratio}× expected
              </div>
            </div>
          )
        })}
      </div>

      <Section title="Operator dengan rate pembulatan tertinggi" desc="Penimbang yang sering menghasilkan netto kelipatan 100 — bisa kebiasaan, bisa estimasi manual">
        {d.perOperator.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Belum ada data</div> :
        <TableLite headers={['Penimbang','Trip','Round (00)','% Round']} rows={d.perOperator.map(o => [
          <span className="font-medium">{o.nama}</span>, o.trip, o.round_00,
          <span className={`font-bold ${o.pct_00 > 5 ? 'text-red-600' : o.pct_00 > 2 ? 'text-orange-500' : 'text-gray-500'}`}>{o.pct_00}%</span>
        ])} />}
      </Section>

      <Section title="Truk dengan rate pembulatan tertinggi" desc="No. Polisi dengan netto kelipatan 100 terbanyak">
        {d.perTruck.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Belum ada data</div> :
        <TableLite headers={['No. Polisi','Trip','Round (00)','% Round']} rows={d.perTruck.map(o => [
          <span className="font-mono font-medium">{o.nama}</span>, o.trip, o.round_00,
          <span className={`font-bold ${o.pct_00 > 5 ? 'text-red-600' : o.pct_00 > 2 ? 'text-orange-500' : 'text-gray-500'}`}>{o.pct_00}%</span>
        ])} />}
      </Section>

      <Section title={`Contoh trip netto bulat (${d.samples.length})`} desc="Netto persis kelipatan 1000 atau 500 — paling mencurigakan untuk diperiksa fisik">
        {d.samples.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada ✓</div> :
        <TableLite headers={['No. Seri','No. Polisi','Relasi','Produk','Netto','Penimbang','Tanggal']} rows={d.samples.slice(0,30).map(s => [
          <span className="font-mono text-xs">{s.no_seri}</span>,
          <span className="font-mono text-xs">{s.no_polisi}</span>,
          <span className="text-xs">{s.relasi_nama}</span>,
          <span className="badge-neutral">{s.produk}</span>,
          <span className="font-mono font-bold text-purple-600">{s.netto?.toLocaleString('id-ID')}</span>,
          <span className="text-xs">{s.penimbang}</span>,
          <span className="text-xs text-gray-500">{s.tanggal_masuk}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* A3 — Sequence Gap */
function SequenceGapAudit() {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/audit/sequence-gap').then(r => setD(r.data)) }, [])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <Activity className="text-blue-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-blue-700">
          <strong>Sequence Gap</strong> — No. Seri seharusnya berurutan tanpa loncatan. Nomor yang hilang bisa berarti: belum diinput, transaksi tunai tak tercatat, atau nota sengaja di-skip. <strong>Patut ditelusuri.</strong>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Rentang Seri" value={`${s.min ?? '–'} – ${s.max ?? '–'}`} />
        <KpiMini label="Seri Hadir" value={s.present?.toLocaleString('id-ID')} />
        <KpiMini label="Seri Hilang" value={s.missing?.toLocaleString('id-ID')} accent={s.missing > 0 ? 'red' : 'green'} />
        <KpiMini label="Jumlah Gap" value={s.gap_count} accent={s.gap_count > 0 ? 'orange' : 'green'} />
      </div>

      <Section title={`Daftar Gap (${d.gaps.length})`} desc="Diurutkan dari gap terbesar — fokus audit pada rentang besar di tengah periode aktif">
        {d.gaps.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Tidak ada nomor seri yang hilang — sequence sempurna</div> :
        <TableLite headers={['Dari','Sampai','Hilang','Tgl Sebelum','Relasi Sebelum','Tgl Sesudah','Relasi Sesudah']} rows={d.gaps.map(g => [
          <span className="font-mono">{g.from}</span>,
          <span className="font-mono">{g.to}</span>,
          <span className={`font-bold ${g.count > 5 ? 'text-red-600' : 'text-orange-500'}`}>{g.count}</span>,
          <span className="text-xs text-gray-500">{g.tgl_before || '–'}</span>,
          <span className="text-xs">{g.relasi_before || '–'}</span>,
          <span className="text-xs text-gray-500">{g.tgl_after || '–'}</span>,
          <span className="text-xs">{g.relasi_after || '–'}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* A4 — Weekend Spike */
function WeekendSpikeAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/weekend-spike', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  const vColor = s.verdict==='PERHATIAN' ? 'red' : s.verdict==='TINGGI' ? 'orange' : 'green'
  const vBox = s.verdict==='PERHATIAN' ? 'bg-red-50 border-red-200' : s.verdict==='TINGGI' ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
  const vIcon = s.verdict==='PERHATIAN' ? 'text-red-600' : s.verdict==='TINGGI' ? 'text-orange-600' : 'text-green-600'
  const chart = d.byDow.map(x => ({ ...x, fill: (x.dow===0||x.dow===6) ? '#f59e0b' : '#a855f7' }))
  return (
    <div className="space-y-4">
      <div className={`card ${vBox} flex items-start gap-3`}>
        <Clock className={`${vIcon} flex-shrink-0 mt-0.5`} size={20}/>
        <div className="text-xs text-gray-700">
          <strong>Weekend Spike</strong> — Pengawasan akhir pekan biasanya lebih longgar. Rasio trip weekend/weekday = <strong>{s.ratio}</strong>. {s.ratio > 1 ? 'Weekend MALAH lebih ramai — tidak biasa, patut diverifikasi.' : 'Weekend lebih sepi dari weekday (normal).'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Rata Weekday" value={`${s.avg_weekday}/hari`} />
        <KpiMini label="Rata Weekend" value={`${s.avg_weekend}/hari`} accent={s.ratio > 1 ? 'red' : undefined} />
        <KpiMini label="Rasio WE/WD" value={s.ratio} accent={vColor} />
        <KpiMini label="Total Weekend" value={s.weekend_trips?.toLocaleString('id-ID')} />
      </div>

      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Distribusi Trip per Hari</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chart} margin={{ top:10,right:10,left:-10,bottom:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="nama" tick={{ fill:'#64748b', fontSize:11 }} />
            <YAxis tick={{ fill:'#64748b', fontSize:10 }} />
            <Tooltip contentStyle={tt} formatter={v => [v+' trip','Jumlah']} />
            <Bar dataKey="trip" radius={[4,4,0,0]}>
              {chart.map((x,i) => <Cell key={i} fill={x.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-400 mt-1">🟠 = Sabtu/Minggu · 🟣 = hari kerja</p>
      </div>

      <Section title="Operator paling aktif di akhir pekan" desc="Penimbang dengan porsi trip weekend tertinggi">
        {d.operators.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Belum ada data</div> :
        <TableLite headers={['Penimbang','Total Trip','Trip Weekend','% Weekend']} rows={d.operators.map(o => [
          <span className="font-medium">{o.nama}</span>, o.total, o.weekend,
          <span className={`font-bold ${o.pct_weekend > 40 ? 'text-red-600' : o.pct_weekend > 25 ? 'text-orange-500' : 'text-gray-500'}`}>{o.pct_weekend}%</span>
        ])} />}
      </Section>

      <Section title="Hari weekend tersibuk" desc="Tanggal Sabtu/Minggu dengan trip terbanyak — cek apakah ada justifikasi operasional">
        {d.topWeekendDays.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Tidak ada trip weekend ✓</div> :
        <TableLite headers={['Tanggal','Hari','Jumlah Trip']} rows={d.topWeekendDays.map(w => [
          <span className="font-mono text-xs">{w.tanggal_masuk}</span>,
          <span className="text-xs">{w.nama_hari?.trim()}</span>,
          <span className="font-bold text-orange-600">{w.trip}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* A5 — Velocity / Turnaround */
function VelocityAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/velocity', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  return (
    <div className="space-y-4">
      <div className="card bg-orange-50 border-orange-200 flex items-start gap-3">
        <Truck className="text-orange-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-orange-700">
          <strong>Turnaround Mustahil</strong> — Truk yang sama tercatat masuk 2× dengan jeda &lt; {s.threshold_menit} menit. Secara fisik mustahil (truk perlu waktu pergi-antar-kembali). Indikasi: 1 trip dicatat ganda, atau salah input jam. <strong>Patut diverifikasi.</strong>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiMini label="Trip Ter-flag" value={s.flagged} accent={s.flagged > 0 ? 'red' : 'green'} />
        <KpiMini label="Truk Terlibat" value={s.trucks_affected} accent={s.trucks_affected > 0 ? 'orange' : 'green'} />
        <KpiMini label="Ambang" value={`< ${s.threshold_menit} mnt`} />
      </div>

      {d.perTruck.length > 0 && (
        <Section title="Truk dengan turnaround mustahil berulang" desc="Semakin sering, semakin perlu diperiksa">
          <TableLite headers={['No. Polisi','Jumlah Kejadian','Jeda Terpendek']} rows={d.perTruck.map(t => [
            <span className="font-mono font-medium">{t.no_polisi}</span>,
            <span className="font-bold text-red-600">{t.count}×</span>,
            <span className="text-orange-600">{t.min_gap} menit</span>
          ])} />
        </Section>
      )}

      <Section title={`Detail trip ter-flag (${d.flagged.length})`} desc="Pasangan trip dengan jeda mustahil">
        {d.flagged.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Tidak ada turnaround mustahil — semua jeda wajar</div> :
        <TableLite headers={['No. Polisi','Jeda','Relasi (kini)','Relasi (sebelum)','Produk','Netto','Tanggal','Jam']} rows={d.flagged.map(f => [
          <span className="font-mono text-xs">{f.no_polisi}</span>,
          <span className="font-bold text-red-600">{f.gap_menit} mnt</span>,
          <span className="text-xs">{f.relasi_nama}</span>,
          <span className="text-xs text-gray-400">{f.prev_relasi}</span>,
          <span className="badge-neutral">{f.produk}</span>,
          <span className="font-mono text-xs">{f.netto?.toLocaleString('id-ID')}</span>,
          <span className="text-xs text-gray-500">{f.tanggal_masuk}</span>,
          <span className="font-mono text-xs">{f.jam_masuk}</span>
        ])} />}
      </Section>
    </div>
  )
}

/* A8 — Duration & Distance Plausibility */
function DurationAudit({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { setD(null); api.get('/audit/duration-plausibility', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const s = d.summary
  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200 flex items-start gap-3">
        <TrendingDown className="text-blue-600 flex-shrink-0 mt-0.5" size={20}/>
        <div className="text-xs text-blue-700">
          <strong>Durasi Jembatan & Jarak</strong> — Durasi normal masuk→keluar timbangan biasanya {s.median_menit} menit (median). Trip dengan durasi &gt; {s.max_jam} jam atau nol/negatif = kemungkinan salah catat jam. Jarak yang berubah-ubah untuk relasi sama = kemungkinan manipulasi OAT/solar.
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total Trip (ada jam)" value={s.total?.toLocaleString('id-ID')} />
        <KpiMini label="Durasi Rata-rata" value={`${s.avg_menit} mnt`} />
        <KpiMini label="Durasi Median" value={`${s.median_menit} mnt`} />
        <KpiMini label="Durasi Janggal" value={s.over_count + s.zero_count} accent={(s.over_count+s.zero_count) > 0 ? 'orange' : 'green'} />
      </div>

      <Section title={`Trip durasi janggal (${d.flagged.length})`} desc={`Durasi > ${s.max_jam} jam atau nol/negatif (jam keluar ≤ jam masuk)`}>
        {d.flagged.length === 0 ? <div className="text-center text-green-600 py-6 text-sm">✓ Semua durasi wajar</div> :
        <TableLite headers={['No. Seri','No. Polisi','Relasi','Jam Masuk','Jam Keluar','Durasi','Netto']} rows={d.flagged.map(f => [
          <span className="font-mono text-xs">{f.no_seri}</span>,
          <span className="font-mono text-xs">{f.no_polisi}</span>,
          <span className="text-xs">{f.relasi_nama}</span>,
          <span className="font-mono text-xs">{f.jam_masuk}</span>,
          <span className="font-mono text-xs">{f.jam_keluar}</span>,
          <span className={`font-bold ${f.menit===0 ? 'text-red-600' : 'text-orange-500'}`}>{f.menit===0 ? 'NOL' : f.jam+' jam'}</span>,
          <span className="font-mono text-xs">{f.netto?.toLocaleString('id-ID')}</span>
        ])} />}
      </Section>

      <Section title={`Inkonsistensi jarak per relasi (${d.distVar.length})`} desc="Relasi dengan jarak (Km) yang bervariasi besar — seharusnya konsisten karena lokasi tetap">
        {d.distVar.length === 0 ? <div className="text-center text-gray-400 py-6 text-sm">Jarak konsisten ✓</div> :
        <TableLite headers={['Relasi','Trip','Rata Km','Min','Maks','Std Dev']} rows={d.distVar.map(v => [
          <span className="text-xs font-medium">{v.relasi_nama}</span>, v.trip,
          <span className="font-mono">{v.avg_km}</span>,
          <span className="font-mono text-xs text-gray-500">{v.min_km}</span>,
          <span className="font-mono text-xs text-gray-500">{v.max_km}</span>,
          <span className={`font-bold ${v.std_km > 50 ? 'text-red-600' : v.std_km > 20 ? 'text-orange-500' : 'text-gray-500'}`}>{v.std_km}</span>
        ])} />}
      </Section>
    </div>
  )
}

function KpiMini({ label, value, accent }) {
  const color = accent==='red' ? 'text-red-600' : accent==='orange' ? 'text-orange-500' : accent==='green' ? 'text-green-600' : 'text-gray-800'
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  )
}

/* ──────────────── PHASE 1 TAB: VEHICLE CAPACITY ──────────────── */
function CapacityTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all') // all | under | over
  useEffect(() => { api.get('/audit/capacity', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  const types = Object.keys(d)

  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-bold text-blue-700 flex items-center gap-2"><BarChart3 size={18}/> Vehicle Capacity Analysis</h3>
        <p className="text-xs text-blue-600 mt-2">
          Forensic check #1: netto truk seharusnya dalam <strong>band kapasitas fisik</strong> (6 roda 9–11k, 10 roda 13–16k, 12 roda 26–32k).
          Trip di luar band = <strong>under-band</strong> (suspect skimming/curi muatan di jalan) atau <strong>over-band</strong> (suspect tare manipulation/overload).
        </p>
      </div>

      {/* KPI per truck type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {types.map(type => {
          const t = d[type]
          const pctIn = t.total ? (t.in_band / t.total * 100).toFixed(1) : 0
          return (
            <button key={type} onClick={() => setSelected(type)}
              className={`card text-left transition-all ${selected===type ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow'}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm text-gray-800">{type}</h4>
                <span className="text-xs text-gray-500">{t.total} trip</span>
              </div>
              <div className="text-xs text-gray-600 mb-2">Band: {(t.band.min/1000).toFixed(0)}–{(t.band.max/1000).toFixed(0)}k kg</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-green-600">✓ In-band</span><span className="font-bold">{t.in_band} ({pctIn}%)</span></div>
                <div className="flex justify-between"><span className="text-amber-600">↓ Under-band</span><span className="font-bold">{t.under_band}</span></div>
                <div className="flex justify-between"><span className="text-red-600">↑ Over-band</span><span className="font-bold">{t.over_band}</span></div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail for selected type */}
      {selected && d[selected] && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">Histogram Netto — {selected}</h3>
              <span className="text-xs text-gray-500">Band: <strong className="text-green-600">{(d[selected].band.min/1000).toFixed(0)}k – {(d[selected].band.max/1000).toFixed(0)}k</strong> kg</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d[selected].histogram} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bucket_start" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={tt} formatter={(v, name) => [v, name === 'in_band' ? 'In-band' : name === 'under' ? 'Under' : 'Over']}
                  labelFormatter={(v) => `${(v/1000).toFixed(1)}k – ${(v/1000+d[selected].band.bucket/1000).toFixed(1)}k kg`} />
                <Legend />
                <ReferenceLine x={d[selected].band.min} stroke="#10b981" strokeDasharray="3 3" label={{ value: `min ${(d[selected].band.min/1000).toFixed(0)}k`, fill: '#10b981', fontSize: 10, position: 'top' }} />
                <ReferenceLine x={d[selected].band.max} stroke="#10b981" strokeDasharray="3 3" label={{ value: `max ${(d[selected].band.max/1000).toFixed(0)}k`, fill: '#10b981', fontSize: 10, position: 'top' }} />
                <Bar dataKey="under" stackId="a" fill="#f59e0b" name="Under-band" />
                <Bar dataKey="in_band" stackId="a" fill="#10b981" name="In-band" />
                <Bar dataKey="over" stackId="a" fill="#ef4444" name="Over-band" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Flagged trips */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">Trip Flagged — {selected}</h3>
              <div className="flex gap-1">
                {['all','under','over'].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs rounded ${filter===f ? 'bg-red-100 text-red-700 font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {f==='all' ? `Semua (${d[selected].under_band + d[selected].over_band})` : f==='under' ? `Under (${d[selected].under_band})` : `Over (${d[selected].over_band})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
                  <th className="text-left p-2">Tgl</th>
                  <th className="text-left p-2">Seri</th>
                  <th className="text-left p-2">No Polisi</th>
                  <th className="text-left p-2">Relasi</th>
                  <th className="text-left p-2">Produk</th>
                  <th className="text-right p-2">Netto (kg)</th>
                  <th className="text-right p-2">Deviasi</th>
                  <th className="text-center p-2">Status</th>
                  <th className="text-center p-2">Aksi</th>
                </tr></thead>
                <tbody>
                  {[
                    ...(filter !== 'over' ? d[selected].flagged_under : []),
                    ...(filter !== 'under' ? d[selected].flagged_over : []),
                  ].slice(0, 50).map(t => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-2 text-xs">{t.tanggal_masuk ? new Date(t.tanggal_masuk).toLocaleDateString('id-ID') : '-'}</td>
                      <td className="p-2 text-xs font-mono">{t.no_seri}</td>
                      <td className="p-2 text-xs font-bold">{t.no_polisi}</td>
                      <td className="p-2 text-xs">{t.relasi_nama}</td>
                      <td className="p-2 text-xs">{t.produk}</td>
                      <td className="p-2 text-right font-bold">{t.berat_netto_wins?.toLocaleString('id-ID')}</td>
                      <td className={`p-2 text-right text-xs font-bold ${t.status === 'under' ? 'text-amber-600' : 'text-red-600'}`}>
                        {t.status === 'under' ? '-' : '+'}{t.deviation?.toLocaleString('id-ID')}
                      </td>
                      <td className="p-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${t.status === 'under' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {t.status === 'under' ? '↓ Under' : '↑ Over'}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <a href={`/data?search=${t.no_seri}`} target="_blank" rel="noopener" className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1">
                          <ExternalLink size={11}/> Lihat
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(d[selected].under_band + d[selected].over_band) === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">✓ Tidak ada trip di luar band kapasitas</div>
              )}
            </div>
          </div>
        </>
      )}

      {!selected && (
        <div className="card text-center py-8 text-gray-400 text-sm">
          ← Klik salah satu kartu truck type di atas untuk lihat histogram & detail flagged trips
        </div>
      )}
    </div>
  )
}

/* ──────────────── PHASE 3 TAB: SCORECARDS ──────────────── */
function ScorecardTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/audit/scorecards', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Memuat...</div>

  const maxIntensity = Math.max(...d.heatmap.map(c => c.intensity), 1)

  return (
    <div className="space-y-4">
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-bold text-blue-700 flex items-center gap-2"><UserCheck size={18}/> Forensic Scorecards</h3>
        <p className="text-xs text-blue-600 mt-2">
          Two-axis pattern detection: <strong>Siapa</strong> (operator timbang, supir) yang sering muncul di trip flagged?
          <strong> Kapan</strong> (hari × jam) anomali paling banyak terjadi?
        </p>
      </div>

      {/* Operator Comparison */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Operator Timbang — Head to Head</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {d.operators.map(op => (
            <div key={op.name} className={`rounded-lg border p-4 ${op.pct_flagged > 10 ? 'border-red-300 bg-red-50' : op.pct_flagged > 5 ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-base">{op.name}</h4>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${op.pct_flagged > 10 ? 'bg-red-100 text-red-700' : op.pct_flagged > 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                  {op.pct_flagged}% flagged
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                <div><div className="text-gray-500">Trip</div><div className="font-bold text-lg">{op.trips}</div></div>
                <div><div className="text-gray-500">In-band</div><div className="font-bold text-lg text-green-600">{op.in_band}</div></div>
                <div><div className="text-gray-500">Flagged</div><div className="font-bold text-lg text-red-600">{op.under + op.over}</div></div>
              </div>
              <div className="text-xs space-y-1 mb-2">
                <div className="flex justify-between"><span className="text-gray-500">Avg Netto</span><span className="font-mono font-bold">{op.avg_netto.toLocaleString('id-ID')} kg</span></div>
                <div className="flex justify-between"><span className="text-amber-600">↓ Under-band</span><span className="font-bold">{op.under}</span></div>
                <div className="flex justify-between"><span className="text-red-600">↑ Over-band</span><span className="font-bold">{op.over}</span></div>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2">
                <p className="text-[10px] text-gray-500 mb-1">Per tipe truk:</p>
                {op.by_type.map(bt => (
                  <div key={bt.truck_type} className="flex justify-between text-[11px]">
                    <span>{bt.truck_type}</span>
                    <span><strong>{bt.trips}</strong> trip · avg <strong>{bt.avg_netto.toLocaleString('id-ID')}</strong> · {bt.pct_flagged}% flag</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Temporal Heatmap */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-1">Temporal Anomaly Heatmap (Hari × Jam)</h3>
        <p className="text-[11px] text-gray-500 mb-3">Intensitas = % trip flagged per cell. Warna merah = lebih banyak anomali.</p>
        <div className="overflow-x-auto">
          <table className="text-[10px]" style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
            <thead>
              <tr>
                <th className="text-gray-500 px-1"></th>
                {Array.from({length:24},(_,h)=>h).map(h => <th key={h} className="text-gray-500 px-1 w-7">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map((day, i) => {
                const dowIdx = i === 6 ? 0 : i + 1
                return (
                  <tr key={day}>
                    <td className="text-gray-600 font-semibold pr-2">{day}</td>
                    {Array.from({length:24},(_,h)=>h).map(h => {
                      const cell = d.heatmap.find(c => c.dow === dowIdx && c.hour === h)
                      if (!cell || cell.trips === 0) return <td key={h} className="bg-gray-50 w-7 h-7 text-center" title="No trip" />
                      const alpha = Math.min(cell.intensity / Math.max(maxIntensity, 20), 1)
                      const bg = cell.flagged > 0 ? `rgba(239, 68, 68, ${0.15 + alpha * 0.7})` : `rgba(16, 185, 129, ${0.1 + Math.min(cell.trips/50, 0.4)})`
                      return (
                        <td key={h} className="w-7 h-7 text-center text-gray-700 font-semibold rounded"
                          style={{ background: bg }}
                          title={`${day} ${h}:00 — ${cell.trips} trip, ${cell.flagged} flagged (${cell.intensity}%)`}>
                          {cell.trips}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <span>Legend:</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(16, 185, 129, 0.3)' }}/> Normal (no flag)</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(239, 68, 68, 0.4)' }}/> Some flagged</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(239, 68, 68, 0.85)' }}/> High anomaly</span>
        </div>
      </div>

      {/* Vendor / Transportir Scorecard */}
      {d.vendors && d.vendors.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Vendor / Transportir Scorecard</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {d.vendors.map(v => (
              <div key={v.vendor} className={`rounded-lg border p-3 ${v.pct_flagged > 10 ? 'border-red-300 bg-red-50' : v.pct_flagged > 5 ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm">{v.vendor}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${v.pct_flagged > 10 ? 'bg-red-100 text-red-700' : v.pct_flagged > 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {v.pct_flagged}% flagged
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center text-xs mb-2">
                  <div><div className="text-gray-500 text-[10px]">Trip</div><div className="font-bold">{v.trips}</div></div>
                  <div><div className="text-gray-500 text-[10px]">Supir</div><div className="font-bold">{v.driver_count}</div></div>
                  <div><div className="text-gray-500 text-[10px]">Under</div><div className="font-bold text-amber-600">{v.under}</div></div>
                  <div><div className="text-gray-500 text-[10px]">Over</div><div className="font-bold text-red-600">{v.over}</div></div>
                </div>
                <div className="text-[11px] text-gray-600">
                  Avg netto: <strong>{v.avg_netto.toLocaleString('id-ID')} kg</strong>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {v.by_type.map(bt => `${bt.truck_type}: ${bt.trips}`).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Flagged Drivers */}
      <div className="card">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Top 20 Supir Paling Sering Flagged</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
              <th className="text-left p-2">Supir</th>
              <th className="text-right p-2">Total Trip</th>
              <th className="text-right p-2">Under-band</th>
              <th className="text-right p-2">Over-band</th>
              <th className="text-right p-2">Total Flag</th>
              <th className="text-right p-2">% Flagged</th>
            </tr></thead>
            <tbody>
              {d.drivers.map(dr => (
                <tr key={dr.driver} className={`border-b border-gray-100 hover:bg-gray-50 ${dr.pct_flagged > 50 ? 'bg-red-50' : dr.pct_flagged > 20 ? 'bg-amber-50' : ''}`}>
                  <td className="p-2 font-medium">{dr.driver}</td>
                  <td className="p-2 text-right">{dr.trips}</td>
                  <td className="p-2 text-right text-amber-600">{dr.under}</td>
                  <td className="p-2 text-right text-red-600">{dr.over}</td>
                  <td className="p-2 text-right font-bold">{dr.flagged}</td>
                  <td className={`p-2 text-right font-bold ${dr.pct_flagged > 50 ? 'text-red-600' : dr.pct_flagged > 20 ? 'text-amber-600' : 'text-gray-700'}`}>{dr.pct_flagged}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ──────────────── PHASE 4C TAB: COMPOSITE FRAUD INDEX ──────────────── */
function FraudIndexTab({ tahun, bulan }) {
  const [d, setD] = useState(null)
  const [filter, setFilter] = useState('all')
  useEffect(() => { api.get('/audit/fraud-index', { params:{ tahun, bulan } }).then(r => setD(r.data)) }, [tahun, bulan])
  if (!d) return <div className="text-gray-500 py-10 text-center">Menghitung composite fraud score...</div>

  const filtered = filter === 'all' ? d.ranked : d.ranked.filter(r => r.level === filter)
  const levelStyle = {
    kritis: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100' },
    mencurigakan: { bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-100' },
    perhatian: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100' },
    aman: { bg: '', text: 'text-green-700', badge: 'bg-green-100' },
  }

  return (
    <div className="space-y-4">
      <div className="card bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
        <h3 className="font-bold text-red-700 flex items-center gap-2"><Zap size={18}/> Composite Fraud Index per Truk</h3>
        <p className="text-xs text-red-700 mt-2">
          Komposit weighted score 0–100 per truk: <strong>Capacity 30% + Tare 30% + Repeat 15% + Multi-trip 15% + Temporal 10%</strong>.
          Ranking ini = <strong>priority list audit Anda</strong>. Truk di atas paling layak diaudit dulu.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Total Truk</p>
          <p className="text-3xl font-bold text-gray-700">{d.summary.total}</p>
        </div>
        <div className="card border-red-300 bg-red-50 text-center">
          <p className="text-xs text-red-600">🔴 Kritis (≥70)</p>
          <p className="text-3xl font-bold text-red-700">{d.summary.kritis}</p>
        </div>
        <div className="card border-orange-300 bg-orange-50 text-center">
          <p className="text-xs text-orange-600">🟠 Mencurigakan (40-69)</p>
          <p className="text-3xl font-bold text-orange-700">{d.summary.mencurigakan}</p>
        </div>
        <div className="card border-amber-300 bg-amber-50 text-center">
          <p className="text-xs text-amber-600">🟡 Perhatian (20-39)</p>
          <p className="text-3xl font-bold text-amber-700">{d.summary.perhatian}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all','kritis','mencurigakan','perhatian','aman'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter===f ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {f==='all' ? `Semua (${d.summary.total})` : `${f.charAt(0).toUpperCase()+f.slice(1)} (${d.summary[f] || 0})`}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header text-left">Rank</th>
                <th className="table-header text-left">No. Polisi</th>
                <th className="table-header text-left">Type</th>
                <th className="table-header text-right">Trip</th>
                <th className="table-header text-right">Composite</th>
                <th className="table-header text-center">Level</th>
                <th className="table-header text-right" title="Capacity sub-score">Cap</th>
                <th className="table-header text-right" title="Tare sub-score">Tare</th>
                <th className="table-header text-right" title="Repeat netto sub-score">Repeat</th>
                <th className="table-header text-right" title="Multi-trip same-day sub-score">Multi</th>
                <th className="table-header text-right" title="Temporal odd-hour sub-score">Temp</th>
                <th className="table-header text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const st = levelStyle[r.level]
                return (
                  <tr key={r.no_polisi} className={`border-b border-gray-100 hover:bg-gray-50 ${st.bg}`}>
                    <td className="table-cell font-bold text-gray-500">#{i+1}</td>
                    <td className="table-cell font-mono font-bold text-purple-700">{r.no_polisi}</td>
                    <td className="table-cell text-xs text-gray-600">{r.dominant_type}</td>
                    <td className="table-cell text-right">{r.trips}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${r.composite >= 70 ? 'bg-red-500' : r.composite >= 40 ? 'bg-orange-500' : r.composite >= 20 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${r.composite}%` }}/>
                        </div>
                        <strong className={st.text}>{r.composite}</strong>
                      </div>
                    </td>
                    <td className="table-cell text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.badge} ${st.text}`}>
                        {r.level === 'kritis' ? '🔴' : r.level === 'mencurigakan' ? '🟠' : r.level === 'perhatian' ? '🟡' : '✓'} {r.level}
                      </span>
                    </td>
                    <td className="table-cell text-right text-xs">{r.scores.capacity}</td>
                    <td className="table-cell text-right text-xs">{r.scores.tare}</td>
                    <td className="table-cell text-right text-xs">{r.scores.repeat}</td>
                    <td className="table-cell text-right text-xs">{r.scores.multi_trip}</td>
                    <td className="table-cell text-right text-xs">{r.scores.temporal}</td>
                    <td className="table-cell text-center">
                      <a href={`/data?search=${encodeURIComponent(r.no_polisi)}`} target="_blank" rel="noopener" className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1">
                        <ExternalLink size={11}/> Audit
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">Tidak ada truk dengan level "{filter}"</div>
          )}
        </div>
      </div>

      <div className="card bg-gray-50 border-gray-200 text-xs text-gray-600">
        <strong>Cara baca:</strong> Cap/Tare/Repeat/Multi/Temp = sub-score 0–100 per indikator. Composite = weighted sum.
        Truk dengan composite tinggi <em>belum tentu fraud</em> — tapi <strong>prioritas pertama untuk diaudit manual</strong>. Klik <strong>Audit</strong> untuk drill-down.
      </div>
    </div>
  )
}
