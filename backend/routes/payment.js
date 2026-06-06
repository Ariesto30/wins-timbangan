const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────── PAYMENT & AGING — arus kas: Piutang (jual) vs Hutang (beli CPO) ───────── */

// Klasifikasi arus kas berdasar PRODUK:
//  CPO = barang masuk → beli → KAS KELUAR (hutang/payable)
//  Olein/RBDPL/Stearin/RBDPS/PFAD/RBDPO = produk keluar → jual → KAS MASUK (piutang/receivable)
const BELI = new Set(['CPO']);
const tipeKas = produk => BELI.has(String(produk || '').toUpperCase()) ? 'hutang' : 'piutang';

// Bangun ringkasan + bucket umur dari sekumpulan baris kontrak
function buildAging(kontrak, today) {
  const buckets = { lancar: 0, b30: 0, b60: 0, b90: 0, b90plus: 0 };
  let totalOutstanding = 0, totalNilai = 0, totalBayar = 0;
  const rows = kontrak.map(k => {
    const nilai = Number(k.nilai_kontrak) || 0;
    const bayar = Number(k.dibayar) || 0;
    const sisa = nilai - bayar;
    totalNilai += nilai; totalBayar += bayar;
    let umur = null, bucket = 'lancar';
    if (sisa > 0.01 && k.jatuh_tempo) {
      umur = Math.floor((today - new Date(k.jatuh_tempo)) / 86400000);
      if (umur <= 0) bucket = 'lancar';
      else if (umur <= 30) bucket = 'b30';
      else if (umur <= 60) bucket = 'b60';
      else if (umur <= 90) bucket = 'b90';
      else bucket = 'b90plus';
      buckets[bucket] += sisa; totalOutstanding += sisa;
    } else if (sisa > 0.01) { buckets.lancar += sisa; totalOutstanding += sisa; }
    return { ...k, tipe: tipeKas(k.produk), nilai_kontrak: nilai, dibayar: bayar, sisa,
      pct_bayar: nilai > 0 ? +(bayar / nilai * 100).toFixed(1) : 0, umur_hari: umur, bucket, lunas: sisa <= 0.01 };
  });
  const summary = {
    total_kontrak: rows.length, total_nilai: Math.round(totalNilai), total_bayar: Math.round(totalBayar),
    total_outstanding: Math.round(totalOutstanding), lunas: rows.filter(r => r.lunas).length,
    overdue: Math.round(rows.filter(r => !r.lunas && r.umur_hari > 0).reduce((s, r) => s + r.sisa, 0)),
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(v)])),
  };
  const outstanding = rows.filter(r => !r.lunas).sort((a, b) => (b.umur_hari || -999) - (a.umur_hari || -999));
  return { summary, outstanding, all: rows };
}

// GET aging: dipisah Piutang (penjualan) & Hutang (pembelian CPO) + posisi kas
router.get('/aging', async (req, res) => {
  try {
    const kontrak = await db.all(`
      SELECT k.no_kontrak, k.relasi_nama, k.produk, k.arah,
        k.nilai_kontrak, k.jatuh_tempo, k.tanggal_penyerahan,
        COALESCE((SELECT SUM(jumlah) FROM pembayaran WHERE no_kontrak = k.no_kontrak), 0) as dibayar
      FROM kontrak k WHERE k.nilai_kontrak > 0 ORDER BY k.jatuh_tempo NULLS LAST
    `);
    const today = new Date();
    const piutangK = kontrak.filter(k => tipeKas(k.produk) === 'piutang');
    const hutangK = kontrak.filter(k => tipeKas(k.produk) === 'hutang');
    const piutang = buildAging(piutangK, today);
    const hutang = buildAging(hutangK, today);
    const net = {
      piutang_outstanding: piutang.summary.total_outstanding,   // kas akan MASUK
      hutang_outstanding: hutang.summary.total_outstanding,     // kas akan KELUAR
      posisi_bersih: piutang.summary.total_outstanding - hutang.summary.total_outstanding,
      piutang_overdue: piutang.summary.overdue,
      hutang_overdue: hutang.summary.overdue,
    };
    // gabungan lama untuk kompatibilitas
    const all = buildAging(kontrak, today);
    res.json({ piutang, hutang, net, summary: all.summary, outstanding: all.outstanding, all: all.all });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// GET pembayaran satu kontrak
router.get('/kontrak/:no', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM pembayaran WHERE no_kontrak = $1 ORDER BY tanggal DESC`, [req.params.no]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST pembayaran
router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.no_kontrak || !b.tanggal) return res.status(400).json({ error: 'No kontrak & tanggal wajib' });
    // ambil relasi dari kontrak
    const k = await db.get(`SELECT relasi_nama FROM kontrak WHERE no_kontrak = $1`, [b.no_kontrak]);
    const r = await db.get(`INSERT INTO pembayaran (no_kontrak, relasi_nama, tanggal, jumlah, metode, keterangan, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.no_kontrak, k?.relasi_nama || b.relasi_nama || null, b.tanggal, Number(b.jumlah) || 0, b.metode || null, b.keterangan || null, req.user.id]);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try { await db.run(`DELETE FROM pembayaran WHERE id=$1`, [req.params.id]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
