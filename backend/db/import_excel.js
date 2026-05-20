/**
 * Import data dari file Excel ke database SQLite
 * Jalankan: node db/import_excel.js
 */

const path = require('path');

// Cek apakah xlsx tersedia
let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  console.error('❌ Module xlsx belum terinstall. Jalankan: npm install xlsx');
  process.exit(1);
}

const db = require('./database');

const EXCEL_PATH = process.argv[2] ||
  '/Users/ariestotopayung/Library/Mobile Documents/com~apple~CloudDocs/Kantor/_PT WINS Sawit/Produksi/Timbangan/01. Laporan Timbangan_2026FIx.xlsx';

console.log(`\n📂 Membaca file: ${EXCEL_PATH}\n`);

const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
const ws = wb.Sheets['Database'];
if (!ws) {
  console.error('❌ Sheet "Database" tidak ditemukan di file Excel');
  process.exit(1);
}

// raw:true supaya dapat nilai asli (angka serial Excel untuk tanggal/jam)
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

// Mapping kolom (0-based, tanpa offset kolom A):
// [0]=Jumlah, [1]=No.Seri, [2]=No Seri Relasi, [3]=No.Polisi, [4]=No Kontrak,
// [5]=DO, [6]=Relasi, [7]=Produk, [8]=Truck, [9]=Tanggal Masuk,
// [10]=Berat Masuk, [11]=Berat Keluar, [12]=Berat Netto WINS, [13]=Berat Relasi,
// [14]=Jam Masuk, [15]=Jam Keluar, [16]=Penimbang, [17]=Driver,
// [18]=Distance, [19]=Transportir, [20]=Lokasi

const dataRows = raw.slice(3).filter(r => r[9] && r[10] && r[11]);

console.log(`📊 Ditemukan ${dataRows.length} baris data\n`);

// Buat map relasi
const relasiMap = {};
db.prepare('SELECT id, nama FROM relasi').all().forEach(r => {
  relasiMap[r.nama.toUpperCase().trim()] = r.id;
});

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date number
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  return null;
}

function parseTime(val) {
  if (!val) return null;
  if (typeof val === 'string' && val.includes(':')) {
    // "1:31:00 PM" format
    const d = new Date('1970-01-01 ' + val);
    if (!isNaN(d)) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return val.substring(0, 5);
  }
  if (typeof val === 'number') {
    // Excel time fraction (0.0 to 1.0)
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  return null;
}

function parseNum(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Math.round(val);
  const n = parseInt(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function findRelasi(nama) {
  if (!nama) return null;
  const key = nama.toUpperCase().trim();
  if (relasiMap[key]) return relasiMap[key];
  // Fuzzy: cari yang mengandung nama
  for (const [k, id] of Object.entries(relasiMap)) {
    if (k.includes(key) || key.includes(k)) return id;
  }
  return null;
}

const insert = db.prepare(`
  INSERT OR IGNORE INTO timbangan (
    no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
    relasi_id, relasi_nama, produk, truck_type,
    tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
    jam_masuk, jam_keluar, penimbang, driver,
    distance_km, transportir, lokasi_pengiriman, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

const insertMany = db.transaction((rows) => {
  let ok = 0, skip = 0;
  for (const r of rows) {
    const tanggal = parseDate(r[9]);
    const beratMasuk = parseNum(r[10]);
    const beratKeluar = parseNum(r[11]);

    if (!tanggal || !beratMasuk || !beratKeluar) { skip++; continue; }

    const relNama = r[6] ? String(r[6]).trim() : null;
    const relId = findRelasi(relNama);

    const result = insert.run(
      r[1] ? String(r[1]).trim() : null,       // no_seri
      r[2] ? String(r[2]).trim() : null,       // no_seri_relasi
      r[3] ? String(r[3]).trim() : null,       // no_polisi
      r[4] ? String(r[4]).trim() : null,       // no_kontrak
      r[5] ? String(r[5]).trim() : null,       // do_number
      relId,                                   // relasi_id
      relNama,                                 // relasi_nama
      r[7] ? String(r[7]).trim() : null,       // produk
      r[8] ? String(r[8]).trim() : null,       // truck_type
      tanggal,                                 // tanggal_masuk
      beratMasuk,                              // berat_masuk
      beratKeluar,                             // berat_keluar
      parseNum(r[13]),                         // berat_relasi
      parseTime(r[14]),                        // jam_masuk
      parseTime(r[15]),                        // jam_keluar
      r[16] ? String(r[16]).trim() : null,     // penimbang
      r[17] ? String(r[17]).trim() : null,     // driver
      r[18] ? parseFloat(r[18]) || 0 : 0,     // distance_km
      r[19] ? String(r[19]).trim() : null,     // transportir
      r[20] ? String(r[20]).trim() : null,     // lokasi_pengiriman
    );
    if (result.changes > 0) ok++; else skip++;
  }
  return { ok, skip };
});

const { ok, skip } = insertMany(dataRows);

console.log(`✅ Import selesai!`);
console.log(`   Berhasil diimpor : ${ok} data`);
console.log(`   Dilewati/duplikat: ${skip} data`);
console.log(`   Total di database: ${db.prepare('SELECT COUNT(*) as c FROM timbangan').get().c}\n`);

// Ringkasan per produk
const byProduk = db.prepare("SELECT produk, COUNT(*) as trip, SUM(berat_masuk - berat_keluar) as netto FROM timbangan GROUP BY produk").all();
console.log('📦 Ringkasan per Produk:');
byProduk.forEach(p => console.log(`   ${p.produk || '?'}: ${p.trip} trip | ${(p.netto/1000).toFixed(2)} ton`));
console.log();
