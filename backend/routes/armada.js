const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/param', async (req, res) => {
  try { res.json(await db.get('SELECT * FROM oat_param WHERE id = 1')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/param', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { harga_solar, kap_6r, kap_10r, kap_12r,
      kml_muat_6r, kml_muat_10r, kml_muat_12r,
      kml_kosong_6r, kml_kosong_10r, kml_kosong_12r, target_margin } = req.body;
    await db.run(`UPDATE oat_param SET
      harga_solar=$1, kap_6r=$2, kap_10r=$3, kap_12r=$4,
      kml_muat_6r=$5, kml_muat_10r=$6, kml_muat_12r=$7,
      kml_kosong_6r=$8, kml_kosong_10r=$9, kml_kosong_12r=$10,
      target_margin=$11, updated_at=NOW() WHERE id=1`,
      [harga_solar, kap_6r, kap_10r, kap_12r,
        kml_muat_6r, kml_muat_10r, kml_muat_12r,
        kml_kosong_6r, kml_kosong_10r, kml_kosong_12r, target_margin]);
    res.json({ message: 'Parameter OAT diperbarui' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/oat-relasi', async (req, res) => {
  try { res.json(await db.all('SELECT * FROM oat_relasi ORDER BY relasi_nama')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/oat-relasi', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan } = req.body;
    const r = await db.get(`INSERT INTO oat_relasi (relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [relasi_nama, produk, lokasi, jarak_pp || 0, oat_6r || 0, oat_10r || 0, oat_12r || 0, makan_jalan || 0, tol_retribusi || 0, penginapan || 0]);
    res.json({ id: r.id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Kombinasi relasi+produk sudah ada' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/oat-relasi/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r, makan_jalan, tol_retribusi, penginapan } = req.body;
    await db.run(`UPDATE oat_relasi SET
      relasi_nama=$1, produk=$2, lokasi=$3, jarak_pp=$4, oat_6r=$5, oat_10r=$6, oat_12r=$7,
      makan_jalan=$8, tol_retribusi=$9, penginapan=$10 WHERE id=$11`,
      [relasi_nama, produk, lokasi, jarak_pp || 0, oat_6r || 0, oat_10r || 0, oat_12r || 0,
        makan_jalan || 0, tol_retribusi || 0, penginapan || 0, req.params.id]);
    res.json({ message: 'OK' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/oat-relasi/:id', requireRole('admin'), async (req, res) => {
  try {
    await db.run('DELETE FROM oat_relasi WHERE id = $1', [req.params.id]);
    res.json({ message: 'OK' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/efisiensi', async (req, res) => {
  try {
    const { tahun, produk } = req.query;
    let where = ['truck_type IS NOT NULL', "truck_type != ''"];
    let params = []; let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    if (produk && produk !== 'Semua') { where.push(`produk = $${n++}`); params.push(produk); }
    const w = 'WHERE ' + where.join(' AND ');
    const data = await db.all(`
      SELECT truck_type, COUNT(*)::int as trip,
        COALESCE(SUM(berat_netto_wins),0)::bigint as total_netto_kg,
        ROUND(AVG(berat_netto_wins), 0)::int as avg_netto,
        MAX(berat_netto_wins) as maks_netto, MIN(berat_netto_wins) as min_netto,
        COUNT(DISTINCT no_polisi)::int as jml_kendaraan
      FROM timbangan ${w} GROUP BY truck_type ORDER BY truck_type
    `, params);
    data.forEach(d => d.total_netto_kg = Number(d.total_netto_kg));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/analisa-oat', async (req, res) => {
  try {
    const { tahun, bulan, bulan_start, bulan_end, produk, relasi_id, relasi_nama, truck_type } = req.query;
    let where = ['t.truck_type IS NOT NULL', "t.truck_type != ''"];
    let params = []; let n = 1;
    if (tahun) { where.push(`to_char(t.tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    { const bs = (bulan_start && bulan_start !== 'Semua') ? bulan_start : (bulan && bulan !== 'Semua' ? bulan : null);
      const be = (bulan_end && bulan_end !== 'Semua') ? bulan_end : (bulan && bulan !== 'Semua' ? bulan : null);
      if (bs) { where.push(`to_char(t.tanggal_masuk, 'MM') >= $${n++}`); params.push(String(bs).padStart(2,'0')); }
      if (be) { where.push(`to_char(t.tanggal_masuk, 'MM') <= $${n++}`); params.push(String(be).padStart(2,'0')); } }
    if (produk && produk !== 'Semua') { where.push(`t.produk = $${n++}`); params.push(produk); }
    if (truck_type && truck_type !== 'Semua') { where.push(`t.truck_type = $${n++}`); params.push(truck_type); }
    if (relasi_id) { where.push(`t.relasi_id = $${n++}`); params.push(parseInt(relasi_id)); }
    if (relasi_nama) { where.push(`t.relasi_nama ILIKE $${n++}`); params.push(`%${relasi_nama}%`); }
    const w = 'WHERE ' + where.join(' AND ');

    const p = await db.get('SELECT * FROM oat_param WHERE id = 1');

    const rows = await db.all(`
      SELECT t.relasi_nama, t.produk, t.truck_type,
        COUNT(*)::int as trip, COALESCE(SUM(t.berat_netto_wins),0)::bigint as total_netto_kg,
        ROUND(AVG(t.berat_netto_wins), 0)::int as avg_netto,
        o.lokasi, o.jarak_pp, o.oat_6r, o.oat_10r, o.oat_12r,
        o.makan_jalan, o.tol_retribusi, o.penginapan
      FROM timbangan t
      LEFT JOIN oat_relasi o ON UPPER(REPLACE(REPLACE(o.relasi_nama,'.',''),' ','')) = UPPER(REPLACE(REPLACE(t.relasi_nama,'.',''),' ','')) AND o.produk = t.produk
      ${w}
      GROUP BY t.relasi_nama, t.produk, t.truck_type, o.lokasi, o.jarak_pp, o.oat_6r, o.oat_10r, o.oat_12r, o.makan_jalan, o.tol_retribusi, o.penginapan
      ORDER BY t.relasi_nama, t.produk, t.truck_type
    `, params);

    const analisa = rows.map(r => {
      r.total_netto_kg = Number(r.total_netto_kg);
      const jarak = r.jarak_pp || 0;
      let kapasitas, kmlMuat, kmlKosong, oatPerTrip;
      if (r.truck_type === '6 Roda')  { kapasitas = p.kap_6r;  kmlMuat = p.kml_muat_6r;  kmlKosong = p.kml_kosong_6r;  oatPerTrip = r.oat_6r; }
      else if (r.truck_type === '10 Roda') { kapasitas = p.kap_10r; kmlMuat = p.kml_muat_10r; kmlKosong = p.kml_kosong_10r; oatPerTrip = r.oat_10r; }
      else if (r.truck_type === '12 Roda') { kapasitas = p.kap_12r; kmlMuat = p.kml_muat_12r; kmlKosong = p.kml_kosong_12r; oatPerTrip = r.oat_12r; }
      else { kapasitas = 0; kmlMuat = 0; kmlKosong = 0; oatPerTrip = 0; }

      const jarak1way = jarak / 2;
      const liter_muat = kmlMuat > 0 ? jarak1way / kmlMuat : 0;
      const liter_kosong = kmlKosong > 0 ? jarak1way / kmlKosong : 0;
      const liter_per_trip = liter_muat + liter_kosong;
      const biaya_solar = liter_per_trip * p.harga_solar;
      const biaya_lain = (r.makan_jalan||0) + (r.tol_retribusi||0) + (r.penginapan||0);
      const total_biaya_per_trip = biaya_solar + biaya_lain;
      const omzet_per_trip = (r.avg_netto || 0) * oatPerTrip;
      const margin_rp_per_trip = omzet_per_trip - total_biaya_per_trip;
      const margin_pct = omzet_per_trip > 0 ? margin_rp_per_trip / omzet_per_trip : 0;
      const omzet_total = (r.total_netto_kg || 0) * oatPerTrip;
      const biaya_total = total_biaya_per_trip * r.trip;
      const margin_total = omzet_total - biaya_total;

      return { ...r, jarak_pp: jarak, kapasitas, oat_per_kg: oatPerTrip,
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
        margin_total: Math.round(margin_total) };
    });

    const totalTrip = analisa.reduce((s, r) => s + r.trip, 0);
    const totalOmzet = analisa.reduce((s, r) => s + r.omzet_total, 0);
    const totalBiaya = analisa.reduce((s, r) => s + r.biaya_total, 0);
    const totalMargin = analisa.reduce((s, r) => s + r.margin_total, 0);
    const totalLiter = analisa.reduce((s, r) => s + r.total_solar_liter, 0);
    const summary = {
      trip: totalTrip, omzet: totalOmzet, biaya: totalBiaya, margin: totalMargin,
      margin_pct: totalOmzet > 0 ? +(totalMargin / totalOmzet * 100).toFixed(2) : 0,
      total_liter_solar: totalLiter, total_biaya_solar: Math.round(totalLiter * p.harga_solar),
    };
    res.json({ param: p, rows: analisa, summary });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/per-kendaraan', async (req, res) => {
  try {
    const { tahun } = req.query;
    let where = ['no_polisi IS NOT NULL', "no_polisi != ''"];
    let params = []; let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    const w = 'WHERE ' + where.join(' AND ');
    const rows = await db.all(`
      SELECT no_polisi, truck_type, driver, COUNT(*)::int as trip,
        COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg,
        ROUND(AVG(berat_netto_wins), 0)::int as avg_trip,
        MIN(tanggal_masuk) as first_trip, MAX(tanggal_masuk) as last_trip
      FROM timbangan ${w} GROUP BY no_polisi, truck_type, driver ORDER BY netto_kg DESC
    `, params);
    rows.forEach(r => r.netto_kg = Number(r.netto_kg));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
