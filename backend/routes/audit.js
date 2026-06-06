const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────────────────────────────────────────────────────────────
   AUDIT FORENSIK — endpoint anti-fraud detection
   Ground truth: pattern internal (statistical baseline + truck fingerprint
   + physical constraints + Benford). Detail per kategori dengan severity score
   ─────────────────────────────────────────────────────────────── */

// Haversine distance (km) antara 2 koordinat
function haversine(lon1, lat1, lon2, lat2) {
  const R = 6371; // earth radius km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildPeriode(req) {
  const { tahun, bulan, bulan_start, bulan_end, tgl_start, tgl_end } = req.query;
  let w = []; let p = []; let n = 1;
  if (tahun) { w.push(`to_char(tanggal_masuk, 'YYYY') = $${n++}`); p.push(tahun); }
  // Rentang bulan (dari–sampai). Fallback ke `bulan` tunggal untuk kompatibilitas lama.
  const bs = (bulan_start && bulan_start !== 'Semua') ? bulan_start : (bulan && bulan !== 'Semua' ? bulan : null);
  const be = (bulan_end && bulan_end !== 'Semua') ? bulan_end : (bulan && bulan !== 'Semua' ? bulan : null);
  if (bs) { w.push(`to_char(tanggal_masuk, 'MM') >= $${n++}`); p.push(String(bs).padStart(2,'0')); }
  if (be) { w.push(`to_char(tanggal_masuk, 'MM') <= $${n++}`); p.push(String(be).padStart(2,'0')); }
  if (tgl_start) { w.push(`tanggal_masuk >= $${n++}`); p.push(tgl_start); }
  if (tgl_end) { w.push(`tanggal_masuk <= $${n++}`); p.push(tgl_end); }
  return { where: w, params: p, nextN: n };
}

