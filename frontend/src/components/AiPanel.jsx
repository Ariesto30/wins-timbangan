import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Send, MessageSquare } from 'lucide-react'
import api from '../utils/api'

const LVL = { tinggi: '#f87171', sedang: '#fbbf24', info: '#60a5fa' }

/* Panel AI insight generik — tarik dari endpoint GET, render gradient navy. */
export default function AiPanel({ endpoint, title = 'AI Insight', subtitle }) {
  const [ai, setAi] = useState(null)
  const [loading, setLoading] = useState(false)
  function load() { setLoading(true); api.get(endpoint).then(r => setAi(r.data)).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [endpoint])
  return (
    <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#0F172A,#312E81)', boxShadow: '0 10px 30px -10px rgba(49,46,129,.5)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Sparkles size={16} className="text-amber-300" /><div><div className="font-bold tracking-tight leading-tight">{title}</div>{subtitle && <div className="text-[10px] text-slate-400">{subtitle}</div>}</div></div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{ai?.source === 'llm' ? 'naratif' : 'ringkasan cepat'}</span>
          <button onClick={load} className="text-slate-300 hover:text-white"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      {!ai ? <div className="text-xs text-slate-400 py-6 text-center">Memuat insight...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {ai.items.map((it, i) => (
            <div key={i} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: LVL[it.level] || '#60a5fa' }} />
                <span className="text-xs font-bold text-slate-100">{it.title}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{it.text}</p>
            </div>
          ))}
        </div>
      )}
      {ai?.note && <p className="text-[10px] text-slate-500 pt-2">{ai.note}</p>}
    </div>
  )
}

/* ─── Panel Insight Audit yang mengikuti tab aktif ─── */
const AUDIT_MAP = {
  score: ['/audit/anomaly-score', 'Anomaly Score'],
  fraudidx: ['/audit/fraud-index', 'Fraud Index'],
  capacity: ['/audit/capacity', 'Vehicle Capacity'],
  truck: ['/audit/truck-fingerprint', 'Truck Fingerprint'],
  pattern: ['/audit/digit-forensic', 'Digit Forensic'],
  scorecard: ['/audit/scorecards', 'Scorecards'],
  duplicate: ['/audit/duplicates', 'Duplicate Detection'],
  time: ['/audit/time-geo', 'Time & Geo'],
  distrib: ['/audit/distribution', 'Distribution'],
  recon: ['/audit/reconciliation', 'Reconciliation'],
}
const NO_FILTER = new Set(['truck', 'recon'])
function trimData(d) {
  if (Array.isArray(d)) return d.slice(0, 8).map(trimData)
  if (d && typeof d === 'object') { const o = {}; for (const k in d) o[k] = trimData(d[k]); return o }
  return d
}

export function AuditInsightPanel({ tab, tahun, bulanStart, bulanEnd }) {
  const [ai, setAi] = useState(null)
  const [loading, setLoading] = useState(false)
  const map = AUDIT_MAP[tab]
  async function load(force) {
    setLoading(true); setAi(null)
    try {
      if (!map) { const r = await api.get('/insight/ai-audit'); setAi(r.data); return }
      const params = NO_FILTER.has(tab) ? {} : { tahun, bulan_start: bulanStart, bulan_end: bulanEnd }
      if (tab === 'distrib') params.dim = 'produk'
      const dataRes = await api.get(map[0], { params })
      const r = await api.post('/insight/ai-narrate' + (force ? '?force=1' : ''), { kind: tab, judul: map[1], data: trimData(dataRes.data) })
      setAi(r.data)
    } catch (e) { setAi({ items: [{ level: 'info', title: 'Insight', text: 'Gagal memuat narasi untuk tab ini.' }] }) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (tab === 'settings' || tab === 'advanced') { setAi(null); return } load(false) }, [tab, tahun, bulanStart, bulanEnd])
  if (tab === 'settings' || tab === 'advanced') return null
  const title = 'Audit Insight' + (map ? ' — ' + map[1] : '')
  return (
    <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#0F172A,#312E81)', boxShadow: '0 10px 30px -10px rgba(49,46,129,.5)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><Sparkles size={16} className="text-amber-300" /><div><div className="font-bold tracking-tight leading-tight">{title}</div><div className="text-[10px] text-slate-400">Narasi forensik tab aktif · indikator, bukan tuduhan</div></div></div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-300">{ai?.source === 'llm' ? 'naratif' : 'ringkasan cepat'}</span>
          <button onClick={() => load(true)} className="text-slate-300 hover:text-white"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>
      {loading ? <div className="text-xs text-slate-400 py-6 text-center">Menganalisa temuan {map ? map[1] : ''}…</div>
        : !ai ? <div className="text-xs text-slate-400 py-6 text-center">—</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {ai.items.map((it, i) => (
              <div key={i} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
                <div className="flex items-center gap-2 mb-0.5"><span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: LVL[it.level] || '#60a5fa' }} /><span className="text-xs font-bold text-slate-100">{it.title}</span></div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{it.text}</p>
              </div>
            ))}
          </div>
        )}
      {ai?.note && <p className="text-[10px] text-slate-500 pt-2">{ai.note}</p>}
    </div>
  )
}

/* Box Tanya WINS — Q&A bebas lintas modul. */
export function AiAsk() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const contoh = ['Produk mana paling berisiko turun mutu?', 'Bagaimana posisi kas saya minggu ini?', 'Tangki mana yang harus segera dikosongkan?']
  async function ask(text) {
    const question = (text ?? q).trim(); if (!question) return
    setQ(question); setLoading(true); setRes(null)
    try { const r = await api.post('/insight/ai-ask', { q: question }); setRes(r.data) }
    catch (e) { setRes({ note: e.response?.data?.error || 'Gagal' }) }
    finally { setLoading(false) }
  }
  return (
    <div className="card">
      <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-2"><MessageSquare size={15} className="text-indigo-600" /> Tanya WINS <span className="text-[10px] font-normal text-gray-400">· menjawab dari data Anda</span></h3>
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Tanya apa saja tentang stok, harga, kas, produksi…" className="input flex-1" />
        <button onClick={() => ask()} disabled={loading} className="btn-primary flex items-center gap-1.5"><Send size={14} /> {loading ? '...' : 'Tanya'}</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {contoh.map(c => <button key={c} onClick={() => ask(c)} className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200">{c}</button>)}
      </div>
      {loading && <div className="text-xs text-gray-400 mt-3">Menganalisa data…</div>}
      {res && (
        <div className="mt-3 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 p-3">
          {res.answer ? <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{res.answer}</div> : <div className="text-xs text-amber-600">{res.note}</div>}
          {res.cost_usd != null && <div className="text-[10px] text-gray-400 mt-2">biaya ${res.cost_usd}</div>}
        </div>
      )}
    </div>
  )
}
