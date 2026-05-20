const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ─── PARAMETER GLOBAL OAT ─────────────────────────── */
router.get('/param', (req, res) => {
  const p = db.prepare('SELECT * FROM oat_param WHERE id = 1').get();
  res.json(p);
});

router.put('/param', requireRole('admin', 'manajer'), (req, res) => {
  const {
    harga_solar, kap_6r, kap_10r, kap_12r,
    kml_muat_6r, kml_muat_10r, kml_muat_12r,
    kml_kosong_6r, kml_kosong_10r, kml_kosong_12r,
    target_margin
  } = req.body;
  db.prepare(`UPDATE oat_param SET
    harga_solar=?, kap_6r=?, kap_10r=?, kap_12r=?,
    kml_muat_6r=?, kml_muat_10r=?, kml_muat_12r=?,
    kml_kosong_6r=?, kml_kosong_10r=?, kml_kosong_12r=?,
    target_margin=?, updated_at=datetime('now','localtime')
    WHERE id=1`).run(
    harga_solar, kap_6r, kap_10r, kap_12r,
    kml_muat_6r, kml_muat_10r, kml_muat_12r,
    kml_kosong_6r, kml_kosong_10r, kml_kosong_12r,
    target_margin
  );
  res.json({ message: 'Parameter OAT diperbarui' });
});

/* ─── DATA OAT PER RELASI ──────────────────────────── */
router.get('/oat-relasi', (req, res) => {
  const rows = db.prepare('SELECT * FROM oat_relasi ORDER BY relasi_nama').all();
  res.json(rows);
});

