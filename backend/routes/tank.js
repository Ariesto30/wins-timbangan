const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

/* Rekam snapshot stok semua tangki utk tanggal tertentu (dipakai route + cron) */
async function captureSnapshot(tanggal) {
  const tgl = tanggal || new Date().toISOString().slice(0, 10);
  const tanks = await db.all(`SELECT id, produk, kapasitas_mt FROM tank WHERE aktif=1`);
  let n = 0;
  for (const t of tanks) {
    const last = await db.get(`SELECT closing FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [t.id]);
    const stok = last ? Number(last.closing) : 0;
    const util = t.kapasitas_mt > 0 ? +(stok / t.kapasitas_mt * 100).toFixed(1) : 0;
    await db.run(`INSERT INTO tank_snapshot (tanggal, tank_id, produk, stok_mt, kapasitas_mt, util)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (tanggal, tank_id) DO UPDATE SET stok_mt=EXCLUDED.stok_mt, util=EXCLUDED.util`,
      [tgl, t.id, t.produk, stok, t.kapasitas_mt, util]);
    n++;
  }
  return { tanggal: tgl, captured: n };
}

router.use(authenticate);

/* Setel stok terkini sebuah tangki ke nilai target dgn membuat pergerakan
   penyesuaian (selisih vs closing terakhir). Dipakai form Edit/Tangki Baru. */
async function setStok(tankId, target, userId) {
  const last = await db.get(`SELECT closing FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [tankId]);
  const opening = last ? Number(last.closing) : 0;
  const tgt = Number(target);
  if (!isFinite(tgt) || Math.abs(tgt - opening) < 1e-6) return; // tak berubah
  const delta = tgt - opening;
  const inb = delta > 0 ? delta : 0;
  const outb = delta < 0 ? -delta : 0;
  const tanggal = new Date().toISOString().slice(0, 10);
  await db.run(`INSERT INTO tank_movement (tank_id, tanggal, opening, inbound, outbound, closing, catatan, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tankId, tanggal, opening, inb, outb, tgt, 'Penyesuaian stok (set manual)', userId || null]);
}

/* ───────── TANK INVENTORY — master tangki + pergerakan stok ───────── */

// GET semua tangki + stok terkini (closing terakhir) + utilisasi + retensi
router.get('/', async (req, res) => {
  try {
    // Auto-rekam snapshot stok harian (sekali per hari) agar tren utilisasi terisi bertahap
    const todayStr = new Date().toISOString().slice(0, 10);
    const snapToday = await db.get(`SELECT 1 FROM tank_snapshot WHERE tanggal=$1 LIMIT 1`, [todayStr]).catch(() => null);
    if (!snapToday) { try { await captureSnapshot(todayStr); } catch (_) { } }

    const tanks = await db.all(`SELECT * FROM tank WHERE aktif = 1 ORDER BY no_urut NULLS LAST, kode, nama`);
    const today = new Date();
    // Stok terkini = closing dari movement terbaru per tangki
    for (const t of tanks) {
      const last = await db.get(`SELECT closing, tanggal FROM tank_movement WHERE tank_id = $1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [t.id]);
      t.stok = last ? Number(last.closing) : 0;
      t.last_update = last ? last.tanggal : null;
      t.util_pct = t.kapasitas_mt > 0 ? +(t.stok / t.kapasitas_mt * 100).toFixed(1) : 0;
      // Hari tersimpan sejak akhir filling
      t.hari_tersimpan = t.akhir_filling ? Math.floor((today - new Date(t.akhir_filling)) / 86400000) : null;
    }
    const summary = {
      total_tank: tanks.length,
      total_kapasitas: +tanks.reduce((s, t) => s + (Number(t.kapasitas_mt) || 0), 0).toFixed(1),
      total_stok: +tanks.reduce((s, t) => s + (t.stok || 0), 0).toFixed(1),
      penuh: tanks.filter(t => t.util_pct >= 90).length,
      kosong: tanks.filter(t => t.util_pct < 10).length,
    };
    summary.util_pct = summary.total_kapasitas > 0 ? +(summary.total_stok / summary.total_kapasitas * 100).toFixed(1) : 0;

    // Akumulasi per produk: MT / Kg / Liter (Liter = Kg ÷ density)
    const densRows = await db.all(`SELECT produk, density FROM produk_density`);
    const densMap = {}; densRows.forEach(d => densMap[d.produk] = Number(d.density));
    const akum = {};
    tanks.forEach(t => {
      const p = t.produk || 'Lainnya';
      akum[p] = (akum[p] || 0) + (t.stok || 0);
    });
    const akumulasi = Object.entries(akum).map(([produk, mt]) => {
      const density = densMap[produk] || 0.9;
      const kg = mt * 1000;
      return { produk, density, total_mt: +mt.toFixed(3), total_kg: Math.round(kg), total_liter: Math.round(kg / density) };
    }).sort((a, b) => b.total_mt - a.total_mt);
    const grand = {
      total_mt: +akumulasi.reduce((s, a) => s + a.total_mt, 0).toFixed(3),
      total_kg: akumulasi.reduce((s, a) => s + a.total_kg, 0),
      total_liter: akumulasi.reduce((s, a) => s + a.total_liter, 0),
    };

    res.json({ summary, tanks, akumulasi, grand });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// GET/PUT density produk (kg/liter) — bisa disesuaikan pabrik
router.get('/density', async (req, res) => {
  try { res.json(await db.all(`SELECT produk, density FROM produk_density ORDER BY produk`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/density', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : (req.body.list || []);
    for (const d of list) {
      if (!d.produk || d.density == null) continue;
      await db.run(`INSERT INTO produk_density (produk, density, updated_at) VALUES ($1,$2,NOW())
        ON CONFLICT (produk) DO UPDATE SET density=EXCLUDED.density, updated_at=NOW()`, [d.produk, Number(d.density)]);
    }
    res.json({ message: 'Density tersimpan' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST tangki baru
router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.nama) return res.status(400).json({ error: 'Nama tangki wajib' });
    const r = await db.get(`INSERT INTO tank (no_urut, kode, nama, produk, kapasitas_mt, lokasi, awal_filling, akhir_filling, be_digunakan, catatan)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.no_urut || null, b.kode || null, b.nama, b.produk || null, Number(b.kapasitas_mt) || 0, b.lokasi || null,
        b.awal_filling || null, b.akhir_filling || null, b.be_digunakan || null, b.catatan || null]);
    if (b.stok_set != null && b.stok_set !== '') await setStok(r.id, b.stok_set, req.user.id);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// PUT update tangki — peruntukan (produk/kapasitas/nama) editable, no_urut tetap stabil
router.put('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE tank SET no_urut=$1, kode=$2, nama=$3, produk=$4, kapasitas_mt=$5, lokasi=$6,
      awal_filling=$7, akhir_filling=$8, be_digunakan=$9, catatan=$10, aktif=$11 WHERE id=$12`,
      [b.no_urut || null, b.kode || null, b.nama, b.produk || null, Number(b.kapasitas_mt) || 0, b.lokasi || null,
        b.awal_filling || null, b.akhir_filling || null, b.be_digunakan || null, b.catatan || null, b.aktif ?? 1, req.params.id]);
    if (b.stok_set != null && b.stok_set !== '') await setStok(req.params.id, b.stok_set, req.user.id);
    res.json({ message: 'Tersimpan' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try { await db.run(`DELETE FROM tank WHERE id=$1`, [req.params.id]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET riwayat pergerakan satu tangki
router.get('/:id/movements', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal DESC, id DESC LIMIT 100`, [req.params.id]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Hitung ulang rantai opening/closing satu tangki (urut tanggal lalu id).
// Dipanggil setiap add/edit/delete agar stok selalu konsisten.
async function recalcChain(tankId) {
  const rows = await db.all(`SELECT id, inbound, outbound FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal ASC, id ASC`, [tankId]);
  let opening = 0;
  for (const r of rows) {
    const closing = opening + Number(r.inbound || 0) - Number(r.outbound || 0);
    await db.run(`UPDATE tank_movement SET opening=$1, closing=$2 WHERE id=$3`, [opening, closing, r.id]);
    opening = closing;
  }
}

// POST pergerakan stok baru (opening/closing dihitung ulang via rantai)
router.post('/:id/movements', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { tanggal, inbound, outbound, catatan } = req.body;
    if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib' });
    const r = await db.get(`INSERT INTO tank_movement (tank_id, tanggal, opening, inbound, outbound, closing, catatan, created_by)
      VALUES ($1,$2,0,$3,$4,0,$5,$6) RETURNING *`,
      [req.params.id, tanggal, Number(inbound) || 0, Number(outbound) || 0, catatan || null, req.user.id]);
    await recalcChain(req.params.id);
    const updated = await db.get(`SELECT * FROM tank_movement WHERE id=$1`, [r.id]);
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// PUT edit pergerakan (revisi tanpa hapus) — opening/closing seluruh rantai di-recalc
router.put('/movements/:mid', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { tanggal, inbound, outbound, catatan } = req.body;
    const mv = await db.get(`SELECT tank_id FROM tank_movement WHERE id=$1`, [req.params.mid]);
    if (!mv) return res.status(404).json({ error: 'Pergerakan tidak ditemukan' });
    if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib' });
    await db.run(`UPDATE tank_movement SET tanggal=$1, inbound=$2, outbound=$3, catatan=$4 WHERE id=$5`,
      [tanggal, Number(inbound) || 0, Number(outbound) || 0, catatan || null, req.params.mid]);
    await recalcChain(mv.tank_id);
    const updated = await db.get(`SELECT * FROM tank_movement WHERE id=$1`, [req.params.mid]);
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/movements/:mid', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const mv = await db.get(`SELECT tank_id FROM tank_movement WHERE id=$1`, [req.params.mid]);
    await db.run(`DELETE FROM tank_movement WHERE id=$1`, [req.params.mid]);
    if (mv) await recalcChain(mv.tank_id);
    res.json({ message: 'Terhapus' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /snapshot — rekam stok hari ini */
router.post('/snapshot', requireRole('admin', 'manajer'), async (req, res) => {
  try { res.json(await captureSnapshot(req.body.tanggal)); }
  catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /forecast — prediksi hari menuju penuh/kosong dari tren snapshot */
router.get('/forecast', async (req, res) => {
  try {
    const tanks = await db.all(`SELECT id, no_urut, nama, produk, kapasitas_mt FROM tank WHERE aktif=1 ORDER BY no_urut`);
    const out = [];
    for (const t of tanks) {
      const snaps = await db.all(`SELECT tanggal, stok_mt FROM tank_snapshot WHERE tank_id=$1 ORDER BY tanggal DESC LIMIT 14`, [t.id]);
      if (snaps.length < 2) { out.push({ ...t, status: 'DATA KURANG', n: snaps.length }); continue; }
      const newest = snaps[0], oldest = snaps[snaps.length - 1];
      const days = Math.max(1, Math.round((new Date(newest.tanggal) - new Date(oldest.tanggal)) / 86400000));
      const rate = (Number(newest.stok_mt) - Number(oldest.stok_mt)) / days; // MT/hari
      const stok = Number(newest.stok_mt), kap = Number(t.kapasitas_mt);
      let prediksi = null, arah = 'stabil';
      if (rate > 0.1) { arah = 'naik'; prediksi = kap > stok ? Math.round((kap - stok) / rate) : 0; }
      else if (rate < -0.1) { arah = 'turun'; prediksi = stok > 0 ? Math.round(stok / -rate) : 0; }
      out.push({ no_urut: t.no_urut, nama: t.nama, produk: t.produk, stok: +stok.toFixed(1), kapasitas: kap, util: +(stok / kap * 100).toFixed(1), rate: +rate.toFixed(1), arah, prediksi_hari: prediksi, n: snaps.length });
    }
    res.json({ forecast: out });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /trend?days=7 — utilisasi total + per produk per hari (dari snapshot) */
router.get('/trend', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const rows = await db.all(`
      SELECT tanggal, produk, SUM(stok_mt) stok, SUM(kapasitas_mt) kap
      FROM tank_snapshot WHERE tanggal >= CURRENT_DATE - $1::int
      GROUP BY tanggal, produk ORDER BY tanggal`, [days]);
    // peta: tanggal -> { total, perProduk }
    const byDate = {};
    for (const r of rows) {
      const d = String(r.tanggal).slice(0, 10);
      byDate[d] = byDate[d] || { tanggal: d, _totStok: 0, _totKap: 0 };
      const util = r.kap > 0 ? +(r.stok / r.kap * 100).toFixed(1) : 0;
      byDate[d][r.produk] = util;
      byDate[d]._totStok += Number(r.stok); byDate[d]._totKap += Number(r.kap);
    }
    const series = Object.values(byDate).map(d => {
      const total = d._totKap > 0 ? +(d._totStok / d._totKap * 100).toFixed(1) : 0;
      const { _totStok, _totKap, ...rest } = d;
      return { ...rest, Total: total };
    });
    const produk = [...new Set(rows.map(r => r.produk))];
    res.json({ series, produk, hari: series.length });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.captureSnapshot = captureSnapshot;
