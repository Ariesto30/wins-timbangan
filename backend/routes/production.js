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

/* GET /crosscheck — CPO IN (produksi) vs CPO diterima (timbangan) per bulan.
   Apple-to-apple: timbangan dibatasi ke rentang tanggal log produksi (atau from/to). */
router.get('/crosscheck', async (req, res) => {
  try {
    const rng = await db.get(`SELECT MIN(tanggal) mn, MAX(tanggal) mx FROM production_log`);
    const from = req.query.from || rng.mn;
    const to = req.query.to || rng.mx;
    const prod = await db.all(`SELECT to_char(tanggal,'YYYY-MM') ym, COALESCE(SUM(cpo_in),0) mt
      FROM production_log WHERE tanggal BETWEEN $1 AND $2 GROUP BY ym ORDER BY ym`, [from, to]);
    const timb = await db.all(`SELECT to_char(tanggal_masuk,'YYYY-MM') ym, COALESCE(SUM(berat_netto_wins),0)/1000.0 mt
      FROM timbangan WHERE produk='CPO' AND tanggal_masuk BETWEEN $1 AND $2 GROUP BY ym`, [from, to]);
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
    // Interpretasi otomatis: pisahkan bulan "cocok" (steady-state) vs "selisih besar"
    const steady = rows.filter(r => r.selisih_pct != null && Math.abs(r.selisih_pct) <= 2);
    const besar = rows.filter(r => r.selisih_pct != null && Math.abs(r.selisih_pct) > 2);
    const gapBesar = besar.reduce((s, r) => s + r.selisih_kg, 0) / 1000;
    const insight = {
      steady_bulan: steady.map(r => r.ym),
      selisih_bulan: besar.map(r => ({ ym: r.ym, mt: +(r.selisih_kg / 1000).toFixed(1) })),
      gap_besar_mt: +gapBesar.toFixed(1),
      narasi: besar.length
        ? `${steady.length} bulan cocok (±2%). Selisih besar terkonsentrasi di ${besar.map(r => r.ym).join(', ')} — total ${gapBesar.toFixed(0)} MT. Selisih negatif = CPO diterima > diolah (penumpukan stok / commissioning), bukan kehilangan.`
        : `Semua ${steady.length} bulan cocok dalam toleransi ±2%.`,
    };
    res.json({ rows, rentang: { dari: from, sampai: to }, insight, total: { produksi: +totProd.toFixed(1), timbangan: +totTimb.toFixed(1), selisih_mt: +(totProd - totTimb).toFixed(1) } });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /aggregate?from&to — total log harian dlm bentuk refinery_balance (utk Ringkasan Periode) */
router.get('/aggregate', async (req, res) => {
  try {
    const rng = await db.get(`SELECT MIN(tanggal) mn, MAX(tanggal) mx FROM production_log`);
    const from = req.query.from || rng.mn, to = req.query.to || rng.mx;
    const t = await db.get(`SELECT ${sumSql} FROM production_log WHERE tanggal BETWEEN $1 AND $2`, [from, to]);
    // stok = nilai hari terakhir dalam rentang
    const last = await db.get(`SELECT cpo_stock_akhir, rbdpo_stock FROM production_log WHERE tanggal BETWEEN $1 AND $2 ORDER BY tanggal DESC LIMIT 1`, [from, to]);
    const r = c => +(+t[c]).toFixed(2);
    res.json({
      rentang: { dari: from, sampai: to },
      mapped: {
        periode_label: `${from} s/d ${to}`, tgl_start: from, tgl_end: to,
        cpo_received: r('cpo_in'), cpo_processed: r('cpo_feed'), cpo_reject: r('cpo_reject'),
        cpo_stock: +(+(last?.cpo_stock_akhir || 0)).toFixed(2),
        rbdpo: r('rbdpo'),
        olein_gross: r('olein'), olein_dispatch: r('olein_despatch'), olein_reject: r('olein_reject'), olein_stock: 0,
        stearin_gross: r('stearin'), stearin_dispatch: r('stearin_despatch'), stearin_reject: r('stearin_reject'), stearin_stock: 0,
        pfad: r('pfad'),
      },
    });
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
