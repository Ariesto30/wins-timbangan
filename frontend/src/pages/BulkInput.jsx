import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardPaste, Trash2, Plus, Upload, Save, AlertCircle, Check, FileSpreadsheet, Download } from 'lucide-react'
import api from '../utils/api'

/* Kolom mengikuti format Excel "Database" sheet */
const COLUMNS = [
  { key: 'no_seri',          label: 'No. Seri',         w: 90,  type: 'text' },
  { key: 'no_seri_relasi',   label: 'No Seri Relasi',   w: 130, type: 'text' },
  { key: 'no_polisi',        label: 'No. Polisi',       w: 110, type: 'text' },
  { key: 'no_kontrak',       label: 'No Kontrak',       w: 160, type: 'text' },
  { key: 'do_number',        label: 'DO',               w: 110, type: 'text' },
  { key: 'relasi_nama',      label: 'Relasi',           w: 200, type: 'text' },
  { key: 'produk',           label: 'Produk',           w: 80,  type: 'text' },
  { key: 'truck_type',       label: 'Truck',            w: 80,  type: 'text' },
  { key: 'tanggal_masuk',    label: 'Tanggal *',        w: 110, type: 'date' },
  { key: 'berat_masuk',      label: 'B. Masuk *',       w: 90,  type: 'number' },
  { key: 'berat_keluar',     label: 'B. Keluar *',      w: 90,  type: 'number' },
  { key: 'berat_relasi',     label: 'B. Relasi',        w: 90,  type: 'number' },
  { key: 'jam_masuk',        label: 'Jam Masuk',        w: 80,  type: 'time' },
  { key: 'jam_keluar',       label: 'Jam Keluar',       w: 80,  type: 'time' },
  { key: 'penimbang',        label: 'Penimbang',        w: 110, type: 'text' },
  { key: 'driver',           label: 'Driver',           w: 140, type: 'text' },
  { key: 'distance_km',      label: 'Jarak (Km)',       w: 80,  type: 'number' },
  { key: 'transportir',      label: 'Transportir',      w: 120, type: 'text' },
  { key: 'lokasi_pengiriman',label: 'Lokasi',           w: 130, type: 'text' },
]

const emptyRow = () => Object.fromEntries(COLUMNS.map(c => [c.key, '']))

/* Parse berbagai format tanggal:
   - 9-Aug, 9/8/2025, 9/8, 2025-08-09, ISO, Excel serial number, dll */