router.post('/oat-relasi', requireRole('admin', 'manajer'), (req, res) => {
  const { relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan } = req.body;
  try {
    const r = db.prepare(`INSERT INTO oat_relasi (relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(relasi_nama, produk, lokasi, jarak_pp || 0, oat_6r || 0, oat_10r || 0, oat_12r || 0, makan_jalan || 0, tol_retribusi || 0, penginapan || 0);
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Kombinasi relasi+produk sudah ada' });
  }
});

router.put('/oat-relasi/:id', requireRole('admin', 'manajer'), (req, res) => {
  const { relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan } = req.body;
  db.prepare(`UPDATE oat_relasi SET
    relasi_nama=?, produk=?, lokasi=?, jarak_pp=?, oat_6r=?, oat_10r=?, oat_12r=?,
    makan_jalan=?, tol_retribusi=?, penginapan=?
    WHERE id=?`).run(
    relasi_nama, produk, lokasi, jarak_pp || 0, oat_6r || 0, oat_10r || 0, oat_12r || 0,
    makan_jalan || 0, tol_retribusi || 0, penginapan || 0, req.params.id
  );
  res.json({ message: 'OK' });
});

router.delete('/oat-relasi/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM oat_relasi WHERE id = ?').run(req.params.id);
  res.json({ message: 'OK' });
});

/* ─── ANALISA EFISIENSI PER JENIS TRUCK ──────────── */
router.get('/efisiensi', (req, res) => {
  const { tahun, produk } = req.query;
  let where = ['truck_type IS NOT NULL', "truck_type != ''"];
  let params = [];
  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  if (produk && produk !== 'Semua') { where.push('produk = ?'); params.push(produk); }
  const w = 'WHERE ' + where.join(' AND ');

  const data = db.prepare(`
    SELECT
      truck_type,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as total_netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_netto,
      MAX(berat_netto_wins) as maks_netto,
      MIN(berat_netto_wins) as min_netto,
      COUNT(DISTINCT no_polisi) as jml_kendaraan
    FROM timbangan ${w}
    GROUP BY truck_type
    ORDER BY truck_type
  `).all(...params);

  res.json(data);
});

/* ─── ANALISA OAT PER TRIP (gabung timbangan + OAT param) ─ */
router.get('/analisa-oat', (req, res) => {
  const { tahun, bulan, produk, relasi_id, relasi_nama, truck_type } = req.query;

  let where = ['t.truck_type IS NOT NULL', "t.truck_type != ''"];
  let params = [];
  if (tahun) { where.push("strftime('%Y', t.tanggal_masuk) = ?"); params.push(tahun); }
  if (bulan && bulan !== 'Semua') { where.push("strftime('%m', t.tanggal_masuk) = ?"); params.push(String(bulan).padStart(2,'0')); }
  if (produk && produk !== 'Semua') { where.push('t.produk = ?'); params.push(produk); }
  if (truck_type && truck_type !== 'Semua') { where.push('t.truck_type = ?'); params.push(truck_type); }
  if (relasi_id) { where.push('t.relasi_id = ?'); params.push(relasi_id); }
  if (relasi_nama) { where.push('t.relasi_nama LIKE ?'); params.push(`%${relasi_nama}%`); }
  const w = 'WHERE ' + where.join(' AND ');

  // Parameter
  const p = db.prepare('SELECT * FROM oat_param WHERE id = 1').get();

  // Agregasi per relasi+produk+truck_type
  const rows = db.prepare(`
    SELECT
      t.relasi_nama, t.produk, t.truck_type,
      COUNT(*) as trip,
      SUM(t.berat_netto_wins) as total_netto_kg,
      ROUND(AVG(t.berat_netto_wins), 0) as avg_netto,
      o.lokasi, o.jarak_pp,
      o.oat_6r, o.oat_10r, o.oat_12r,
      o.makan_jalan, o.tol_retribusi, o.penginapan
    FROM timbangan t
    LEFT JOIN oat_relasi o ON UPPER(REPLACE(REPLACE(o.relasi_nama,'.',''),' ','')) = UPPER(REPLACE(REPLACE(t.relasi_nama,'.',''),' ','')) AND o.produk = t.produk
    ${w}
    GROUP BY t.relasi_nama, t.produk, t.truck_type
    ORDER BY t.relasi_nama, t.produk, t.truck_type
  `).all(...params);

  const analisa = rows.map(r => {
    const jarak = r.jarak_pp || 0;
    let kapasitas, kmlMuat, kmlKosong, oatPerTrip;
    if (r.truck_type === '6 Roda')  { kapasitas = p.kap_6r;  kmlMuat = p.kml_muat_6r;  kmlKosong = p.kml_kosong_6r;  oatPerTrip = r.oat_6r; }
    else if (r.truck_type === '10 Roda') { kapasitas = p.kap_10r; kmlMuat = p.kml_muat_10r; kmlKosong = p.kml_kosong_10r; oatPerTrip = r.oat_10r; }
    else if (r.truck_type === '12 Roda') { kapasitas = p.kap_12r; kmlMuat = p.kml_muat_12r; kmlKosong = p.kml_kosong_12r; oatPerTrip = r.oat_12r; }
    else { kapasitas = 0; kmlMuat = 0; kmlKosong = 0; oatPerTrip = 0; }

    // Solar PP = (½ jarak ÷ km/L muat) + (½ jarak ÷ km/L kosong)
    const jarak1way = jarak / 2;
    const liter_muat = kmlMuat > 0 ? jarak1way / kmlMuat : 0;
    const liter_kosong = kmlKosong > 0 ? jarak1way / kmlKosong : 0;
    const liter_per_trip = liter_muat + liter_kosong;
    const biaya_solar = liter_per_trip * p.harga_solar;

    const biaya_lain = (r.makan_jalan||0) + (r.tol_retribusi||0) + (r.penginapan||0);
    const total_biaya_per_trip = biaya_solar + biaya_lain;

    // OAT = tarif Rp per Kg muatan. Omzet per trip = avg_netto × tarif
    const omzet_per_trip = (r.avg_netto || 0) * oatPerTrip;
    const margin_rp_per_trip = omzet_per_trip - total_biaya_per_trip;
    const margin_pct = omzet_per_trip > 0 ? margin_rp_per_trip / omzet_per_trip : 0;

    // Total aktual berdasarkan netto sebenarnya, bukan avg
    const omzet_total = (r.total_netto_kg || 0) * oatPerTrip;
    const biaya_total = total_biaya_per_trip * r.trip;
    const margin_total = omzet_total - biaya_total;

    return {
      ...r,
      jarak_pp: jarak,
      kapasitas,
      oat_per_kg: oatPerTrip,
      liter_per_trip: +liter_per_trip.toFixed(1),
      biaya_solar_per_trip: Math.round(biaya_solar),
      biaya_lain_per_trip: Math.round(biaya_lain),
      total_biaya_per_trip: Math.round(total_biaya_per_trip),
      omzet_per_trip: Math.round(omzet_per_trip),
      margin_rp_per_trip: Math.round(margin_rp_per_trip),
      margin_pct: +(margin_pct*100).toFixed(2),
      total_solar_liter: +(liter_per_trip * r.trip).toFixed(0),
      omzet_total: Math.round(omzet_total),
      biaya_total: Math.round(biaya_total),
      margin_total: Math.round(margin_total),
    };
  });

  // Summary
  const totalTrip = analisa.reduce((s, r) => s + r.trip, 0);
  const totalOmzet = analisa.reduce((s, r) => s + r.omzet_total, 0);
  const totalBiaya = analisa.reduce((s, r) => s + r.biaya_total, 0);
  const totalMargin = analisa.reduce((s, r) => s + r.margin_total, 0);
  const totalLiter = analisa.reduce((s, r) => s + r.total_solar_liter, 0);
  const summary = {
    trip: totalTrip,
    omzet: totalOmzet,
    biaya: totalBiaya,
    margin: totalMargin,
    margin_pct: totalOmzet > 0 ? +(totalMargin / totalOmzet * 100).toFixed(2) : 0,
    total_liter_solar: totalLiter,
    total_biaya_solar: Math.round(totalLiter * p.harga_solar),
  };

  res.json({ param: p, rows: analisa, summary });
});

/* ─── ANALISA PER KENDARAAN ─────────────────────── */
router.get('/per-kendaraan', (req, res) => {
  const { tahun } = req.query;
  let where = ['no_polisi IS NOT NULL', "no_polisi != ''"];
  let params = [];
  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  const w = 'WHERE ' + where.join(' AND ');

  const rows = db.prepare(`
    SELECT
      no_polisi, truck_type, driver,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_trip,
      MIN(tanggal_masuk) as first_trip,
      MAX(tanggal_masuk) as last_trip
    FROM timbangan ${w}
    GROUP BY no_polisi
    ORDER BY netto_kg DESC
  `).all(...params);

  res.json(rows);
});

module.exports = router;
