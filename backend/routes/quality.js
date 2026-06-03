const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* ───────── QUALITY LOG — parameter lab per sampel/batch/tangki ─────────
   Spec per produk (dari Rekap v3 PT WINS):
   CPO:     FFA<=5.0%  | M+I<=0.25% | DOBI>=2.31 | IV>=50
   Olein:   FFA<=0.10% | IV>=56.0   | CP<=10C
   RBDPL:   = Olein (RBD Palm Olein)
   RBDPO:   FFA<=0.10% | IV>=50     | PV<=2.0
   Stearin: FFA<=0.15% | IV>=34     | MP>=48C
   RBDPS:   = Stearin (RBD Palm Stearin)
   ──────────────────────────────────────────────────────────────────── */
const SPEC = {
  CPO:     { ffa: { max: 5.0 }, mni: { max: 0.25 }, dobi: { min: 2.31 }, iv: { min: 50 } },
  Olein:   { ffa: { max: 0.10 }, iv: { min: 56.0 }, cp: { max: 10 } },
  RBDPL:   { ffa: { max: 0.10 }, iv: { min: 56.0 }, cp: { max: 10 } },
  RBDPO:   { ffa: { max: 0.10 }, iv: { min: 50 }, pv: { max: 2.0 } },
  Stearin: { ffa: { max: 0.15 }, iv: { min: 34 }, mp: { min: 48 } },
  RBDPS:   { ffa: { max: 0.15 }, iv: { min: 34 }, mp: { min: 48 } },
};
const PARAM_LABEL = { ffa: 'FFA', mni: 'M+I', dobi: 'DOBI', iv: 'IV', pv: 'PV', cp: 'CP', mp: 'MP', anv: 'ANV', tox: 'TOX' };

function checkSpec(r) {
  const spec = SPEC[r.produk];
  const flags = [];
  if (!spec) return flags;
  for (const [param, rule] of Object.entries(spec)) {
    const v = r[param];
    if (v == null) continue;
    if (rule.max != null && v > rule.max) flags.push(`${PARAM_LABEL[param]} ${v} > ${rule.max}`);
    if (rule.min != null && v < rule.min) flags.push(`${PARAM_LABEL[param]} ${v} < ${rule.min}`);
  }
  return flags;
}

