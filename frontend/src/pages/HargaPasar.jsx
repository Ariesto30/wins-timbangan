import { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { TrendingUp, TrendingDown, RefreshCw, Globe, Wallet, Minus, Download, Plus, X, Save, Trash2, History, Brain, DollarSign } from 'lucide-react'
import api from '../utils/api'

const PRODUK = ['CPO', 'RBDPO', 'Olein', 'Stearin', 'PFAD']
const SUMBER = ['PORAM', 'KPBN/Dumai', 'FCPO', 'MPOB', 'Manual']
const PRODCOLOR = { CPO: '#f59e0b', RBDPO: '#0d9488', Olein: '#16a34a', Stearin: '#7c3aed', PFAD: '#db2777' }
const SERICOLOR = ['#f59e0b', '#0d9488', '#16a34a', '#7c3aed', '#db2777', '#0ea5e9', '#ef4444', '#8b5cf6']
const tt = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }
const fmtN = (v, d = 0) => v == null ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d })
const fmtRp = v => v == null ? '–' : 'Rp ' + Number(v).toLocaleString('id-ID')
const Delta = ({ v, pct }) => {
  if (v == null) return <span className="text-gray-300 text-xs">–</span>
  const up = v > 0, fl = Math.abs(v) < 0.001
  const Icon = fl ? Minus : up ? TrendingUp : TrendingDown
  const c = fl ? 'text-gray-400' : up ? 'text-green-600' : 'text-red-500'
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${c}`}><Icon size={12} />{pct != null ? `${pct > 0 ? '+' : ''}${pct}%` : fmtN(v, 1)}</span>
}

export default function HargaPasar() {
  const [summary, setSummary] = useState(null)
  const [kurs, setKurs] = useState(null)
  const [insight, setInsight] = useState(null)
  const [series, setSeries] = useState([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  // filter
  const [fProduk, setFProduk] = useState(['CPO'])
  const [fSumber, setFSumber] = useState([])
  const [hari, setHari] = useState(90)
  const [mata, setMata] = useState('IDR')

  function loadCore() {
    api.get('/harga/summary').then(r => setSummary(r.data)).catch(e => setMsg(e.response?.data?.error || e.message))
    api.get('/harga/kurs').then(r => setKurs(r.data)).catch(() => {})
    api.get('/harga/insight').then(r => setInsight(r.data)).catch(() => {})
  }
  function loadSeries() {
    api.get('/harga/series', { params: { produk: fProduk.join(','), sumber: fSumber.join(','), hari } }).then(r => setSeries(r.data)).catch(() => setSeries([]))
  }
  useEffect(() => { loadCore() }, [])
  useEffect(() => { loadSeries() }, [fProduk, fSumber, hari])

  async function act(name, fn, okMsg) {
    setBusy(name); setMsg('')
    try { const r = await fn(); setMsg('✓ ' + (okMsg || r?.data?.message || 'Selesai')); loadCore(); loadSeries() }
    catch (e) { setMsg('⚠ ' + (e.response?.data?.error || 'Gagal')) }
    finally { setBusy('') }
  }
  async function exportCsv() {
    setBusy('export')
    try {
      const r = await api.get('/harga/export.csv', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a'); a.href = url; a.download = 'harga_pasar_wins.csv'; a.click(); URL.revokeObjectURL(url)
    } catch (e) { setMsg('⚠ Gagal export') } finally { setBusy('') }
  }
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  // pivot series -> chart rows by date
  const valKey = mata === 'IDR' ? 'harga_idr' : 'harga'
  const chartData = useMemo(() => {
    const byDate = {}; const keys = new Set()
    series.forEach(r => { const k = r.seri; keys.add(k); (byDate[r.tanggal] = byDate[r.tanggal] || { tanggal: r.tanggal })[k] = r[valKey] })
    return { rows: Object.values(byDate).sort((a, b) => a.tanggal.localeCompare(b.tanggal)), keys: [...keys] }
  }, [series, valKey])

  const items = summary?.items || []
  const byProduk = {}; items.forEach(i => (byProduk[i.produk] = byProduk[i.produk] || []).push(i))

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}><TrendingUp size={22} className="text-white" /></div>
          <div>
            <h1 className="page-title">Harga Pasar Komoditas</h1>
            <p className="page-subtitle">CPO · Olein · Stearin · PFAD · RBDPO — multi-sumber, Rupiah & USD</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => act('online', () => api.post('/harga/fetch'))} disabled={!!busy} className="btn-primary flex items-center gap-1.5 text-sm"><Globe size={14} /> {busy === 'online' ? '...' : 'Tarik Harga'}</button>
          <button onClick={() => act('kurs', () => api.post('/harga/kurs/fetch'))} disabled={!!busy} className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold flex items-center gap-1.5"><Wallet size={14} /> {busy === 'kurs' ? '...' : 'Tarik Kurs'}</button>
          <button onClick={exportCsv} disabled={!!busy} className="px-3 py-2 rounded-lg bg-white ring-1 ring-gray-200 text-gray-700 text-sm font-semibold flex items-center gap-1.5 hover:bg-gray-50"><Download size={14} /> CSV</button>
          <button onClick={() => setShowForm(true)} className="px-3 py-2 rounded-lg bg-white ring-1 ring-gray-200 text-gray-700 text-sm font-semibold flex items-center gap-1.5 hover:bg-gray-50"><Plus size={14} /> Input</button>
        </div>
      </div>
      {msg && <div className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{msg}</div>}

      {/* Kurs panel */}
      {kurs && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KursCard label="USD → IDR" v={kurs.terkini.USD} tgl={kurs.tanggal} />
          <KursCard label="MYR → IDR" v={kurs.terkini.MYR} tgl={kurs.tanggal} />
          <div className="card flex items-center justify-between">
            <div><div className="text-[11px] text-gray-400">Nilai Stok @ Pasar</div><div className="text-lg font-extrabold text-green-600">{insight ? 'Rp ' + (insight.total_nilai_idr / 1e9).toFixed(2) + ' M' : '–'}</div></div>
            <DollarSign size={26} className="text-green-200" />
          </div>
          <div className="card flex items-center justify-between">
            <div><div className="text-[11px] text-gray-400">Tampilkan dalam</div>
              <div className="flex gap-1 mt-1">
                {['IDR', 'USD'].map(m => <button key={m} onClick={() => setMata(m)} className={`px-2.5 py-1 rounded-md text-xs font-bold ${mata === m ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{m}</button>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI per produk */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Harga Terkini per Produk</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRODUK.filter(p => byProduk[p]).map(p => (
            <div key={p} className="card">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRODCOLOR[p] }} />
                <span className="font-bold text-gray-800">{p}</span>
              </div>
              <div className="space-y-1.5">
                {byProduk[p].map(i => (
                  <div key={i.sumber} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 text-xs">{i.sumber}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gray-800">{mata === 'IDR' ? fmtRp(i.harga_idr) : `$${fmtN(i.harga)}`}</span>
                      <Delta v={i.d7} pct={i.d7_pct} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter + comparison chart */}
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><History size={15} /> Perbandingan Tren Harga</h3>
          <div className="flex items-center gap-1">
            {[30, 90, 180].map(h => <button key={h} onClick={() => setHari(h)} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${hari === h ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500'}`}>{h}h</button>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-1">
          <span className="text-[11px] text-gray-400 self-center font-semibold mr-1">Produk:</span>
          {PRODUK.map(p => <Chip key={p} on={fProduk.includes(p)} color={PRODCOLOR[p]} onClick={() => toggle(fProduk, setFProduk, p)}>{p}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="text-[11px] text-gray-400 self-center font-semibold mr-1">Sumber:</span>
          {SUMBER.map(s => <Chip key={s} on={fSumber.includes(s)} onClick={() => toggle(fSumber, setFSumber, s)}>{s}</Chip>)}
          {fSumber.length === 0 && <span className="text-[11px] text-gray-400 self-center italic">(semua sumber)</span>}
        </div>
        {chartData.keys.length === 0 ? <div className="text-center text-gray-400 py-12 text-sm">Pilih produk untuk menampilkan tren.</div> : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="tanggal" tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={d => d?.slice(5)} minTickGap={28} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => mata === 'IDR' ? (v / 1e6).toFixed(1) + 'jt' : v} width={48} />
              <Tooltip contentStyle={tt} formatter={v => mata === 'IDR' ? fmtRp(v) : '$' + fmtN(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chartData.keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={SERICOLOR[i % SERICOLOR.length]} strokeWidth={2} dot={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        )}
        <div className="text-[10px] text-gray-400 mt-1">Garis "estimasi" (backfill) ditandai sebagai riwayat perkiraan untuk kedalaman chart — akan tergantikan data nyata harian.</div>
      </div>

      {/* Owner Insight */}
      {insight && insight.insights.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-1"><Brain size={15} className="text-purple-600" /> Owner Decision Insight</h3>
          <p className="text-xs text-gray-400 mb-3">Rekomendasi berdasar tren harga 7 hari × stok tangki saat ini. Nilai stok total: <b>Rp {(insight.total_nilai_idr / 1e9).toFixed(2)} M</b></p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50 text-xs">
                {['Produk', 'Harga', 'Δ 7 hari', 'Stok (MT)', 'Nilai (Rp)', 'Aksi'].map(h => <th key={h} className="px-2.5 py-2 text-left font-semibold text-gray-500">{h}</th>)}
              </tr></thead>
              <tbody>
                {insight.insights.map(i => {
                  const aksiC = i.level === 'naik' ? 'bg-green-100 text-green-700' : i.level === 'turun' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  return (
                    <tr key={i.produk} className="border-b border-gray-50">
                      <td className="px-2.5 py-2 font-semibold text-gray-700">{i.produk}</td>
                      <td className="px-2.5 py-2 font-mono">{mata === 'IDR' ? fmtRp(i.harga_idr) : `$${fmtN(i.harga)}`}</td>
                      <td className="px-2.5 py-2"><Delta v={i.chg7} pct={i.chg7} /></td>
                      <td className="px-2.5 py-2 font-mono">{fmtN(i.stok_mt, 1)}</td>
                      <td className="px-2.5 py-2 font-mono text-gray-600">{(i.nilai_idr / 1e9).toFixed(2)} M</td>
                      <td className="px-2.5 py-2"><div><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${aksiC}`}>{i.aksi}</span><div className="text-[10px] text-gray-400 mt-0.5">{i.alasan}</div></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backfill note */}
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>Kurs sumber: open.er-api · Harga: PORAM/KPBN/FCPO (agropost)</span>
        <button onClick={() => act('backfill', () => api.post('/harga/backfill', { hari: 180 }), 'Riwayat estimasi 180 hari terisi')} disabled={!!busy} className="underline decoration-dotted hover:text-gray-600">{busy === 'backfill' ? 'memproses...' : 'Isi riwayat estimasi 180 hari'}</button>
      </div>

      {showForm && <InputForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadCore(); loadSeries() }} />}
    </div>
  )
}

function KursCard({ label, v, tgl }) {
  return (
    <div className="card">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="text-lg font-extrabold text-sky-700">{v ? 'Rp ' + Number(v).toLocaleString('id-ID') : '–'}</div>
      <div className="text-[10px] text-gray-400">{tgl || 'belum ada kurs'}</div>
    </div>
  )
}
function Chip({ on, color, onClick, children }) {
  return <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`} style={on ? { background: color || '#16a34a' } : {}}>{children}</button>
}

function InputForm({ onClose, onSaved }) {
  const [f, setF] = useState({ tanggal: new Date().toISOString().slice(0, 10), produk: 'CPO', sumber: 'Manual', harga: '', mata_uang: 'USD', basis: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!f.harga) { alert('Harga wajib'); return }
    setSaving(true)
    try { await api.post('/harga', f); onSaved() } catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100"><h3 className="font-bold text-gray-800">Input Harga Manual</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button></div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <Fld label="Tanggal"><input type="date" value={f.tanggal} onChange={e => set('tanggal', e.target.value)} className="input w-full" /></Fld>
          <Fld label="Produk"><select value={f.produk} onChange={e => set('produk', e.target.value)} className="input w-full">{PRODUK.map(p => <option key={p}>{p}</option>)}</select></Fld>
          <Fld label="Sumber"><select value={f.sumber} onChange={e => set('sumber', e.target.value)} className="input w-full">{SUMBER.map(s => <option key={s}>{s}</option>)}</select></Fld>
          <Fld label="Mata Uang"><select value={f.mata_uang} onChange={e => set('mata_uang', e.target.value)} className="input w-full">{['USD', 'MYR', 'IDR'].map(m => <option key={m}>{m}</option>)}</select></Fld>
          <Fld label="Harga"><input type="number" step="any" value={f.harga} onChange={e => set('harga', e.target.value)} className="input w-full" placeholder="1123" /></Fld>
          <Fld label="Basis"><input value={f.basis} onChange={e => set('basis', e.target.value)} className="input w-full" placeholder="FOB" /></Fld>
        </div>
        <div className="px-5 pb-5"><button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button></div>
      </div>
    </div>
  )
}
const Fld = ({ label, children }) => <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div>