function parseDateFlex(val, tahun = new Date().getFullYear()) {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  // Excel serial number (numeric, < 100000)
  if (/^\d{1,5}(\.\d+)?$/.test(s)) {
    const n = parseFloat(s)
    if (n > 25000 && n < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30))
      const d = new Date(epoch.getTime() + n * 86400000)
      return d.toISOString().split('T')[0]
    }
  }
  // 9-Aug or 9-Aug-25 or 9/Aug/2025
  const monthMap = { jan:1,feb:2,mar:3,apr:4,may:5,mei:5,jun:6,jul:7,aug:8,agu:8,sep:9,oct:10,okt:10,nov:11,dec:12,des:12 }
  const m1 = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,})[-\/\s]?(\d{2,4})?$/)
  if (m1) {
    const day = parseInt(m1[1])
    const mon = monthMap[m1[2].toLowerCase().substring(0,3)]
    let yr = m1[3] ? parseInt(m1[3]) : tahun
    if (yr < 100) yr += 2000
    if (mon) return `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m2) {
    let yr = parseInt(m2[3])
    if (yr < 100) yr += 2000
    return `${yr}-${String(m2[2]).padStart(2,'0')}-${String(m2[1]).padStart(2,'0')}`
  }
  // dd/mm
  const m3 = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (m3) return `${tahun}-${String(m3[2]).padStart(2,'0')}-${String(m3[1]).padStart(2,'0')}`
  // Fallback Date constructor
  const d = new Date(s)
  if (!isNaN(d)) return d.toISOString().split('T')[0]
  return s
}

/* Parse jam: "1:31:00 PM", "13:31", "13.31" */
function parseTimeFlex(val) {
  if (!val) return ''
  const s = String(val).trim()
  if (/^\d{2}:\d{2}/.test(s)) return s.substring(0,5)
  // 12h format with AM/PM
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
  if (m) {
    let h = parseInt(m[1])
    const min = m[2]
    const ap = m[3]?.toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2,'0')}:${min}`
  }
  // Excel time fraction (0.0 - 1.0)
  if (/^0?\.\d+$/.test(s)) {
    const f = parseFloat(s)
    const totalMin = Math.round(f * 24 * 60)
    const h = Math.floor(totalMin / 60) % 24
    const mi = totalMin % 60
    return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`
  }
  return s
}

function parseNumFlex(val) {
  if (val == null || val === '') return ''
  const s = String(val).replace(/[\s,]/g, '').replace(/[^0-9.-]/g, '')
  return s
}

export default function BulkInput() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([emptyRow()])
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(true)
  const scrollRef = useRef(null)

  function updateCell(i, key, value) {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [key]: value } : row))
  }

  function deleteRow(i) {
    setRows(r => r.filter((_, idx) => idx !== i))
  }

  function addRow() {
    setRows(r => [...r, emptyRow()])
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)
  }

  /* Paste handler — parse data from clipboard (TSV format from Excel) */
  function handlePaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    if (!text) return

    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '')
    if (lines.length === 0) return

    // Detect header row (jika baris pertama berisi label, skip)
    const firstLine = lines[0].toLowerCase()
    const hasHeader = ['tanggal','berat','no.','no ','seri','relasi','produk'].some(k => firstLine.includes(k))
    const dataLines = hasHeader ? lines.slice(1) : lines

    const parsed = dataLines.map(line => {
      const cells = line.split('\t')
      // Map ke kolom — heuristik: jika ada 19+ kolom, asumsi format Excel asli
      // (Jumlah, No.Seri, No SeriRelasi, No.Polisi, No.Kontrak, DO, Relasi, Produk, Truck, Tanggal, Masuk, Keluar, Netto, Relasi, JamMasuk, JamKeluar, Penimbang, Driver, Distance, Transportir, Lokasi)
      const r = emptyRow()
      if (cells.length >= 19) {
        // Format Excel asli (with Jumlah column at start)
        const offset = cells[0] && /^\d+$/.test(cells[0].trim()) && cells.length >= 21 ? 1 : 0
        r.no_seri          = cells[offset+0]?.trim() || ''
        r.no_seri_relasi   = cells[offset+1]?.trim() || ''
        r.no_polisi        = cells[offset+2]?.trim() || ''
        r.no_kontrak       = cells[offset+3]?.trim() || ''
        r.do_number        = cells[offset+4]?.trim() || ''
        r.relasi_nama      = cells[offset+5]?.trim() || ''
        r.produk           = cells[offset+6]?.trim() || ''
        r.truck_type       = cells[offset+7]?.trim() || ''
        r.tanggal_masuk    = parseDateFlex(cells[offset+8]?.trim())
        r.berat_masuk      = parseNumFlex(cells[offset+9])
        r.berat_keluar     = parseNumFlex(cells[offset+10])
        // skip netto (calculated)
        r.berat_relasi     = parseNumFlex(cells[offset+12])
        r.jam_masuk        = parseTimeFlex(cells[offset+13])
        r.jam_keluar       = parseTimeFlex(cells[offset+14])
        r.penimbang        = cells[offset+15]?.trim() || ''
        r.driver           = cells[offset+16]?.trim() || ''
        r.distance_km      = parseNumFlex(cells[offset+17])
        r.transportir      = cells[offset+18]?.trim() || ''
        r.lokasi_pengiriman= cells[offset+19]?.trim() || ''
      } else {
        // Map sesuai urutan kolom di grid
        COLUMNS.forEach((col, idx) => {
          let v = (cells[idx] || '').trim()
          if (col.type === 'date') v = parseDateFlex(v)
          else if (col.type === 'time') v = parseTimeFlex(v)
          else if (col.type === 'number') v = parseNumFlex(v)
          r[col.key] = v
        })
      }
      return r
    })

    // Hilangkan empty rows + tambah ke state
    const validParsed = parsed.filter(r => r.tanggal_masuk || r.berat_masuk || r.berat_keluar || r.relasi_nama)
    if (validParsed.length === 0) {
      setErrors([{ row: 0, error: 'Tidak ada baris valid terdeteksi dari clipboard' }])
      return
    }

    // Replace baris kosong atau append
    setRows(prev => {
      const filtered = prev.filter(r => Object.values(r).some(v => v !== ''))
      return filtered.length === 0 ? validParsed : [...filtered, ...validParsed]
    })
    setErrors([])
    setResult({ pasted: validParsed.length, message: `${validParsed.length} baris ditambahkan dari clipboard` })
  }

  /* Validasi sebelum simpan */
  function validate() {
    const errs = []
    rows.forEach((r, i) => {
      if (Object.values(r).every(v => v === '')) return // Skip empty
      if (!r.tanggal_masuk) errs.push({ row: i + 1, error: 'Tanggal kosong' })
      if (!r.berat_masuk) errs.push({ row: i + 1, error: 'Berat masuk kosong' })
      if (!r.berat_keluar) errs.push({ row: i + 1, error: 'Berat keluar kosong' })
    })
    return errs
  }

  async function save() {
    const errs = validate()
    if (errs.length > 0) { setErrors(errs); return }
    const valid = rows.filter(r => Object.values(r).some(v => v !== ''))
    if (valid.length === 0) { setErrors([{ row: 0, error: 'Tidak ada data untuk disimpan' }]); return }

    setSaving(true)
    try {
      const { data } = await api.post('/timbangan/bulk', { rows: valid })
      setResult({ saved: data.ok, total: data.total, errors: data.errors })
      if (data.ok > 0 && data.errors?.length === 0) {
        setTimeout(() => navigate('/data'), 1500)
      } else if (data.errors?.length > 0) {
        setErrors(data.errors)
      }
    } catch (e) {
      setErrors([{ row: 0, error: e.response?.data?.error || 'Gagal menyimpan' }])
    } finally {
      setSaving(false)
    }
  }

  function clearAll() {
    if (confirm('Hapus semua baris?')) setRows([emptyRow()])
  }

  /* Calculate netto preview */
  function calcNetto(r) {
    const m = parseInt(r.berat_masuk), k = parseInt(r.berat_keluar)
    if (isNaN(m) || isNaN(k)) return null
    return Math.abs(m - k)
  }

  const validCount = rows.filter(r => r.tanggal_masuk && r.berat_masuk && r.berat_keluar).length

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Input Massal (Bulk / Paste Excel)</h1>
          <p className="text-sm text-slate-500">Tempel data dari Excel sesuai format kolom, lalu klik Simpan</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>{rows.length} baris di grid</div>
          <div className="text-primary-400 font-semibold">{validCount} siap simpan</div>
        </div>
      </div>

      {/* Help */}
      {showHelp && (
        <div className="card bg-blue-900/20 border-blue-700/40 relative">
          <button onClick={() => setShowHelp(false)} className="absolute top-3 right-3 text-slate-500 hover:text-white text-xs">tutup ✕</button>
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="text-blue-400 mt-0.5 flex-shrink-0" size={20} />
            <div className="space-y-2 text-sm">
              <p className="text-blue-300 font-semibold">Cara Cepat — Tempel dari Excel:</p>
              <ol className="text-slate-300 text-xs list-decimal pl-4 space-y-1">
                <li>Buka file Excel, blok seluruh baris data (mulai dari kolom <strong>No. Seri</strong> sampai <strong>Lokasi</strong>)</li>
                <li>Tekan <kbd className="px-1.5 py-0.5 bg-wins-dark rounded border border-wins-border text-[10px]">Ctrl+C</kbd> / <kbd className="px-1.5 py-0.5 bg-wins-dark rounded border border-wins-border text-[10px]">Cmd+C</kbd></li>
                <li>Klik di mana saja di area ini, tekan <kbd className="px-1.5 py-0.5 bg-wins-dark rounded border border-wins-border text-[10px]">Ctrl+V</kbd> / <kbd className="px-1.5 py-0.5 bg-wins-dark rounded border border-wins-border text-[10px]">Cmd+V</kbd></li>
                <li>Data akan otomatis terparse — periksa, lalu klik <strong>Simpan Semua</strong></li>
              </ol>
              <p className="text-slate-500 text-xs italic">Kolom wajib: Tanggal, Berat Masuk, Berat Keluar. No. Seri akan auto-generate jika kosong.</p>
            </div>
          </div>
        </div>
      )}

      {/* Result toast */}
      {result?.message && (
        <div className="card bg-green-900/20 border-green-700/40 flex items-center gap-3">
          <Check className="text-green-400" size={18} />
          <span className="text-sm text-green-300">{result.message}</span>
        </div>
      )}
      {result?.saved && (
        <div className="card bg-green-900/20 border-green-700/40 flex items-center gap-3">
          <Check className="text-green-400" size={18} />
          <span className="text-sm text-green-300">{result.saved} dari {result.total} baris berhasil disimpan ke database</span>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="card bg-red-900/20 border-red-700/40">
          <div className="flex items-center gap-2 text-red-400 mb-2 font-semibold text-sm">
            <AlertCircle size={16} /> {errors.length} kesalahan:
          </div>
          <div className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
            {errors.slice(0, 20).map((e, i) => <div key={i}>Baris {e.row}: {e.error}</div>)}
            {errors.length > 20 && <div className="text-slate-500">...dan {errors.length - 20} lainnya</div>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || validCount === 0} className="btn-primary flex items-center gap-2">
          <Save size={15} /> {saving ? 'Menyimpan...' : `Simpan Semua (${validCount})`}
        </button>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2">
          <Plus size={15} /> Tambah Baris
        </button>
        <button onClick={() => document.execCommand('paste')} className="btn-secondary flex items-center gap-2" title="Atau tekan Ctrl+V / Cmd+V di mana saja">
          <ClipboardPaste size={15} /> Paste Manual
        </button>
        <div className="flex-1" />
        <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
          <Trash2 size={13} /> Bersihkan Semua
        </button>
      </div>

      {/* Grid */}
      <div className="card p-0 overflow-hidden">
        <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-380px)]" style={{ maxHeight: '60vh' }}>
          <table className="border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-wins-dark border-b border-wins-border px-2 py-2 text-xs text-slate-400 font-semibold w-10 sticky left-0">#</th>
                {COLUMNS.map(c => (
                  <th key={c.key} className="bg-wins-dark border-b border-wins-border px-2 py-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider text-left" style={{ minWidth: c.w }}>
                    {c.label}
                  </th>
                ))}
                <th className="bg-wins-dark border-b border-wins-border px-2 py-2 text-xs text-slate-400 font-semibold w-20">Netto</th>
                <th className="bg-wins-dark border-b border-wins-border px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const netto = calcNetto(row)
                const hasError = errors.some(e => e.row === i + 1)
                const isEmpty = Object.values(row).every(v => v === '')
                return (
                  <tr key={i} className={`border-b border-wins-border/50 ${hasError ? 'bg-red-900/10' : isEmpty ? '' : 'hover:bg-wins-border/20'}`}>
                    <td className="px-2 py-1 text-xs text-slate-500 text-center sticky left-0 bg-wins-card">{i + 1}</td>
                    {COLUMNS.map(c => (
                      <td key={c.key} className="border-r border-wins-border/30 p-0">
                        <input
                          type={c.type === 'number' ? 'text' : c.type}
                          value={row[c.key]}
                          onChange={e => updateCell(i, c.key, e.target.value)}
                          className="w-full bg-transparent px-2 py-1.5 text-xs text-slate-200 border-0 focus:bg-wins-dark focus:outline-none focus:ring-1 focus:ring-primary-500 focus:ring-inset"
                          style={{ minWidth: c.w }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-xs text-primary-400 font-mono font-semibold text-right">
                      {netto != null ? netto.toLocaleString('id-ID') : '—'}
                    </td>
                    <td className="px-1">
                      <button onClick={() => deleteRow(i)} className="text-slate-500 hover:text-red-400 p-1">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-wins-border bg-wins-dark/50 text-xs text-slate-500 flex items-center justify-between">
          <span>💡 Tekan <kbd className="px-1 bg-wins-card rounded text-[10px]">Ctrl+V</kbd> untuk paste dari Excel</span>
          <span>{validCount} valid · {rows.length - validCount} kosong/invalid</span>
        </div>
      </div>
    </div>
  )
}