router.get('/', async (req, res) => {
  try {
    const { produk, relasi, tank_id, tahun, bulan } = req.query;
    const w = []; const p = []; let n = 1;
    if (produk && produk !== 'Semua') { w.push(`q.produk = $${n++}`); p.push(produk); }
    if (relasi) { w.push(`q.relasi_nama ILIKE $${n++}`); p.push(`%${relasi}%`); }
    if (tank_id) { w.push(`q.tank_id = $${n++}`); p.push(parseInt(tank_id)); }
    if (tahun) { w.push(`to_char(q.tanggal,'YYYY') = $${n++}`); p.push(tahun); }
    if (bulan && bulan !== 'Semua') { w.push(`to_char(q.tanggal,'MM') = $${n++}`); p.push(String(bulan).padStart(2, '0')); }
    const where = w.length ? 'WHERE ' + w.join(' AND ') : '';

    const rows = await db.all(`
      SELECT q.*, t.nama as tank_nama, t.kode as tank_kode
      FROM quality_log q LEFT JOIN tank t ON t.id = q.tank_id
      ${where} ORDER BY q.tanggal DESC, q.id DESC LIMIT 500`, p);

    rows.forEach(r => { r.flags = checkSpec(r); r.off_spec = r.flags.length > 0; });

    const trend = await db.all(`
      SELECT to_char(tanggal,'YYYY-MM') as bulan, produk,
        ROUND(AVG(ffa)::numeric,3)::float as avg_ffa,
        ROUND(AVG(mni)::numeric,3)::float as avg_mni,
        COUNT(*)::int as n
      FROM quality_log ${where ? where.replace(/q\./g, '') : ''} ${where ? 'AND' : 'WHERE'} ffa IS NOT NULL
      GROUP BY bulan, produk ORDER BY bulan, produk`, p);

    const withFfa = rows.filter(r => r.ffa != null);
    const summary = {
      total: rows.length,
      off_spec: rows.filter(r => r.off_spec).length,
      avg_ffa: withFfa.length ? +(withFfa.reduce((s, r) => s + r.ffa, 0) / withFfa.length).toFixed(3) : null,
    };

    res.json({ summary, rows, trend, spec: SPEC });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ─── STABILITY EVALUATION — degradasi mutu selama penyimpanan per tangki ─── */
router.get('/stability', async (req, res) => {
  try {
    // Ambil tangki + riwayat quality terurut waktu
    const tanks = await db.all(`SELECT id, no_urut, kode, nama, produk, awal_filling, akhir_filling, be_digunakan FROM tank WHERE aktif = 1 ORDER BY no_urut`);
    const today = new Date();
    const results = [];

    for (const t of tanks) {
      const q = await db.all(`SELECT tanggal, ffa, iv, cp, mp, pv, color, mni FROM quality_log WHERE tank_id = $1 AND ffa IS NOT NULL ORDER BY tanggal ASC`, [t.id]);
      if (q.length < 2) {
        results.push({ ...t, n: q.length, status: 'DATA KURANG', evaluasi: q.length === 0 ? 'Belum ada data lab' : 'Perlu ≥2 data lab untuk evaluasi' });
        continue;
      }
      const first = q[0], last = q[q.length - 1];
      const days = Math.max(1, Math.round((new Date(last.tanggal) - new Date(first.tanggal)) / 86400000));
      const ffaDelta = +(last.ffa - first.ffa).toFixed(4);
      const ffaPerWeek = +(ffaDelta / days * 7).toFixed(4);
      const spec = SPEC[t.produk];
      const ffaMax = spec?.ffa?.max;
      const hariTersimpan = t.akhir_filling ? Math.floor((today - new Date(t.akhir_filling)) / 86400000) : null;

      // Status
      let status = 'STABIL';
      const notes = [];
      if (ffaMax != null && last.ffa > ffaMax) { status = 'OVER SPEC'; notes.push(`FFA ${last.ffa}% melewati batas ${ffaMax}%`); }
      else if (ffaMax != null && last.ffa > ffaMax * 0.9) { status = 'MENDEKATI BATAS'; notes.push(`FFA ${last.ffa}% mendekati batas ${ffaMax}%`); }
      if (ffaPerWeek > 0.01) { if (status === 'STABIL') status = 'DRIFT'; notes.push(`FFA naik ${ffaPerWeek}/minggu`); }
      else notes.push(`FFA stabil (${ffaPerWeek >= 0 ? '+' : ''}${ffaPerWeek}/minggu)`);

      // Proyeksi: berapa minggu lagi sampai over spec
      let mingguKeBatas = null;
      if (ffaMax != null && ffaPerWeek > 0.001 && last.ffa < ffaMax) {
        mingguKeBatas = +((ffaMax - last.ffa) / ffaPerWeek).toFixed(1);
      }

      results.push({
        ...t, n: q.length,
        ffa_awal: first.ffa, ffa_akhir: last.ffa, ffa_delta: ffaDelta, ffa_per_minggu: ffaPerWeek,
        iv_awal: first.iv, iv_akhir: last.iv, cp_awal: first.cp, cp_akhir: last.cp,
        color_awal: first.color, color_akhir: last.color,
        tgl_awal: first.tanggal, tgl_akhir: last.tanggal, rentang_hari: days,
        hari_tersimpan: hariTersimpan, ffa_max: ffaMax,
        minggu_ke_batas: mingguKeBatas,
        status, evaluasi: notes.join(' · '),
        series: q.map(x => ({ tanggal: x.tanggal, ffa: x.ffa })),
      });
    }

    const summary = {
      total: results.length,
      over_spec: results.filter(r => r.status === 'OVER SPEC').length,
      mendekati: results.filter(r => r.status === 'MENDEKATI BATAS').length,
      drift: results.filter(r => r.status === 'DRIFT').length,
      stabil: results.filter(r => r.status === 'STABIL').length,
      data_kurang: results.filter(r => r.status === 'DATA KURANG').length,
    };
    res.json({ summary, results });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.tanggal) return res.status(400).json({ error: 'Tanggal wajib' });
    const r = await db.get(`INSERT INTO quality_log (tanggal, tank_id, produk, relasi_nama, sampel, tonase, ffa, mni, iv, dobi, pv, anv, tox, cp, mp, color, catatan, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [b.tanggal, b.tank_id || null, b.produk || null, b.relasi_nama || null, b.sampel || null, num(b.tonase),
        num(b.ffa), num(b.mni), num(b.iv), num(b.dobi), num(b.pv), num(b.anv), num(b.tox), num(b.cp), num(b.mp),
        b.color || null, b.catatan || null, req.user.id]);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    await db.run(`UPDATE quality_log SET tanggal=$1, tank_id=$2, produk=$3, relasi_nama=$4, sampel=$5, tonase=$6,
      ffa=$7, mni=$8, iv=$9, dobi=$10, pv=$11, anv=$12, tox=$13, cp=$14, mp=$15, color=$16, catatan=$17 WHERE id=$18`,
      [b.tanggal, b.tank_id || null, b.produk || null, b.relasi_nama || null, b.sampel || null, num(b.tonase),
        num(b.ffa), num(b.mni), num(b.iv), num(b.dobi), num(b.pv), num(b.anv), num(b.tox), num(b.cp), num(b.mp),
        b.color || null, b.catatan || null, req.params.id]);
    res.json({ message: 'Tersimpan' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try { await db.run(`DELETE FROM quality_log WHERE id=$1`, [req.params.id]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

function num(v) { return v === '' || v == null ? null : Number(v); }

module.exports = router;
