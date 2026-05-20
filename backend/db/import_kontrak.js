/**
 * Import data kontrak dari sheet "Summary Kontrak"
 * Jalankan: node db/import_kontrak.js
 */
const XLSX = require('xlsx');
const db = require('./database');

const EXCEL_PATH = process.argv[2] ||
  '/Users/ariestotopayung/Library/Mobile Documents/com~apple~CloudDocs/Kantor/_PT WINS Sawit/Produksi/Timbangan/01. Laporan Timbangan_2026FIx.xlsx';

console.log(`\n📂 Membaca: ${EXCEL_PATH}\n`);
const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
const ws = wb.Sheets['Summary Kontrak'];
if (!ws) { console.error('Sheet "Summary Kontrak" tidak ditemukan'); process.exit(1); }
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

// Header di row index 1, data mulai row 2
const dataRows = raw.slice(2).filter(r => r && r[0] && String(r[0]).includes('/'));
console.log(`📊 Ditemukan ${dataRows.length} baris kontrak\n`);

// Map relasi
const relasiMap = {};
db.prepare('SELECT id, nama FROM relasi').all().forEach(r => {
  relasiMap[r.nama.toUpperCase().replace(/[.\s]/g,'')] = r.id;
});

function findRelasi(nama) {
  if (!nama) return null;
  const key = String(nama).toUpperCase().replace(/[.\s]/g, '');
  if (relasiMap[key]) return relasiMap[key];
  for (const [k, id] of Object.entries(relasiMap)) {
    if (k.includes(key) || key.includes(k)) return id;
  }
  return null;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}` : null;
  }
  return null;
}

const insert = db.prepare(`
  INSERT OR REPLACE INTO kontrak (
    no_kontrak, do_number, relasi_id, relasi_nama, produk,
    quantity_kg, harga_satuan, ppn, nilai_kontrak, lokasi_penyerahan,
    tanggal_penyerahan, jatuh_tempo, status_pengiriman,
    dp, jatuh_tempo_dp, arah
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let ok = 0, skip = 0;
const tx = db.transaction(() => {
  for (const r of dataRows) {
    const noKontrak = String(r[0]).trim();
    const relNama = r[2] ? String(r[2]).trim() : null;
    const relId = findRelasi(relNama);

    // PPN field bisa berupa angka (1485 = nilai PPN per Kg) atau persentase
    // Kita normalisasi ke percentage: PPN = harga_satuan * 0.11
    // Tapi data Excel sudah punya kolom PPn (per kg) dan Nilai Kontrak total
    const harga = r[5] || 0;
    const ppnVal = r[6] || 0;
    const ppnPct = harga > 0 ? ppnVal / harga : 0.11;

    insert.run(
      noKontrak,                              // no_kontrak
      r[1] ? String(r[1]).trim() : null,      // do_number
      relId,                                  // relasi_id
      relNama,                                // relasi_nama
      r[3] ? String(r[3]).trim() : null,      // produk
      r[4] || null,                           // quantity_kg
      harga || null,                          // harga_satuan
      ppnPct,                                 // ppn (sebagai persen)
      r[8] || null,                           // nilai_kontrak
      r[9] ? String(r[9]).trim() : null,      // lokasi_penyerahan
      parseDate(r[10]),                       // tanggal_penyerahan
      parseDate(r[11]),                       // jatuh_tempo
      r[12] ? String(r[12]).trim() : null,    // status_pengiriman
      r[13] || 0,                             // dp
      parseDate(r[14]),                       // jatuh_tempo_dp
      r[22] || 'IN',                          // arah
    );
    ok++;
  }
});

tx();

console.log(`✅ Import selesai!`);
console.log(`   Berhasil: ${ok}`);

// Ringkasan
const summary = db.prepare(`
  SELECT arah, produk, COUNT(*) as jml,
    SUM(quantity_kg) as total_qty,
    SUM(nilai_kontrak) as total_nilai
  FROM kontrak GROUP BY arah, produk
`).all();
console.log('\n📦 Ringkasan kontrak:');
summary.forEach(s => {
  console.log(`   ${s.arah} ${s.produk}: ${s.jml} kontrak | ${(s.total_qty/1000).toFixed(0)} ton | Rp ${(s.total_nilai/1e9).toFixed(2)} M`);
});
console.log();
