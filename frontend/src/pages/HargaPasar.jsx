import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, TrendingDown, RefreshCw, Plus, X, Save, Trash2, Globe, Wallet, Minus } from 'lucide-react'
import api from '../utils/api'

const PRODUK = ['CPO', 'RBDPO', 'Olein', 'Stearin', 'PFAD']
const SUMBER = ['PORAM', 'KPBN/Dumai', 'FCPO', 'MPOB', 'Manual']
const PRODCOLOR = { CPO: '#f59e0b', RBDPO: '#0d9488', Olein: '#16a34a', Stearin: '#7c3aed', PFAD: '#db2777' }
const tt = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }
const fmtN = (v, d = 2) => v == null ? '–' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function HargaPasar() {
  const [data, setData] = useState(null)
  const [inv, setInv] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [msg, setMsg] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [chartProduk, setChartProduk] = useState('Olein')
  const [history, setHistory] = useState([])

  function load() {
    api.get('/harga').then(r => setData(r.data)).catch(e => setMsg(e.response?.data?.error || e.message))
    api.get('/harga/inventory-value').then(r => setInv(r.data)).catch(() => {})
  }
  useEffect(() => { load() }, [])
  useEffect(() => { api.get('/harga/history', { params: { produk: chartProduk, sumber: 'PORAM', hari: 90 } }).then(r => setHistory(r.data)).catch(() => setHistory([])) }, [chartProduk])

  async function tarikOnline() {
    setFetching(true); setMsg('')
    try { const r = await api.post('/harga/fetch'); setMsg(`✓ ${r.data.message}`); load(); api.get('/harga/history', { params: { produk: chartProduk, sumber: 'PORAM', hari: 90 } }).then(rr => setHistory(rr.data)) }
    catch (e) { setMsg('⚠ ' + (e.response?.data?.error || 'Gagal tarik online')) }
    finally { setFetching(false) }
  }

  const latest = data?.latest || []
  // group per produk
  const byProduk = {}
  latest.forEach(r => { (byProduk[r.produk] = byProduk[r.produk] || []).push(r) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
            <TrendingUp size={22} className="text-white" />
          </div>
          <div>
            <h1 className="page-title">Harga Pasar Komoditas</h1>
            <p className="page-subtitle">CPO · RBDPO · Olein · Stearin · PFAD — PORAM, KPBN/Dumai, FCPO {data?.lastUpdate ? `· update ${data.lastUpdate}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={tarikOnline} disabled={fetching} className="btn-primary flex items-center gap-2">
            <RefreshCw size={15} className={fetching ? 'animate-spin' : ''} /> {fetching ? 'Menarik...' : 'Tarik Harga Online'}
          </button>
          <button onClick={() => setShowForm(true)} className="btn-secondary flex items-center gap-2"><Plus size={15} /> Input Manual</button>
        </div>
      </div>

      {msg && <div className={`card text-sm ${msg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{msg}</div>}

      {!data ? <div className="text-gray-500 py-10 text-center">Memuat...</div> : latest.length === 0 ? (
        <div className="card text-center text-gray-400 py-12">
          Belum ada data harga. Klik <strong>"Tarik Harga Online"</strong> untuk ambil harga terkini dari PORAM/FCPO,
          atau <strong>"Input Manual"</strong>.
        </div>
      ) : (
        <>
          {/* Kartu harga per produk */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRODUK.filter(p => byProduk[p]).map(p => (
              <div key={p} className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-800">{p}</span>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRODCOLOR[p] }} />
                </div>
                <div className="space-y-1.5">
                  {byProduk[p].map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-xs text-gray-500">{r.sumber}<span className="text-gray-300"> · {r.basis}</span></span>
                      <span className="flex items-center gap-2">
                        <span className="font-bold font-mono text-gray-800">{r.mata_uang === 'MYR' ? 'RM' : '$'}{fmtN(r.harga, r.mata_uang === 'MYR' ? 0 : 1)}</span>
                        {r.delta != null && (
                          <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${r.delta > 0 ? 'text-green-600' : r.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {r.delta > 0 ? <TrendingUp size={11} /> : r.delta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                            {r.delta_pct > 0 ? '+' : ''}{r.delta_pct}%
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tren + Nilai Inventory */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-700">Tren Harga (PORAM, 90 hari)</h3>
                <select value={chartProduk} onChange={e => setChartProduk(e.target.value)} className="input w-auto text-xs">
                  {PRODUK.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              {history.length < 2 ? <div className="text-center text-gray-400 py-12 text-sm">Belum cukup data tren. Tarik harga online beberapa hari agar grafik terbentuk.</div> :
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={history.map(h => ({ tgl: h.tanggal?.slice(5), harga: h.harga }))} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="tgl" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={tt} formatter={v => ['$' + fmtN(v, 1), chartProduk]} />
                  <Line type="monotone" dataKey="harga" stroke={PRODCOLOR[chartProduk]} strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>}
            </div>

            {/* Nilai Inventory */}
            <div className="card">
              <h3 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><Wallet size={15} /> Nilai Stok @ Harga Pasar</h3>
              {!inv ? <div className="text-gray-400 text-sm py-4">Memuat...</div> : (
                <>
                  <div className="text-2xl font-extrabold text-green-600">Rp {(inv.total_idr / 1e9).toFixed(2)} M</div>
                  <div className="text-xs text-gray-400 mb-3">≈ ${inv.total_usd.toLocaleString('id-ID')} · kurs {inv.kurs.toLocaleString('id-ID')}</div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {inv.rows.filter(r => r.nilai_usd > 0).map((r, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-500 truncate">{r.nama}</span>
                        <span className="font-mono text-gray-700">Rp {(r.nilai_idr / 1e9).toFixed(2)}M</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">Stok tangki × harga PORAM terkini. Working capital tertahan di tangki.</p>
                </>
              )}
            </div>
          </div>

          {/* Tabel harga lengkap */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Globe size={14} className="text-gray-500" />
              <h3 className="text-sm font-bold text-gray-800">Semua Harga Terkini</h3>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 bg-gray-50">
                {['Produk', 'Sumber', 'Harga', 'Basis', 'Δ Sebelumnya', 'Tanggal', 'Auto', ''].map(h => <th key={h} className="table-header">{h}</th>)}
              </tr></thead>
              <tbody>
                {latest.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="table-cell"><span className="badge-neutral">{r.produk}</span></td>
                    <td className="table-cell text-xs">{r.sumber}</td>
                    <td className="table-cell font-mono font-semibold">{r.mata_uang === 'MYR' ? 'RM' : '$'}{fmtN(r.harga, r.mata_uang === 'MYR' ? 0 : 1)}</td>
                    <td className="table-cell text-xs text-gray-500">{r.basis}</td>
                    <td className="table-cell text-xs">{r.delta != null ? <span className={r.delta > 0 ? 'text-green-600' : r.delta < 0 ? 'text-red-600' : 'text-gray-400'}>{r.delta > 0 ? '+' : ''}{fmtN(r.delta, 1)} ({r.delta_pct}%)</span> : '–'}</td>
                    <td className="table-cell text-xs text-gray-500">{r.tanggal}</td>
                    <td className="table-cell">{r.auto ? <span className="badge-success">online</span> : <span className="badge-neutral">manual</span>}</td>
                    <td className="table-cell"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && <HargaForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function HargaForm({ onClose, onSaved }) {
  const [f, setF] = useState({ tanggal: new Date().toISOString().slice(0, 10), sumber: 'PORAM', produk: 'CPO', harga: '', mata_uang: 'USD', basis: 'FOB' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    if (!f.harga) { alert('Harga wajib'); return }
    setSaving(true)
    try { await api.post('/harga', f); onSaved() } catch (e) { alert(e.response?.data?.error || 'Gagal') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Input Harga Manual</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <Fld label="Tanggal"><input type="date" value={f.tanggal} onChange={e => set('tanggal', e.target.value)} className="input w-full" /></Fld>
          <Fld label="Sumber"><select value={f.sumber} onChange={e => set('sumber', e.target.value)} className="input w-full">{SUMBER.map(s => <option key={s}>{s}</option>)}</select></Fld>
          <Fld label="Produk"><select value={f.produk} onChange={e => set('produk', e.target.value)} className="input w-full">{PRODUK.map(p => <option key={p}>{p}</option>)}</select></Fld>
          <Fld label="Harga"><input type="number" step="any" value={f.harga} onChange={e => set('harga', e.target.value)} className="input w-full" /></Fld>
          <Fld label="Mata Uang"><select value={f.mata_uang} onChange={e => set('mata_uang', e.target.value)} className="input w-full"><option>USD</option><option>MYR</option><option>IDR</option></select></Fld>
          <Fld label="Basis"><input value={f.basis} onChange={e => set('basis', e.target.value)} placeholder="FOB Dumai" className="input w-full" /></Fld>
        </div>
        <div className="px-5 pb-5"><button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2"><Save size={15} /> {saving ? '...' : 'Simpan'}</button></div>
      </div>
    </div>
  )
}
function Fld({ label, children }) { return <div><label className="text-xs text-gray-500 block mb-1">{label}</label>{children}</div> }