/* ─── 1. SETTINGS — get/update threshold ─── */
router.get('/settings', async (req, res) => {
  try {
    const settings = await db.get(`SELECT * FROM audit_settings WHERE id = 1`);
    const produk = await db.all(`SELECT kode, nama, arah, toleransi_pct FROM produk ORDER BY arah, kode`);
    res.json({ settings, produk });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/settings', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const s = req.body.settings;
    await db.run(`UPDATE audit_settings SET
      tare_threshold_perhatian=$1, tare_threshold_alert=$2, tare_threshold_mustahil=$3,
      jam_ops_start=$4, jam_ops_end=$5, off_hours_strict_start=$6, off_hours_strict_end=$7,
      late_trips_threshold=$8, weekend_high_pct=$9, capacity_overflow_pct=$10,
      kontrak_over_pct=$11, avg_speed_kmh=$12,
      score_perhatian=$13, score_mencurigakan=$14, score_kritis=$15,
      updated_at=NOW() WHERE id=1`,
      [s.tare_threshold_perhatian, s.tare_threshold_alert, s.tare_threshold_mustahil,
        s.jam_ops_start, s.jam_ops_end, s.off_hours_strict_start, s.off_hours_strict_end,
        s.late_trips_threshold, s.weekend_high_pct, s.capacity_overflow_pct,
        s.kontrak_over_pct, s.avg_speed_kmh,
        s.score_perhatian, s.score_mencurigakan, s.score_kritis]);
    // Update toleransi per produk
    if (Array.isArray(req.body.produk)) {
      for (const p of req.body.produk) {
        await db.run(`UPDATE produk SET toleransi_pct=$1, arah=$2 WHERE kode=$3`,
          [p.toleransi_pct ?? null, p.arah || 'IN', p.kode]);
      }
    }
    res.json({ message: 'Settings tersimpan' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── 2. ANOMALY SCORE — score komposit per trip ─── */
router.get('/anomaly-score', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const settings = await db.get(`SELECT * FROM audit_settings WHERE id = 1`);
    const oat = await db.get(`SELECT * FROM oat_param WHERE id = 1`);
    const produkMaster = await db.all(`SELECT kode, arah, toleransi_pct FROM produk`);
    const produkMap = {};
    produkMaster.forEach(p => produkMap[p.kode] = p);

    // Ambil semua trip
    const trips = await db.all(`
      SELECT id, no_seri, no_polisi, no_kontrak, do_number, relasi_nama, produk, truck_type,
        tanggal_masuk, berat_masuk, berat_keluar, berat_netto_wins, berat_relasi,
        jam_masuk, jam_keluar, penimbang, driver, lokasi_pengiriman
      FROM timbangan ${w}
      ORDER BY tanggal_masuk DESC, id DESC LIMIT 2000
    `, params);

    // Pre-compute median tare per no_polisi (gunakan SEMUA data, bukan filtered)
    const tareData = await db.all(`
      SELECT no_polisi, produk, berat_masuk, berat_keluar
      FROM timbangan WHERE no_polisi IS NOT NULL AND no_polisi != ''
    `);
    const tarePerTruck = {};  // no_polisi -> [tares]
    tareData.forEach(t => {
      const pInfo = produkMap[t.produk];
      if (!pInfo) return;
      const tare = pInfo.arah === 'IN' ? t.berat_keluar : t.berat_masuk;
      if (!tare || tare < 1000) return; // filter outlier obvious
      if (!tarePerTruck[t.no_polisi]) tarePerTruck[t.no_polisi] = [];
      tarePerTruck[t.no_polisi].push(tare);
    });
    const medianTare = {};
    Object.entries(tarePerTruck).forEach(([k, arr]) => {
      arr.sort((a,b) => a-b);
      medianTare[k] = arr[Math.floor(arr.length / 2)];
    });

    // Group netto by produk untuk cek identik berulang
    const nettoGroups = {};
    tareData.forEach(t => {
      const netto = Math.abs(t.berat_masuk - t.berat_keluar);
      const key = `${t.produk}_${netto}`;
      nettoGroups[key] = (nettoGroups[key] || 0) + 1;
    });

    // Daily trip counter per truck
    const dailyTripCount = {};
    const dailyTrips = await db.all(`
      SELECT no_polisi, tanggal_masuk, COUNT(*)::int as c FROM timbangan
      WHERE no_polisi IS NOT NULL AND no_polisi != ''
      GROUP BY no_polisi, tanggal_masuk
    `);
    dailyTrips.forEach(d => {
      const key = `${d.no_polisi}_${d.tanggal_masuk}`;
      dailyTripCount[key] = d.c;
    });

    // Avg netto for weekend check
    const avgRow = await db.get(`SELECT AVG(berat_netto_wins) as avg FROM timbangan ${w}`, params);
    const avgNetto = Number(avgRow?.avg) || 0;

    // Capacity per truck type
    const cap = {
      '6 Roda':  oat.kap_6r * (1 + settings.capacity_overflow_pct / 100),
      '10 Roda': oat.kap_10r * (1 + settings.capacity_overflow_pct / 100),
      '12 Roda': oat.kap_12r * (1 + settings.capacity_overflow_pct / 100),
    };

    // Score each trip
    const scored = trips.map(t => {
      const pInfo = produkMap[t.produk];
      const arah = pInfo?.arah || 'IN';
      const tareField  = arah === 'IN' ? t.berat_keluar : t.berat_masuk;
      const grossField = arah === 'IN' ? t.berat_masuk  : t.berat_keluar;

      const reasons = [];
      let score = 0;

      // 1. Impossible weight (gross < tare per arah)
      if (grossField <= tareField) {
        score += 50;
        reasons.push({ code: 'IMPOSSIBLE_WEIGHT', label: arah==='IN' ? 'Berat masuk ≤ berat keluar (mustahil untuk produk masuk)' : 'Berat keluar ≤ berat masuk (mustahil untuk produk keluar)', severity: 'critical', points: 50 });
      }

      // 2. Netto = 0
      if (t.berat_netto_wins === 0) {
        score += 50;
        reasons.push({ code: 'NETTO_ZERO', label: 'Netto = 0 (data error atau impossible)', severity: 'critical', points: 50 });
      }

      // 3. Netto > kapasitas truck
      if (t.truck_type && cap[t.truck_type] && t.berat_netto_wins > cap[t.truck_type]) {
        score += 40;
        reasons.push({ code: 'OVERLOAD', label: `Netto ${t.berat_netto_wins.toLocaleString('id-ID')} kg melebihi kapasitas ${t.truck_type} (max ${cap[t.truck_type].toLocaleString('id-ID')} kg)`, severity: 'critical', points: 40 });
      }

      // 4. Tare deviation
      const med = medianTare[t.no_polisi];
      if (med && tareField) {
        const dev = Math.abs((tareField - med) / med) * 100;
        if (dev > settings.tare_threshold_mustahil) {
          score += 50;
          reasons.push({ code: 'TARE_MUSTAHIL', label: `Tare deviasi ${dev.toFixed(1)}% (median ${med.toLocaleString('id-ID')}, aktual ${tareField.toLocaleString('id-ID')})`, severity: 'critical', points: 50 });
        } else if (dev > settings.tare_threshold_alert) {
          score += 25;
          reasons.push({ code: 'TARE_ALERT', label: `Tare deviasi ${dev.toFixed(1)}% di atas threshold alert ${settings.tare_threshold_alert}%`, severity: 'alert', points: 25 });
        } else if (dev > settings.tare_threshold_perhatian) {
          score += 10;
          reasons.push({ code: 'TARE_PERHATIAN', label: `Tare deviasi ${dev.toFixed(1)}% di atas threshold perhatian ${settings.tare_threshold_perhatian}%`, severity: 'warning', points: 10 });
        }
      }

      // 5. Netto identik berulang
      const nettoKey = `${t.produk}_${t.berat_netto_wins}`;
      const sameCount = nettoGroups[nettoKey];
      if (sameCount >= 4) {
        score += 20;
        reasons.push({ code: 'NETTO_REPEAT', label: `Berat netto ${t.berat_netto_wins.toLocaleString('id-ID')} kg muncul ${sameCount}× di produk ${t.produk}`, severity: 'alert', points: 20 });
      }

      // 6. Round number bias
      if (t.berat_netto_wins > 0) {
        if (t.berat_netto_wins % 1000 === 0) {
          score += 10;
          reasons.push({ code: 'ROUND_1000', label: `Netto ${t.berat_netto_wins.toLocaleString('id-ID')} bulat 1.000`, severity: 'warning', points: 10 });
        } else if (t.berat_netto_wins % 500 === 0) {
          score += 5;
          reasons.push({ code: 'ROUND_500', label: `Netto bulat 500`, severity: 'info', points: 5 });
        }
      }

      // 7. Var WINS vs Relasi
      if (t.berat_relasi && t.berat_relasi > 0) {
        const varPct = Math.abs(t.berat_netto_wins - t.berat_relasi) / t.berat_relasi * 100;
        const tol = pInfo?.toleransi_pct ?? 0.30;
        if (varPct > 1) {
          score += 25;
          reasons.push({ code: 'VAR_OUTLIER', label: `Selisih ${varPct.toFixed(3)}% di atas 1% (WINS ${t.berat_netto_wins.toLocaleString('id-ID')}, Relasi ${t.berat_relasi.toLocaleString('id-ID')})`, severity: 'alert', points: 25 });
        } else if (varPct > tol) {
          score += 10;
          reasons.push({ code: 'VAR_OVER_TOL', label: `Selisih ${varPct.toFixed(3)}% di atas toleransi produk ${tol}%`, severity: 'warning', points: 10 });
        }
      }

      // 8. Off-hours
      if (t.jam_masuk) {
        const jm = t.jam_masuk.substring(0,5);
        if (jm >= settings.off_hours_strict_start && jm <= settings.off_hours_strict_end) {
          score += 20;
          reasons.push({ code: 'OFF_HOURS_STRICT', label: `Trip jam ${jm} di luar jam operasional (00:00-04:59)`, severity: 'alert', points: 20 });
        } else if (jm > settings.jam_ops_end) {
          score += 15;
          reasons.push({ code: 'OFF_HOURS_LATE', label: `Trip jam ${jm} setelah jam operasional ${settings.jam_ops_end}`, severity: 'warning', points: 15 });
        }
      }

      // 9. Weekend high
      if (t.tanggal_masuk) {
        const d = new Date(t.tanggal_masuk + 'T00:00:00');
        const dow = d.getDay();
        if ((dow === 0 || dow === 6) && avgNetto > 0 && t.berat_netto_wins > avgNetto * (1 + settings.weekend_high_pct / 100)) {
          score += 10;
          reasons.push({ code: 'WEEKEND_HIGH', label: `Trip ${dow===0?'Minggu':'Sabtu'} dengan netto ${((t.berat_netto_wins / avgNetto - 1) * 100).toFixed(0)}% di atas avg`, severity: 'warning', points: 10 });
        }
      }

      // 10. Trip ke-N di hari yang sama
      const dailyKey = `${t.no_polisi}_${t.tanggal_masuk}`;
      const tripsPerDay = dailyTripCount[dailyKey] || 1;
      if (tripsPerDay > 3) {
        const points = 5 * tripsPerDay;
        score += points;
        reasons.push({ code: 'BUSY_DAY', label: `Truk ${t.no_polisi} timbang ${tripsPerDay}× di tanggal ini`, severity: 'warning', points });
      }

      // Klasifikasi
      let level, levelLabel;
      if (score >= settings.score_kritis) { level = 'kritis'; levelLabel = 'Sangat Mencurigakan'; }
      else if (score >= settings.score_mencurigakan) { level = 'mencurigakan'; levelLabel = 'Mencurigakan'; }
      else if (score >= settings.score_perhatian) { level = 'perhatian'; levelLabel = 'Perlu Perhatian'; }
      else { level = 'aman'; levelLabel = 'Aman'; }

      return { ...t, anomaly_score: score, level, level_label: levelLabel, reasons };
    });

    // Sort by score desc, ambil yang punya score > 0
    const flagged = scored.filter(t => t.anomaly_score > 0).sort((a,b) => b.anomaly_score - a.anomaly_score);
    const stats = {
      total_trip: scored.length,
      aman: scored.filter(t => t.level === 'aman').length,
      perhatian: scored.filter(t => t.level === 'perhatian').length,
      mencurigakan: scored.filter(t => t.level === 'mencurigakan').length,
      kritis: scored.filter(t => t.level === 'kritis').length,
    };

    res.json({ stats, flagged: flagged.slice(0, 500), settings });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── 3. TRUCK FINGERPRINT ─── */
router.get('/truck-fingerprint', async (req, res) => {
  try {
    const settings = await db.get(`SELECT * FROM audit_settings WHERE id = 1`);
    const produkMaster = await db.all(`SELECT kode, arah FROM produk`);
    const arahMap = {}; produkMaster.forEach(p => arahMap[p.kode] = p.arah);

    // Ambil semua data trip lengkap (untuk drill-down)
    const rows = await db.all(`
      SELECT id, no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
        relasi_nama, produk, truck_type, tanggal_masuk,
        berat_masuk, berat_keluar, berat_netto_wins, berat_relasi,
        jam_masuk, jam_keluar, penimbang, driver, distance_km,
        transportir, lokasi_pengiriman
      FROM timbangan WHERE no_polisi IS NOT NULL AND no_polisi != ''
      ORDER BY no_polisi, tanggal_masuk DESC
    `);

    // Group by truck
    const trucks = {};
    rows.forEach(r => {
      if (!trucks[r.no_polisi]) trucks[r.no_polisi] = { no_polisi: r.no_polisi, truck_type: r.truck_type, trips: [], tares: [] };
      const arah = arahMap[r.produk] || 'IN';
      const tare = arah === 'IN' ? r.berat_keluar : r.berat_masuk;
      const gross = arah === 'IN' ? r.berat_masuk : r.berat_keluar;
      // Hitung var % jika ada berat_relasi
      let var_pct = null;
      if (r.berat_relasi && r.berat_relasi > 0) {
        var_pct = +(((r.berat_netto_wins - r.berat_relasi) * 100.0 / r.berat_relasi).toFixed(3));
      }
      trucks[r.no_polisi].trips.push({ ...r, arah, tare, gross, var_pct });
      if (tare && tare >= 1000) {
        trucks[r.no_polisi].tares.push(tare);
      }
    });

    // Compute fingerprint per truck
    const fingerprints = Object.values(trucks).map(t => {
      const arr = t.tares.slice().sort((a,b) => a-b);
      const median = arr.length ? arr[Math.floor(arr.length / 2)] : 0;
      const min = arr[0] || 0;
      const max = arr[arr.length - 1] || 0;
      const avg = arr.reduce((s,v) => s+v, 0) / (arr.length || 1);
      // Annotate every trip with deviation + level
      const allTrips = t.trips.map(trip => {
        const dev = median && trip.tare ? Math.abs((trip.tare - median) / median) * 100 : 0;
        let level = 'aman';
        if (dev > settings.tare_threshold_mustahil) level = 'mustahil';
        else if (dev > settings.tare_threshold_alert) level = 'alert';
        else if (dev > settings.tare_threshold_perhatian) level = 'perhatian';
        return { ...trip, dev_pct: +dev.toFixed(2), level };
      }).sort((a, b) => (b.dev_pct || 0) - (a.dev_pct || 0));
      const flagged = allTrips.filter(d => d.level !== 'aman');
      return {
        no_polisi: t.no_polisi,
        truck_type: t.truck_type,
        trip_count: t.trips.length,
        median_tare: Math.round(median),
        min_tare: min, max_tare: max, avg_tare: Math.round(avg),
        range: max - min,
        anomalies: flagged.length,
        all_trips: allTrips,        // SEMUA trip dengan tare + deviasi + level
        flagged_trips: flagged,     // hanya yang anomali (untuk default view)
      };
    }).filter(f => f.trip_count >= 3).sort((a,b) => b.anomalies - a.anomalies);

    res.json({ trucks: fingerprints, total: fingerprints.length, settings });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── 4. BENFORD'S LAW + ROUND ─── */
router.get('/benford', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const expectedBenford = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];

    const benford = await db.all(`
      SELECT SUBSTRING(berat_netto_wins::text FROM 1 FOR 1)::int as digit, COUNT(*)::int as count
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} berat_netto_wins > 0
      GROUP BY digit ORDER BY digit
    `, params);
    const total = benford.reduce((s,b) => s + b.count, 0);
    const data = [1,2,3,4,5,6,7,8,9].map(d => {
      const f = benford.find(b => b.digit === d);
      const actual = f ? (f.count / total * 100) : 0;
      return { digit: d, count: f?.count || 0, actual_pct: +actual.toFixed(2), expected_pct: expectedBenford[d-1], deviation: +(actual - expectedBenford[d-1]).toFixed(2) };
    });
    const chi2 = data.reduce((s, b) => { const ex = b.expected_pct * total / 100; return s + Math.pow(b.count - ex, 2) / (ex || 1); }, 0);

    const roundPattern = await db.get(`
      SELECT
        SUM(CASE WHEN berat_netto_wins % 1000 = 0 THEN 1 ELSE 0 END)::int as r1000,
        SUM(CASE WHEN berat_netto_wins % 500 = 0 AND berat_netto_wins % 1000 != 0 THEN 1 ELSE 0 END)::int as r500,
        SUM(CASE WHEN berat_netto_wins % 100 = 0 AND berat_netto_wins % 500 != 0 THEN 1 ELSE 0 END)::int as r100,
        COUNT(*)::int as total
      FROM timbangan ${w}
    `, params);

    // Per-produk breakdown
    const produkList = await db.all(`
      SELECT DISTINCT produk FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} berat_netto_wins > 0 AND produk IS NOT NULL
      ORDER BY produk
    `, params);

    function calcBenford(rows, tot) {
      const d = [1,2,3,4,5,6,7,8,9].map(digit => {
        const f = rows.find(r => r.digit === digit);
        const actual = f ? (f.count / tot * 100) : 0;
        return { digit, count: f?.count || 0, actual_pct: +actual.toFixed(2), expected_pct: expectedBenford[digit-1], deviation: +(actual - expectedBenford[digit-1]).toFixed(2) };
      });
      const chi = d.reduce((s, b) => { const ex = b.expected_pct * tot / 100; return s + Math.pow(b.count - ex, 2) / (ex || 1); }, 0);
      return { data: d, chi2: +chi.toFixed(2), suspicious: chi > 15.51, threshold: 15.51, total: tot };
    }

    const perProduk = [];
    for (const { produk } of produkList) {
      const wExtra = w ? `${w} AND produk = $${params.length + 1}` : `WHERE produk = $${params.length + 1}`;
      const rows = await db.all(`
        SELECT SUBSTRING(berat_netto_wins::text FROM 1 FOR 1)::int as digit, COUNT(*)::int as count
        FROM timbangan ${wExtra} AND berat_netto_wins > 0
        GROUP BY digit ORDER BY digit
      `, [...params, produk]);
      const tot = rows.reduce((s,r) => s + r.count, 0);
      if (tot < 10) continue; // skip produk dengan data terlalu sedikit
      perProduk.push({ produk, ...calcBenford(rows, tot) });
    }

    res.json({
      benford: { data, chi2: +chi2.toFixed(2), suspicious: chi2 > 15.51, threshold: 15.51, total },
      perProduk,
      round: {
        r1000: roundPattern.r1000, r500: roundPattern.r500, r100: roundPattern.r100, total: roundPattern.total,
        pct_1000: +(roundPattern.r1000 / roundPattern.total * 100).toFixed(2),
        pct_500: +(roundPattern.r500 / roundPattern.total * 100).toFixed(2),
        pct_100: +(roundPattern.r100 / roundPattern.total * 100).toFixed(2),
        suspicious: (roundPattern.r1000 / roundPattern.total) > 0.02,
      },
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── PHASE 4A: TARE DRIFT TIMELINE per truck ─── */
router.get('/truck-timeline/:no_polisi', async (req, res) => {
  try {
    const noPolisi = req.params.no_polisi;
    const produkMaster = await db.all(`SELECT kode, arah FROM produk`);
    const arahMap = {};
    produkMaster.forEach(p => arahMap[p.kode] = p.arah);

    const trips = await db.all(`
      SELECT id, no_seri, no_polisi, produk, truck_type, tanggal_masuk,
        berat_masuk, berat_keluar, berat_netto_wins, jam_masuk
      FROM timbangan
      WHERE no_polisi = $1
      ORDER BY tanggal_masuk ASC, id ASC
    `, [noPolisi]);

    // Compute tare per trip based on produk arah
    const timeline = trips.map(t => {
      const arah = arahMap[t.produk] || 'IN';
      const tare = arah === 'IN' ? t.berat_keluar : t.berat_masuk;
      const gross = arah === 'IN' ? t.berat_masuk : t.berat_keluar;
      return {
        id: t.id, no_seri: t.no_seri, tanggal: t.tanggal_masuk, produk: t.produk,
        truck_type: t.truck_type, arah, tare, gross, netto: t.berat_netto_wins,
      };
    }).filter(t => t.tare && t.tare > 1000);

    // Statistics
    const tares = timeline.map(t => t.tare).sort((a,b) => a - b);
    const median = tares[Math.floor(tares.length / 2)] || 0;
    const min = tares[0] || 0;
    const max = tares[tares.length - 1] || 0;
    const mean = tares.length ? tares.reduce((s,v) => s+v, 0) / tares.length : 0;
    // MAD (median absolute deviation) — robust dispersion
    const deviations = tares.map(t => Math.abs(t - median)).sort((a,b) => a - b);
    const mad = deviations[Math.floor(deviations.length / 2)] || 0;

    // Add deviation% per trip
    timeline.forEach(t => {
      t.dev_pct = median ? +(((t.tare - median) / median) * 100).toFixed(2) : 0;
      t.abs_dev_pct = Math.abs(t.dev_pct);
    });

    // Rolling window analysis: detect gradual drift (compare first 20% vs last 20% means)
    let driftWarning = null;
    if (timeline.length >= 20) {
      const seg = Math.floor(timeline.length * 0.2);
      const firstMean = timeline.slice(0, seg).reduce((s,t) => s + t.tare, 0) / seg;
      const lastMean = timeline.slice(-seg).reduce((s,t) => s + t.tare, 0) / seg;
      const drift_pct = median ? ((lastMean - firstMean) / median * 100) : 0;
      if (Math.abs(drift_pct) > 2) {
        driftWarning = {
          first_mean: Math.round(firstMean),
          last_mean: Math.round(lastMean),
          drift_pct: +drift_pct.toFixed(2),
          direction: drift_pct > 0 ? 'naik' : 'turun',
        };
      }
    }

    res.json({
      no_polisi: noPolisi,
      total_trips: timeline.length,
      stats: {
        median, mean: Math.round(mean), min, max,
        mad: +mad.toFixed(0),
        range_pct: median ? +((max - min) / median * 100).toFixed(1) : 0,
      },
      timeline,
      driftWarning,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── PHASE 4C: COMPOSITE FRAUD INDEX per truk ─── */
router.get('/fraud-index', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const settings = await db.get(`SELECT * FROM audit_settings WHERE id = 1`);
    const produkMaster = await db.all(`SELECT kode, arah FROM produk`);
    const arahMap = {};
    produkMaster.forEach(p => arahMap[p.kode] = p.arah);

    const bands = {
      '6 Roda':  { min: 9000,  max: 11000 },
      '10 Roda': { min: 13000, max: 16000 },
      '12 Roda': { min: 26000, max: 32000 },
    };

    const trips = await db.all(`
      SELECT id, no_polisi, truck_type, produk, berat_masuk, berat_keluar, berat_netto_wins, tanggal_masuk, jam_masuk
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} no_polisi IS NOT NULL AND no_polisi != '' AND berat_netto_wins > 0
    `, params);

    // Group by truck
    const byTruck = {};
    trips.forEach(t => {
      if (!byTruck[t.no_polisi]) byTruck[t.no_polisi] = [];
      byTruck[t.no_polisi].push(t);
    });

    // Median tare per truck (utk semua data, bukan filtered)
    const allTareRows = await db.all(`
      SELECT no_polisi, produk, berat_masuk, berat_keluar
      FROM timbangan WHERE no_polisi IS NOT NULL AND no_polisi != ''
    `);
    const tareByTruck = {};
    allTareRows.forEach(t => {
      const arah = arahMap[t.produk] || 'IN';
      const tare = arah === 'IN' ? t.berat_keluar : t.berat_masuk;
      if (!tare || tare < 1000) return;
      if (!tareByTruck[t.no_polisi]) tareByTruck[t.no_polisi] = [];
      tareByTruck[t.no_polisi].push(tare);
    });
    const medianTare = {};
    Object.entries(tareByTruck).forEach(([k, arr]) => {
      arr.sort((a,b) => a-b);
      medianTare[k] = arr[Math.floor(arr.length / 2)];
    });

    // Daily trip count
    const daily = {};
    trips.forEach(t => {
      const key = `${t.no_polisi}_${t.tanggal_masuk}`;
      daily[key] = (daily[key] || 0) + 1;
    });

    // Compute scores per truck
    const scoreThresholds = {
      tare_perhatian: settings.tare_threshold_perhatian || 3,
      tare_alert: settings.tare_threshold_alert || 5,
      tare_mustahil: settings.tare_threshold_mustahil || 10,
    };

    const ranked = Object.entries(byTruck).map(([no_polisi, truckTrips]) => {
      const types = {};
      truckTrips.forEach(t => { if (t.truck_type) types[t.truck_type] = (types[t.truck_type] || 0) + 1; });
      const dominantType = Object.entries(types).sort((a,b) => b[1] - a[1])[0]?.[0];
      const band = bands[dominantType];
      const med = medianTare[no_polisi];

      let capFlag = 0, tareFlag = 0, tareMax = 0, oddHourFlag = 0, multiTripFlag = 0, repeatNetto = 0;
      const nettoSeen = {};
      truckTrips.forEach(t => {
        // Capacity
        if (band) {
          if (t.berat_netto_wins < band.min || t.berat_netto_wins > band.max) capFlag++;
        }
        // Tare deviation
        const arah = arahMap[t.produk] || 'IN';
        const tare = arah === 'IN' ? t.berat_keluar : t.berat_masuk;
        if (med && tare) {
          const dev = Math.abs((tare - med) / med) * 100;
          if (dev > scoreThresholds.tare_perhatian) tareFlag++;
          if (dev > tareMax) tareMax = dev;
        }
        // Odd hour
        if (t.jam_masuk) {
          const h = parseInt(t.jam_masuk.substring(0,2));
          if (!isNaN(h) && (h < 5 || h >= 22)) oddHourFlag++;
        }
        // Multi trip same day
        const key = `${t.no_polisi}_${t.tanggal_masuk}`;
        if (daily[key] >= 4) multiTripFlag++;
        // Repeat netto
        const nk = `${t.produk}_${t.berat_netto_wins}`;
        nettoSeen[nk] = (nettoSeen[nk] || 0) + 1;
      });
      // Repeat: count trips where netto is duplicated >=3x within this truck
      Object.values(nettoSeen).forEach(c => { if (c >= 3) repeatNetto += c; });

      const n = truckTrips.length;
      // Sub-scores (0-100 each)
      const s_capacity   = Math.min(100, (capFlag / n) * 100);
      const s_tare       = Math.min(100, Math.min(tareMax * 5, 100)) * 0.5 + Math.min(100, (tareFlag / n) * 100) * 0.5;
      const s_temporal   = Math.min(100, (oddHourFlag / n) * 100);
      const s_multiTrip  = Math.min(100, (multiTripFlag / n) * 100);
      const s_repeat     = Math.min(100, (repeatNetto / n) * 100);
      // Weighted composite (forensic weights based on fraud impact)
      const composite = Math.round(
        s_capacity  * 0.30 +  // most direct fraud indicator
        s_tare      * 0.30 +  // tare manipulation = primary modus
        s_repeat    * 0.15 +  // pattern fingerprint
        s_multiTrip * 0.15 +  // suspicious frequency
        s_temporal  * 0.10    // weak signal
      );

      let level = 'aman';
      if (composite >= 70) level = 'kritis';
      else if (composite >= 40) level = 'mencurigakan';
      else if (composite >= 20) level = 'perhatian';

      return {
        no_polisi, dominant_type: dominantType, trips: n,
        capacity_flag: capFlag,
        tare_flag: tareFlag, tare_max_dev_pct: +tareMax.toFixed(1),
        odd_hour_flag: oddHourFlag,
        multi_trip_flag: multiTripFlag,
        repeat_netto: repeatNetto,
        median_tare: med || null,
        scores: {
          capacity: Math.round(s_capacity),
          tare: Math.round(s_tare),
          temporal: Math.round(s_temporal),
          multi_trip: Math.round(s_multiTrip),
          repeat: Math.round(s_repeat),
        },
        composite, level,
      };
    });

    // Filter truck dengan trip cukup, lalu sort by composite desc
    const filtered = ranked.filter(r => r.trips >= 3).sort((a,b) => b.composite - a.composite);

    // Summary distribution
    const summary = {
      total: filtered.length,
      kritis: filtered.filter(r => r.level === 'kritis').length,
      mencurigakan: filtered.filter(r => r.level === 'mencurigakan').length,
      perhatian: filtered.filter(r => r.level === 'perhatian').length,
      aman: filtered.filter(r => r.level === 'aman').length,
    };

    res.json({ summary, ranked: filtered });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── PHASE 1: VEHICLE CAPACITY ANALYSIS ─── */
router.get('/capacity', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Expected band per truck type (kapasitas operasional, bukan max)
    const bands = {
      '6 Roda':  { min: 9000,  max: 11000, hist_min: 4000,  hist_max: 14000, bucket: 500 },
      '10 Roda': { min: 13000, max: 16000, hist_min: 8000,  hist_max: 20000, bucket: 500 },
      '12 Roda': { min: 26000, max: 32000, hist_min: 20000, hist_max: 38000, bucket: 1000 },
    };

    const trips = await db.all(`
      SELECT id, no_seri, no_polisi, truck_type, produk, relasi_nama,
        berat_masuk, berat_keluar, berat_netto_wins, tanggal_masuk, jam_masuk
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} truck_type IS NOT NULL AND berat_netto_wins > 0
      ORDER BY tanggal_masuk DESC, id DESC
    `, params);

    const result = {};
    for (const [type, band] of Object.entries(bands)) {
      const tripsType = trips.filter(t => t.truck_type === type);
      const histogram = {};
      for (let b = band.hist_min; b < band.hist_max; b += band.bucket) {
        histogram[b] = { bucket_start: b, bucket_end: b + band.bucket, in_band: 0, under: 0, over: 0 };
      }
      const flagged = { under: [], over: [], inband_count: 0 };
      tripsType.forEach(t => {
        const n = t.berat_netto_wins;
        // bucket
        const bIdx = Math.floor((n - band.hist_min) / band.bucket) * band.bucket + band.hist_min;
        const buc = histogram[bIdx];
        let status = 'in';
        if (n < band.min) status = 'under';
        else if (n > band.max) status = 'over';
        if (buc) {
          if (status === 'in') buc.in_band++;
          else if (status === 'under') buc.under++;
          else buc.over++;
        }
        if (status === 'under') flagged.under.push({ ...t, status, deviation: band.min - n });
        else if (status === 'over') flagged.over.push({ ...t, status, deviation: n - band.max });
        else flagged.inband_count++;
      });
      // sort flagged by deviation desc
      flagged.under.sort((a,b) => b.deviation - a.deviation);
      flagged.over.sort((a,b) => b.deviation - a.deviation);
      result[type] = {
        band,
        total: tripsType.length,
        in_band: flagged.inband_count,
        under_band: flagged.under.length,
        over_band: flagged.over.length,
        histogram: Object.values(histogram),
        flagged_under: flagged.under.slice(0, 100),
        flagged_over: flagged.over.slice(0, 100),
      };
    }
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── PHASE 2: LAST-2-DIGIT FORENSIC ─── */
router.get('/digit-forensic', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Helper: hitung distribusi 2 digit terakhir, AWARE of instrument granularity
    async function lastTwoDist(field) {
      const rows = await db.all(`
        SELECT (${field} % 100)::int as last2, COUNT(*)::int as count
        FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} ${field} > 0
        GROUP BY last2 ORDER BY last2
      `, params);
      const total = rows.reduce((s,r) => s + r.count, 0);
      // Detect granularity (10kg / 20kg / 100kg / 1kg)
      const valid_pairs_10 = [0,10,20,30,40,50,60,70,80,90];
      const valid_pairs_20 = [0,20,40,60,80];
      const valid_pairs_100 = [0];
      const sum_10 = rows.filter(r => r.last2 % 10 === 0).reduce((s,r) => s + r.count, 0);
      const sum_20 = rows.filter(r => r.last2 % 20 === 0).reduce((s,r) => s + r.count, 0);
      const sum_100 = rows.filter(r => r.last2 === 0).reduce((s,r) => s + r.count, 0);
      let granularity = 1, valid_pairs_count = 100;
      if (sum_100 / total > 0.98) { granularity = 100; valid_pairs_count = 1; }
      else if (sum_20 / total > 0.98) { granularity = 20; valid_pairs_count = 5; }
      else if (sum_10 / total > 0.98) { granularity = 10; valid_pairs_count = 10; }
      // Build full 0-99 array
      const dist = Array.from({ length: 100 }, (_, i) => {
        const f = rows.find(r => r.last2 === i);
        const count = f ? f.count : 0;
        const actual_pct = total > 0 ? (count / total * 100) : 0;
        return { last2: i, count, actual_pct: +actual_pct.toFixed(2), valid: i % granularity === 0 };
      });
      // Chi-square HANYA atas valid pairs (sesuai granularity)
      const validDist = dist.filter(d => d.valid);
      const expected_count = total / valid_pairs_count;
      const chi2 = validDist.reduce((s, d) => s + Math.pow(d.count - expected_count, 2) / (expected_count || 1), 0);
      // Chi-square critical values (df = valid_pairs_count - 1)
      const chiTable = { 1: 3.84, 5: 9.49, 10: 16.92, 100: 124.34 };
      const df = valid_pairs_count - 1;
      const threshold = chiTable[valid_pairs_count] || (df > 0 ? df + 2 * Math.sqrt(2 * df) : 100);
      // Top suspect: pair yang muncul >2x expected
      const suspect = validDist.filter(d => d.count > expected_count * 2 && expected_count > 0)
        .sort((a,b) => b.count - a.count).slice(0, 10);
      return {
        dist, total,
        granularity, valid_pairs_count,
        chi2: +chi2.toFixed(2), threshold: +threshold.toFixed(2),
        suspicious: chi2 > threshold,
        suspect,
        expected_count: +expected_count.toFixed(1),
      };
    }

    const netto = await lastTwoDist('berat_netto_wins');
    const gross_in = await lastTwoDist('berat_masuk');
    const gross_out = await lastTwoDist('berat_keluar');

    // Granularity-aware: 2nd-to-last digit (puluhan)
    // Karena terbukti precision 10kg, digit yg bermakna adalah PULUHAN (10..90 step 10)
    async function tensDigitDist(field) {
      const rows = await db.all(`
        SELECT ((${field} / 10) % 10)::int as tens, COUNT(*)::int as count
        FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} ${field} > 0
        GROUP BY tens ORDER BY tens
      `, params);
      const total = rows.reduce((s,r) => s + r.count, 0);
      const dist = Array.from({ length: 10 }, (_, i) => {
        const f = rows.find(r => r.tens === i);
        const count = f ? f.count : 0;
        return { digit: i, count, actual_pct: total > 0 ? +(count / total * 100).toFixed(2) : 0, expected_pct: 10 };
      });
      const expected_count = total / 10;
      const chi2 = dist.reduce((s, d) => s + Math.pow(d.count - expected_count, 2) / (expected_count || 1), 0);
      return { dist, total, chi2: +chi2.toFixed(2), threshold: 16.92, suspicious: chi2 > 16.92, expected_count: +expected_count.toFixed(1) };
    }

    const tens_netto = await tensDigitDist('berat_netto_wins');

    res.json({ netto, gross_in, gross_out, tens_netto });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── PHASE 3: SCORECARDS (Operator + Temporal + Driver) ─── */
router.get('/scorecards', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Capacity bands (re-define utk dipakai disini)
    const bands = {
      '6 Roda':  { min: 9000,  max: 11000 },
      '10 Roda': { min: 13000, max: 16000 },
      '12 Roda': { min: 26000, max: 32000 },
    };

    // Ambil semua trip dengan field yang dibutuhkan
    const trips = await db.all(`
      SELECT id, no_polisi, truck_type, driver, penimbang, transportir,
        berat_netto_wins, tanggal_masuk, jam_masuk,
        EXTRACT(DOW FROM tanggal_masuk)::int as dow,
        CASE WHEN jam_masuk IS NOT NULL THEN SUBSTRING(jam_masuk FROM 1 FOR 2)::int ELSE NULL END as hour
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} berat_netto_wins > 0
    `, params);

    // Flag setiap trip
    function flagTrip(t) {
      const band = bands[t.truck_type];
      if (!band) return 'unknown';
      if (t.berat_netto_wins < band.min) return 'under';
      if (t.berat_netto_wins > band.max) return 'over';
      return 'in';
    }

    // 1. OPERATOR SCORECARD — Datu vs Samsira (normalize case)
    function normOp(s) {
      if (!s) return null;
      const x = s.toLowerCase().trim();
      if (x.startsWith('datu')) return 'Datu';
      if (x.startsWith('samsira')) return 'Samsira';
      return s;
    }
    const opMap = {};
    trips.forEach(t => {
      const op = normOp(t.penimbang);
      if (!op) return;
      if (!opMap[op]) opMap[op] = { name: op, trips: 0, under: 0, over: 0, in_band: 0, total_netto: 0, by_type: {} };
      const flag = flagTrip(t);
      opMap[op].trips++;
      opMap[op].total_netto += t.berat_netto_wins;
      if (flag === 'under') opMap[op].under++;
      else if (flag === 'over') opMap[op].over++;
      else if (flag === 'in') opMap[op].in_band++;
      if (t.truck_type) {
        if (!opMap[op].by_type[t.truck_type]) opMap[op].by_type[t.truck_type] = { trips: 0, netto_sum: 0, flagged: 0 };
        opMap[op].by_type[t.truck_type].trips++;
        opMap[op].by_type[t.truck_type].netto_sum += t.berat_netto_wins;
        if (flag !== 'in') opMap[op].by_type[t.truck_type].flagged++;
      }
    });
    const operators = Object.values(opMap).map(o => ({
      ...o,
      avg_netto: o.trips ? Math.round(o.total_netto / o.trips) : 0,
      pct_flagged: o.trips ? +((o.under + o.over) / o.trips * 100).toFixed(2) : 0,
      by_type: Object.entries(o.by_type).map(([type, d]) => ({
        truck_type: type, trips: d.trips, avg_netto: Math.round(d.netto_sum / d.trips), flagged: d.flagged,
        pct_flagged: +(d.flagged / d.trips * 100).toFixed(2),
      })),
    })).sort((a,b) => b.trips - a.trips);

    // 2. TEMPORAL HEATMAP — hari × jam (anomaly intensity)
    // DOW: 0=Minggu, 1=Senin, ..., 6=Sabtu
    const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const heatmap = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        heatmap.push({ dow: d, day: dayNames[d], hour: h, trips: 0, flagged: 0, intensity: 0 });
      }
    }
    trips.forEach(t => {
      if (t.hour === null || t.dow === null) return;
      const cell = heatmap.find(c => c.dow === t.dow && c.hour === t.hour);
      if (!cell) return;
      cell.trips++;
      const flag = flagTrip(t);
      if (flag !== 'in' && flag !== 'unknown') cell.flagged++;
    });
    heatmap.forEach(c => { c.intensity = c.trips > 0 ? +(c.flagged / c.trips * 100).toFixed(1) : 0; });

    // 3. DRIVER TOP FLAGGED
    const driverMap = {};
    trips.forEach(t => {
      if (!t.driver) return;
      const d = t.driver.trim();
      if (!d) return;
      if (!driverMap[d]) driverMap[d] = { driver: d, trips: 0, flagged: 0, under: 0, over: 0 };
      driverMap[d].trips++;
      const flag = flagTrip(t);
      if (flag === 'under') { driverMap[d].under++; driverMap[d].flagged++; }
      else if (flag === 'over') { driverMap[d].over++; driverMap[d].flagged++; }
    });
    const drivers = Object.values(driverMap)
      .filter(d => d.trips >= 3)
      .map(d => ({ ...d, pct_flagged: +(d.flagged / d.trips * 100).toFixed(2) }))
      .sort((a,b) => b.pct_flagged - a.pct_flagged || b.flagged - a.flagged)
      .slice(0, 20);

    // 4. VENDOR / TRANSPORTIR SCORECARD
    const vendorMap = {};
    trips.forEach(t => {
      if (!t.transportir) return;
      const v = t.transportir.trim();
      if (!v) return;
      if (!vendorMap[v]) vendorMap[v] = { vendor: v, trips: 0, under: 0, over: 0, in_band: 0, total_netto: 0, by_type: {}, drivers: new Set() };
      const flag = flagTrip(t);
      vendorMap[v].trips++;
      vendorMap[v].total_netto += t.berat_netto_wins;
      if (flag === 'under') vendorMap[v].under++;
      else if (flag === 'over') vendorMap[v].over++;
      else if (flag === 'in') vendorMap[v].in_band++;
      if (t.driver) vendorMap[v].drivers.add(t.driver.trim());
      if (t.truck_type) {
        if (!vendorMap[v].by_type[t.truck_type]) vendorMap[v].by_type[t.truck_type] = 0;
        vendorMap[v].by_type[t.truck_type]++;
      }
    });
    const vendors = Object.values(vendorMap)
      .filter(v => v.trips >= 3)
      .map(v => ({
        ...v,
        avg_netto: v.trips ? Math.round(v.total_netto / v.trips) : 0,
        pct_flagged: v.trips ? +((v.under + v.over) / v.trips * 100).toFixed(2) : 0,
        driver_count: v.drivers.size,
        drivers: undefined,
        by_type: Object.entries(v.by_type).map(([type, c]) => ({ truck_type: type, trips: c })),
      }))
      .sort((a,b) => b.trips - a.trips);

    res.json({ operators, heatmap, drivers, vendors, total_trips: trips.length });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── 5. DUPLICATE DETECTOR ─── */
router.get('/duplicates', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Exact: same no_seri_relasi (no_seri internal bisa berulang antar tahun/produk,
    // tapi no_seri_relasi adalah unique identifier dari customer per DO)
    const exact = await db.all(`
      SELECT no_seri_relasi, produk, relasi_nama, COUNT(*)::int as c,
        ARRAY_AGG(id) as ids, ARRAY_AGG(no_seri) as seris,
        ARRAY_AGG(tanggal_masuk::text) as tanggals, ARRAY_AGG(berat_netto_wins) as nettos,
        ARRAY_AGG(no_polisi) as polisis
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} no_seri_relasi IS NOT NULL AND no_seri_relasi != ''
      GROUP BY no_seri_relasi, produk, relasi_nama HAVING COUNT(*) > 1
      ORDER BY c DESC LIMIT 100
    `, params);

    // Near: same berat_masuk + berat_keluar + relasi (tapi tanggal/seri beda)
    const near = await db.all(`
      SELECT berat_masuk, berat_keluar, relasi_nama, produk,
        COUNT(*)::int as c,
        ARRAY_AGG(id) as ids, ARRAY_AGG(no_seri) as seris, ARRAY_AGG(tanggal_masuk::text) as tanggals
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} berat_masuk > 0 AND berat_keluar > 0
      GROUP BY berat_masuk, berat_keluar, relasi_nama, produk
      HAVING COUNT(*) >= 3
      ORDER BY c DESC LIMIT 50
    `, params);

    // Repeated net weight (same netto per produk)
    const repeatedNetto = await db.all(`
      SELECT berat_netto_wins, produk, COUNT(*)::int as c,
        ARRAY_AGG(DISTINCT no_polisi) as polisis,
        ARRAY_AGG(id) as ids
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} berat_netto_wins > 1000
      GROUP BY berat_netto_wins, produk
      HAVING COUNT(*) >= 4
      ORDER BY c DESC LIMIT 50
    `, params);

    res.json({ exact, near, repeatedNetto });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── 6. TIME & GEO PATTERN ─── */
router.get('/time-geo', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const settings = await db.get(`SELECT * FROM audit_settings WHERE id = 1`);

    const perHour = await db.all(`
      SELECT EXTRACT(HOUR FROM jam_masuk::time)::int as hour, COUNT(*)::int as trip
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} jam_masuk IS NOT NULL AND jam_masuk != ''
      GROUP BY hour ORDER BY hour
    `, params);

    const perDow = await db.all(`
      SELECT EXTRACT(DOW FROM tanggal_masuk)::int as dow, COUNT(*)::int as trip
      FROM timbangan ${w} GROUP BY dow ORDER BY dow
    `, params);
    const dowNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    perDow.forEach(d => d.day_name = dowNames[d.dow]);

    // Off-hours trips per truck (count > settings.late_trips_threshold = flag)
    const lateByTruck = await db.all(`
      SELECT no_polisi, COUNT(*)::int as late_trips
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} no_polisi IS NOT NULL AND no_polisi != '' AND jam_masuk > $${params.length+1}
      GROUP BY no_polisi HAVING COUNT(*) > $${params.length+2}
      ORDER BY late_trips DESC LIMIT 20
    `, [...params, settings.jam_ops_end, settings.late_trips_threshold]);

    // Geo: cek truk yang appear di 2+ lokasi dalam <X jam (impossible jika jarak besar)
    const lokasi = await db.all(`SELECT nama, lon, lat FROM lokasi`);
    const lokMap = {}; lokasi.forEach(l => lokMap[l.nama.toLowerCase()] = l);

    // Get trips with timestamp + lokasi
    const tripsWithLoc = await db.all(`
      SELECT no_polisi, lokasi_pengiriman, tanggal_masuk,
        COALESCE(jam_masuk, '00:00') as jam, berat_netto_wins, no_seri
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} no_polisi IS NOT NULL AND lokasi_pengiriman IS NOT NULL AND lokasi_pengiriman != ''
      ORDER BY no_polisi, tanggal_masuk, jam_masuk
    `, params);

    const geoViolations = [];
    for (let i = 1; i < tripsWithLoc.length; i++) {
      const a = tripsWithLoc[i-1], b = tripsWithLoc[i];
      if (a.no_polisi !== b.no_polisi) continue;
      if (a.tanggal_masuk !== b.tanggal_masuk) continue;
      const locA = lokMap[(a.lokasi_pengiriman||'').toLowerCase().trim()];
      const locB = lokMap[(b.lokasi_pengiriman||'').toLowerCase().trim()];
      if (!locA || !locB || locA.nama === locB.nama) continue;

      const dist = haversine(locA.lon, locA.lat, locB.lon, locB.lat);
      const jamA = parseInt(a.jam.substring(0,2))*60 + parseInt(a.jam.substring(3,5));
      const jamB = parseInt(b.jam.substring(0,2))*60 + parseInt(b.jam.substring(3,5));
      const gap_minute = Math.abs(jamB - jamA);
      const min_minute = (dist / settings.avg_speed_kmh) * 60;

      if (gap_minute < min_minute && gap_minute > 0) {
        geoViolations.push({
          no_polisi: a.no_polisi, tanggal: a.tanggal_masuk,
          loc_a: locA.nama, loc_b: locB.nama,
          distance_km: +dist.toFixed(1),
          gap_minute, min_minute: +min_minute.toFixed(0),
          seri_a: a.no_seri, seri_b: b.no_seri,
        });
      }
    }

    res.json({ perHour, perDow, lateByTruck, geoViolations, lokasi, settings });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── 7. DISTRIBUTION ANALYSIS ─── */
router.get('/distribution', async (req, res) => {
  try {
    const { dim = 'produk' } = req.query;
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const groupCol = { produk: 'produk', relasi: 'relasi_nama', truck: 'no_polisi' }[dim] || 'produk';

    const data = await db.all(`
      SELECT ${groupCol} as grp,
        COUNT(*)::int as n,
        AVG(berat_netto_wins)::int as avg,
        ROUND(STDDEV(berat_netto_wins)::numeric)::int as stddev,
        MIN(berat_netto_wins)::int as min,
        MAX(berat_netto_wins)::int as max,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY berat_netto_wins)::int as q1,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY berat_netto_wins)::int as median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY berat_netto_wins)::int as q3
      FROM timbangan ${w} ${w ? 'AND' : 'WHERE'} ${groupCol} IS NOT NULL
      GROUP BY ${groupCol} HAVING COUNT(*) >= 3
      ORDER BY n DESC LIMIT 50
    `, params);
    res.json({ data, dim });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── 8. RECONCILIATION (Kontrak vs Timbangan) ─── */
router.get('/reconciliation', async (req, res) => {
  try {
    const settings = await db.get(`SELECT * FROM audit_settings WHERE id = 1`);
    const rows = await db.all(`
      SELECT k.no_kontrak, k.relasi_nama, k.produk, k.arah,
        k.quantity_kg::bigint as kuota_kg, k.harga_satuan,
        COALESCE((SELECT SUM(berat_netto_wins) FROM timbangan WHERE no_kontrak = k.no_kontrak)::bigint, 0) as aktual_kg,
        COALESCE((SELECT COUNT(*) FROM timbangan WHERE no_kontrak = k.no_kontrak)::int, 0) as trip_count,
        k.jatuh_tempo
      FROM kontrak k ORDER BY k.created_at DESC
    `);
    const summary = { total_kontrak: rows.length, total_kuota: 0, total_aktual: 0, selesai: 0, over: 0, under: 0, belum: 0, flagged: 0 };
    const flagged = [];
    rows.forEach(r => {
      r.kuota_kg = Number(r.kuota_kg); r.aktual_kg = Number(r.aktual_kg);
      r.sisa_kg = r.kuota_kg - r.aktual_kg;
      r.pct = r.kuota_kg > 0 ? +(r.aktual_kg / r.kuota_kg * 100).toFixed(2) : 0;
      summary.total_kuota += r.kuota_kg; summary.total_aktual += r.aktual_kg;
      if (r.pct === 0) summary.belum++;
      else if (r.pct < 100) summary.under++;
      else if (r.pct >= 100 && r.pct < 101) summary.selesai++;
      else summary.over++;
      if (r.pct > 100 + settings.kontrak_over_pct) { r.alert = `OVER >${settings.kontrak_over_pct}%`; flagged.push(r); summary.flagged++; }
      else if (r.jatuh_tempo && new Date(r.jatuh_tempo) < new Date() && r.pct < 95) { r.alert = 'UNDER + LEWAT TEMPO'; flagged.push(r); summary.flagged++; }
    });

    const orphan = await db.all(`
      SELECT relasi_nama, produk, COUNT(*)::int as trip, SUM(berat_netto_wins)::bigint as netto
      FROM timbangan WHERE no_kontrak IS NULL OR no_kontrak = ''
      GROUP BY relasi_nama, produk ORDER BY netto DESC LIMIT 30
    `);
    orphan.forEach(o => o.netto = Number(o.netto));

    res.json({ summary, kontrak: rows, flagged, orphan });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A1. ROUND-NUMBER BIAS — netto berakhir 000/500/00 melebihi rate wajar ─── */
router.get('/round-number', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const wAnd = w ? 'AND' : 'WHERE';

    const tot = await db.get(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE berat_netto_wins % 1000 = 0)::int as end_000,
        COUNT(*) FILTER (WHERE berat_netto_wins % 1000 = 500)::int as end_500,
        COUNT(*) FILTER (WHERE berat_netto_wins % 100 = 0)::int as end_00,
        COUNT(*) FILTER (WHERE berat_netto_wins % 10 = 0)::int as end_0
      FROM timbangan ${w} ${wAnd} berat_netto_wins IS NOT NULL AND berat_netto_wins > 0
    `, params);

    const total = tot.total || 1;
    const expected = { end_000: total * 0.001, end_500: total * 0.001, end_00: total * 0.01, end_0: total * 0.10 };
    const stats = {
      total,
      end_000: { count: tot.end_000, pct: +(tot.end_000 / total * 100).toFixed(2), expected_pct: 0.1, ratio: +(tot.end_000 / Math.max(expected.end_000, 0.5)).toFixed(1) },
      end_500: { count: tot.end_500, pct: +(tot.end_500 / total * 100).toFixed(2), expected_pct: 0.1, ratio: +(tot.end_500 / Math.max(expected.end_500, 0.5)).toFixed(1) },
      end_00:  { count: tot.end_00,  pct: +(tot.end_00 / total * 100).toFixed(2),  expected_pct: 1.0, ratio: +(tot.end_00 / Math.max(expected.end_00, 0.5)).toFixed(1) },
      end_0:   { count: tot.end_0,   pct: +(tot.end_0 / total * 100).toFixed(2),   expected_pct: 10.0, ratio: +(tot.end_0 / Math.max(expected.end_0, 0.5)).toFixed(1) },
    };

    const suspicious = stats.end_00.pct > 3 || stats.end_000.pct > 0.5;
    const verdict = suspicious ? 'PERHATIAN' : 'NORMAL';

    const perOperator = await db.all(`
      SELECT penimbang as nama,
        COUNT(*)::int as trip,
        COUNT(*) FILTER (WHERE berat_netto_wins % 100 = 0)::int as round_00,
        ROUND(COUNT(*) FILTER (WHERE berat_netto_wins % 100 = 0) * 100.0 / COUNT(*), 2)::float as pct_00
      FROM timbangan ${w} ${wAnd} penimbang IS NOT NULL AND penimbang != '' AND berat_netto_wins > 0
      GROUP BY penimbang HAVING COUNT(*) >= 10
      ORDER BY pct_00 DESC LIMIT 20
    `, params);

    const perTruck = await db.all(`
      SELECT no_polisi as nama,
        COUNT(*)::int as trip,
        COUNT(*) FILTER (WHERE berat_netto_wins % 100 = 0)::int as round_00,
        ROUND(COUNT(*) FILTER (WHERE berat_netto_wins % 100 = 0) * 100.0 / COUNT(*), 2)::float as pct_00
      FROM timbangan ${w} ${wAnd} no_polisi IS NOT NULL AND no_polisi != '' AND berat_netto_wins > 0
      GROUP BY no_polisi HAVING COUNT(*) >= 10
      ORDER BY pct_00 DESC LIMIT 20
    `, params);

    const samples = await db.all(`
      SELECT id, no_seri, no_polisi, relasi_nama, produk, berat_netto_wins as netto, penimbang, tanggal_masuk
      FROM timbangan ${w} ${wAnd} (berat_netto_wins % 1000 = 0 OR berat_netto_wins % 1000 = 500) AND berat_netto_wins > 0
      ORDER BY tanggal_masuk DESC LIMIT 50
    `, params);

    res.json({ stats, verdict, suspicious, perOperator, perTruck, samples });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A3. SEQUENCE GAP — no_seri numerik yang hilang dalam rentang ─── */
router.get('/sequence-gap', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT no_seri::bigint as seri, tanggal_masuk, no_polisi, relasi_nama, produk
      FROM timbangan
      WHERE no_seri ~ '^[0-9]+$'
      ORDER BY no_seri::bigint
    `);
    if (rows.length === 0) return res.json({ gaps: [], summary: { min: null, max: null, present: 0, missing: 0 } });

    const min = Number(rows[0].seri);
    const max = Number(rows[rows.length - 1].seri);
    const present = new Set(rows.map(r => Number(r.seri)));

    const gaps = [];
    let gapStart = null;
    for (let s = min; s <= max; s++) {
      if (!present.has(s)) {
        if (gapStart === null) gapStart = s;
      } else if (gapStart !== null) {
        gaps.push({ from: gapStart, to: s - 1, count: s - gapStart });
        gapStart = null;
      }
    }
    if (gapStart !== null) gaps.push({ from: gapStart, to: max, count: max - gapStart + 1 });

    const seriToRow = {};
    rows.forEach(r => { seriToRow[Number(r.seri)] = r; });
    const isWeekend = d => { if (!d) return false; const x = new Date(d).getUTCDay(); return x === 0 || x === 6; };
    const sameDay = (a, b) => a && b && String(a).slice(0, 10) === String(b).slice(0, 10);
    gaps.forEach(g => {
      const before = seriToRow[g.from - 1];
      const after = seriToRow[g.to + 1];
      g.tgl_before = before?.tanggal_masuk || null;
      g.tgl_after = after?.tanggal_masuk || null;
      g.relasi_before = before?.relasi_nama || null;
      g.relasi_after = after?.relasi_nama || null;
      // Diagnosis otomatis (dugaan penyebab) — bantu prioritas telusur
      const sameRelasi = g.relasi_before && g.relasi_before === g.relasi_after;
      const sameTgl = sameDay(g.tgl_before, g.tgl_after);
      let dugaan, level;
      if (sameRelasi && sameTgl) { dugaan = 'Relasi & tanggal sama di kedua sisi → kemungkinan besar nota BELUM DIINPUT. Cek arsip fisik.'; level = 'tinggi'; }
      else if (sameTgl) { dugaan = 'Tanggal sama, relasi beda → nota antar-relasi mungkin terlewat input.'; level = 'sedang'; }
      else if (isWeekend(g.tgl_before) || isWeekend(g.tgl_after)) { dugaan = 'Berdekatan akhir pekan → mungkin libur (normal).'; level = 'rendah'; }
      else { dugaan = 'Beda hari → bisa normal (tak ada transaksi) atau nota hari kosong terlewat.'; level = 'rendah'; }
      if (g.count >= 3) { level = 'tinggi'; dugaan = `Gap besar (${g.count} nota). ` + dugaan; }
      g.dugaan = dugaan; g.level = level;
    });

    const totalMissing = gaps.reduce((s, g) => s + g.count, 0);
    const summary = {
      min, max, range: max - min + 1,
      present: present.size, missing: totalMissing, gap_count: gaps.length,
      missing_pct: +(totalMissing / (max - min + 1) * 100).toFixed(2),
    };

    res.json({ gaps: gaps.sort((a, b) => b.count - a.count).slice(0, 100), summary });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A3b. KONTEKS GAP — transaksi nyata di sekitar nomor seri yang hilang ─── */
router.get('/sequence-gap/context', async (req, res) => {
  try {
    const from = parseInt(req.query.from), to = parseInt(req.query.to);
    if (isNaN(from) || isNaN(to)) return res.status(400).json({ error: 'from & to wajib angka' });
    const win = Math.min(parseInt(req.query.window) || 4, 20);
    const lo = from - win, hi = to + win;
    // ambil transaksi nyata dalam jendela seri (lo..hi)
    const rows = await db.all(`
      SELECT id, no_seri::bigint as seri, no_seri_relasi, tanggal_masuk, jam_masuk, jam_keluar,
        no_polisi, relasi_nama, produk, do_number, no_kontrak, berat_netto_wins, penimbang
      FROM timbangan
      WHERE no_seri ~ '^[0-9]+$' AND no_seri::bigint BETWEEN $1 AND $2
      ORDER BY no_seri::bigint`, [lo, hi]);
    const present = new Set(rows.map(r => Number(r.seri)));
    // susun deret lengkap lo..hi, tandai yang hilang
    const deret = [];
    for (let s = lo; s <= hi; s++) {
      const r = rows.find(x => Number(x.seri) === s);
      deret.push(r
        ? { seri: s, hilang: false, no_seri_relasi: r.no_seri_relasi, tanggal: r.tanggal_masuk, jam_masuk: r.jam_masuk, jam_keluar: r.jam_keluar, no_polisi: r.no_polisi, relasi: r.relasi_nama, produk: r.produk, do_number: r.do_number, no_kontrak: r.no_kontrak, netto: r.berat_netto_wins, penimbang: r.penimbang, id: r.id }
        : { seri: s, hilang: true, dalam_gap: s >= from && s <= to });
    }
    // cek kontinuitas no_seri_relasi (seri customer) di sekitar gap → bukti kuat
    const relSeris = rows.map(r => r.no_seri_relasi).filter(Boolean);
    res.json({ from, to, window: win, deret, hint_relasi_seri: relSeris });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A4. WEEKEND & OFF-DAY SPIKE — rasio trip weekend vs weekday ─── */
router.get('/weekend-spike', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const wAnd = w ? 'AND' : 'WHERE';

    const byDow = await db.all(`
      SELECT EXTRACT(DOW FROM tanggal_masuk)::int as dow,
        COUNT(*)::int as trip,
        COUNT(DISTINCT tanggal_masuk)::int as hari,
        SUM(berat_netto_wins)::bigint as netto
      FROM timbangan ${w} ${wAnd} tanggal_masuk IS NOT NULL
      GROUP BY dow ORDER BY dow
    `, params);
    byDow.forEach(d => d.netto = Number(d.netto));

    const weekdayTrips = byDow.filter(d => d.dow >= 1 && d.dow <= 5).reduce((s, d) => s + d.trip, 0);
    const weekendTrips = byDow.filter(d => d.dow === 0 || d.dow === 6).reduce((s, d) => s + d.trip, 0);
    const weekdayDays = byDow.filter(d => d.dow >= 1 && d.dow <= 5).reduce((s, d) => s + d.hari, 0) || 1;
    const weekendDays = byDow.filter(d => d.dow === 0 || d.dow === 6).reduce((s, d) => s + d.hari, 0) || 1;

    const avgWeekday = weekdayTrips / weekdayDays;
    const avgWeekend = weekendTrips / weekendDays;
    const ratio = avgWeekday > 0 ? +(avgWeekend / avgWeekday).toFixed(2) : 0;

    const summary = {
      weekday_trips: weekdayTrips, weekend_trips: weekendTrips,
      weekday_days: weekdayDays, weekend_days: weekendDays,
      avg_weekday: +avgWeekday.toFixed(1), avg_weekend: +avgWeekend.toFixed(1),
      ratio,
      verdict: ratio > 1.2 ? 'PERHATIAN' : ratio > 0.8 ? 'TINGGI' : 'NORMAL',
    };

    const operators = await db.all(`
      SELECT penimbang as nama,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE EXTRACT(DOW FROM tanggal_masuk) IN (0,6))::int as weekend,
        ROUND(COUNT(*) FILTER (WHERE EXTRACT(DOW FROM tanggal_masuk) IN (0,6)) * 100.0 / COUNT(*), 1)::float as pct_weekend
      FROM timbangan ${w} ${wAnd} penimbang IS NOT NULL AND penimbang != '' AND tanggal_masuk IS NOT NULL
      GROUP BY penimbang HAVING COUNT(*) >= 10
      ORDER BY pct_weekend DESC LIMIT 20
    `, params);

    const topWeekendDays = await db.all(`
      SELECT tanggal_masuk, COUNT(*)::int as trip, to_char(tanggal_masuk, 'Day') as nama_hari
      FROM timbangan ${w} ${wAnd} EXTRACT(DOW FROM tanggal_masuk) IN (0,6)
      GROUP BY tanggal_masuk ORDER BY trip DESC LIMIT 15
    `, params);

    const dowNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    byDow.forEach(d => d.nama = dowNames[d.dow]);

    res.json({ summary, byDow, operators, topWeekendDays });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A5. VELOCITY / TURNAROUND — interval antar-trip truk yang mustahil ─── */
router.get('/velocity', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';
    const minGap = parseInt(req.query.min_menit) || 30;

    const rows = await db.all(`
      WITH ordered AS (
        SELECT id, no_polisi, relasi_nama, produk, berat_netto_wins as netto,
          tanggal_masuk, jam_masuk, driver, penimbang,
          (tanggal_masuk + jam_masuk::time) as ts
        FROM timbangan
        WHERE no_polisi IS NOT NULL AND no_polisi != ''
          AND jam_masuk ~ '^[0-2][0-9]:[0-5][0-9]'
          ${w}
      ),
      diffs AS (
        SELECT *,
          LAG(ts) OVER (PARTITION BY no_polisi ORDER BY ts) as prev_ts,
          LAG(id) OVER (PARTITION BY no_polisi ORDER BY ts) as prev_id,
          LAG(relasi_nama) OVER (PARTITION BY no_polisi ORDER BY ts) as prev_relasi
        FROM ordered
      )
      SELECT id, prev_id, no_polisi, relasi_nama, prev_relasi, produk, netto,
        driver, penimbang, tanggal_masuk, jam_masuk,
        EXTRACT(EPOCH FROM (ts - prev_ts))/60 as gap_menit
      FROM diffs
      WHERE prev_ts IS NOT NULL
        AND EXTRACT(EPOCH FROM (ts - prev_ts))/60 < ${minGap}
        AND EXTRACT(EPOCH FROM (ts - prev_ts))/60 >= 0
      ORDER BY gap_menit ASC LIMIT 100
    `, params);

    rows.forEach(r => r.gap_menit = Math.round(Number(r.gap_menit)));

    const perTruck = {};
    rows.forEach(r => {
      perTruck[r.no_polisi] = perTruck[r.no_polisi] || { no_polisi: r.no_polisi, count: 0, min_gap: 9999 };
      perTruck[r.no_polisi].count++;
      perTruck[r.no_polisi].min_gap = Math.min(perTruck[r.no_polisi].min_gap, r.gap_menit);
    });

    res.json({
      summary: { flagged: rows.length, trucks_affected: Object.keys(perTruck).length, threshold_menit: minGap },
      flagged: rows,
      perTruck: Object.values(perTruck).sort((a, b) => b.count - a.count),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A8. BRIDGE-DURATION & DISTANCE PLAUSIBILITY ─── */
router.get('/duration-plausibility', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';
    const maxJam = parseFloat(req.query.max_jam) || 6;

    const rows = await db.all(`
      WITH durasi AS (
        SELECT id, no_seri, no_polisi, relasi_nama, produk, berat_netto_wins as netto,
          jam_masuk, jam_keluar, tanggal_masuk, penimbang, distance_km,
          CASE
            WHEN jam_keluar::time >= jam_masuk::time
              THEN EXTRACT(EPOCH FROM (jam_keluar::time - jam_masuk::time))/60
            ELSE EXTRACT(EPOCH FROM (jam_keluar::time - jam_masuk::time + interval '24 hours'))/60
          END as menit
        FROM timbangan
        WHERE jam_masuk ~ '^[0-2][0-9]:[0-5][0-9]'
          AND jam_keluar ~ '^[0-2][0-9]:[0-5][0-9]'
          ${w}
      )
      SELECT * FROM durasi
      WHERE menit > ${maxJam * 60} OR menit = 0
      ORDER BY menit DESC LIMIT 80
    `, params);
    rows.forEach(r => { r.menit = Math.round(Number(r.menit)); r.jam = +(r.menit / 60).toFixed(1); });

    const stat = await db.get(`
      WITH durasi AS (
        SELECT
          CASE
            WHEN jam_keluar::time >= jam_masuk::time
              THEN EXTRACT(EPOCH FROM (jam_keluar::time - jam_masuk::time))/60
            ELSE EXTRACT(EPOCH FROM (jam_keluar::time - jam_masuk::time + interval '24 hours'))/60
          END as menit
        FROM timbangan
        WHERE jam_masuk ~ '^[0-2][0-9]:[0-5][0-9]' AND jam_keluar ~ '^[0-2][0-9]:[0-5][0-9]' ${w}
      )
      SELECT COUNT(*)::int as total,
        ROUND(AVG(menit)::numeric,0)::int as avg_menit,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY menit)::numeric,0)::int as median_menit,
        COUNT(*) FILTER (WHERE menit > ${maxJam * 60})::int as over_count,
        COUNT(*) FILTER (WHERE menit = 0)::int as zero_count
      FROM durasi
    `, params);

    const distVar = await db.all(`
      SELECT relasi_nama, COUNT(*)::int as trip,
        ROUND(AVG(distance_km)::numeric,1)::float as avg_km,
        ROUND(MIN(distance_km)::numeric,1)::float as min_km,
        ROUND(MAX(distance_km)::numeric,1)::float as max_km,
        ROUND(STDDEV(distance_km)::numeric,1)::float as std_km
      FROM timbangan
      WHERE relasi_nama IS NOT NULL AND distance_km > 0 ${w}
      GROUP BY relasi_nama HAVING COUNT(*) >= 5 AND STDDEV(distance_km) > 0
      ORDER BY std_km DESC LIMIT 20
    `, params);

    res.json({
      summary: {
        total: stat.total, avg_menit: stat.avg_menit, median_menit: stat.median_menit,
        over_count: stat.over_count, zero_count: stat.zero_count, max_jam: maxJam,
      },
      flagged: rows,
      distVar,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── B1. TARE PROFILE — profil berat kosong (tare) per truk + deteksi drift ─── */
router.get('/tare-profile', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';
    const minTrip = parseInt(req.query.min_trip) || 6;

    // Tare = berat kosong = LEAST(masuk, keluar). Ambil semua trip terurut waktu.
    const rows = await db.all(`
      SELECT no_polisi, truck_type,
        LEAST(berat_masuk, berat_keluar) as tare,
        GREATEST(berat_masuk, berat_keluar) as gross,
        berat_netto_wins as netto, produk, tanggal_masuk, no_seri
      FROM timbangan
      WHERE no_polisi IS NOT NULL AND no_polisi != ''
        AND berat_masuk > 0 AND berat_keluar > 0
        ${w}
      ORDER BY no_polisi, tanggal_masuk, no_seri
    `, params);

    const median = arr => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };

    // Group per truk
    const trucks = {};
    rows.forEach(r => {
      const t = Number(r.tare);
      if (!trucks[r.no_polisi]) trucks[r.no_polisi] = { no_polisi: r.no_polisi, truck_type: r.truck_type, tares: [], trips: [] };
      trucks[r.no_polisi].tares.push(t);
      trucks[r.no_polisi].trips.push({ tare: t, tanggal: r.tanggal_masuk, netto: Number(r.netto), produk: r.produk, no_seri: r.no_seri });
    });

    const profiles = [];
    Object.values(trucks).forEach(tk => {
      if (tk.tares.length < minTrip) return;
      const med = median(tk.tares);
      const mad = median(tk.tares.map(t => Math.abs(t - med))) || 1;
      const min = Math.min(...tk.tares);
      const max = Math.max(...tk.tares);
      const spread = max - min;
      // Drift: median sepertiga awal vs sepertiga akhir (kronologis)
      const n = tk.trips.length;
      const third = Math.max(1, Math.floor(n / 3));
      const early = median(tk.trips.slice(0, third).map(t => t.tare));
      const late = median(tk.trips.slice(-third).map(t => t.tare));
      const drift = late - early;
      const driftPct = early > 0 ? +(drift / early * 100).toFixed(2) : 0;
      // Outlier: tare menyimpang > 3 MAD dari median
      const outliers = tk.trips.filter(t => Math.abs(t.tare - med) > 3 * mad);
      // CV (koefisien variasi) sebagai % — stabilitas tare
      const mean = tk.tares.reduce((a, b) => a + b, 0) / tk.tares.length;
      const std = Math.sqrt(tk.tares.reduce((a, b) => a + (b - mean) ** 2, 0) / tk.tares.length);
      const cv = mean > 0 ? +(std / mean * 100).toFixed(2) : 0;

      // Status: stabil / drift / tidak stabil
      let status = 'STABIL';
      if (Math.abs(driftPct) > 3) status = 'DRIFT';
      else if (cv > 3 || outliers.length > 0) status = 'TIDAK STABIL';

      profiles.push({
        no_polisi: tk.no_polisi, truck_type: tk.truck_type, trip: tk.tares.length,
        tare_median: Math.round(med), mad: Math.round(mad), min, max, spread,
        cv, drift: Math.round(drift), drift_pct: driftPct,
        early_tare: Math.round(early), late_tare: Math.round(late),
        outlier_count: outliers.length, status,
        outliers: outliers.slice(0, 5).map(o => ({ no_seri: o.no_seri, tanggal: o.tanggal, tare: o.tare, dev: Math.round(o.tare - med) })),
      });
    });

    // Urutkan: yang paling bermasalah dulu (drift besar / cv tinggi)
    profiles.sort((a, b) => (Math.abs(b.drift_pct) + b.cv + b.outlier_count * 2) - (Math.abs(a.drift_pct) + a.cv + a.outlier_count * 2));

    const summary = {
      total_truck: profiles.length,
      stabil: profiles.filter(p => p.status === 'STABIL').length,
      drift: profiles.filter(p => p.status === 'DRIFT').length,
      tidak_stabil: profiles.filter(p => p.status === 'TIDAK STABIL').length,
      min_trip: minTrip,
    };

    res.json({ summary, profiles });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── B2. THROUGHPUT MONITOR — volume IN vs OUT per bulan + konversi ─── */
router.get('/throughput', async (req, res) => {
  try {
    const { tahun } = req.query;
    const pw = tahun ? `WHERE to_char(tanggal_masuk,'YYYY') = $1` : '';
    const pp = tahun ? [tahun] : [];

    // Arah produk dari master
    const prods = await db.all(`SELECT kode, arah FROM produk`);
    const arahMap = {};
    prods.forEach(p => { arahMap[p.kode] = p.arah; });

    // Volume per bulan per produk
    const monthly = await db.all(`
      SELECT to_char(tanggal_masuk, 'YYYY-MM') as bulan,
        produk,
        COUNT(*)::int as trip,
        SUM(berat_netto_wins)::bigint as netto
      FROM timbangan ${pw}
      ${pw ? 'AND' : 'WHERE'} tanggal_masuk IS NOT NULL AND produk IS NOT NULL AND produk != ''
      GROUP BY bulan, produk ORDER BY bulan, produk
    `, pp);

    // Pivot per bulan: total IN, total OUT, ratio
    const byMonth = {};
    monthly.forEach(m => {
      m.netto = Number(m.netto);
      const arah = arahMap[m.produk] || 'IN';
      if (!byMonth[m.bulan]) byMonth[m.bulan] = { bulan: m.bulan, in_kg: 0, out_kg: 0, in_trip: 0, out_trip: 0, produk: {} };
      byMonth[m.bulan].produk[m.produk] = { netto: m.netto, trip: m.trip, arah };
      if (arah === 'IN') { byMonth[m.bulan].in_kg += m.netto; byMonth[m.bulan].in_trip += m.trip; }
      else { byMonth[m.bulan].out_kg += m.netto; byMonth[m.bulan].out_trip += m.trip; }
    });

    const months = Object.values(byMonth).map(mm => ({
      ...mm,
      in_ton: +(mm.in_kg / 1000).toFixed(1),
      out_ton: +(mm.out_kg / 1000).toFixed(1),
      // Apparent conversion: OUT/IN (untuk refinery: produk jadi / bahan baku)
      conv_pct: mm.in_kg > 0 ? +(mm.out_kg / mm.in_kg * 100).toFixed(1) : null,
    })).sort((a, b) => a.bulan.localeCompare(b.bulan));

    // Total per produk (keseluruhan)
    const perProduk = await db.all(`
      SELECT produk, COUNT(*)::int as trip, SUM(berat_netto_wins)::bigint as netto,
        ROUND(AVG(berat_netto_wins)::numeric)::int as avg_netto
      FROM timbangan ${pw}
      ${pw ? 'AND' : 'WHERE'} produk IS NOT NULL AND produk != ''
      GROUP BY produk ORDER BY netto DESC
    `, pp);
    perProduk.forEach(p => { p.netto = Number(p.netto); p.arah = arahMap[p.produk] || 'IN'; p.ton = +(p.netto / 1000).toFixed(1); });

    const totIn = perProduk.filter(p => p.arah === 'IN').reduce((s, p) => s + p.netto, 0);
    const totOut = perProduk.filter(p => p.arah === 'OUT').reduce((s, p) => s + p.netto, 0);
    const summary = {
      total_in_ton: +(totIn / 1000).toFixed(1),
      total_out_ton: +(totOut / 1000).toFixed(1),
      conv_pct: totIn > 0 ? +(totOut / totIn * 100).toFixed(1) : null,
      months_count: months.length,
    };

    res.json({ summary, months, perProduk });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A2. FIRST-LAST PAIR — truk masuk 2× hari sama dgn netto identik ─── */
router.get('/same-day-pair', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';
    const tolNetto = parseInt(req.query.tol_netto) || 100; // toleransi netto (kg)

    // Cari truk yang muncul >1× di tanggal sama dengan netto sangat mirip
    const rows = await db.all(`
      WITH samehari AS (
        SELECT a.id as id_a, b.id as id_b, a.no_polisi, a.tanggal_masuk,
          a.berat_netto_wins as netto_a, b.berat_netto_wins as netto_b,
          a.relasi_nama as relasi_a, b.relasi_nama as relasi_b,
          a.produk, a.jam_masuk as jam_a, b.jam_masuk as jam_b,
          a.no_seri as seri_a, b.no_seri as seri_b,
          ABS(a.berat_netto_wins - b.berat_netto_wins) as selisih
        FROM timbangan a
        JOIN timbangan b ON a.no_polisi = b.no_polisi
          AND a.tanggal_masuk = b.tanggal_masuk
          AND a.id < b.id
          AND ABS(a.berat_netto_wins - b.berat_netto_wins) <= ${tolNetto}
        WHERE a.no_polisi IS NOT NULL AND a.no_polisi != ''
          AND a.berat_netto_wins > 0
          ${w}
      )
      SELECT * FROM samehari ORDER BY selisih ASC, tanggal_masuk DESC LIMIT 100
    `, params);

    const trucks = new Set(rows.map(r => r.no_polisi));
    res.json({
      summary: { flagged: rows.length, trucks_affected: trucks.size, tol_netto: tolNetto },
      flagged: rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A6. BENFORD 2ND-DIGIT — distribusi digit kedua netto ─── */
router.get('/benford-2nd', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const wAnd = w ? 'AND' : 'WHERE';

    // Digit kedua dari netto (butuh angka >= 10)
    const rows = await db.all(`
      SELECT SUBSTRING(berat_netto_wins::text FROM 2 FOR 1)::int as d2, COUNT(*)::int as n
      FROM timbangan ${w} ${wAnd} berat_netto_wins >= 10
      GROUP BY d2 ORDER BY d2
    `, params);

    // Probabilitas Benford digit kedua (d=0..9)
    const benford2 = [0.11968, 0.11389, 0.10882, 0.10433, 0.10031, 0.09668, 0.09337, 0.09035, 0.08757, 0.08500];
    const total = rows.reduce((s, r) => s + r.n, 0) || 1;
    const observed = Array(10).fill(0);
    rows.forEach(r => { if (r.d2 >= 0 && r.d2 <= 9) observed[r.d2] = r.n; });

    let chi2 = 0;
    const dist = benford2.map((p, d) => {
      const exp = p * total;
      const obs = observed[d];
      const contrib = exp > 0 ? (obs - exp) ** 2 / exp : 0;
      chi2 += contrib;
      return { digit: d, observed: obs, expected: +exp.toFixed(1), obs_pct: +(obs / total * 100).toFixed(2), exp_pct: +(p * 100).toFixed(2) };
    });

    // df = 9, alpha 0.05 → critical 16.92
    const critical = 16.92;
    const suspicious = chi2 > critical;

    res.json({
      total, chi2: +chi2.toFixed(2), critical, suspicious,
      verdict: suspicious ? 'PERHATIAN' : 'NORMAL',
      dist,
      disclaimer: 'Data timbangan terikat kapasitas truk (bounded), sehingga uji Benford bisa false-positive. Gunakan sebagai indikator awal, bukan bukti.',
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A7. DRIVER-TRUCK MISMATCH — pasangan driver-truk tak biasa ─── */
router.get('/driver-truck', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';

    const rows = await db.all(`
      SELECT no_polisi, driver, COUNT(*)::int as trip
      FROM timbangan
      WHERE no_polisi IS NOT NULL AND no_polisi != ''
        AND driver IS NOT NULL AND driver != ''
        ${w}
      GROUP BY no_polisi, driver
    `, params);

    // Per truk: total trip + driver dominan
    const perTruck = {};
    rows.forEach(r => {
      perTruck[r.no_polisi] = perTruck[r.no_polisi] || { no_polisi: r.no_polisi, total: 0, drivers: [] };
      perTruck[r.no_polisi].total += r.trip;
      perTruck[r.no_polisi].drivers.push({ driver: r.driver, trip: r.trip });
    });

    // Truk dengan terlalu banyak driver berbeda (>=4) — bisa indikasi truk "umum"
    const manyDrivers = Object.values(perTruck)
      .filter(t => t.total >= 8 && t.drivers.length >= 4)
      .map(t => ({ ...t, driver_count: t.drivers.length, drivers: t.drivers.sort((a, b) => b.trip - a.trip) }))
      .sort((a, b) => b.driver_count - a.driver_count).slice(0, 20);

    // Pasangan langka: driver yang hanya 1× di truk yang punya driver dominan jelas
    const rareTrips = [];
    Object.values(perTruck).forEach(t => {
      if (t.total < 8) return;
      const sorted = [...t.drivers].sort((a, b) => b.trip - a.trip);
      const dominant = sorted[0];
      if (dominant.trip / t.total < 0.5) return; // tidak ada dominan jelas
      sorted.slice(1).forEach(d => {
        if (d.trip / t.total < 0.1) {
          rareTrips.push({ no_polisi: t.no_polisi, driver: d.driver, trip: d.trip, total: t.total, dominant: dominant.driver, dominant_trip: dominant.trip, pct: +(d.trip / t.total * 100).toFixed(1) });
        }
      });
    });
    rareTrips.sort((a, b) => a.pct - b.pct);

    // Driver yang pakai banyak truk berbeda
    const driverTrucks = {};
    rows.forEach(r => {
      driverTrucks[r.driver] = driverTrucks[r.driver] || { driver: r.driver, trucks: 0, total: 0 };
      driverTrucks[r.driver].trucks++;
      driverTrucks[r.driver].total += r.trip;
    });
    const manyTrucks = Object.values(driverTrucks).filter(d => d.trucks >= 4).sort((a, b) => b.trucks - a.trucks).slice(0, 20);

    res.json({
      summary: { trucks_many_drivers: manyDrivers.length, rare_pairs: rareTrips.length, drivers_many_trucks: manyTrucks.length },
      manyDrivers, rareTrips: rareTrips.slice(0, 30), manyTrucks,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── A11. CONCENTRATION / COLLUSION INDICATOR ─── */
router.get('/concentration', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';

    // Konsentrasi transportir → operator: berapa % trip 1 transportir lewat 1 operator
    const rows = await db.all(`
      SELECT transportir, penimbang, relasi_nama, COUNT(*)::int as trip,
        SUM(berat_netto_wins)::bigint as netto
      FROM timbangan
      WHERE transportir IS NOT NULL AND transportir != ''
        AND penimbang IS NOT NULL AND penimbang != ''
        ${w}
      GROUP BY transportir, penimbang, relasi_nama
    `, params);

    // Agregasi per transportir
    const vendors = {};
    rows.forEach(r => {
      r.netto = Number(r.netto);
      if (!vendors[r.transportir]) vendors[r.transportir] = { transportir: r.transportir, total: 0, combos: [] };
      vendors[r.transportir].total += r.trip;
      vendors[r.transportir].combos.push(r);
    });

    // Untuk tiap vendor: cari kombo (operator+relasi) dominan & hitung konsentrasi
    const flagged = [];
    Object.values(vendors).forEach(v => {
      if (v.total < 10) return;
      const top = v.combos.sort((a, b) => b.trip - a.trip)[0];
      const conc = top.trip / v.total;
      // operator diversity
      const operators = new Set(v.combos.map(c => c.penimbang));
      if (conc > 0.6 && operators.size <= 2) {
        flagged.push({
          transportir: v.transportir, total: v.total,
          top_operator: top.penimbang, top_relasi: top.relasi_nama, top_trip: top.trip,
          concentration: +(conc * 100).toFixed(1),
          operator_count: operators.size,
        });
      }
    });
    flagged.sort((a, b) => b.concentration - a.concentration);

    // Matriks transportir × operator (top combos overall)
    const topCombos = rows.sort((a, b) => b.trip - a.trip).slice(0, 25);

    res.json({
      summary: { vendors_analyzed: Object.keys(vendors).length, flagged: flagged.length },
      flagged, topCombos,
      note: 'Konsentrasi tinggi (1 transportir selalu lewat 1 operator + 1 relasi) BUKAN bukti kolusi — bisa karena pembagian wilayah. Hanya indikator untuk diverifikasi.',
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── D1-D3,D8. KONSISTENSI ARAH — arah fisik timbang vs arah produk ─── */
router.get('/direction', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';

    // Arah master per produk
    const prods = await db.all(`SELECT kode, arah FROM produk`);
    const arahMap = {};
    prods.forEach(p => { arahMap[p.kode] = p.arah || 'IN'; });

    const rows = await db.all(`
      SELECT id, no_seri, no_polisi, truck_type, relasi_nama, transportir, produk,
        berat_masuk, berat_keluar, berat_netto_wins, tanggal_masuk
      FROM timbangan
      WHERE berat_masuk > 0 AND berat_keluar > 0 ${w}
      ORDER BY tanggal_masuk DESC, no_seri DESC
    `, params);

    const flagged = [];
    let flat = 0;
    const byProduk = {};
    rows.forEach(r => {
      const arahMaster = arahMap[r.produk] || 'IN';
      const arahFisik = r.berat_masuk > r.berat_keluar ? 'IN' : r.berat_keluar > r.berat_masuk ? 'OUT' : 'FLAT';
      byProduk[r.produk] = byProduk[r.produk] || { produk: r.produk, arah_master: arahMaster, total: 0, terbalik: 0, flat: 0 };
      byProduk[r.produk].total++;
      if (arahFisik === 'FLAT') {
        flat++; byProduk[r.produk].flat++;
        flagged.push({ ...r, arah_master: arahMaster, arah_fisik: arahFisik, severity: 'CRITICAL', alasan: 'Berat masuk = keluar (netto 0)' });
      } else if (arahFisik !== arahMaster) {
        byProduk[r.produk].terbalik++;
        flagged.push({ ...r, arah_master: arahMaster, arah_fisik: arahFisik, severity: 'CRITICAL', alasan: `Produk ${arahMaster} tapi pola fisik ${arahFisik} (kemungkinan masuk/keluar tertukar)` });
      }
    });

    const summary = {
      total: rows.length,
      terbalik: flagged.filter(f => f.alasan.includes('tertukar')).length,
      flat,
      flagged: flagged.length,
      ok: rows.length - flagged.length,
    };
    res.json({ summary, flagged: flagged.slice(0, 200), byProduk: Object.values(byProduk).filter(p => p.terbalik > 0 || p.flat > 0) });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST /direction/fix — tukar masuk<->keluar untuk daftar id (perbaikan terkontrol) */
router.post('/direction/fix', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(x => Number.isInteger(x)) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Daftar id kosong' });
    // Tukar masuk<->keluar; netto generated tetap (ABS)
    const r = await db.run(
      `UPDATE timbangan SET berat_masuk = berat_keluar, berat_keluar = berat_masuk, updated_at = NOW()
       WHERE id = ANY($1::int[])`, [ids]);
    res.json({ message: `${r.changes} trip diperbaiki (masuk<->keluar ditukar)`, fixed: r.changes });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── KONSISTENSI TRUK — klasifikasi kelas truk berbasis plat (median netto) ─── */
function classifyByNetto(median) {
  if (median >= 7000 && median <= 11500) return '6 Roda';
  if (median >= 12000 && median <= 17500) return '10 Roda';
  if (median >= 25000 && median <= 33000) return '12 Roda';
  return 'AMBIGU'; // celah 11.5-12k atau 17.5-25k atau >33k → tidak auto-koreksi
}
const medianOf = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

router.get('/truck-class', async (req, res) => {
  try {
    const { where, params } = buildPeriode(req);
    const w = where.length ? 'AND ' + where.join(' AND ') : '';
    const rows = await db.all(`
      SELECT id, no_seri, no_polisi, truck_type, produk, berat_netto_wins as netto, tanggal_masuk
      FROM timbangan
      WHERE no_polisi IS NOT NULL AND no_polisi != '' AND berat_netto_wins > 0 ${w}
      ORDER BY no_polisi, tanggal_masuk
    `, params);

    // Group per plat
    const plates = {};
    rows.forEach(r => {
      r.netto = Number(r.netto);
      if (!plates[r.no_polisi]) plates[r.no_polisi] = { no_polisi: r.no_polisi, trips: [], nettos: [], labels: {} };
      const p = plates[r.no_polisi];
      p.trips.push(r); p.nettos.push(r.netto);
      if (r.truck_type) p.labels[r.truck_type] = (p.labels[r.truck_type] || 0) + 1;
    });

    const plateSummary = [];
    const mismatchTrips = [];
    Object.values(plates).forEach(p => {
      if (p.trips.length < 2) return;
      const med = medianOf(p.nettos);
      const derived = classifyByNetto(med);
      const labelList = Object.entries(p.labels).sort((a, b) => b[1] - a[1]); // [label,count]
      const inconsistent = labelList.length > 1;
      // Trip yang labelnya beda dari kelas turunan (hanya jika derived jelas)
      let mismatchCount = 0;
      if (derived !== 'AMBIGU') {
        p.trips.forEach(t => {
          if (t.truck_type && t.truck_type !== derived) {
            mismatchCount++;
            mismatchTrips.push({
              id: t.id, no_seri: t.no_seri, no_polisi: t.no_polisi, produk: t.produk,
              netto: t.netto, tanggal_masuk: t.tanggal_masuk,
              label_input: t.truck_type, kelas_asli: derived,
            });
          }
        });
      }
      plateSummary.push({
        no_polisi: p.no_polisi, trip: p.trips.length, median: Math.round(med),
        kelas_asli: derived, inconsistent,
        labels: labelList.map(([k, v]) => `${k}×${v}`).join(', '),
        mismatch: mismatchCount,
      });
    });

    plateSummary.sort((a, b) => b.mismatch - a.mismatch || (b.inconsistent - a.inconsistent));
    mismatchTrips.sort((a, b) => a.no_polisi.localeCompare(b.no_polisi));

    const summary = {
      plat_total: plateSummary.length,
      plat_inconsistent: plateSummary.filter(p => p.inconsistent).length,
      plat_ambigu: plateSummary.filter(p => p.kelas_asli === 'AMBIGU').length,
      mismatch_trips: mismatchTrips.length,
    };
    res.json({
      summary,
      plates: plateSummary.filter(p => p.mismatch > 0 || p.inconsistent || p.kelas_asli === 'AMBIGU').slice(0, 100),
      mismatchTrips: mismatchTrips.slice(0, 300),
      note: 'Kelas asli = klasifikasi dari median netto historis plat. AMBIGU (netto 17.5-25k dll) tidak disarankan auto-koreksi — kemungkinan sub-kelas truk / band perlu ditinjau.',
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST /truck-class/fix — set truck_type sesuai kelas asli untuk daftar id */
router.post('/truck-class/fix', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const valid = items.filter(it => Number.isInteger(it.id) && ['6 Roda', '10 Roda', '12 Roda'].includes(it.truck_type));
    if (valid.length === 0) return res.status(400).json({ error: 'Tidak ada koreksi valid' });
    let fixed = 0;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const it of valid) {
        const r = await client.query(`UPDATE timbangan SET truck_type=$1, updated_at=NOW() WHERE id=$2`, [it.truck_type, it.id]);
        fixed += r.rowCount;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.json({ message: `${fixed} label truk dikoreksi`, fixed });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── DRILL-DOWN — ambil data timbangan lengkap dgn filter fleksibel ─── */
router.get('/trips', async (req, res) => {
  try {
    const cols = `id, no_seri, tanggal_masuk, jam_masuk, jam_keluar, no_polisi, produk,
      relasi_nama, berat_masuk, berat_keluar, berat_netto_wins, penimbang, driver,
      no_kontrak, do_number, transportir`;
    const { seri, ids, netto, produk, no_polisi, penimbang, driver, transportir, relasi, round, tahun, bulan } = req.query;
    const w = []; const p = []; let n = 1;

    if (seri) { const list = String(seri).split(',').map(s => s.trim()).filter(Boolean); w.push(`no_seri = ANY($${n++})`); p.push(list); }
    if (ids) { const list = String(ids).split(',').map(x => parseInt(x)).filter(Number.isInteger); w.push(`id = ANY($${n++})`); p.push(list); }
    if (netto != null && netto !== '') { w.push(`berat_netto_wins = $${n++}`); p.push(parseInt(netto)); }
    if (produk) { w.push(`produk = $${n++}`); p.push(produk); }
    if (no_polisi) { w.push(`no_polisi = $${n++}`); p.push(no_polisi); }
    if (penimbang) { w.push(`penimbang = $${n++}`); p.push(penimbang); }
    if (driver) { w.push(`driver = $${n++}`); p.push(driver); }
    if (transportir) { w.push(`transportir = $${n++}`); p.push(transportir); }
    if (relasi) { w.push(`relasi_nama = $${n++}`); p.push(relasi); }
    if (round === '1') { w.push(`berat_netto_wins % 100 = 0 AND berat_netto_wins > 0`); }
    if (tahun) { w.push(`to_char(tanggal_masuk,'YYYY') = $${n++}`); p.push(tahun); }
    if (bulan && bulan !== 'Semua') { w.push(`to_char(tanggal_masuk,'MM') = $${n++}`); p.push(String(bulan).padStart(2, '0')); }

    if (w.length === 0) return res.status(400).json({ error: 'Sertakan minimal 1 filter' });
    const rows = await db.all(`SELECT ${cols} FROM timbangan WHERE ${w.join(' AND ')} ORDER BY tanggal_masuk DESC, no_seri LIMIT 500`, p);
    res.json({ rows });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
