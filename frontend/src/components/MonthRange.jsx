const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/* Filter rentang bulan (Dari – Sampai). Kosong = semua bulan.
   Hanya "Dari" diisi = dari bulan itu s/d Desember.
   Hanya "Sampai" diisi = Januari s/d bulan itu. */
export default function MonthRange({ start, end, onStart, onEnd, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select className="input w-auto" value={start} onChange={e => onStart(e.target.value)} title="Bulan mulai">
        <option value="">Bulan (semua)</option>
        {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <span className="text-gray-400 text-xs font-medium">s/d</span>
      <select className="input w-auto" value={end} onChange={e => onEnd(e.target.value)} title="Bulan akhir">
        <option value="">— akhir —</option>
        {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
    </div>
  )
}
