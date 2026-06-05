/**
 * Migration: schema audit forensik
 * - produk: tambah arah (IN/OUT) + toleransi_pct + kapasitas overflow tolerance
 * - lokasi: tabel master koordinat geografis (Haversine source)
 * - audit_settings: konfigurasi threshold global (adjustable user)
 *
 * Jalankan: node db/migration_audit.js
 */
require('dotenv').config();
const { pool, run, all, get } = require('./pg');

(async () => {
  console.log('\n🔧 Migration: Schema Audit Forensik\n');

  // 1. Tambah kolom arah dan toleransi_pct ke produk
  console.log('1. Update tabel produk (arah + toleransi_pct)...');
  await run(`ALTER TABLE produk ADD COLUMN IF NOT EXISTS arah TEXT DEFAULT 'IN'`);
  await run(`ALTER TABLE produk ADD COLUMN IF NOT EXISTS toleransi_pct REAL DEFAULT 0.30`);

  // Set arah per produk
  const arahMap = {
    CPO: 'IN', 'B-40': 'IN', BE: 'IN',
    RBDPL: 'OUT', RBDPS: 'OUT', PFAD: 'OUT'
  };
  for (const [kode, arah] of Object.entries(arahMap)) {
    await run(`UPDATE produk SET arah = $1 WHERE kode = $2`, [arah, kode]);
  }
  // Set toleransi default (sesuai user: CPO 0.30, RBDPL 0.30, lainnya NULL = belum diset)
  await run(`UPDATE produk SET toleransi_pct = 0.30 WHERE kode IN ('CPO', 'RBDPL')`);
  await run(`UPDATE produk SET toleransi_pct = NULL WHERE kode NOT IN ('CPO', 'RBDPL')`);

  // 2. Tabel lokasi (koordinat geo)
  console.log('2. Buat tabel lokasi + seed koordinat...');
  await run(`
    CREATE TABLE IF NOT EXISTS lokasi (
      id SERIAL PRIMARY KEY,
      nama TEXT UNIQUE NOT NULL,
      lon REAL NOT NULL,
      lat REAL NOT NULL,
      keterangan TEXT
    );
  `);

  const lokasi = [
    ['Makassar',  119.4221, -5.1477, 'Markas PT WINS / Pelabuhan ekspor'],
    ['Palu',      119.8707, -0.9003, 'Lokasi PT KASMAR MATANO PERSADA'],
    ['Bone Bone', 120.42,   -2.52,   'Lokasi PT MADINRA INTI SAWIT'],
    ['Masamba',   120.331,  -2.553,  'Lokasi PT PERKEBUNAN NUSANTARA'],
    ['Pomala',    121.54,   -4.17,   'Lokasi PT BUKIT JEJER LESTARI'],
    ['Burau',     120.79,   -3.05,   'Lokasi PT WIJAYA NUSANTARA ENERGI'],
    ['Palopo',    120.1962, -2.9962, 'Loc loco PKS PT MIS/PNT'],
    ['Gowa',      119.4467, -5.3192, 'Lokasi CV SCM'],
    ['Torobulu',  122.0,    -4.6,    'Lokasi PT PUP / PT WIN'],
    ['Siumbatu',  120.2,    -2.7,    'Lokasi PT TDJ'],
  ];

  for (const [nama, lon, lat, ket] of lokasi) {
    await run(`
      INSERT INTO lokasi (nama, lon, lat, keterangan) VALUES ($1, $2, $3, $4)
      ON CONFLICT (nama) DO UPDATE SET lon = $2, lat = $3, keterangan = $4
    `, [nama, lon, lat, ket]);
  }

  // 3. Audit settings — konfigurasi threshold (single row id=1)
  console.log('3. Buat tabel audit_settings + seed default...');
  await run(`
    CREATE TABLE IF NOT EXISTS audit_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tare_threshold_perhatian REAL DEFAULT 3.0,
      tare_threshold_alert REAL DEFAULT 5.0,
      tare_threshold_mustahil REAL DEFAULT 10.0,
      jam_ops_start TEXT DEFAULT '05:00',
      jam_ops_end TEXT DEFAULT '22:00',
      off_hours_strict_start TEXT DEFAULT '00:00',
      off_hours_strict_end TEXT DEFAULT '04:59',
      late_trips_threshold INTEGER DEFAULT 5,
      weekend_high_pct REAL DEFAULT 30.0,
      capacity_overflow_pct REAL DEFAULT 5.0,
      kontrak_over_pct REAL DEFAULT 5.0,
      avg_speed_kmh INTEGER DEFAULT 60,
      score_perhatian INTEGER DEFAULT 21,
      score_mencurigakan INTEGER DEFAULT 41,
      score_kritis INTEGER DEFAULT 71,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  const exists = await get(`SELECT id FROM audit_settings WHERE id = 1`);
  if (!exists) {
    await run(`INSERT INTO audit_settings (id) VALUES (1)`);
  }

  // 4. Index untuk audit query performance
  console.log('4. Buat index untuk audit performance...');
  await run(`CREATE INDEX IF NOT EXISTS idx_timbangan_no_polisi_tgl ON timbangan(no_polisi, tanggal_masuk)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_timbangan_netto ON timbangan(berat_netto_wins)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_timbangan_jam_masuk ON timbangan(jam_masuk)`);

  console.log('\n✅ Migration selesai!\n');

  // Verifikasi
  const produk = await all(`SELECT kode, nama, arah, toleransi_pct FROM produk ORDER BY arah, kode`);
  console.log('Master Produk:');
  produk.forEach(p => console.log(`  ${p.kode.padEnd(8)} | arah: ${p.arah.padEnd(3)} | toleransi: ${p.toleransi_pct ?? 'NULL (belum diset)'}`));

  const lok = await all(`SELECT nama, lon, lat FROM lokasi ORDER BY nama`);
  console.log(`\nLokasi (${lok.length}):`);
  lok.forEach(l => console.log(`  ${l.nama.padEnd(12)} | ${l.lon}, ${l.lat}`));

  const set = await get(`SELECT * FROM audit_settings WHERE id = 1`);
  console.log('\nAudit Settings (defaults):');
  Object.entries(set).filter(([k]) => k !== 'id' && k !== 'updated_at').forEach(([k, v]) => console.log(`  ${k.padEnd(25)} = ${v}`));

  await pool.end();
})().catch(e => { console.error('❌', e); process.exit(1); });
