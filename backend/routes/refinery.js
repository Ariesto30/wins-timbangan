const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────────────────────────────────────────────────────────────
   REFINERY RECONCILIATION — Raw & Stock Balancing
   Membandingkan data produksi refinery (input manual) dengan
   throughput timbangan (otomatis dari tabel timbangan).
   Mass balance: CPO = Olein + Stearin + PFAD + Loss + Reject + ΔStock
   ─────────────────────────────────────────────────────────────── */

const NUM_FIELDS = [
  'cpo_received','cpo_processed','cpo_stock','cpo_reject','cpo_lost_pct',
  'olein_gross','olein_dispatch','olein_stock','olein_reject',
  'stearin_gross','stearin_dispatch','stearin_stock','stearin_reject',
  'pfad','rbdpo',
];

// Hitung analisis mass balance + yield + red flags untuk satu record
function analyze(r, timbanganCpoMt) {
  const n = k => Number(r[k]) || 0;
  const cpoReceived = n('cpo_received');
  const cpoProcessed = n('cpo_processed');
  const cpoStock = n('cpo_stock');
  const cpoReject = n('cpo_reject');
  const oleinGross = n('olein_gross');
  const oleinReject = n('olein_reject');
  const oleinDispatch = n('olein_dispatch');
  const oleinStock = n('olein_stock');
  const stearinGross = n('stearin_gross');
  const stearinReject = n('stearin_reject');
  const stearinDispatch = n('stearin_dispatch');
  const stearinStock = n('stearin_stock');
  const pfad = n('pfad');
  const rbdpo = n('rbdpo');

  const cpoAvailable = cpoProcessed + cpoStock; // olah + stock
  // Gap weighbridge: CPO received (timbangan) vs olah+stock teridentifikasi
  const gapWeighbridge = cpoReceived - cpoAvailable;
  const gapWeighbridgePct = cpoReceived > 0 ? (gapWeighbridge / cpoReceived * 100) : 0;

  // Yield split (basis cpo processed)
  const base = cpoProcessed > 0 ? cpoProcessed : 1;
  const yields = {
    rbdpo_pct: +(rbdpo / base * 100).toFixed(2),
    pfad_pct: +(pfad / base * 100).toFixed(2),
  };
  // Fractionation split (basis olein+stearin gross)
  const fracBase = (oleinGross + stearinGross) || 1;
  const fractionation = {
    olein_pct: +(oleinGross / fracBase * 100).toFixed(2),
    stearin_pct: +(stearinGross / fracBase * 100).toFixed(2),
  };

  // Balance olein: produksi - reject = dispatch + stock
  const oleinNet = oleinGross - oleinReject;
  const oleinAccounted = oleinDispatch + oleinStock;
  const oleinMismatch = +(oleinNet - oleinAccounted).toFixed(1);

  // Balance stearin
  const stearinNet = stearinGross - stearinReject;
  const stearinAccounted = stearinDispatch + stearinStock;
  const stearinMismatch = +(stearinNet - stearinAccounted).toFixed(1);

  // Cross-check timbangan: CPO received vs total CPO IN dari weighbridge
  let timbanganMatch = null;
  if (timbanganCpoMt != null) {
    timbanganMatch = {
      timbangan_cpo_mt: +timbanganCpoMt.toFixed(1),
      whiteboard_cpo: cpoReceived,
      selisih: +(cpoReceived - timbanganCpoMt).toFixed(1),
      selisih_pct: cpoReceived > 0 ? +((cpoReceived - timbanganCpoMt) / cpoReceived * 100).toFixed(2) : 0,
    };
  }

  // Red flags
  const flags = [];
  if (Math.abs(gapWeighbridgePct) > 1)
    flags.push({ level: 'tinggi', msg: `Gap weighbridge vs olah+stock = ${gapWeighbridge.toFixed(0)} MT (${gapWeighbridgePct.toFixed(2)}%)`, hint: 'Audit kalibrasi timbangan & level tangki' });
  if (cpoReject > cpoReceived * 0.02)
    flags.push({ level: 'tinggi', msg: `CPO Reject ${cpoReject.toFixed(0)} MT = ${(cpoReject/cpoReceived*100).toFixed(1)}% dari received`, hint: 'Verifikasi: quality reject atau commodity resale?' });
  if (Math.abs(oleinMismatch) > 5)
    flags.push({ level: 'sedang', msg: `Olein mismatch ${oleinMismatch} MT (net ${oleinNet.toFixed(0)} vs dispatch+stock ${oleinAccounted.toFixed(0)})`, hint: 'Telusuri jalur olein yang hilang' });
  if (Math.abs(stearinMismatch) > 5)
    flags.push({ level: 'sedang', msg: `Stearin mismatch ${stearinMismatch} MT`, hint: 'Telusuri penggunaan internal / rework' });
  if (timbanganMatch && Math.abs(timbanganMatch.selisih_pct) > 3)
    flags.push({ level: 'sedang', msg: `CPO received beda ${timbanganMatch.selisih} MT dari timbangan (${timbanganMatch.selisih_pct}%)`, hint: 'Cek trip CPO yang belum/terlambat diinput' });

  return {
    cpoAvailable, gapWeighbridge: +gapWeighbridge.toFixed(1), gapWeighbridgePct: +gapWeighbridgePct.toFixed(2),
    yields, fractionation,
    oleinNet: +oleinNet.toFixed(1), oleinAccounted: +oleinAccounted.toFixed(1), oleinMismatch,
    stearinNet: +stearinNet.toFixed(1), stearinAccounted: +stearinAccounted.toFixed(1), stearinMismatch,
    timbanganMatch, flags,
  };
}

