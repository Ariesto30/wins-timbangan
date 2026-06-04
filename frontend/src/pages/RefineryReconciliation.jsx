import { useEffect, useState } from 'react'
import { Factory, Plus, Save, Trash2, AlertTriangle, CheckCircle, Scale, Droplet, TrendingDown, X } from 'lucide-react'
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0d9488,#0f766e)' }}>
            <Factory size={22} className="text-white" />
          </div>
          <div>
            <h1 className="page-title">Refinery Reconciliation</h1>
            <p className="page-subtitle">Raw & Stock Balancing — rekonsiliasi produksi vs timbangan</p>
          </div>
        </div>
        <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus size={15} /> Periode Baru</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* List periode */}
        <div className="lg:col-span-1 space-y-2">
          {list.length === 0 && <div className="card text-center text-sm text-gray-400 py-8">Belum ada periode.<br />Klik "Periode Baru".</div>}
          {list.map(p => (
            <button key={p.id} onClick={() => { setSelId(p.id); setEditing(false) }}
              className={`w-full text-left card hover:border-teal-300 transition-colors ${selId === p.id ? 'border-teal-400 bg-teal-50/40' : ''}`}>
              <div className="font-semibold text-sm text-gray-800">{p.periode_label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{p.tgl_start || '?'} → {p.tgl_end || '?'}</div>
              <div className="text-xs text-teal-600 mt-1">CPO {fmtMt(p.cpo_received)} MT</div>
            </button>
          ))}
        </div>

        {/* Detail / form */}
        <div className="lg:col-span-3">
          {editing ? <BalanceForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(false)} saving={saving} isNew={editing === 'new'} />
            : detail ? <ReconciliationView detail={detail} onEdit={startEdit} onDelete={del} />
              : <div className="card text-center text-gray-400 py-16">Pilih periode di kiri, atau buat periode baru untuk mulai rekonsiliasi.</div>}
        </div>
      </div>
    </div>
  )
}

/* ─── Form input produksi ─── */
function BalanceForm({ form, setForm, onSave, onCancel, saving, isNew }) {
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
  const FLAG_STYLE = {
    tinggi: { box: 'bg-red-50 border-red-200',       icon: 'text-red-600',    title: 'text-red-700' },
    sedang: { box: 'bg-orange-50 border-orange-200', icon: 'text-orange-600', title: 'text-orange-700' },
    rendah: { box: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-600', title: 'text-yellow-700' },
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 text-lg">{r.periode_label}</h3>
          <p className="text-xs text-gray-400">{r.tgl_start || '?'} → {r.tgl_end || '?'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="btn-secondary text-sm">Edit</button>
          <button onClick={onDelete} className="text-red-500 hover:text-red-700 p-2"><Trash2 size={16} /></button>
        </div>
      </div>

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

      {/* Yield & Fraksinasi */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h4 className="font-bold text-sm text-gray-700 mb-3">Yield Konversi (basis CPO diolah)</h4>
          <YieldBar label="RBDPO" pct={a.yields.rbdpo_pct} target={94.5} />
          <YieldBar label="PFAD" pct={a.yields.pfad_pct} target={5} />
        </div>
        <div className="card">
          <h4 className="font-bold text-sm text-gray-700 mb-3">Split Fraksinasi (olein vs stearin)</h4>
          <YieldBar label="Olein" pct={a.fractionation.olein_pct} target={75} />
          <YieldBar label="Stearin" pct={a.fractionation.stearin_pct} target={20} />
        </div>
      </div>

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
