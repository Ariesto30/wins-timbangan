const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────── PRODUKSI REFINERY — neraca massa harian, yield, sounding, cross-check ───────── */

const pct = (a, b) => (b ? +(a / b * 100).toFixed(2) : 0);

// Hitung yield/loss dari sekumpulan total periode
function yields(t) {
  const refining_yield = pct(t.rbdpo, t.cpo_feed);        // RBDPO diproduksi / CPO diolah
  const pfad_yield = pct(t.pfad, t.cpo_feed);             // PFAD / CPO diolah
  const refining_loss = +(100 - refining_yield - pfad_yield).toFixed(2); // sisa = loss + reject
  const olein_yield = pct(t.olein, t.rbdpo_feed);          // Olein / RBDPO difraksinasi
  const stearin_yield = pct(t.stearin, t.rbdpo_feed);
  const frac_loss = +(100 - olein_yield - stearin_yield).toFixed(2);
  const cpo_reject_pct = pct(t.cpo_reject, t.cpo_feed);
  const rbdpo_reject_pct = pct(t.rbdpo_reject, t.rbdpo_feed);
  return { refining_yield, pfad_yield, refining_loss, olein_yield, stearin_yield, frac_loss, cpo_reject_pct, rbdpo_reject_pct };
}

const SUMCOLS = ['cpo_in', 'cpo_feed', 'cpo_reject', 'rbdpo', 'rbdpo_feed', 'rbdpo_reject', 'olein', 'olein_reject', 'olein_despatch', 'stearin', 'stearin_reject', 'stearin_despatch', 'pfad'];
const sumSql = SUMCOLS.map(c => `COALESCE(SUM(${c}),0) ${c}`).join(',');

/* GET /daily — baris harian + yield harian */
router.get('/daily', async (req, res) => {
  try {
    const { from, to } = req.query;
    const cond = []; const args = [];
    if (from) { args.push(from); cond.push(`tanggal >= $${args.length}`); }
    if (to) { args.push(to); cond.push(`tanggal <= $${args.length}`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const rows = await db.all(`SELECT * FROM production_log ${where} ORDER BY tanggal DESC`, args);
    res.json(rows.map(r => ({ ...r, _yield: yields(r) })));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /summary — KPI total + yield keseluruhan + rekap bulanan + tren */
router.get('/summary', async (req, res) => {
  try {
    const tot = await db.get(`SELECT ${sumSql}, COUNT(*)::int hari, MIN(tanggal) mn, MAX(tanggal) mx FROM production_log`);
    const months = await db.all(`SELECT to_char(tanggal,'YYYY-MM') ym, ${sumSql} FROM production_log GROUP BY ym ORDER BY ym`);
    const monthly = months.map(m => {
      const obj = {}; SUMCOLS.forEach(c => obj[c] = +(+m[c]).toFixed(2));
      return { ym: m.ym, ...obj, _yield: yields(m) };
    });
    res.json({
      periode: { hari: tot.hari, dari: tot.mn, sampai: tot.mx },
      total: SUMCOLS.reduce((o, c) => (o[c] = +(+tot[c]).toFixed(1), o), {}),
      yield: yields(tot),
      monthly,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /sounding — rekonsiliasi sounding vs buku, dikelompok per periode */
router.get('/sounding', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM sounding_recon ORDER BY periode DESC, produk`);
    const byPeriod = {};
    for (const r of rows) {
      const k = r.periode_label || String(r.periode);
      (byPeriod[k] = byPeriod[k] || { periode: r.periode, label: k, items: [] }).items.push({
        produk: r.produk, sounding: +r.sounding_kg, dc: +r.dc_kg,
        var_kg: +r.variance_kg, var_pct: +r.variance_pct,
        // toleransi 0,5% absolut → flag
        flag: Math.abs(+r.variance_pct) > 0.5 ? (Math.abs(+r.variance_pct) > 1 ? 'tinggi' : 'sedang') : 'ok',
      });
    }
    res.json(Object.values(byPeriod).sort((a, b) => new Date(b.periode) - new Date(a.periode)));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /crosscheck — CPO IN (produksi) vs CPO diterima (timbangan) per bulan */
router.get('/crosscheck', async (req, res) => {
  try {
    const prod = await db.all(`SELECT to_char(tanggal,'YYYY-MM') ym, COALESCE(SUM(cpo_in),0) mt FROM production_log GROUP BY ym ORDER BY ym`);
    const timb = await db.all(`SELECT to_char(tanggal_masuk,'YYYY-MM') ym, COALESCE(SUM(berat_netto_wins),0)/1000.0 mt
      FROM timbangan WHERE produk='CPO' GROUP BY ym`);
    const tmap = {}; timb.forEach(t => tmap[t.ym] = +t.mt);
    const rows = prod.map(p => {
      const prodMt = +(+p.mt).toFixed(2), timbMt = +(tmap[p.ym] || 0).toFixed(2);
      const dKg = +((prodMt - timbMt) * 1000).toFixed(0);
      const dPct = timbMt ? +((prodMt - timbMt) / timbMt * 100).toFixed(2) : null;
      return { ym: p.ym, produksi_cpo_in: prodMt, timbangan_cpo: timbMt, selisih_kg: dKg, selisih_pct: dPct,
        flag: timbMt === 0 ? 'no-timbangan' : (Math.abs(dPct) > 2 ? 'tinggi' : Math.abs(dPct) > 0.5 ? 'sedang' : 'ok') };
    });
    const totProd = rows.reduce((s, r) => s + r.produksi_cpo_in, 0);
    const totTimb = rows.reduce((s, r) => s + r.timbangan_cpo, 0);
    res.json({ rows, total: { produksi: +totProd.toFixed(1), timbangan: +totTimb.toFixed(1), selisih_mt: +(totProd - totTimb).toFixed(1) } });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST / — input/update satu hari (manual) */
router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.tanggal) return res.status(400).json({ error: 'Tanggal wajib' });
    const cols = ['cpo_in', 'cpo_stock_timbangan', 'cpo_stock', 'cpo_feed', 'cpo_reject', 'cpo_stock_akhir', 'rbdpo', 'rbdpo_feed', 'rbdpo_reject', 'rbdpo_stock', 'olein', 'olein_reject', 'olein_despatch', 'stearin', 'stearin_reject', 'stearin_despatch', 'pfad', 'catatan'];
    const vals = [b.tanggal, ...cols.map(c => c === 'catatan' ? (b[c] || null) : (Number(b[c]) || 0)), req.user.id];
    const ph = cols.map((_, i) => `$${i + 2}`).join(',');
    const upd = cols.map(c => `${c}=EXCLUDED.${c}`).join(',');
    const r = await db.get(`INSERT INTO production_log (tanggal,${cols.join(',')},created_by)
      VALUES ($1,${ph},$${cols.length + 2})
      ON CONFLICT (tanggal) DO UPDATE SET ${upd}, updated_at=NOW() RETURNING *`, vals);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try { await db.run(`DELETE FROM production_log WHERE id=$1`, [req.params.id]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