// CPO Received di whiteboard = KUMULATIF sejak awal operasi s/d cut-off (tgl_end),
// bukan volume periode. Jumlahkan produk CPO hingga tgl_end.
async function timbanganCpoMt(tgl_start, tgl_end) {
  if (!tgl_end) return null;
  const r = await db.get(`
    SELECT COALESCE(SUM(berat_netto_wins),0)::bigint as kg
    FROM timbangan
    WHERE produk = 'CPO' AND tanggal_masuk <= $1
  `, [tgl_end]);
  return Number(r.kg) / 1000;
}

/* GET semua periode */
router.get('/', async (req, res) => {
  try {
    const rows = await db.all(`SELECT * FROM refinery_balance ORDER BY tgl_end DESC NULLS LAST, created_at DESC`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET satu periode + analisis lengkap */
router.get('/:id', async (req, res) => {
  try {
    const r = await db.get(`SELECT * FROM refinery_balance WHERE id = $1`, [req.params.id]);
    if (!r) return res.status(404).json({ error: 'Periode tidak ditemukan' });
    const cpoMt = await timbanganCpoMt(r.tgl_start, r.tgl_end);
    const analysis = analyze(r, cpoMt);
    res.json({ record: r, analysis });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST buat periode baru */
router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.periode_label) return res.status(400).json({ error: 'Label periode wajib' });
    const vals = NUM_FIELDS.map(f => Number(b[f]) || 0);
    const row = await db.get(`
      INSERT INTO refinery_balance (
        periode_label, tgl_start, tgl_end, catatan, created_by,
        ${NUM_FIELDS.join(', ')}
      ) VALUES ($1,$2,$3,$4,$5, ${NUM_FIELDS.map((_, i) => '$' + (i + 6)).join(',')})
      RETURNING *
    `, [b.periode_label, b.tgl_start || null, b.tgl_end || null, b.catatan || null, req.user.id, ...vals]);
    res.json(row);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* PUT update periode */
router.put('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    const sets = ['periode_label=$1', 'tgl_start=$2', 'tgl_end=$3', 'catatan=$4', 'updated_at=NOW()'];
    const params = [b.periode_label, b.tgl_start || null, b.tgl_end || null, b.catatan || null];
    NUM_FIELDS.forEach((f, i) => { sets.push(`${f}=$${i + 5}`); params.push(Number(b[f]) || 0); });
    params.push(req.params.id);
    await db.run(`UPDATE refinery_balance SET ${sets.join(', ')} WHERE id=$${params.length}`, params);
    res.json({ message: 'Tersimpan' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* DELETE */
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await db.run(`DELETE FROM refinery_balance WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Terhapus' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
