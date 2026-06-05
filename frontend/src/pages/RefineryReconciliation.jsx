import { useEffect, useState } from 'react'
import { Factory, Plus, Save, Trash2, AlertTriangle, CheckCircle, Scale, Droplet, TrendingDown, X, Package, Truck, Bell, Cog, BarChart3, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react'
import api from '../utils/api'

const BLANK = {
  periode_label: '', tgl_start: '', tgl_end: '', catatan: '',
  cpo_received: 0, cpo_processed: 0, cpo_stock: 0, cpo_reject: 0, cpo_lost_pct: 0.5,
  olein_gross: 0, olein_dispatch: 0, olein_stock: 0, olein_reject: 0,
  stearin_gross: 0, stearin_dispatch: 0, stearin_stock: 0, stearin_reject: 0,
  pfad: 0, rbdpo: 0,
}

const fmtMt = v => (v == null ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }))

export default function RefineryReconciliation() {
  const [list, setList] = useState([])
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  function loadList() { api.get('/refinery').then(r => setList(r.data)).catch(e => alert('Gagal memuat periode: ' + (e.response?.data?.error || e.message))) }
  useEffect(() => { loadList() }, [])
  useEffect(() => {
    if (selId) api.get(`/refinery/${selId}`).then(r => setDetail(r.data))
    else setDetail(null)
  }, [selId])

  function startNew() { setForm(BLANK); setEditing('new') }
  function startEdit() {
    if (!detail) return
    const r = detail.record
    setForm({ ...BLANK, ...r, tgl_start: r.tgl_start || '', tgl_end: r.tgl_end || '' })
    setEditing('edit')
  }

  async function save() {
    if (!form.periode_label) { alert('Label periode wajib diisi'); return }
    setSaving(true)
    try {
      if (editing === 'new') {
        const r = await api.post('/refinery', form)
        loadList(); setSelId(r.data.id)
      } else {
        await api.put(`/refinery/${detail.record.id}`, form)
        const r = await api.get(`/refinery/${detail.record.id}`); setDetail(r.data); loadList()
      }
      setEditing(false)
    } catch (e) { alert(e.response?.data?.error || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  async function del() {
    if (!detail || !confirm('Hapus periode ini?')) return
    await api.delete(`/refinery/${detail.record.id}`)
    setSelId(null); loadList()
  }

  // Tarik agregat dari Log Produksi Harian -> isi form otomatis
  async function tarikDariLog() {
    try {
      const params = {}
      if (form.tgl_start) params.from = form.tgl_start
      if (form.tgl_end) params.to = form.tgl_end
      const r = await api.get('/production/aggregate', { params })
      const m = r.data.mapped
      setForm(f => ({ ...f, ...m, periode_label: f.periode_label || m.periode_label }))
      alert(`Terisi dari Log Harian (${r.data.rentang.dari} s/d ${r.data.rentang.sampai}).\nCek & sesuaikan stok bila perlu, lalu Simpan.`)
    } catch (e) { alert('Gagal tarik: ' + (e.response?.data?.error || e.message)) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0d9488,#0f766e)' }}>
            <Factory size={22} className="text-white" />
          </div>
          <div>
            <h1 className="page-title">Refinery Balance <span className="text-[11px] font-semibold text-teal-600 align-middle ml-1">RINGKASAN PERIODE</span></h1>
            <p className="page-subtitle">Rekonsiliasi neraca per periode — bisa ditarik otomatis dari Produksi Refinery (harian)</p>
          </div>
        </div>
        <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus size={15} /> Periode Baru</button>
      </div>

      {/* Chip pemilih periode (horizontal) */}
      {list.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-semibold">Periode:</span>
          {list.map(p => (
            <button key={p.id} onClick={() => { setSelId(p.id); setEditing(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selId === p.id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'}`}>
              {p.periode_label} <span className={selId === p.id ? 'text-teal-100' : 'text-gray-400'}>· CPO {fmtMt(p.cpo_received)} MT</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail full-width */}
      <div>
        {editing ? <BalanceForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(false)} saving={saving} isNew={editing === 'new'} onTarik={tarikDariLog} />
          : detail ? <ReconciliationView detail={detail} onEdit={startEdit} onDelete={del} />
            : <div className="card text-center text-gray-400 py-16">Belum ada periode. Klik "Periode Baru" untuk mulai rekonsiliasi.</div>}
      </div>
    </div>
  )
}

/* ─── Form input produksi ─── */
function BalanceForm({ form, setForm, onSave, onCancel, saving, isNew, onTarik }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const numField = (k, label, hint) => (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label} {hint && <span className="text-gray-300">({hint})</span>}</label>
      <input type="number" step="any" value={form[k]} onChange={e => set(k, e.target.value)}
        className="input w-full" />
    </div>
  )
  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">{isNew ? 'Periode Baru' : 'Edit Periode'}</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      {onTarik && (
        <div className="rounded-xl bg-orange-50 ring-1 ring-orange-200 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-orange-800"><b>Isi otomatis</b> dari Produksi Refinery (log harian). Atur rentang tanggal di bawah dulu (kosong = seluruh data), lalu klik.</div>
          <button onClick={onTarik} className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 flex-shrink-0"><ArrowDownToLine size={14} /> Tarik dari Log Harian</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <label className="text-xs text-gray-500 block mb-1">Label Periode *</label>
          <input value={form.periode_label} onChange={e => set('periode_label', e.target.value)} placeholder="cth: Feb-Mei 2026" className="input w-full" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Tanggal Mulai</label>
          <input type="date" value={form.tgl_start} onChange={e => set('tgl_start', e.target.value)} className="input w-full" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Tanggal Cut-Off</label>
          <input type="date" value={form.tgl_end} onChange={e => set('tgl_end', e.target.value)} className="input w-full" />
        </div>
      </div>

      <FormGroup icon={<Scale size={14} />} title="Bahan Baku CPO (MT)" color="teal">
        {numField('cpo_received', 'CPO Received', 'weighbridge')}
        {numField('cpo_processed', 'CPO Diolah')}
        {numField('cpo_stock', 'CPO Stock')}
        {numField('cpo_reject', 'CPO Reject')}
        {numField('cpo_lost_pct', 'Loss %', 'abs')}
      </FormGroup>

      <FormGroup icon={<Droplet size={14} />} title="RBD Olein (MT)" color="amber">
        {numField('olein_gross', 'Produksi Gross')}
        {numField('olein_dispatch', 'Dispatch')}
        {numField('olein_stock', 'Stock')}
        {numField('olein_reject', 'Reject')}
      </FormGroup>

      <FormGroup icon={<Droplet size={14} />} title="RBD Stearin (MT)" color="orange">
        {numField('stearin_gross', 'Produksi Gross')}
        {numField('stearin_dispatch', 'Dispatch')}
        {numField('stearin_stock', 'Stock')}
        {numField('stearin_reject', 'Reject')}
      </FormGroup>

      <FormGroup icon={<TrendingDown size={14} />} title="Lainnya (MT)" color="gray">
        {numField('pfad', 'PFAD')}
        {numField('rbdpo', 'RBDPO')}
      </FormGroup>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Catatan</label>
        <textarea value={form.catatan || ''} onChange={e => set('catatan', e.target.value)} rows={2} className="input w-full" />
      </div>

      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button onClick={onCancel} className="btn-secondary">Batal</button>
      </div>
    </div>
  )
}

const GROUP_STYLES = {
  teal:   { box: 'border-teal-200 bg-teal-50/30',     text: 'text-teal-700' },
  amber:  { box: 'border-amber-200 bg-amber-50/30',   text: 'text-amber-700' },
  orange: { box: 'border-orange-200 bg-orange-50/30', text: 'text-orange-700' },
  gray:   { box: 'border-gray-200 bg-gray-50/30',     text: 'text-gray-700' },
}
function FormGroup({ icon, title, color, children }) {
  const s = GROUP_STYLES[color] || GROUP_STYLES.gray
  return (
    <div className={`rounded-xl border p-3 ${s.box}`}>
      <div className={`flex items-center gap-2 text-xs font-bold mb-3 ${s.text}`}>{icon} {title}</div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{children}</div>
    </div>
  )
}

/* ─── Panel rekonsiliasi ─── */
function ReconciliationView({ detail, onEdit, onDelete }) {
  const r = detail.record
  const a = detail.analysis
  const [view, setView] = useState('twin')
  const [tankSum, setTankSum] = useState(null)
  useEffect(() => { api.get('/tank').then(res => setTankSum(res.data.summary)).catch(() => {}) }, [])
  const FLAG_STYLE = {
    tinggi: { box: 'bg-red-50 border-red-200',       icon: 'text-red-600',    title: 'text-red-700' },
    sedang: { box: 'bg-orange-50 border-orange-200', icon: 'text-orange-600', title: 'text-orange-700' },
    rendah: { box: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-600', title: 'text-yellow-700' },
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">{r.periode_label}</h3>
          <p className="text-xs text-gray-400">{r.tgl_start || '?'} → {r.tgl_end || '?'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            <button onClick={() => setView('twin')} className={`px-3 py-1.5 flex items-center gap-1.5 ${view==='twin' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><Factory size={13} /> Digital Twin</button>
            <button onClick={() => setView('ringkasan')} className={`px-3 py-1.5 flex items-center gap-1.5 ${view==='ringkasan' ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}><BarChart3 size={13} /> Ringkasan</button>
          </div>
          <button onClick={onEdit} className="btn-secondary text-sm">Edit</button>
          <button onClick={onDelete} className="text-red-500 hover:text-red-700 p-2"><Trash2 size={16} /></button>
        </div>
      </div>

      {view === 'twin' && <DigitalTwin r={r} a={a} tankSum={tankSum} />}
      {view === 'ringkasan' && <RingkasanView r={r} a={a} FLAG_STYLE={FLAG_STYLE} />}
    </div>
  )
}

function RingkasanView({ r, a, FLAG_STYLE }) {
  return (
    <div className="space-y-4">

      {/* KPI mass balance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox label="CPO Received" value={`${fmtMt(r.cpo_received)} MT`} sub="weighbridge" color="teal" />
        <KpiBox label="CPO Olah + Stock" value={`${fmtMt(a.cpoAvailable)} MT`} sub={`gap ${fmtMt(a.gapWeighbridge)} MT (${a.gapWeighbridgePct}%)`} color={Math.abs(a.gapWeighbridgePct) > 1 ? 'red' : 'green'} />
        <KpiBox label="Total Produk Jual" value={`${fmtMt(a.oleinNet + a.stearinNet)} MT`} sub="olein + stearin (net)" color="amber" />
        <KpiBox label="CPO Reject" value={`${fmtMt(r.cpo_reject)} MT`} sub={r.cpo_received > 0 ? `${(r.cpo_reject / r.cpo_received * 100).toFixed(1)}% dari received` : ''} color={r.cpo_reject > r.cpo_received * 0.02 ? 'red' : 'gray'} />
      </div>

      {/* Cross-check timbangan */}
      {a.timbanganMatch && (
        <div className={`card ${Math.abs(a.timbanganMatch.selisih_pct) > 3 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Scale size={16} className="text-gray-600" />
            <span className="font-bold text-sm text-gray-800">Cross-Check vs Data Timbangan</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-xs text-gray-500">CPO Received (input)</div><div className="font-bold text-gray-800">{fmtMt(a.timbanganMatch.whiteboard_cpo)} MT</div></div>
            <div><div className="text-xs text-gray-500">CPO kumulatif s/d cut-off (timbangan)</div><div className="font-bold text-gray-800">{fmtMt(a.timbanganMatch.timbangan_cpo_mt)} MT</div></div>
            <div><div className="text-xs text-gray-500">Selisih</div><div className={`font-bold ${Math.abs(a.timbanganMatch.selisih_pct) > 3 ? 'text-orange-600' : 'text-green-600'}`}>{fmtMt(a.timbanganMatch.selisih)} MT ({a.timbanganMatch.selisih_pct}%)</div></div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">CPO Received whiteboard = akumulasi CPO sejak awal operasi s/d tanggal cut-off (bukan volume periode). Timbangan menjumlah produk CPO hingga cut-off. Selisih kecil (&lt;1%) = tervalidasi.</p>
        </div>
      )}

      {/* Yield Flow — alur konversi CPO → PFAD + RBDPO → Olein + Stearin */}
      {a.flow && <YieldFlow flow={a.flow} />}

      {/* Balance Olein & Stearin */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalanceCard title="Balance Olein" gross={r.olein_gross} reject={r.olein_reject} net={a.oleinNet} dispatch={r.olein_dispatch} stock={r.olein_stock} accounted={a.oleinAccounted} mismatch={a.oleinMismatch} />
        <BalanceCard title="Balance Stearin" gross={r.stearin_gross} reject={r.stearin_reject} net={a.stearinNet} dispatch={r.stearin_dispatch} stock={r.stearin_stock} accounted={a.stearinAccounted} mismatch={a.stearinMismatch} />
      </div>

      {/* Red flags */}
      <div className="card">
        <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><AlertTriangle size={15} /> Red Flag & Deviasi ({a.flags.length})</h4>
        {a.flags.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 text-sm py-2"><CheckCircle size={16} /> Tidak ada deviasi signifikan — mass balance sehat.</div>
        ) : (
          <div className="space-y-2">
            {a.flags.map((f, i) => {
              const s = FLAG_STYLE[f.level] || FLAG_STYLE.sedang
              return (
                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${s.box}`}>
                  <AlertTriangle size={15} className={`${s.icon} flex-shrink-0 mt-0.5`} />
                  <div>
                    <div className={`text-xs font-semibold ${s.title}`}>{f.msg}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">→ {f.hint}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {r.catatan && <div className="card text-xs text-gray-600"><strong>Catatan:</strong> {r.catatan}</div>}
    </div>
  )
}

function KpiBox({ label, value, sub, color }) {
  const txt = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'teal' ? 'text-teal-600' : color === 'amber' ? 'text-amber-600' : 'text-gray-800'
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${txt}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

/* ═══════════ DIGITAL TWIN — proses refinery ala SCADA ═══════════ */
function Pipe({ color, h = 30 }) {
  // Pipa berkilau: badan gelap + isi warna + dash beraliran + highlight
  return (
    <svg width="16" height={h} className="flex-shrink-0">
      <line x1="8" y1="0" x2="8" y2={h} stroke="#334155" strokeWidth="9" strokeLinecap="round" opacity="0.25" />
      <line x1="8" y1="0" x2="8" y2={h} stroke={color} strokeWidth="7" strokeLinecap="round" />
      <line x1="8" y1="0" x2="8" y2={h} stroke="#fff" strokeWidth="7" strokeLinecap="round" className="pipe-flow" opacity="0.45" />
      <line x1="6" y1="2" x2="6" y2={h - 2} stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/* Tangki silinder metalik untuk scene proses */
function RefTank({ code, mt, pct, color, light, fill = 82, w = 116 }) {
  const uid = `rt${code}`.replace(/[^a-z0-9]/gi, '')
  const TOP = 18, BOT = 116, H = BOT - TOP
  const surf = BOT - (fill / 100) * H
  const body = `M16,${TOP} A30,9 0 0 1 ${w - 16},${TOP} L${w - 16},${BOT} A30,9 0 0 1 16,${BOT} Z`
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${w} 142`} style={{ width: w }} className="h-32">
        <defs>
          {/* cairan */}
          <linearGradient id={`${uid}l`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={light} /><stop offset="100%" stopColor={color} /></linearGradient>
          {/* kulit baja: gelap-terang-gelap (silinder metalik) */}
          <linearGradient id={`${uid}steel`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(15,23,42,.28)" />
            <stop offset="18%" stopColor="rgba(255,255,255,.65)" />
            <stop offset="40%" stopColor="rgba(255,255,255,.05)" />
            <stop offset="62%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(15,23,42,.32)" />
          </linearGradient>
          <clipPath id={`${uid}c`}><path d={body} /></clipPath>
        </defs>
        {/* bayangan lantai */}
        <ellipse cx={w/2} cy="130" rx={w/2-4} ry="8" fill="rgba(15,23,42,.14)" />
        {/* dinding belakang */}
        <path d={body} fill="#e2e8f0" />
        {/* cairan + animasi */}
        <g clipPath={`url(#${uid}c)`}>
          <rect x="16" y={surf} width={w-32} height={BOT - surf + 2} fill={`url(#${uid}l)`} />
          {/* permukaan bergejolak (meniscus) */}
          <ellipse className="tank-liquid-surface" cx={w/2} cy={surf} rx={w/2-16} ry="8" fill={light} opacity="0.95" />
          <ellipse className="tank-liquid-surface" cx={w/2} cy={surf} rx={w/2-26} ry="5" fill="#ffffff" opacity="0.22" />
          {/* shimmer menyapu */}
          <rect className="tank-shimmer" x="16" y={surf} width={(w-32)*0.42} height={BOT - surf} fill="rgba(255,255,255,.35)" />
          {/* buih naik */}
          {fill > 12 && <>
            <circle className="tank-bubble" cx={w*0.32} cy={BOT-7} r="2.3" fill="rgba(255,255,255,.6)"  style={{ animationDelay: '0s' }} />
            <circle className="tank-bubble" cx={w*0.44} cy={BOT-5} r="1.6" fill="rgba(255,255,255,.5)"  style={{ animationDelay: '0.5s' }} />
            <circle className="tank-bubble" cx={w*0.52} cy={BOT-9} r="2.0" fill="rgba(255,255,255,.55)" style={{ animationDelay: '1.0s' }} />
            <circle className="tank-bubble" cx={w*0.62} cy={BOT-6} r="1.5" fill="rgba(255,255,255,.5)"  style={{ animationDelay: '1.5s' }} />
            <circle className="tank-bubble" cx={w*0.7}  cy={BOT-8} r="1.9" fill="rgba(255,255,255,.55)" style={{ animationDelay: '2.0s' }} />
            <circle className="tank-bubble" cx={w*0.48} cy={BOT-4} r="1.4" fill="rgba(255,255,255,.5)"  style={{ animationDelay: '2.4s' }} />
          </>}
          {/* sabuk baja horizontal (struktur tangki) */}
          {[0.4, 0.68].map((g,i)=>(<line key={i} x1="16" y1={BOT-g*H} x2={w-16} y2={BOT-g*H} stroke="rgba(15,23,42,.12)" strokeWidth="1" />))}
        </g>
        {/* lapisan metalik */}
        <path d={body} fill={`url(#${uid}steel)`} stroke="rgba(15,23,42,.3)" strokeWidth="1.2" />
        {/* rim atas metalik */}
        <ellipse cx={w/2} cy={TOP} rx={w/2-16} ry="9" fill="#f1f5f9" stroke="rgba(15,23,42,.35)" strokeWidth="1.3" />
        <ellipse cx={w/2} cy={TOP} rx={w/2-23} ry="6" fill="none" stroke="rgba(15,23,42,.15)" strokeWidth="1" />
        {/* nozzle */}
        <rect x={w/2-5} y={TOP-9} width="10" height="7" rx="1.5" fill="#94a3b8" stroke="rgba(15,23,42,.3)" strokeWidth=".8" />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-[9px] font-bold text-slate-400 tracking-wider">{code}</div>
        <div className="font-extrabold text-sm leading-none" style={{ color }}>{fmtMt(mt)} <span className="text-[9px] text-slate-400">MT</span></div>
        {pct != null && <div className="text-[11px] font-semibold" style={{ color }}>{pct}%</div>}
      </div>
    </div>
  )
}

function DigitalTwin({ r, a, tankSum }) {
  const f = a.flow || {}
  const pctReceived = r.cpo_received > 0 ? (r.cpo_processed / r.cpo_received * 100).toFixed(1) : 0
  const tm = a.timbanganMatch
  const C = { cpo: ['#f59e0b', '#fcd34d'], pfad: ['#db2777', '#f472b6'], rbdpo: ['#0d9488', '#2dd4bf'], reject: ['#ef4444', '#fca5a5'], olein: ['#16a34a', '#4ade80'], stearin: ['#7c3aed', '#a78bfa'], sisa: ['#0891b2', '#67e8f9'] }
  const yieldRows = [
    { l: 'PFAD', mt: f.pfad?.mt, pct: f.pfad?.aktual, tgt: 5, c: '#db2777' },
    { l: 'RBDPO (Total)', mt: f.rbdpo?.mt, pct: f.rbdpo?.aktual, tgt: 94.5, c: '#0d9488' },
    { l: 'Loss / Susut', mt: f.loss?.mt, pct: f.loss?.aktual, tgt: null, c: '#64748b' },
    { l: 'RBD Olein', mt: f.olein?.mt, pct: f.olein?.aktual, tgt: 75, c: '#16a34a' },
    { l: 'RBD Stearin', mt: f.stearin?.mt, pct: f.stearin?.aktual, tgt: 20, c: '#7c3aed' },
    { l: 'Sisa RBDPO', mt: f.rbdpo_sisa?.mt, pct: f.rbdpo_sisa?.aktual, tgt: null, c: '#0891b2' },
  ]
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200" style={{ background: 'linear-gradient(160deg,#f8fafc,#eef2f7)' }}>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 p-3 bg-white/60">
        <TwinKpi label="CPO Received" value={fmtMt(r.cpo_received)} unit="MT" sub="weighbridge" color="#f59e0b" />
        <TwinKpi label="CPO Processed" value={fmtMt(r.cpo_processed)} unit="MT" sub={`${pctReceived}% dari received`} color="#0ea5e9" />
        <TwinKpi label="Total Produk Jual" value={fmtMt(a.oleinNet + a.stearinNet)} unit="MT" sub="Olein + Stearin (Net)" color="#16a34a" />
        <TwinKpi label="CPO Reject" value={fmtMt(r.cpo_reject)} unit="MT" sub={`${r.cpo_received > 0 ? (r.cpo_reject / r.cpo_received * 100).toFixed(1) : 0}% dari received`} color="#ef4444" />
        <TwinKpi label="Selisih Timbangan" value={tm ? fmtMt(tm.selisih) : '–'} unit="MT" sub={tm ? `${tm.selisih_pct}% (${Math.abs(tm.selisih_pct) < 1 ? 'Validated' : 'cek'})` : ''} color={tm && Math.abs(tm.selisih_pct) < 1 ? '#7c3aed' : '#ef4444'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-3">
        {/* Scene proses */}
        <div className="lg:col-span-2 rounded-xl ring-1 ring-slate-200 bg-white p-4 relative overflow-hidden">
          <div className="relative flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Refinery Process Flow</span>
            <span className="text-[10px] font-bold text-green-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE</span>
          </div>
          <div className="relative flex flex-col items-center">
            {/* CPO received */}
            <RefTank code="CPO RECEIVED" mt={r.cpo_received} pct={100} color={C.cpo[0]} light={C.cpo[1]} fill={98} w={140} />
            <Pipe color={C.cpo[0]} h={26} />
            <div className="px-4 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold tracking-wide shadow flex items-center gap-2"><Cog size={14} /> REFINERY PROCESS — olah {fmtMt(r.cpo_processed)} MT</div>
            {/* Split jadi PFAD + RBDPO + Reject */}
            <div className="flex items-start justify-center gap-2 mt-1">
              <Pipe color={C.pfad[0]} h={22} /><Pipe color={C.rbdpo[0]} h={22} /><Pipe color={C.reject[0]} h={22} />
            </div>
            <div className="flex flex-wrap items-start justify-center gap-4 mt-1">
              <RefTank code="PFAD" mt={f.pfad?.mt} pct={f.pfad?.aktual} color={C.pfad[0]} light={C.pfad[1]} fill={60} />
              <RefTank code="RBDPO" mt={f.rbdpo?.mt} pct={f.rbdpo?.aktual} color={C.rbdpo[0]} light={C.rbdpo[1]} fill={90} />
              <RefTank code="REJECT" mt={r.cpo_reject} pct={r.cpo_received > 0 ? +(r.cpo_reject/r.cpo_received*100).toFixed(1) : 0} color={C.reject[0]} light={C.reject[1]} fill={30} />
            </div>
            {/* RBDPO dipecah */}
            <div className="text-[10px] text-slate-400 mt-2">RBDPO dipecah (fraksinasi) ↓</div>
            <div className="flex items-start justify-center gap-2">
              <Pipe color={C.olein[0]} h={20} /><Pipe color={C.stearin[0]} h={20} /><Pipe color={C.sisa[0]} h={20} />
            </div>
            <div className="flex flex-wrap items-start justify-center gap-4">
              <ProductTank code="RBD OLEIN" mt={f.olein?.mt} pct={f.olein?.aktual} colors={C.olein} dispatch={r.olein_dispatch} stock={r.olein_stock} />
              <ProductTank code="RBD STEARIN" mt={f.stearin?.mt} pct={f.stearin?.aktual} colors={C.stearin} dispatch={r.stearin_dispatch} stock={r.stearin_stock} />
              <ProductTank code="SISA RBDPO" mt={f.rbdpo_sisa?.mt} pct={f.rbdpo_sisa?.aktual} colors={C.sisa} dispatch={0} stock={r.rbdpo} />
            </div>
          </div>
        </div>

        {/* Panel kanan */}
        <div className="space-y-3">
          <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
            <div className="text-xs font-bold text-slate-700 mb-2">YIELD CONVERSION <span className="text-slate-400 font-normal">(dari CPO diolah)</span></div>
            <div className="space-y-1.5">
              {yieldRows.map((y, i) => {
                const ok = y.tgt == null ? null : Math.abs(y.pct - y.tgt) <= y.tgt * 0.1
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: y.c }}>{y.l}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-slate-700">{fmtMt(y.mt)} MT</span>
                      <span className={`font-bold ${ok === null ? 'text-slate-500' : ok ? 'text-green-600' : 'text-orange-500'}`}>{y.pct}%</span>
                      {y.tgt != null && <span className="text-slate-300 text-[10px]">/ {y.tgt}%</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl bg-white ring-1 ring-slate-200 p-3">
            <div className="text-xs font-bold text-slate-700 mb-2">BALANCE SUMMARY</div>
            <Row label="CPO Received (Input)" value={`${fmtMt(r.cpo_received)} MT`} />
            <Row label="CPO Kumulatif Timbangan" value={`${tm ? fmtMt(tm.timbangan_cpo_mt) : '–'} MT`} />
            <Row label="Selisih Timbangan" value={tm ? `${fmtMt(tm.selisih)} MT (${tm.selisih_pct}%)` : '–'} bold />
            <div className="text-[10px] text-slate-400 mt-1">Selisih kecil (&lt;1%) = tervalidasi</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MiniBalance title="OLEIN" gross={r.olein_gross} reject={r.olein_reject} net={a.oleinNet} dispatch={r.olein_dispatch} stock={r.olein_stock} mismatch={a.oleinMismatch} />
            <MiniBalance title="STEARIN" gross={r.stearin_gross} reject={r.stearin_reject} net={a.stearinNet} dispatch={r.stearin_dispatch} stock={r.stearin_stock} mismatch={a.stearinMismatch} />
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-white border-t border-slate-200 text-xs text-slate-600">
        <StatusItem label="Total Tank" value={tankSum ? `${tankSum.total_tank} Unit` : '–'} />
        <StatusItem label="Total Kapasitas" value={tankSum ? `${fmtMt(tankSum.total_kapasitas)} MT` : '–'} />
        <StatusItem label="Total Stok" value={tankSum ? `${fmtMt(tankSum.total_stok)} MT` : '–'} />
        <StatusItem label="Utilisasi" value={tankSum ? `${tankSum.util_pct}%` : '–'} />
        <div className="flex items-center gap-1.5"><Bell size={13} className={a.flags.length ? 'text-red-500' : 'text-slate-400'} /><span className="text-slate-400">Alerts:</span><span className={`font-bold ${a.flags.length ? 'text-red-600' : 'text-green-600'}`}>{a.flags.length} Active</span></div>
        <div className="flex items-center gap-1.5"><CheckCircle size={13} className="text-green-500" /><span className="font-bold text-green-600">All Systems Normal</span></div>
        <div className="ml-auto text-slate-400">Update: {r.updated_at ? new Date(r.updated_at).toLocaleString('id-ID') : '–'}</div>
      </div>
    </div>
  )
}

function TwinKpi({ label, value, unit, sub, color }) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 px-3 py-2">
      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
      <div className="flex items-baseline gap-1"><span className="text-xl font-extrabold" style={{ color }}>{value}</span><span className="text-[10px] font-bold text-slate-400">{unit}</span></div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  )
}

function ProductTank({ code, mt, pct, colors, dispatch, stock }) {
  return (
    <div className="flex flex-col items-center">
      <RefTank code={code} mt={mt} pct={pct} color={colors[0]} light={colors[1]} fill={80} />
      <div className="flex gap-1 mt-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1"><ArrowUpFromLine size={9} /> {fmtMt(dispatch)}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1"><Package size={9} /> {fmtMt(stock)}</span>
      </div>
    </div>
  )
}

function MiniBalance({ title, gross, reject, net, dispatch, stock, mismatch }) {
  const bad = Math.abs(mismatch) > 5
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 p-2.5">
      <div className="text-[11px] font-bold text-slate-700 mb-1">BALANCE {title}</div>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between"><span className="text-slate-400">Gross</span><span className="font-mono">{fmtMt(gross)}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">− Reject</span><span className="font-mono text-red-500">{fmtMt(reject)}</span></div>
        <div className="flex justify-between font-semibold"><span className="text-slate-500">Net</span><span className="font-mono">{fmtMt(net)}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Dispatch</span><span className="font-mono">{fmtMt(dispatch)}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Stock</span><span className="font-mono">{fmtMt(stock)}</span></div>
      </div>
      <div className={`mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 ${bad ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>{bad ? <AlertTriangle size={9} /> : <CheckCircle size={9} />} Δ {fmtMt(mismatch)} MT</div>
    </div>
  )
}

function StatusItem({ label, value }) {
  return <div className="flex items-center gap-1.5"><span className="text-slate-400">{label}:</span><span className="font-bold">{value}</span></div>
}

/* Diagram alur yield: CPO Diolah → PFAD + RBDPO → Olein + Stearin + sisa */
function YieldFlow({ flow }) {
  const f = flow
  const dev = (a, t) => Math.abs(a - t) <= t * 0.1   // ±10% dari target = OK
  const Node = ({ title, mt, aktual, target, color, sub }) => {
    const ok = target == null ? null : dev(aktual, target)
    return (
      <div className="rounded-xl border-2 px-4 py-3 bg-white text-center min-w-[150px]" style={{ borderColor: color }}>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</div>
        <div className="text-2xl font-extrabold mt-0.5" style={{ color }}>{fmtMt(mt)}<span className="text-xs font-semibold text-gray-400 ml-1">MT</span></div>
        {aktual != null && (
          <div className="text-xs mt-1">
            <span className={ok === null ? 'text-gray-500 font-semibold' : ok ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>{aktual}%</span>
            {target != null && <span className="text-gray-400"> / target {target}%</span>}
          </div>
        )}
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    )
  }
  const Arrow = () => <div className="text-gray-300 text-2xl px-1 select-none">→</div>
  const ArrowDown = () => <div className="text-gray-300 text-xl text-center select-none leading-none my-1">↓</div>

  return (
    <div className="card">
      <h4 className="font-bold text-sm text-gray-700 mb-1">Alur Konversi Yield (basis CPO Diolah)</h4>
      <p className="text-xs text-gray-400 mb-4">CPO diolah dimurnikan jadi RBDPO + PFAD, lalu RBDPO dipecah jadi Olein & Stearin. Persentase = aktual vs target.</p>

      {/* Tahap 1: CPO Diolah */}
      <div className="flex flex-col items-center">
        <Node title="CPO Diolah" mt={f.cpo_diolah} aktual={100} target={null} color="#f59e0b" sub="100% bahan baku" />
        <ArrowDown />
        {/* Tahap 2: PFAD + RBDPO + Loss */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Node title="PFAD" mt={f.pfad.mt} aktual={f.pfad.aktual} target={f.pfad.target} color="#db2777" />
          <span className="text-gray-300 font-bold">+</span>
          <Node title="RBDPO" mt={f.rbdpo.mt} aktual={f.rbdpo.aktual} target={f.rbdpo.target} color="#0d9488" sub="olein+stearin+sisa" />
          {f.loss && f.loss.mt > 0 && <>
            <span className="text-gray-300 font-bold">+</span>
            <Node title="Loss/Susut" mt={f.loss.mt} aktual={f.loss.aktual} target={null} color="#94a3b8" />
          </>}
        </div>
        <ArrowDown />
        {/* Tahap 3: RBDPO dipecah */}
        <div className="text-[10px] text-gray-400 mb-1">RBDPO dipecah (fraksinasi):</div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Node title="RBD Olein" mt={f.olein.mt} aktual={f.olein.aktual} target={f.olein.target} color="#16a34a" sub="minyak goreng" />
          <span className="text-gray-300 font-bold">+</span>
          <Node title="RBD Stearin" mt={f.stearin.mt} aktual={f.stearin.aktual} target={f.stearin.target} color="#7c3aed" sub="lemak padat" />
          {f.rbdpo_sisa && f.rbdpo_sisa.mt > 0 && <>
            <span className="text-gray-300 font-bold">+</span>
            <Node title="Sisa RBDPO" mt={f.rbdpo_sisa.mt} aktual={f.rbdpo_sisa.aktual} target={null} color="#0891b2" sub="belum dipecah" />
          </>}
        </div>
      </div>
    </div>
  )
}

function YieldBar({ label, pct, target }) {
  const dev = Math.abs(pct - target)
  const ok = dev <= target * 0.1
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={ok ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>{pct}% <span className="text-gray-400">/ target {target}%</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${ok ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}

function BalanceCard({ title, gross, reject, net, dispatch, stock, accounted, mismatch }) {
  const bad = Math.abs(mismatch) > 5
  return (
    <div className="card">
      <h4 className="font-bold text-sm text-gray-700 mb-3">{title}</h4>
      <div className="space-y-1.5 text-sm">
        <Row label="Produksi Gross" value={fmtMt(gross)} />
        <Row label="− Reject" value={fmtMt(reject)} neg />
        <Row label="= Net Layak Jual" value={fmtMt(net)} bold />
        <div className="border-t border-gray-100 my-1" />
        <Row label="Dispatch" value={fmtMt(dispatch)} />
        <Row label="Stock" value={fmtMt(stock)} />
        <Row label="= Total Tercatat" value={fmtMt(accounted)} bold />
        <div className={`mt-2 p-2 rounded-lg text-xs font-semibold ${bad ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
          Mismatch: {fmtMt(mismatch)} MT {bad ? '⚠️ perlu ditelusuri' : '✓ wajar'}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold, neg }) {
  return (
    <div className="flex justify-between">
      <span className={`text-gray-500 ${bold ? 'font-semibold' : ''}`}>{label}</span>
      <span className={`font-mono ${bold ? 'font-bold text-gray-800' : neg ? 'text-red-500' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}
