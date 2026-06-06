import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, FlaskConical, Database, Wallet, Scale, Gauge } from 'lucide-react'
import api from '../utils/api'

const SHEET_INFO = [
  { name: 'Lab Harian', icon: FlaskConical, target: 'Quality & Stability', color: 'text-purple-600' },
  { name: 'Mutasi Stok', icon: Database, target: 'Tank Inventory', color: 'text-sky-600' },
  { name: 'Pembayaran', icon: Wallet, target: 'Payment & Aging', color: 'text-green-600' },
  { name: 'Backfill Timbangan', icon: Scale, target: 'Data Timbangan', color: 'text-amber-600' },
  { name: 'Produksi Harian', icon: Gauge, target: 'Produksi Refinery', color: 'text-orange-600' },
]

export default function ImportData() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState(null)
  const inputRef = useRef(null)

  function onPick(e) { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setErr(null) } }

  async function doImport() {
    if (!file) return
    setBusy(true); setErr(null); setResult(null)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file)
      })
      const { data } = await api.post('/import', { base64 })
      setResult(data.result)
    } catch (e) {
      setErr(e.response?.data?.error || e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0F172A,#1E293B)' }}>
          <Upload size={22} className="text-white" />
        </div>
        <div>
          <h1 className="page-title">Import Data Operasional</h1>
          <p className="page-subtitle">Upload file "Form Operasional WINS" yang sudah diisi → otomatis masuk ke modul</p>
        </div>
      </div>

      {/* Info sheet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SHEET_INFO.map(s => {
          const Icon = s.icon
          return (
            <div key={s.name} className="card">
              <Icon size={18} className={s.color} />
              <div className="font-semibold text-sm text-gray-800 mt-1">{s.name}</div>
              <div className="text-[11px] text-gray-400">→ {s.target}</div>
            </div>
          )
        })}
      </div>

      {/* Upload area */}
      <div className="card">
        <div onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl py-10 text-center cursor-pointer hover:border-teal-400 transition-colors">
          <FileSpreadsheet size={36} className="mx-auto text-gray-300 mb-2" />
          {file ? <div className="text-sm font-semibold text-gray-700">{file.name}</div>
            : <div className="text-sm text-gray-500">Klik untuk pilih file Excel (.xlsx)</div>}
          <div className="text-xs text-gray-400 mt-1">Form_Operasional_WINS.xlsx</div>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={onPick} />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={doImport} disabled={!file || busy} className="btn-primary flex items-center gap-2">
            <Upload size={15} /> {busy ? 'Memproses...' : 'Import Sekarang'}
          </button>
          <span className="text-xs text-gray-400">Baris "CONTOH" otomatis dilewati. Stok mutasi dihitung otomatis (opening/closing).</span>
        </div>
      </div>

      {err && <div className="card bg-red-50 border-red-200 flex items-start gap-2"><AlertTriangle size={16} className="text-red-600 mt-0.5" /><div className="text-sm text-red-700">{err}</div></div>}

      {result && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><CheckCircle size={16} className="text-green-600" /> Hasil Import</h3>
          <div className="space-y-2">
            {Object.entries(result).map(([sheet, r]) => (
              <div key={sheet} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className="font-semibold text-sm text-gray-700">{sheet}</span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-green-600 font-semibold flex items-center gap-1"><CheckCircle size={13} /> {r.ok} berhasil</span>
                  {r.error > 0 && <span className="text-orange-600 font-semibold flex items-center gap-1"><AlertTriangle size={13} /> {r.error} gagal</span>}
                </span>
              </div>
            ))}
          </div>
          {Object.values(result).some(r => r.errors?.length) && (
            <div className="mt-3 text-xs text-gray-500">
              <div className="font-semibold mb-1">Contoh error:</div>
              {Object.entries(result).flatMap(([s, r]) => (r.errors || []).map((e, i) => <div key={s + i}>• {s}: {e}</div>))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Buka modul terkait (Quality, Tank, Payment) untuk verifikasi data masuk.</p>
        </div>
      )}
    </div>
  )
}
