const router = require('express').Router();
const db = require('../db/pg');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard', async (req, res) => {
  try {
    const { tahun, bulan, produk, relasi_id, truck_type, tgl_start, tgl_end } = req.query;
    let where = [];
    let params = [];
    let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    if (bulan && bulan !== 'Semua') { where.push(`to_char(tanggal_masuk, 'MM') = $${n++}`); params.push(String(bulan).padStart(2,'0')); }
    if (produk && produk !== 'Semua') { where.push(`produk = $${n++}`); params.push(produk); }
    if (relasi_id) { where.push(`relasi_id = $${n++}`); params.push(parseInt(relasi_id)); }
    if (truck_type && truck_type !== 'Semua') { where.push(`truck_type = $${n++}`); params.push(truck_type); }
    if (tgl_start) { where.push(`tanggal_masuk >= $${n++}`); params.push(tgl_start); }
    if (tgl_end) { where.push(`tanggal_masuk <= $${n++}`); params.push(tgl_end); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const kpi = await db.get(`
      SELECT
        COUNT(*)::int as total_trip,
        COALESCE(SUM(berat_netto_wins), 0)::bigint as total_netto_kg,
        ROUND(AVG(berat_netto_wins), 0)::int as avg_netto_trip,
        MAX(berat_netto_wins) as maks_netto,
        MIN(berat_netto_wins) as min_netto,
        COUNT(DISTINCT no_polisi)::int as polisi_unik,
        COUNT(DISTINCT relasi_nama)::int as relasi_unik
      FROM timbangan ${w}
    `, params);
    kpi.total_netto_kg = Number(kpi.total_netto_kg);

    const byBulan = await db.all(`
      SELECT
        to_char(tanggal_masuk, 'MM-YYYY') as bulan,
        to_char(tanggal_masuk, 'YYYY-MM') as sort_key,
        COUNT(*)::int as trip,
        COALESCE(SUM(berat_netto_wins), 0)::bigint as netto_kg,
        ROUND(AVG(berat_netto_wins), 0)::int as avg_trip
      FROM timbangan ${w}
      GROUP BY to_char(tanggal_masuk, 'MM-YYYY'), to_char(tanggal_masuk, 'YYYY-MM')
      ORDER BY sort_key
    `, params);
    byBulan.forEach(b => b.netto_kg = Number(b.netto_kg));

    const byRelasi = await db.all(`
      SELECT relasi_nama, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg, ROUND(AVG(berat_netto_wins), 0)::int as avg_trip
      FROM timbangan ${w} GROUP BY relasi_nama ORDER BY netto_kg DESC
    `, params);
    byRelasi.forEach(r => r.netto_kg = Number(r.netto_kg));

    const byProduk = await db.all(`
      SELECT produk, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg
      FROM timbangan ${w} GROUP BY produk ORDER BY netto_kg DESC
    `, params);
    byProduk.forEach(p => p.netto_kg = Number(p.netto_kg));

    const byTruck = await db.all(`
      SELECT truck_type, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg, ROUND(AVG(berat_netto_wins),0)::int as avg_trip
      FROM timbangan ${w} GROUP BY truck_type ORDER BY trip DESC
    `, params);
    byTruck.forEach(t => t.netto_kg = Number(t.netto_kg));

    const w5 = where.length
      ? 'WHERE ' + [...where, "no_polisi IS NOT NULL", "no_polisi != ''"].join(' AND ')
      : "WHERE no_polisi IS NOT NULL AND no_polisi != ''";
    const top5Kendaraan = await db.all(`
      SELECT no_polisi, truck_type, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg
      FROM timbangan ${w5} GROUP BY no_polisi, truck_type ORDER BY netto_kg DESC LIMIT 5
    `, params);
    top5Kendaraan.forEach(k => k.netto_kg = Number(k.netto_kg));

    const daily30Raw = await db.all(`
      SELECT tanggal_masuk as tanggal, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg
      FROM timbangan ${w} GROUP BY tanggal_masuk ORDER BY tanggal_masuk DESC LIMIT 30
    `, params);
    const daily30 = daily30Raw.reverse().map(d => ({
      tanggal: d.tanggal instanceof Date ? d.tanggal.toISOString().split('T')[0] : d.tanggal,
      trip: d.trip,
      netto_kg: Number(d.netto_kg)
    }));

    // Previous period comparison
    let prevNetto = null;
    if (tahun && bulan && bulan !== 'Semua') {
      const prev = await db.get(`
        SELECT COALESCE(SUM(berat_netto_wins),0) as netto_kg FROM timbangan
        WHERE to_char(tanggal_masuk, 'YYYY-MM') = to_char((($1 || '-' || $2 || '-01')::date - INTERVAL '1 month'), 'YYYY-MM')
      `, [tahun, String(bulan).padStart(2,'0')]);
      prevNetto = Number(prev?.netto_kg) || 0;
    } else if (tahun) {
      const prev = await db.get(`SELECT COALESCE(SUM(berat_netto_wins),0) as netto_kg FROM timbangan WHERE to_char(tanggal_masuk, 'YYYY') = $1`, [String(parseInt(tahun) - 1)]);
      prevNetto = Number(prev?.netto_kg) || 0;
    }

    const peakDay = await db.get(`
      SELECT tanggal_masuk as tanggal, COUNT(*)::int as trip
      FROM timbangan ${w} GROUP BY tanggal_masuk ORDER BY trip DESC LIMIT 1
    `, params);

    const totalNetto = kpi?.total_netto_kg || 0;
    const topRelasi = byRelasi?.[0];
    const topProduk = byProduk?.[0];
    const pctRelasi = topRelasi && totalNetto > 0 ? ((topRelasi.netto_kg / totalNetto) * 100).toFixed(1) : null;
    const pctProduk = topProduk && totalNetto > 0 ? ((topProduk.netto_kg / totalNetto) * 100).toFixed(1) : null;
    const momPct = prevNetto > 0 ? (((totalNetto - prevNetto) / prevNetto) * 100).toFixed(1) : null;

    const insights = [];
    if (momPct !== null) {
      const naik = parseFloat(momPct) >= 0;
      insights.push({ icon: naik ? 'up' : 'down', color: naik ? 'green' : 'red', text: `Total Netto ${naik ? 'naik' : 'turun'} ${Math.abs(momPct)}% dibanding periode sebelumnya (${((prevNetto||0)/1000).toFixed(0)} Ton)` });
    }
    if (topRelasi && pctRelasi) insights.push({ icon: 'bar', color: 'orange', text: `Relasi terbesar ${topRelasi.relasi_nama} dengan kontribusi ${pctRelasi}%` });
    if (topProduk && pctProduk) insights.push({ icon: 'box', color: 'blue', text: `Produk dominan ${topProduk.produk} dengan kontribusi ${pctProduk}% dari total tonase` });
    if (peakDay) {
      const tgl = peakDay.tanggal instanceof Date ? peakDay.tanggal.toISOString().split('T')[0] : peakDay.tanggal;
      insights.push({ icon: 'peak', color: 'purple', text: `Puncak ritasi terjadi pada ${tgl} sebanyak ${peakDay.trip} Trip` });
    }

    res.json({ kpi, byBulan, byRelasi, byProduk, byTruck, top5Kendaraan, daily30, prevNetto, momPct, insights });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Per relasi detail
router.get('/relasi', async (req, res) => {
  try {
    const { tahun, bulan } = req.query;
    let where = []; let params = []; let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    if (bulan) { where.push(`to_char(tanggal_masuk, 'MM') = $${n++}`); params.push(String(bulan).padStart(2,'0')); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const data = await db.all(`
      SELECT relasi_nama, produk, COUNT(*)::int as trip,
        COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg,
        ROUND(AVG(berat_netto_wins), 0)::int as avg_trip,
        COALESCE(SUM(berat_relasi),0)::bigint as netto_relasi_kg,
        COALESCE(SUM(berat_netto_wins) - SUM(COALESCE(berat_relasi, 0)),0)::bigint as selisih_total
      FROM timbangan ${w} GROUP BY relasi_nama, produk ORDER BY netto_kg DESC
    `, params);
    data.forEach(d => { d.netto_kg = Number(d.netto_kg); d.netto_relasi_kg = Number(d.netto_relasi_kg); d.selisih_total = Number(d.selisih_total); });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Analisa selisih dengan toleransi
router.get('/selisih', async (req, res) => {
  try {
    const { tahun, bulan, toleransi = 0.30 } = req.query;
    const tol = parseFloat(toleransi);
    let where = ['berat_relasi IS NOT NULL', 'berat_relasi > 0'];
    let params = []; let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    if (bulan) { where.push(`to_char(tanggal_masuk, 'MM') = $${n++}`); params.push(String(bulan).padStart(2,'0')); }
    const w = 'WHERE ' + where.join(' AND ');

    const summary = await db.get(`
      SELECT COUNT(*)::int as total,
        SUM(CASE WHEN berat_netto_wins > berat_relasi THEN 1 ELSE 0 END)::int as wins_lebih_berat,
        SUM(CASE WHEN berat_netto_wins < berat_relasi THEN 1 ELSE 0 END)::int as wins_lebih_ringan,
        SUM(CASE WHEN berat_netto_wins = berat_relasi THEN 1 ELSE 0 END)::int as sama,
        COALESCE(SUM(berat_netto_wins - berat_relasi),0)::bigint as total_selisih_kg,
        ROUND(AVG(berat_netto_wins - berat_relasi)::numeric, 1)::float as avg_selisih_kg,
        SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi <= $${n} THEN 1 ELSE 0 END)::int as dalam_toleransi,
        SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi > $${n} AND ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi <= 1 THEN 1 ELSE 0 END)::int as luar_toleransi_ringan,
        SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi > 1 THEN 1 ELSE 0 END)::int as luar_toleransi_berat,
        ROUND(AVG(ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi)::numeric, 3)::float as avg_var_pct,
        MAX(ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi)::float as max_var_pct
      FROM timbangan ${w}
    `, [...params, tol]);
    if (summary) summary.total_selisih_kg = Number(summary.total_selisih_kg);

    const detail = await db.all(`
      SELECT id, no_seri, no_polisi, relasi_nama, produk, tanggal_masuk, berat_netto_wins, berat_relasi,
        (berat_netto_wins - berat_relasi) as selisih,
        ROUND(((berat_netto_wins - berat_relasi) * 100.0 / berat_relasi)::numeric, 4)::float as var_pct
      FROM timbangan ${w}
      ORDER BY ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi DESC LIMIT 100
    `, params);

    const perRelasi = await db.all(`
      SELECT relasi_nama, COUNT(*)::int as trip,
        SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi <= $${n} THEN 1 ELSE 0 END)::int as dalam_toleransi,
        ROUND(AVG(ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi)::numeric, 3)::float as avg_var_pct
      FROM timbangan ${w}
      GROUP BY relasi_nama ORDER BY avg_var_pct DESC
    `, [...params, tol]);
    res.json({ summary, detail, perRelasi, toleransi: tol });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/armada', async (req, res) => {
  try {
    const { tahun } = req.query;
    let where = []; let params = []; let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    const w = where.length
      ? 'WHERE ' + [...where, "no_polisi IS NOT NULL", "no_polisi != ''"].join(' AND ')
      : "WHERE no_polisi IS NOT NULL AND no_polisi != ''";
    const rows = await db.all(`
      SELECT no_polisi, truck_type, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg,
        ROUND(AVG(berat_netto_wins), 0)::int as avg_trip,
        MIN(tanggal_masuk) as first_trip, MAX(tanggal_masuk) as last_trip
      FROM timbangan ${w} GROUP BY no_polisi, truck_type ORDER BY netto_kg DESC
    `, params);
    rows.forEach(r => r.netto_kg = Number(r.netto_kg));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/harian', async (req, res) => {
  try {
    const { tahun, bulan } = req.query;
    let where = []; let params = []; let n = 1;
    if (tahun) { where.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun); }
    if (bulan) { where.push(`to_char(tanggal_masuk, 'MM') = $${n++}`); params.push(String(bulan).padStart(2,'0')); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const data = await db.all(`
      SELECT tanggal_masuk as tanggal, COUNT(*)::int as trip, COALESCE(SUM(berat_netto_wins),0)::bigint as netto_kg
      FROM timbangan ${w} GROUP BY tanggal_masuk ORDER BY tanggal_masuk
    `, params);
    data.forEach(d => { d.netto_kg = Number(d.netto_kg); if (d.tanggal instanceof Date) d.tanggal = d.tanggal.toISOString().split('T')[0]; });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/master/relasi', async (req, res) => {
  res.json(await db.all('SELECT * FROM relasi WHERE aktif=1 ORDER BY nama'));
});
router.get('/master/produk', async (req, res) => {
  res.json(await db.all('SELECT * FROM produk ORDER BY kode'));
});

module.exports = router;
