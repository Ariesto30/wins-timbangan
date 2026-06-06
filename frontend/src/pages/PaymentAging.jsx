import { useEffect, useState } from 'react'
import { Wallet, Plus, X, Save, Trash2, ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react'
import api from '../utils/api'
import AiPanel from '../components/AiPanel'

const fmtRp = v => 'Rp ' + Number(v || 0).toLocaleString('id-ID')
const fmtM = v => (Number(v || 0) / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'
const BUCKETS = [
  { key: 'lancar', label: 'Belum Tempo', color: 'green' },
  { key: 'b30', label: '1–30 hari', color: 'yellow' },
  { key: 'b60', label: '31–60 hari', color: 'amber' },
  { key: 'b90', label: '61–90 hari', color: 'orange' },
  { key: 'b90plus', label: '> 90 hari', color: 'red' },
]
const BUCKET_TXT = { green: 'text-green-600', yellow: 'text-yellow-600', amber: 'text-amber-600', orange: 'text-orange-600', red: 'text-red-600' }

export default function PaymentAging() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [payFor, setPayFor] = useState(null)
  const [tab, setTab] = useState('piutang')

  function load() {
    setErr(null)
    api.get('/payment/aging').then(r => setData(r.data)).catch(e => setErr(e.response?.data?.error || e.message || 'Gagal memuat'))
  }
  useEffect(() => { load() }, [])

  if (err) return (
    <div className="card bg-red-50 border-red-200 text-center py-10">
      <div className="text-red-600 font-semibold mb-1">Gagal memuat data</div>
      <div className="text-xs text-gray-500 mb-4">{err}</div>
      <button onClick={load} className="btn-primary">Coba Lagi</button>
    </div>
  )
  if (!data) return <div className="text-gray-500 py-10 text-center">Memuat...</div>
  const net = data.net || {}
  const active = tab === 'piutang' ? data.piutang : data.hutang

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0F172A,#1E293B)' }}>
          <Wallet size={22} className="text-white" />
        </div>
        <div>
          <h1 className="page-title">Arus Kas — Piutang & Hutang</h1>
          <p className="page-subtitle">Penjualan produk (kas masuk) vs pembelian CPO (kas keluar)</p>
        </div>
      </div>

      {/* Posisi Kas — ringkasan netto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 ring-1 ring-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 mb-1"><ArrowDownCircle size={15} /> PIUTANG — Kas Akan Masuk</div>
          <div className="text-2xl font-extrabold text-emerald-700">{fmtRp(net.piutang_outstanding)}</div>
          <div className="text-[11px] text-emerald-600/80 mt-0.5">Penjualan Olein·Stearin·PFAD·RBDPO · jatuh tempo lewat: {fmtRp(net.piutang_overdue)}</div>
        </div>
        <div className="rounded-2xl p-4 ring-1 ring-red-200 bg-gradient-to-br from-red-50 to-white">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-700 mb-1"><ArrowUpCircle size={15} /> HUTANG — Kas Akan Keluar</div>
          <div className="text-2xl font-extrabold text-red-600">{fmtRp(net.hutang_outstanding)}</div>
          <div className="text-[11px] text-red-600/80 mt-0.5">Pembelian CPO · jatuh tempo lewat: {fmtRp(net.hutang_overdue)}</div>
        </div>
        <div className={`rounded-2xl p-4 ring-1 ${net.posisi_bersih >= 0 ? 'ring-sky-200 bg-gradient-to-br from-sky-50 to-white' : 'ring-amber-200 bg-gradient-to-br from-amber-50 to-white'}`}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-1"><Scale size={15} /> POSISI BERSIH</div>
          <div className={`text-2xl font-extrabold ${net.posisi_bersih >= 0 ? 'text-sky-700' : 'text-amber-600'}`}>{net.posisi_bersih >= 0 ? '+' : ''}{fmtRp(net.posisi_bersih)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{net.posisi_bersih >= 0 ? 'Surplus — piutang melebihi hutang' : 'Defisit — hutang melebihi piutang, siapkan kas'}</div>
        </div>
      </div>

      <AiPanel endpoint="/insight/ai-payment" title="AI Cashflow Insight" subtitle="Risiko likuiditas · overdue · prediksi keterlambatan" />

      {/* Tab Piutang / Hutang */}
      <div className="flex gap-2">
        <button onClick={() => setTab('piutang')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'piutang' ? 'bg-emerald-600 text-white shadow' : 'bg-white ring-1 ring-slate-200 text-slate-500'}`}>
          <ArrowDownCircle size={15} /> Piutang — Penjualan ({data.piutang.summary.total_kontrak})
        </button>
        <button onClick={() => setTab('hutang')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === 'hutang' ? 'bg-red-600 text-white shadow' : 'bg-white ring-1 ring-slate-200 text-slate-500'}`}>
          <ArrowUpCircle size={15} /> Hutang — Pembelian CPO ({data.hutang.summary.total_kontrak})
        </button>
      </div>

      <AgingSection data={active} tone={tab} onPay={setPayFor} />

      {payFor && <PaymentForm kontrak={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load() }} />}
    </div>
  )
}

