/**
 * Sinkronkan FULL semua data dari Excel ke database.
 * Target: 1503 trip / 21.004.380 kg, 5 produk (CPO, RBDPL, B-40, BE, RBDPS).
 */
require('dotenv').config();
const XLSX = require('xlsx');
const { all, run, pool } = require('./pg');

function parseDateLocal(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? d.y + '-' + String(d.m).padStart(2,'0') + '-' + String(d.d).padStart(2,'0') : null; }
  return null;
}
function parseTime(v) {
  if (!v) return null;
  if (typeof v === 'string' && v.includes(':')) {
    const d = new Date('1970-01-01 ' + v);
    if (!isNaN(d)) return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    return v.substring(0,5);
  }
  if (typeof v === 'number') { const tm = Math.round(v*24*60); return String(Math.floor(tm/60)%24).padStart(2,'0') + ':' + String(tm%60).padStart(2,'0'); }
  if (v instanceof Date) return String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0');
  return null;
}
function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  return parseInt(String(v).replace(/[^0-9.-]/g,'')) || null;
}

(async () => {
  console.log('\n📦 Full Sync Excel → Postgres\n');

  // 1. Master produk
  console.log('1. Pastikan master produk lengkap (CPO, RBDPL, B-40, BE, PFAD, RBDPS)...');
  for (const k of ['CPO','RBDPL','B-40','BE','PFAD','RBDPS']) {
    await run('INSERT INTO produk (kode, nama) VALUES ($1, $2) ON CONFLICT (kode) DO NOTHING', [k, k]);
  }

  // 2. Bersihkan
  console.log('2. Hapus semua data timbangan...');
  const before = await all('SELECT COUNT(*)::int as c FROM timbangan');
  console.log('   Sebelum:', before[0].c, 'baris');
  await run('DELETE FROM timbangan');
  await run("SELECT setval('timbangan_id_seq', 1)");

  // 3. Baca Excel
  console.log('3. Baca Excel...');
  const wb = XLSX.readFile('/Users/ariestotopayung/Library/Mobile Documents/com~apple~CloudDocs/Kantor/_PT WINS Sawit/Produksi/Timbangan/01. Laporan Timbangan_2026FIx.xlsx', { cellDates: true });
  const ws = wb.Sheets['Database'];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const relasiList = await all('SELECT id, nama FROM relasi');
  const relMap = {};
  relasiList.forEach(r => relMap[r.nama.toUpperCase().replace(/[.\s]/g,'')] = r.id);
  function findRelasi(nama) {
    if (!nama) return null;
    const key = String(nama).toUpperCase().replace(/[.\s]/g,'');
    if (relMap[key]) return relMap[key];
    for (const [k,id] of Object.entries(relMap)) if (k.includes(key) || key.includes(k)) return id;
    return null;
  }

  console.log('4. Import semua data...');
  let ok=0;
  const errored = [];
  const byProduk = {};
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i];
    if (!r || !r[7]) continue;

    const produk = String(r[7]).trim();
    const tgl = parseDateLocal(r[9]);
    const bm = parseNum(r[10]);
    const bk = parseNum(r[11]);

    if (!tgl) { errored.push({row:i+1, reason:'no tgl', produk}); continue; }
    if (!bm || !bk) { errored.push({row:i+1, reason:'no berat', produk, bm, bk}); continue; }

    const relNama = r[6] ? String(r[6]).trim() : null;
    try {
      await run(`INSERT INTO timbangan (
        no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
        relasi_id, relasi_nama, produk, truck_type,
        tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
        jam_masuk, jam_keluar, penimbang, driver,
        distance_km, transportir, lokasi_pengiriman, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`, [
        r[1] ? String(r[1]).trim() : null,
        r[2] ? String(r[2]).trim() : null,
        r[3] ? String(r[3]).trim() : null,
        r[4] ? String(r[4]).trim() : null,
        r[5] ? String(r[5]).trim() : null,
        findRelasi(relNama), relNama, produk,
        r[8] ? String(r[8]).trim() : null,
        tgl, bm, bk, parseNum(r[13]),
        parseTime(r[14]), parseTime(r[15]),
        r[16] ? String(r[16]).trim() : null,
        r[17] ? String(r[17]).trim() : null,
        r[18] ? parseFloat(r[18]) || 0 : 0,
        r[19] ? String(r[19]).trim() : null,
        r[20] ? String(r[20]).trim() : null,
        1
      ]);
      ok++;
      byProduk[produk] = (byProduk[produk]||0) + 1;
    } catch (e) {
      errored.push({row:i+1, reason: 'sql: ' + e.message.substring(0,100), produk});
    }
    if (ok % 200 === 0) process.stdout.write(`\r   Progress: ${ok}...`);
  }

  console.log('\n\n✅ Imported:', ok, '| Errored:', errored.length);
  if (errored.length) {
    console.log('\nError detail (max 20):');
    errored.slice(0,20).forEach(e => console.log(`  Row ${e.row}: ${e.reason} | produk: ${e.produk}`));
  }

  console.log('\n=== HASIL FINAL ===');
  const final = await all('SELECT produk, COUNT(*)::int as trip, SUM(berat_netto_wins)::bigint as netto FROM timbangan GROUP BY produk ORDER BY netto DESC');
  let totT = 0, totN = 0;
  final.forEach(t => {
    const n = Number(t.netto);
    totT += t.trip; totN += n;
    console.log(`  ${t.produk.padEnd(8)}: ${String(t.trip).padStart(4)} trip | ${n.toLocaleString('id-ID').padStart(15)} kg | ${(n/1000).toFixed(2).padStart(10)} ton`);
  });
  console.log('─'.repeat(70));
  console.log(`  TOTAL   : ${String(totT).padStart(4)} trip | ${totN.toLocaleString('id-ID').padStart(15)} kg | ${(totN/1000).toFixed(2).padStart(10)} ton`);
  console.log(`  TARGET  : 1503 trip | 21.004.380 kg | 21.004,38 ton`);
  console.log(`  SELISIH : ${(totT-1503>=0?'+':'') + (totT-1503)} trip | ${(totN-21004380>=0?'+':'') + (totN-21004380).toLocaleString('id-ID')} kg`);

  await pool.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
