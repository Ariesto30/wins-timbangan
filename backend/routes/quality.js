const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────── QUALITY LOG — parameter lab per sampel/batch ───────── */

// Ambang spec umum (bisa disesuaikan): FFA CPO < 5%, M&I < 0.25%
const SPEC = {
  CPO:   { ffa: 5.0, mni: 0.25 },
  RBDPL: { ffa: 0.1, mni: 0.10 },
  RBDPS: { ffa: 0.2, mni: 0.10 },
};

router.get('/', async (req, res) => {
  try {
    const { produk, relasi, tahun, bulan } = req.query;
    const w = []; const p = []; let n = 1;
    if (produk && produk !== 'Semua') { w.push(`produk = $${n++}`); p.push(produk); }
    if (relasi) { w.push(`relasi_nama ILIKE $${n++}`); p.push(`%${relasi}%`); }
    if (tahun) { w.push(`to_char(tanggal,'YYYY') = $${n++}`); p.push(tahun); }
    if (bulan && bulan !== 'Semua') { w.push(`to_char(tanggal,'MM') = $${n++}`); p.push(String(bulan).padStart(2, '0')); }
    const where = w.length ? 'WHERE ' + w.join(' AND ') : '';

    const rows = await db.all(`SELECT * FROM quality_log ${where} ORDER BY tanggal DESC, id DESC LIMIT 500`, p);

    // Tandai off-spec
    rows.forEach(r => {
      const spec = SPEC[r.produk];
      r.flags = [];
      if (spec) {
        if (r.ffa != null && r.ffa > spec.ffa) r.flags.push(`FFA ${r.ffa}% > ${spec.ffa}%`);
        if (r.mni != null && r.mni > spec.mni) r.flags.push(`M&I ${r.mni}% > ${spec.mni}%`);
      }
      r.off_spec = r.flags.length > 0;
    });

    // Trend FFA per produk per bulan
    const trend = await db.all(`
      SELECT to_char(tanggal,'YYYY-MM') as bulan, produk,
        ROUND(AVG(ffa)::numeric,3)::float as avg_ffa,
        ROUND(AVG(mni)::numeric,3)::float as avg_mni,
        COUNT(*)::int as n
      FROM quality_log ${where} ${where ? 'AND' : 'WHERE'} ffa IS NOT NULL
      GROUP BY bulan, produk ORDER BY bulan, produk
    `, p);

    const summary = {
      total: rows.length,
      off_spec: rows.filter(r => r.off_spec).length,
      avg_ffa: rows.filter(r => r.ffa != null).length
        ? +(rows.filter(r => r.ffa != null).reduce((s, r) => s + r.ffa, 0) / rows.filter(r => r.ffa != null).length).toFixed(3)
        : null,
    };

    res.json({ summary, rows, trend, spec: SPEC });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.tanggal) return res.status(400).json({ error: 'Tanggal wajib' });
    const r = await db.get(`INSERT INTO quality_log (tanggal, produk, relasi_nama, sampel, ffa, mni, iv, dobi, color, catatan, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.tanggal, b.produk || null, b.relasi_nama || null, b.sampel || null,
        num(b.ffa), num(b.mni), num(b.iv), num(b.dobi), b.color || null, b.catatan || null, req.user.id]);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE quality_log SET tanggal=$1, produk=$2, relasi_nama=$3, sampel=$4, ffa=$5, mni=$6, iv=$7, dobi=$8, color=$9, catatan=$10 WHERE id=$11`,
      [b.tanggal, b.produk || null, b.relasi_nama || null, b.sampel || null,
        num(b.ffa), num(b.mni), num(b.iv), num(b.dobi), b.color || null, b.catatan || null, req.params.id]);
    res.json({ message: 'Tersimpan' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try { await db.run(`DELETE FROM quality_log WHERE id=$1`, [req.params.id]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

function num(v) { return v === '' || v == null ? null : Number(v); }

module.exports = router;
