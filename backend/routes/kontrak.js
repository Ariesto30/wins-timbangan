const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { arah, relasi_id, produk, search, tahun, bulan_start, bulan_end } = req.query;
    let where = [];
    let params = [];
    let n = 1;
    if (arah) { where.push(`arah = $${n++}`); params.push(arah); }
    if (relasi_id) { where.push(`relasi_id = $${n++}`); params.push(parseInt(relasi_id)); }
    if (produk && produk !== 'Semua') { where.push(`produk = $${n++}`); params.push(produk); }
    // Filter berbasis tanggal penyerahan kontrak
    if (tahun) { where.push(`to_char(tanggal_penyerahan, 'YYYY') = $${n++}`); params.push(tahun); }
    if (bulan_start && bulan_start !== 'Semua') { where.push(`to_char(tanggal_penyerahan, 'MM') >= $${n++}`); params.push(String(bulan_start).padStart(2,'0')); }
    if (bulan_end && bulan_end !== 'Semua') { where.push(`to_char(tanggal_penyerahan, 'MM') <= $${n++}`); params.push(String(bulan_end).padStart(2,'0')); }
    if (search) {
      where.push(`(no_kontrak ILIKE $${n} OR relasi_nama ILIKE $${n} OR produk ILIKE $${n} OR do_number ILIKE $${n})`);
      params.push(`%${search}%`); n++;
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await db.all(`SELECT * FROM kontrak ${w} ORDER BY created_at DESC`, params);

    const result = await Promise.all(rows.map(async k => {
      const realisasi = await db.get('SELECT SUM(berat_netto_wins) as total_kg FROM timbangan WHERE no_kontrak = $1', [k.no_kontrak]);
      const aktual_kg = parseFloat(realisasi?.total_kg) || 0;
      const sisa_kg = k.quantity_kg - aktual_kg;
      const pct_realisasi = k.quantity_kg > 0 ? aktual_kg / k.quantity_kg : 0;
      const nilai_terkirim = aktual_kg * (k.harga_satuan || 0) * (1 + (parseFloat(k.ppn) || 0));
      let status_kontrak = 'Berjalan';
      if (pct_realisasi >= 1.001) status_kontrak = 'Over';
      else if (pct_realisasi >= 1) status_kontrak = 'Selesai';
      else if (k.jatuh_tempo && new Date(k.jatuh_tempo) < new Date()) status_kontrak = 'Lewat Jatuh Tempo';
      return { ...k, aktual_kg, sisa_kg, pct_realisasi, nilai_terkirim, status_kontrak };
    }));
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const {
      no_kontrak, do_number, relasi_id, relasi_nama, produk,
      quantity_kg, harga_satuan, ppn, lokasi_penyerahan,
      tanggal_penyerahan, jatuh_tempo, status_pengiriman,
      dp, jatuh_tempo_dp, arah, catatan
    } = req.body;
    if (!no_kontrak) return res.status(400).json({ error: 'No. Kontrak wajib diisi' });
    const nilai = quantity_kg * harga_satuan * (1 + (ppn || 0.11));
    const r = await db.get(`INSERT INTO kontrak (
      no_kontrak, do_number, relasi_id, relasi_nama, produk,
      quantity_kg, harga_satuan, ppn, nilai_kontrak, lokasi_penyerahan,
      tanggal_penyerahan, jatuh_tempo, status_pengiriman,
      dp, jatuh_tempo_dp, arah, catatan
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [no_kontrak, do_number, relasi_id || null, relasi_nama, produk,
      quantity_kg, harga_satuan, ppn || 0.11, nilai, lokasi_penyerahan,
      tanggal_penyerahan || null, jatuh_tempo || null, status_pengiriman,
      dp || 0, jatuh_tempo_dp || null, arah || 'IN', catatan]);
    res.json({ id: r.id, message: 'Kontrak berhasil disimpan' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'No. Kontrak sudah ada' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const {
      no_kontrak, do_number, relasi_id, relasi_nama, produk,
      quantity_kg, harga_satuan, ppn, lokasi_penyerahan,
      tanggal_penyerahan, jatuh_tempo, status_pengiriman,
      dp, jatuh_tempo_dp, arah, catatan
    } = req.body;
    const nilai = quantity_kg * harga_satuan * (1 + (ppn || 0.11));
    await db.run(`UPDATE kontrak SET
      no_kontrak=$1, do_number=$2, relasi_id=$3, relasi_nama=$4, produk=$5,
      quantity_kg=$6, harga_satuan=$7, ppn=$8, nilai_kontrak=$9, lokasi_penyerahan=$10,
      tanggal_penyerahan=$11, jatuh_tempo=$12, status_pengiriman=$13,
      dp=$14, jatuh_tempo_dp=$15, arah=$16, catatan=$17, updated_at=NOW()
      WHERE id=$18`,
      [no_kontrak, do_number, relasi_id || null, relasi_nama, produk,
        quantity_kg, harga_satuan, ppn || 0.11, nilai, lokasi_penyerahan,
        tanggal_penyerahan || null, jatuh_tempo || null, status_pengiriman,
        dp || 0, jatuh_tempo_dp || null, arah || 'IN', catatan, req.params.id]);
    res.json({ message: 'Kontrak berhasil diupdate' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await db.run('DELETE FROM kontrak WHERE id = $1', [req.params.id]);
    res.json({ message: 'Kontrak berhasil dihapus' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
