import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardPaste, Trash2, Plus, Upload, Save, AlertCircle, Check, FileSpreadsheet, Download } from 'lucide-react'
import api from '../utils/api'

/* Kolom mengikuti format Excel "Database" sheet
   Urutan grid dioptimasi: kolom paling sering digunakan di kiri,
   Jam Masuk/Keluar diletakkan tepat setelah Tanggal agar mudah ditemukan */
const COLUMNS = [
  { key: 'no_seri',          label: 'No. Seri',         w: 90,  type: 'text' },
  { key: 'no_seri_relasi',   label: 'No Seri Relasi',   w: 130, type: 'text' },
  { key: 'no_polisi',        label: 'No. Polisi',       w: 110, type: 'text' },
  { key: 'tanggal_masuk',    label: 'Tanggal *',        w: 110, type: 'date' },
  { key: 'jam_masuk',        label: 'Jam Masuk',        w: 95,  type: 'time' },
  { key: 'jam_keluar',       label: 'Jam Keluar',       w: 95,  type: 'time' },
  { key: 'berat_masuk',      label: 'B. Masuk *',       w: 90,  type: 'number' },
  { key: 'berat_keluar',     label: 'B. Keluar *',      w: 90,  type: 'number' },
  { key: 'berat_relasi',     label: 'B. Relasi',        w: 90,  type: 'number' },
  { key: 'produk',           label: 'Produk',           w: 80,  type: 'text' },
  { key: 'truck_type',       label: 'Truck',            w: 80,  type: 'text' },
  { key: 'relasi_nama',      label: 'Relasi',           w: 200, type: 'text' },
  { key: 'no_kontrak',       label: 'No Kontrak',       w: 160, type: 'text' },
  { key: 'do_number',        label: 'DO',               w: 110, type: 'text' },
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
  // Format id-ID dengan titik: "16.48.00" atau "16.48" → "16:48"
  const idDot = s.match(/^(\d{1,2})\.(\d{2})(?:\.\d{2})?$/)
  if (idDot) {
    const h = parseInt(idDot[1])
    const mi = idDot[2]
    if (h >= 0 && h <= 23) return `${String(h).padStart(2,'0')}:${mi}`
  }
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
  // Tidak bisa parse — return empty agar tidak salah simpan
  return ''
}

function parseNumFlex(val) {
  if (val == null || val === '') return ''
  // Indonesian/Excel format: "3.900" = 3900 (titik = thousand sep), "3,5" = 3.5 (koma = decimal)
  // Strategy: ganti koma ke titik (decimal), lalu hapus titik thousand-sep
  // - Hanya valid jika punya >1 titik atau 1 titik diikuti 3 digit (thousand sep pattern)
  let s = String(val).trim().replace(/\s/g, '')
  // koma -> titik decimal (jika ada koma, kemungkinan format id-ID dengan decimal)
  if (s.includes(',')) {
    // remove titik thousand-sep, ganti koma ke titik decimal
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    // titik bisa decimal atau thousand. Asumsi weighbridge: integer ribuan
    // Jika titik diikuti 3 digit di akhir, itu thousand sep → hapus
    // Contoh: "3.900" → "3900", "13.540" → "13540", "1.234.567" → "1234567"
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '')
    }
    // Kalau pattern lain (misal "3.9" yang ambigu), biarkan as-is — parseInt akan ambil "3"
  }
  // Buang karakter non-angka kecuali . dan -
  s = s.replace(/[^0-9.-]/g, '')
  return s
}