/* Satu sisi aging (piutang atau hutang): KPI + bucket + tabel */
function AgingSection({ data, tone, onPay }) {
  const s = data.summary
  const isPiutang = tone === 'piutang'
  const sisaLabel = isPiutang ? 'Sisa Tertagih' : 'Sisa Terhutang'
  const payLabel = isPiutang ? '+ Terima' : '+ Bayar'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox label="Nilai Kontrak" value={fmtRp(s.total_nilai)} />
        <KpiBox label={isPiutang ? 'Sudah Diterima' : 'Sudah Dibayar'} value={fmtRp(s.total_bayar)} color="green" />
        <KpiBox label="Outstanding" value={fmtRp(s.total_outstanding)} color={s.total_outstanding > 0 ? (isPiutang ? 'emerald' : 'red') : 'green'} />
        <KpiBox label="Lunas" value={`${s.lunas} / ${s.total_kontrak}`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {BUCKETS.map(b => (
          <div key={b.key} className="card">
            <div className="text-xs text-gray-500">{b.label}</div>
            <div className={`text-base font-bold mt-1 ${BUCKET_TXT[b.color]}`}>{fmtRp(s.buckets[b.key])}</div>
          </div>
        ))}
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-bold text-gray-800">{isPiutang ? 'Piutang' : 'Hutang'} Belum Lunas ({data.outstanding.length})</h3>
          <p className="text-xs text-gray-500 mt-0.5">Diurutkan dari paling lama menunggak</p>
        </div>
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0"><tr className="border-b border-gray-200 bg-gray-50">
              {['No. Kontrak', 'Relasi', 'Produk', 'Nilai', isPiutang ? 'Diterima' : 'Dibayar', sisaLabel, '% Bayar', 'Jatuh Tempo', 'Umur', ''].map(h => <th key={h} className="table-header">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.outstanding.length === 0 && <tr><td colSpan={10} className="text-center text-green-600 py-8">✓ Semua lunas</td></tr>}
              {data.outstanding.map(r => (
                <tr key={r.no_kontrak} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell font-mono text-xs">{r.no_kontrak}</td>
                  <td className="table-cell text-xs">{r.relasi_nama}</td>
                  <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                  <td className="table-cell font-mono text-xs">{fmtRp(r.nilai_kontrak)}</td>
                  <td className="table-cell font-mono text-xs text-green-600">{fmtRp(r.dibayar)}</td>
                  <td className={`table-cell font-mono text-xs font-bold ${isPiutang ? 'text-emerald-600' : 'text-red-600'}`}>{fmtRp(r.sisa)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${r.pct_bayar}%` }} /></div>
                      <span className="text-[10px] text-gray-500">{r.pct_bayar}%</span>
                    </div>
                  </td>
                  <td className="table-cell text-xs text-gray-500">{r.jatuh_tempo || '–'}</td>
                  <td className="table-cell">{r.umur_hari > 0 ? <span className={`font-bold ${r.umur_hari > 90 ? 'text-red-600' : r.umur_hari > 30 ? 'text-orange-500' : 'text-yellow-600'}`}>{r.umur_hari} hr</span> : <span className="text-gray-400 text-xs">belum</span>}</td>
                  <td className="table-cell"><button onClick={() => onPay(r)} className={`text-xs font-medium ${isPiutang ? 'text-emerald-600 hover:text-emerald-800' : 'text-red-600 hover:text-red-800'}`}>{payLabel}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PaymentForm({ kontrak, onClose, onSaved }) {
  const [history, setHistory] = useState([])
  const [f, setF] = useState({ tanggal: new Date().toISOString().slice(0, 10), jumlah: '', metode: 'Transfer', keterangan: '' })
  const [saving, setSaving] = useState(false)
  function loadHist() { api.get(`/payment/kontrak/${encodeURIComponent(kontrak.no_kontrak)}`).then(r => setHistory(r.data)) }
  useEffect(() => { loadHist() }, [])
  async function save() {
    if (!f.jumlah) { alert('Jumlah wajib'); return }
    setSaving(true)
    try { await api.post('/payment', { ...f, no_kontrak: kontrak.no_kontrak }); setF({ ...f, jumlah: '', keterangan: '' }); loadHist(); onSaved() }
    catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">{kontrak.tipe === 'piutang' ? 'Penerimaan' : 'Pembayaran'} — {kontrak.no_kontrak}</h3>
            <p className="text-xs text-gray-400">{kontrak.relasi_nama} · {kontrak.tipe === 'piutang' ? 'sisa tertagih' : 'sisa terhutang'} {fmtRp(kontrak.sisa)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Fld label="Tanggal"><input type="date" value={f.tanggal} onChange={e => setF({ ...f, tanggal: e.target.value })} className="input w-full" /></Fld>
            <Fld label="Jumlah (Rp)"><input type="number" step="any" value={f.jumlah} onChange={e => setF({ ...f, jumlah: e.target.value })} className="input w-full" /></Fld>
            <Fld label="Metode"><select value={f.metode} onChange={e => setF({ ...f, metode: e.target.value })} className="input w-full"><option>Transfer</option><option>Tunai</option><option>Giro</option><option>Lainnya</option></select></Fld>
            <Fld label="Keterangan"><input value={f.keterangan} onChange={e => setF({ ...f, keterangan: e.target.value })} className="input w-full" /></Fld>
          </div>
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 mb-4"><Save size={15} /> {saving ? '...' : 'Catat Pembayaran'}</button>

          <h4 className="text-xs font-bold text-gray-600 mb-2">Riwayat ({history.length})</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {history.length === 0 && <div className="text-xs text-gray-400">Belum ada pembayaran</div>}
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs border-b border-gray-50 py-1">
                <span className="text-gray-500">{h.tanggal} · {h.metode}</span>
                <span className="font-mono font-semibold">{fmtRp(h.jumlah)}</span>
                <button onClick={async () => { if (confirm('Hapus?')) { await api.delete(`/payment/${h.id}`); loadHist(); onSaved() } }} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Fld({ label, children }) { return <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div> }
function KpiBox({ label, value, color }) {
  const txt = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-600' : color === 'emerald' ? 'text-emerald-600' : 'text-gray-800'
  return <div className="card"><div className="text-xs text-gray-500">{label}</div><div className={`text-lg font-bold mt-1 ${txt}`}>{value}</div></div>
}
