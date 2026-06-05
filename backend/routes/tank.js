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
    res.json({ summary, tanks });
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

// POST pergerakan stok baru (opening auto = closing terakhir)
router.post('/:id/movements', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { tanggal, inbound, outbound, catatan } = req.body;
    if (!tanggal) return res.status(400).json({ error: 'Tanggal wajib' });
    const last = await db.get(`SELECT closing FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [req.params.id]);
    const opening = last ? Number(last.closing) : 0;
    const inb = Number(inbound) || 0;
    const outb = Number(outbound) || 0;
    const closing = opening + inb - outb;
    const r = await db.get(`INSERT INTO tank_movement (tank_id, tanggal, opening, inbound, outbound, closing, catatan, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, tanggal, opening, inb, outb, closing, catatan || null, req.user.id]);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/movements/:mid', requireRole('admin', 'manajer'), async (req, res) => {
  try { await db.run(`DELETE FROM tank_movement WHERE id=$1`, [req.params.mid]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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

module.exports = router;
module.exports.captureSnapshot = captureSnapshot;