export default function BulkInput() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([emptyRow()])
  const [errors, setErrors] = useState([])
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(null) // { done, total, batch, totalBatch }
  const [showHelp, setShowHelp] = useState(true)
  const [relasiList, setRelasiList] = useState([])
  const scrollRef = useRef(null)

  // Load daftar relasi (untuk auto-generate no_seri_relasi)
  useEffect(() => {
    api.get('/relasi').then(r => setRelasiList(r.data)).catch(()=>{})
  }, [])

  /* Cari kode relasi berdasarkan nama (fuzzy match) */
  function findKodeRelasi(nama) {
    if (!nama || relasiList.length === 0) return ''
    const key = String(nama).toUpperCase().replace(/[.\s]/g,'')
    for (const r of relasiList) {
      const k = r.nama.toUpperCase().replace(/[.\s]/g,'')
      if (k === key || k.includes(key) || key.includes(k)) return r.kode || ''
    }
    return ''
  }

  /* Auto-generate no_seri_relasi = PRODUK + NO_SERI + KODE */
  function buildNoSeriRelasi(row) {
    if (!row.produk || !row.no_seri || !row.relasi_nama) return ''
    const kode = findKodeRelasi(row.relasi_nama)
    if (!kode) return ''
    return `${row.produk}${row.no_seri}${kode}`.replace(/\s+/g,'')
  }

  function updateCell(i, key, value) {
    setRows(r => r.map((row, idx) => {
      if (idx !== i) return row
      const next = { ...row, [key]: value }
      // Re-generate no_seri_relasi jika user TIDAK manual edit field-nya
      // dan field source-nya berubah (produk, no_seri, relasi_nama)
      if (['produk','no_seri','relasi_nama'].includes(key)) {
        const auto = buildNoSeriRelasi(next)
        if (auto) next.no_seri_relasi = auto
      }
      return next
    }))
  }

  function deleteRow(i) {
    setRows(r => r.filter((_, idx) => idx !== i))
  }

  function addRow() {
    setRows(r => [...r, emptyRow()])
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)
  }

  /* Paste handler — parse data dari clipboard (TSV format dari Excel)
     Pakai useCallback + attach ke document agar nangkap paste dari mana saja */
  const handlePaste = useCallback((e) => {
    // Skip kalau user paste di input single-line yang fokus, dan clipboardnya bukan multi-tab
    // (kalau cuma 1 nilai, biarkan default paste ke cell)
    const text = (e.clipboardData || window.clipboardData).getData('text')
    if (!text) return
    const hasMultiCell = text.includes('\t') || text.includes('\n')
    if (!hasMultiCell) return  // 1 nilai saja, biarkan default

    e.preventDefault()
    e.stopPropagation()

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '')
    if (lines.length === 0) return

    // Detect header row
    const firstLine = lines[0].toLowerCase()
    const hasHeader = ['tanggal','berat','no.','no ','seri','relasi','produk','truck','polisi'].some(k => firstLine.includes(k))
    const dataLines = hasHeader ? lines.slice(1) : lines

    const parsed = dataLines.map(line => {
      const cells = line.split('\t')
      const r = emptyRow()
      if (cells.length >= 19) {
        // Format Excel asli (with Jumlah column kemungkinan di awal)
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
      // Auto-fill no_seri_relasi kalau kosong tapi punya produk+no_seri+relasi
      if (!r.no_seri_relasi && r.produk && r.no_seri && r.relasi_nama) {
        const auto = buildNoSeriRelasi(r)
        if (auto) r.no_seri_relasi = auto
      }
      return r
    })

    const validParsed = parsed.filter(r => r.tanggal_masuk || r.berat_masuk || r.berat_keluar || r.relasi_nama)
    if (validParsed.length === 0) {
      setErrors([{ row: 0, error: 'Tidak ada baris valid terdeteksi dari clipboard. Pastikan format Excel benar (kolom dipisah Tab, baris dipisah Enter).' }])
      return
    }

    setRows(prev => {
      const filtered = prev.filter(r => Object.values(r).some(v => v !== ''))
      return filtered.length === 0 ? validParsed : [...filtered, ...validParsed]
    })
    setErrors([])
    setResult({ pasted: validParsed.length, message: `✓ ${validParsed.length} baris berhasil ditambahkan dari clipboard` })
  }, [relasiList])

  // Attach paste listener di document agar nangkap dari semua input
  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

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

    // Kirim bertahap 300 baris per request — menghindari batas proxy Render.com
    const BATCH_SIZE = 300
    const chunks = []
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      chunks.push(valid.slice(i, i + BATCH_SIZE))
    }

    setSaving(true)
    setSaveProgress({ done: 0, total: valid.length, batch: 0, totalBatch: chunks.length })
    setErrors([])
    setResult(null)

    let totalOk = 0
    const allErrors = []

    try {
      for (let ci = 0; ci < chunks.length; ci++) {
        setSaveProgress({ done: totalOk, total: valid.length, batch: ci + 1, totalBatch: chunks.length })
        const { data } = await api.post('/timbangan/bulk', { rows: chunks[ci] })
        totalOk += data.ok || 0
        if (data.errors?.length) {
          // Offset nomor baris agar sesuai posisi di grid
          data.errors.forEach(e => allErrors.push({ ...e, row: e.row + ci * BATCH_SIZE }))
        }
      }

      setResult({ saved: totalOk, total: valid.length, errors: allErrors })
      if (allErrors.length > 0) setErrors(allErrors)
      if (totalOk > 0) setTimeout(() => navigate('/data'), allErrors.length ? 3000 : 1500)

    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Gagal menyimpan'
      const status = e.response?.status
      const hint = status === 401 || status === 403
        ? 'Sesi login habis — silakan login ulang'
        : status >= 500
        ? `Server error: ${msg}`
        : msg
      setErrors([{ row: 0, error: hint }])
    } finally {
      setSaving(false)
      setSaveProgress(null)
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-800"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">Input Massal (Bulk / Paste Excel)</h1>
          <p className="text-sm text-gray-400">Tempel data dari Excel sesuai format kolom, lalu klik Simpan</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{rows.length} baris di grid</div>
          <div className="text-purple-600 font-semibold">{validCount} siap simpan</div>
        </div>
      </div>

      {/* Help */}
      {showHelp && (
        <div className="card bg-blue-50 border-blue-700/40 relative">
          <button onClick={() => setShowHelp(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-800 text-xs">tutup ✕</button>
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="text-blue-600 mt-0.5 flex-shrink-0" size={20} />
            <div className="space-y-2 text-sm">
              <p className="text-blue-700 font-semibold">Cara Cepat — Tempel dari Excel:</p>
              <ol className="text-gray-700 text-xs list-decimal pl-4 space-y-1">
                <li>Buka file Excel, blok seluruh baris data (mulai dari kolom <strong>No. Seri</strong> sampai <strong>Lokasi</strong>)</li>
                <li>Tekan <kbd className="px-1.5 py-0.5 bg-gray-50 rounded border border-gray-200 text-[10px]">Ctrl+C</kbd> / <kbd className="px-1.5 py-0.5 bg-gray-50 rounded border border-gray-200 text-[10px]">Cmd+C</kbd></li>
                <li>Klik di mana saja di area ini, tekan <kbd className="px-1.5 py-0.5 bg-gray-50 rounded border border-gray-200 text-[10px]">Ctrl+V</kbd> / <kbd className="px-1.5 py-0.5 bg-gray-50 rounded border border-gray-200 text-[10px]">Cmd+V</kbd></li>
                <li>Data akan otomatis terparse — periksa, lalu klik <strong>Simpan Semua</strong></li>
              </ol>
              <p className="text-gray-400 text-xs italic">Kolom wajib: Tanggal, Berat Masuk, Berat Keluar. No. Seri akan auto-generate jika kosong.</p>
              <p className="text-blue-600/80 text-xs">📋 Urutan kolom grid: No. Seri → No Polisi → <strong>Tanggal → Jam Masuk → Jam Keluar</strong> → Berat Masuk → Berat Keluar → … (scroll kanan untuk kolom lainnya)</p>
            </div>
          </div>
        </div>
      )}

      {/* Result toast */}
      {result?.message && (
        <div className="card bg-green-50 border-green-200 flex items-center gap-3">
          <Check className="text-green-600" size={18} />
          <span className="text-sm text-green-700">{result.message}</span>
        </div>
      )}
      {result?.saved && (
        <div className="card bg-green-50 border-green-200 flex items-center gap-3">
          <Check className="text-green-600" size={18} />
          <span className="text-sm text-green-700">{result.saved} dari {result.total} baris berhasil disimpan ke database</span>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600 mb-2 font-semibold text-sm">
            <AlertCircle size={16} /> {errors.length} kesalahan:
          </div>
          <div className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
            {errors.slice(0, 20).map((e, i) => <div key={i}>Baris {e.row}: {e.error}</div>)}
            {errors.length > 20 && <div className="text-gray-400">...dan {errors.length - 20} lainnya</div>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || validCount === 0} className="btn-primary flex items-center gap-2 min-w-[180px] justify-center">
          {saving ? (
            <>
              <svg className="animate-spin flex-shrink-0" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" strokeOpacity={0.3}/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
              {saveProgress
                ? `Batch ${saveProgress.batch}/${saveProgress.totalBatch}…`
                : 'Menyimpan…'}
            </>
          ) : (
            <><Save size={15} /> Simpan Semua ({validCount})</>
          )}
        </button>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2">
          <Plus size={15} /> Tambah Baris
        </button>
        <button onClick={() => document.execCommand('paste')} className="btn-secondary flex items-center gap-2" title="Atau tekan Ctrl+V / Cmd+V di mana saja">
          <ClipboardPaste size={15} /> Paste Manual
        </button>
        <div className="flex-1" />
        <button onClick={clearAll} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1">
          <Trash2 size={13} /> Bersihkan Semua
        </button>
      </div>

      {/* Progress bar saat batch upload */}
      {saving && saveProgress && (
        <div className="card bg-purple-50 border-purple-200 py-3">
          <div className="flex items-center justify-between text-xs text-purple-700 mb-2">
            <span className="font-semibold">Mengunggah data ke server…</span>
            <span>Batch {saveProgress.batch} dari {saveProgress.totalBatch} · {saveProgress.done} baris tersimpan</span>
          </div>
          <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((saveProgress.batch / saveProgress.totalBatch) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="card p-0 overflow-hidden">
        <div ref={scrollRef} className="overflow-auto max-h-[calc(100vh-380px)]" style={{ maxHeight: '60vh' }}>
          <table className="border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-xs text-gray-500 font-semibold w-10 sticky left-0">#</th>
                {COLUMNS.map(c => {
                  const isTime = c.type === 'time'
                  return (
                    <th
                      key={c.key}
                      className={`border-b border-gray-200 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-left ${
                        isTime
                          ? 'bg-purple-50 text-purple-600 border-b-2 border-b-purple-300'
                          : 'bg-gray-50 text-gray-500'
                      }`}
                      style={{ minWidth: c.w }}
                    >
                      {c.label}
                    </th>
                  )
                })}
                <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 text-xs text-gray-500 font-semibold w-20">Netto</th>
                <th className="bg-gray-50 border-b border-gray-200 px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const netto = calcNetto(row)
                const hasError = errors.some(e => e.row === i + 1)
                const isEmpty = Object.values(row).every(v => v === '')
                return (
                  <tr key={i} className={`border-b border-gray-100 ${hasError ? 'bg-red-900/10' : isEmpty ? '' : 'hover:bg-gray-50'}`}>
                    <td className="px-2 py-1 text-xs text-gray-400 text-center sticky left-0 bg-white">{i + 1}</td>
                    {COLUMNS.map(c => {
                      const isTime = c.type === 'time'
                      return (
                        <td key={c.key} className={`border-r p-0 ${isTime ? 'border-r-purple-200 bg-purple-50/30' : 'border-r-gray-100'}`}>
                          <input
                            type={c.type === 'number' ? 'text' : c.type}
                            value={row[c.key]}
                            onChange={e => updateCell(i, c.key, e.target.value)}
                            className={`w-full bg-transparent px-2 py-1.5 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-inset ${
                              isTime
                                ? 'text-purple-700 focus:bg-purple-50 focus:ring-purple-400 placeholder:text-purple-300'
                                : 'text-gray-700 focus:bg-gray-50 focus:ring-purple-500'
                            }`}
                            style={{ minWidth: c.w }}
                            placeholder={isTime ? 'HH:MM' : undefined}
                          />
                        </td>
                      )
                    })}
                    <td className="px-2 py-1 text-xs text-purple-600 font-mono font-semibold text-right">
                      {netto != null ? netto.toLocaleString('id-ID') : '—'}
                    </td>
                    <td className="px-1">
                      <button onClick={() => deleteRow(i)} className="text-gray-400 hover:text-red-600 p-1">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50/50 text-xs text-gray-400 flex items-center justify-between">
          <span>💡 Tekan <kbd className="px-1 bg-white rounded text-[10px]">Ctrl+V</kbd> untuk paste dari Excel &nbsp;·&nbsp; <span className="text-purple-500">■</span> kolom ungu = Jam Masuk &amp; Jam Keluar (scroll kanan jika perlu)</span>
          <span>{validCount} valid · {rows.length - validCount} kosong/invalid</span>
        </div>
      </div>
    </div>
  )
}
