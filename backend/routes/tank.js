const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────── TANK INVENTORY — master tangki + pergerakan stok ───────── */

// GET semua tangki + stok terkini (closing terakhir) + utilisasi
router.get('/', async (req, res) => {
  try {
    const tanks = await db.all(`SELECT * FROM tank WHERE aktif = 1 ORDER BY kode, nama`);
    // Stok terkini = closing dari movement terbaru per tangki
    for (const t of tanks) {
      const last = await db.get(`SELECT closing, tanggal FROM tank_movement WHERE tank_id = $1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [t.id]);
      t.stok = last ? Number(last.closing) : 0;
      t.last_update = last ? last.tanggal : null;
      t.util_pct = t.kapasitas_mt > 0 ? +(t.stok / t.kapasitas_mt * 100).toFixed(1) : 0;
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
    const { kode, nama, produk, kapasitas_mt, lokasi } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama tangki wajib' });
    const r = await db.get(`INSERT INTO tank (kode, nama, produk, kapasitas_mt, lokasi) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [kode || null, nama, produk || null, Number(kapasitas_mt) || 0, lokasi || null]);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// PUT update tangki
router.put('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const { kode, nama, produk, kapasitas_mt, lokasi, aktif } = req.body;
    await db.run(`UPDATE tank SET kode=$1, nama=$2, produk=$3, kapasitas_mt=$4, lokasi=$5, aktif=$6 WHERE id=$7`,
      [kode || null, nama, produk || null, Number(kapasitas_mt) || 0, lokasi || null, aktif ?? 1, req.params.id]);
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

module.exports = router;
