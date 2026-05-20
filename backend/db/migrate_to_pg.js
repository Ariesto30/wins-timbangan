/**
 * Migrasi data dari SQLite (wins_timbangan.db) ke Neon Postgres.
 * Jalankan: node db/migrate_to_pg.js
 */
require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const { pool, initDB } = require('./pg');

const SQLITE_PATH = path.join(__dirname, '..', 'wins_timbangan.db');

(async () => {
  console.log('\n📦 Migrasi SQLite → Neon Postgres\n');

  // 1. Pastikan schema Postgres siap
  console.log('1. Pastikan schema...');
  await initDB();

  // 2. Buka SQLite
  console.log('2. Baca data SQLite...');
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // 3. Migrasi users (skip yang sudah ada karena default seed sudah dibuat)
  const users = sqlite.prepare('SELECT * FROM users WHERE username NOT IN (?,?,?)').all('admin','operator','manajer');
  if (users.length > 0) {
    console.log(`   ${users.length} users custom...`);
    for (const u of users) {
      await pool.query(
        'INSERT INTO users (username, password_hash, nama_lengkap, role, aktif) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (username) DO NOTHING',
        [u.username, u.password_hash, u.nama_lengkap, u.role, u.aktif]
      );
    }
  }

  // 4. Relasi - sync semua (update jika sudah ada)
  const relasi = sqlite.prepare('SELECT * FROM relasi').all();
  console.log(`3. Sync ${relasi.length} relasi...`);
  // Kosongkan relasi default supaya ID match
  await pool.query('DELETE FROM relasi');
  for (const r of relasi) {
    await pool.query(
      'INSERT INTO relasi (id, kode, nama, lokasi, transportir, aktif) VALUES ($1,$2,$3,$4,$5,$6)',
      [r.id, r.kode, r.nama, r.lokasi, r.transportir, r.aktif]
    );
  }
  // Update sequence agar auto-increment lanjut dari ID terbesar
  await pool.query("SELECT setval('relasi_id_seq', (SELECT MAX(id) FROM relasi))");

  // 5. Produk
  const produk = sqlite.prepare('SELECT * FROM produk').all();
  console.log(`4. Sync ${produk.length} produk...`);
  await pool.query('DELETE FROM produk');
  for (const p of produk) {
    await pool.query('INSERT INTO produk (id, kode, nama) VALUES ($1,$2,$3)', [p.id, p.kode, p.nama]);
  }
  await pool.query("SELECT setval('produk_id_seq', (SELECT MAX(id) FROM produk))");

  // 6. OAT param
  const oatP = sqlite.prepare('SELECT * FROM oat_param WHERE id=1').get();
  if (oatP) {
    console.log('5. Sync OAT param...');
    await pool.query(`UPDATE oat_param SET
      harga_solar=$1, kap_6r=$2, kap_10r=$3, kap_12r=$4,
      kml_muat_6r=$5, kml_muat_10r=$6, kml_muat_12r=$7,
      kml_kosong_6r=$8, kml_kosong_10r=$9, kml_kosong_12r=$10, target_margin=$11
      WHERE id=1`,
      [oatP.harga_solar, oatP.kap_6r, oatP.kap_10r, oatP.kap_12r,
        oatP.kml_muat_6r, oatP.kml_muat_10r, oatP.kml_muat_12r,
        oatP.kml_kosong_6r, oatP.kml_kosong_10r, oatP.kml_kosong_12r, oatP.target_margin]);
  }

  // 7. OAT relasi
  const oatR = sqlite.prepare('SELECT * FROM oat_relasi').all();
  console.log(`6. Sync ${oatR.length} oat_relasi...`);
  await pool.query('DELETE FROM oat_relasi');
  for (const r of oatR) {
    await pool.query(
      'INSERT INTO oat_relasi (id, relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [r.id, r.relasi_nama, r.produk, r.lokasi, r.jarak_pp, r.oat_6r, r.oat_10r, r.oat_12r, r.makan_jalan || 0, r.tol_retribusi || 0, r.penginapan || 0]
    );
  }
  await pool.query("SELECT setval('oat_relasi_id_seq', (SELECT MAX(id) FROM oat_relasi))");

  // 8. Kontrak
  const kontrak = sqlite.prepare('SELECT * FROM kontrak').all();
  console.log(`7. Sync ${kontrak.length} kontrak...`);
  await pool.query('DELETE FROM kontrak');
  for (const k of kontrak) {
    await pool.query(`INSERT INTO kontrak (
      id, no_kontrak, do_number, relasi_id, relasi_nama, produk,
      quantity_kg, harga_satuan, ppn, nilai_kontrak, lokasi_penyerahan,
      tanggal_penyerahan, jatuh_tempo, status_pengiriman,
      dp, jatuh_tempo_dp, arah, catatan
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [k.id, k.no_kontrak, k.do_number, k.relasi_id, k.relasi_nama, k.produk,
      k.quantity_kg, k.harga_satuan, k.ppn, k.nilai_kontrak, k.lokasi_penyerahan,
      k.tanggal_penyerahan, k.jatuh_tempo, k.status_pengiriman,
      k.dp, k.jatuh_tempo_dp, k.arah, k.catatan]);
  }
  if (kontrak.length > 0) await pool.query("SELECT setval('kontrak_id_seq', (SELECT MAX(id) FROM kontrak))");

  // 9. Timbangan (batch insert untuk performa)
  const timbangan = sqlite.prepare('SELECT * FROM timbangan').all();
  console.log(`8. Sync ${timbangan.length} timbangan (batch)...`);
  await pool.query('DELETE FROM timbangan');
  const BATCH = 200;
  for (let i = 0; i < timbangan.length; i += BATCH) {
    const batch = timbangan.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let n = 1;
    for (const t of batch) {
      values.push(`($${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++})`);
      params.push(
        t.id, t.no_seri, t.no_seri_relasi, t.no_polisi, t.no_kontrak, t.do_number,
        t.relasi_id, t.relasi_nama, t.produk, t.truck_type,
        t.tanggal_masuk, t.berat_masuk, t.berat_keluar, t.berat_relasi,
        t.jam_masuk, t.jam_keluar, t.penimbang, t.driver,
        t.distance_km, t.transportir, t.lokasi_pengiriman, t.catatan, t.created_by
      );
    }
    await pool.query(`INSERT INTO timbangan (
      id, no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
      relasi_id, relasi_nama, produk, truck_type,
      tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
      jam_masuk, jam_keluar, penimbang, driver,
      distance_km, transportir, lokasi_pengiriman, catatan, created_by
    ) VALUES ${values.join(',')}`, params);
    process.stdout.write(`\r   Progress: ${Math.min(i + BATCH, timbangan.length)}/${timbangan.length}`);
  }
  console.log();
  if (timbangan.length > 0) await pool.query("SELECT setval('timbangan_id_seq', (SELECT MAX(id) FROM timbangan))");

  // 10. Verifikasi
  console.log('\n✅ Migrasi selesai. Verifikasi:');
  const counts = await pool.query(`
    SELECT 'users' as tbl, COUNT(*) FROM users UNION ALL
    SELECT 'relasi', COUNT(*) FROM relasi UNION ALL
    SELECT 'produk', COUNT(*) FROM produk UNION ALL
    SELECT 'kontrak', COUNT(*) FROM kontrak UNION ALL
    SELECT 'timbangan', COUNT(*) FROM timbangan UNION ALL
    SELECT 'oat_relasi', COUNT(*) FROM oat_relasi
  `);
  counts.rows.forEach(r => console.log(`   ${r.tbl}: ${r.count}`));

  const tot = await pool.query('SELECT COUNT(*) c, SUM(berat_netto_wins) n FROM timbangan');
  console.log(`\nTotal Trip: ${tot.rows[0].c} | Total Netto: ${(tot.rows[0].n/1000).toFixed(2)} ton`);

  sqlite.close();
  await pool.end();
  console.log('\n🎉 Selesai!\n');
})().catch(e => { console.error('❌ Error:', e); process.exit(1); });
