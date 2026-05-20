const router = require('express').Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Dashboard KPI summary
router.get('/dashboard', (req, res) => {
  const { tahun, bulan, produk, relasi_id, truck_type, tgl_start, tgl_end } = req.query;
  let where = [];
  let params = [];

  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  if (bulan && bulan !== 'Semua') { where.push("strftime('%m', tanggal_masuk) = ?"); params.push(String(bulan).padStart(2,'0')); }
  if (produk && produk !== 'Semua') { where.push('produk = ?'); params.push(produk); }
  if (relasi_id) { where.push('relasi_id = ?'); params.push(relasi_id); }
  if (truck_type && truck_type !== 'Semua') { where.push('truck_type = ?'); params.push(truck_type); }
  if (tgl_start) { where.push('tanggal_masuk >= ?'); params.push(tgl_start); }
  if (tgl_end) { where.push('tanggal_masuk <= ?'); params.push(tgl_end); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const kpi = db.prepare(`
    SELECT
      COUNT(*) as total_trip,
      SUM(berat_netto_wins) as total_netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_netto_trip,
      MAX(berat_netto_wins) as maks_netto,
      MIN(berat_netto_wins) as min_netto,
      COUNT(DISTINCT no_polisi) as polisi_unik,
      COUNT(DISTINCT relasi_nama) as relasi_unik
    FROM timbangan ${w}
  `).get(...params);

  const byBulan = db.prepare(`
    SELECT
      strftime('%m-%Y', tanggal_masuk) as bulan,
      strftime('%Y-%m', tanggal_masuk) as sort_key,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_trip
    FROM timbangan ${w}
    GROUP BY strftime('%Y-%m', tanggal_masuk)
    ORDER BY sort_key
  `).all(...params);

  const byRelasi = db.prepare(`
    SELECT
      relasi_nama,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_trip
    FROM timbangan ${w}
    GROUP BY relasi_nama
    ORDER BY netto_kg DESC
  `).all(...params);

  const byProduk = db.prepare(`
    SELECT
      produk,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg
    FROM timbangan ${w}
    GROUP BY produk
    ORDER BY netto_kg DESC
  `).all(...params);

  const byTruck = db.prepare(`
    SELECT
      truck_type,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_trip
    FROM timbangan ${w}
    GROUP BY truck_type
    ORDER BY trip DESC
  `).all(...params);

  // Top 5 kendaraan
  const w5 = where.length
    ? 'WHERE ' + [...where, "no_polisi IS NOT NULL", "no_polisi != ''"].join(' AND ')
    : "WHERE no_polisi IS NOT NULL AND no_polisi != ''"
  const top5Kendaraan = db.prepare(`
    SELECT no_polisi, truck_type, COUNT(*) as trip, SUM(berat_netto_wins) as netto_kg
    FROM timbangan ${w5}
    GROUP BY no_polisi ORDER BY netto_kg DESC LIMIT 5
  `).all(...params);

  // Daily netto 30 hari terakhir (berdasarkan filter tahun jika ada)
  const daily30 = db.prepare(`
    SELECT tanggal_masuk as tanggal, COUNT(*) as trip, SUM(berat_netto_wins) as netto_kg
    FROM timbangan ${w}
    GROUP BY tanggal_masuk
    ORDER BY tanggal_masuk DESC
    LIMIT 30
  `).all(...params).reverse();

  // Previous period comparison — ambil total netto satu periode sebelum range saat ini
  // Jika filter per bulan: bandingkan bulan sebelumnya. Jika per tahun: tahun sebelumnya
  let prevNetto = null;
  if (tahun && bulan && bulan !== 'Semua') {
    const prevBulan = db.prepare(`
      SELECT SUM(berat_netto_wins) as netto_kg FROM timbangan
      WHERE strftime('%Y-%m', tanggal_masuk) = strftime('%Y-%m', ?||'-'||?||'-01', '-1 month')
    `).get(tahun, String(bulan).padStart(2,'0'));
    prevNetto = prevBulan?.netto_kg;
  } else if (tahun) {
    const prevTahun = db.prepare(`
      SELECT SUM(berat_netto_wins) as netto_kg FROM timbangan
      WHERE strftime('%Y', tanggal_masuk) = ?
    `).get(String(parseInt(tahun) - 1));
    prevNetto = prevTahun?.netto_kg;
  } else {
    // Bandingkan dengan periode sebelumnya (sama panjang)
    const minMax = db.prepare(`SELECT MIN(tanggal_masuk) as min_tgl, MAX(tanggal_masuk) as max_tgl FROM timbangan ${w}`).get(...params);
    prevNetto = null;
  }

  // Puncak trip harian
  const peakDay = db.prepare(`
    SELECT tanggal_masuk as tanggal, COUNT(*) as trip
    FROM timbangan ${w}
    GROUP BY tanggal_masuk ORDER BY trip DESC LIMIT 1
  `).get(...params);

  // Auto insights
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
  if (peakDay) insights.push({ icon: 'peak', color: 'purple', text: `Puncak ritasi terjadi pada ${peakDay.tanggal} sebanyak ${peakDay.trip} Trip` });

  // Last update
  const lastUpdate = db.prepare(`SELECT MAX(updated_at) as lu, MAX(created_at) as ca FROM timbangan`).get();

  res.json({ kpi, byBulan, byRelasi, byProduk, byTruck, top5Kendaraan, daily30, prevNetto, momPct, insights, lastUpdate });
});

// Laporan per relasi detail
router.get('/relasi', (req, res) => {
  const { tahun, bulan } = req.query;
  let where = [];
  let params = [];
  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  if (bulan) { where.push("strftime('%m', tanggal_masuk) = ?"); params.push(String(bulan).padStart(2,'0')); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const data = db.prepare(`
    SELECT
      relasi_nama,
      produk,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_trip,
      SUM(berat_relasi) as netto_relasi_kg,
      SUM(berat_netto_wins) - SUM(CASE WHEN berat_relasi IS NOT NULL THEN berat_relasi ELSE 0 END) as selisih_total
    FROM timbangan ${w}
    GROUP BY relasi_nama, produk
    ORDER BY netto_kg DESC
  `).all(...params);

  res.json(data);
});

// Analisa selisih timbang dengan toleransi 0.30%
router.get('/selisih', (req, res) => {
  const { tahun, bulan, toleransi = 0.30 } = req.query;
  const tol = parseFloat(toleransi);
  let where = ['berat_relasi IS NOT NULL', 'berat_relasi > 0'];
  let params = [];
  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  if (bulan) { where.push("strftime('%m', tanggal_masuk) = ?"); params.push(String(bulan).padStart(2,'0')); }
  const w = 'WHERE ' + where.join(' AND ');

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN berat_netto_wins > berat_relasi THEN 1 ELSE 0 END) as wins_lebih_berat,
      SUM(CASE WHEN berat_netto_wins < berat_relasi THEN 1 ELSE 0 END) as wins_lebih_ringan,
      SUM(CASE WHEN berat_netto_wins = berat_relasi THEN 1 ELSE 0 END) as sama,
      SUM(berat_netto_wins - berat_relasi) as total_selisih_kg,
      ROUND(AVG(berat_netto_wins - berat_relasi), 1) as avg_selisih_kg,
      SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi <= ? THEN 1 ELSE 0 END) as dalam_toleransi,
      SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi > ? AND ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi <= 1 THEN 1 ELSE 0 END) as luar_toleransi_ringan,
      SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi > 1 THEN 1 ELSE 0 END) as luar_toleransi_berat,
      ROUND(AVG(ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi), 3) as avg_var_pct,
      MAX(ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi) as max_var_pct
    FROM timbangan ${w}
  `).get(tol, tol, ...params);

  const detail = db.prepare(`
    SELECT
      id, no_seri, no_polisi, relasi_nama, produk, tanggal_masuk,
      berat_netto_wins, berat_relasi,
      (berat_netto_wins - berat_relasi) as selisih,
      ROUND((berat_netto_wins - berat_relasi) * 100.0 / berat_relasi, 4) as var_pct
    FROM timbangan ${w}
    ORDER BY ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi DESC
    LIMIT 100
  `).all(...params);

  // Distribusi per relasi
  const perRelasi = db.prepare(`
    SELECT
      relasi_nama,
      COUNT(*) as trip,
      SUM(CASE WHEN ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi <= ? THEN 1 ELSE 0 END) as dalam_toleransi,
      ROUND(AVG(ABS(berat_netto_wins - berat_relasi) * 100.0 / berat_relasi), 3) as avg_var_pct
    FROM timbangan ${w}
    GROUP BY relasi_nama
    ORDER BY avg_var_pct DESC
  `).all(tol, ...params);

  res.json({ summary, detail, perRelasi, toleransi: tol });
});

// Efisiensi armada
router.get('/armada', (req, res) => {
  const { tahun } = req.query;
  let where = [];
  let params = [];
  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const byNoPolisi = db.prepare(`
    SELECT
      no_polisi,
      truck_type,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg,
      ROUND(AVG(berat_netto_wins), 0) as avg_trip,
      MIN(tanggal_masuk) as first_trip,
      MAX(tanggal_masuk) as last_trip
    FROM timbangan ${w}
    WHERE no_polisi IS NOT NULL AND no_polisi != ''
    GROUP BY no_polisi
    ORDER BY netto_kg DESC
  `).all(...params);

  res.json(byNoPolisi);
});

// Trend harian
router.get('/harian', (req, res) => {
  const { tahun, bulan } = req.query;
  let where = [];
  let params = [];
  if (tahun) { where.push("strftime('%Y', tanggal_masuk) = ?"); params.push(tahun); }
  if (bulan) { where.push("strftime('%m', tanggal_masuk) = ?"); params.push(String(bulan).padStart(2,'0')); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const data = db.prepare(`
    SELECT
      tanggal_masuk as tanggal,
      COUNT(*) as trip,
      SUM(berat_netto_wins) as netto_kg
    FROM timbangan ${w}
    GROUP BY tanggal_masuk
    ORDER BY tanggal_masuk
  `).all(...params);

  res.json(data);
});

// Master data
router.get('/master/relasi', (req, res) => {
  res.json(db.prepare('SELECT * FROM relasi WHERE aktif=1 ORDER BY nama').all());
});

router.get('/master/produk', (req, res) => {
  res.json(db.prepare('SELECT * FROM produk ORDER BY kode').all());
});

module.exports = router;
