const router = require('express').Router();
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  const { arah, status, relasi_id, produk, search } = req.query;
  let where = [];
  let params = [];
  if (arah) { where.push('arah = ?'); params.push(arah); }
  if (relasi_id) { where.push('relasi_id = ?'); params.push(relasi_id); }
  if (produk && produk !== 'Semua') { where.push('produk = ?'); params.push(produk); }
  if (search) {
    where.push('(no_kontrak LIKE ? OR relasi_nama LIKE ? OR produk LIKE ? OR do_number LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db.prepare(`SELECT * FROM kontrak ${w} ORDER BY created_at DESC`).all(...params);

  // Calculate realisasi for each kontrak
  const result = rows.map(k => {
    const realisasi = db.prepare(`
      SELECT SUM(berat_netto_wins) as total_kg
      FROM timbangan
      WHERE no_kontrak = ?
    `).get(k.no_kontrak);

    const aktual_kg = realisasi?.total_kg || 0;
    const sisa_kg = k.quantity_kg - aktual_kg;
    const pct_realisasi = k.quantity_kg > 0 ? aktual_kg / k.quantity_kg : 0;
    const nilai_terkirim = aktual_kg * (k.harga_satuan || 0) * (1 + (k.ppn || 0));

    let status_kontrak = 'Berjalan';
    if (pct_realisasi >= 1) status_kontrak = 'Selesai';
    else if (pct_realisasi > 1) status_kontrak = 'Over';
    else if (k.jatuh_tempo && new Date(k.jatuh_tempo) < new Date()) status_kontrak = 'Lewat Jatuh Tempo';

    return { ...k, aktual_kg, sisa_kg, pct_realisasi, nilai_terkirim, status_kontrak };
  });

  res.json(result);
});

router.post('/', requireRole('admin', 'manajer'), (req, res) => {
  const {
    no_kontrak, do_number, relasi_id, relasi_nama, produk,
    quantity_kg, harga_satuan, ppn, lokasi_penyerahan,
    tanggal_penyerahan, jatuh_tempo, status_pengiriman,
    dp, jatuh_tempo_dp, arah, catatan
  } = req.body;

  if (!no_kontrak) return res.status(400).json({ error: 'No. Kontrak wajib diisi' });

  const nilai = quantity_kg * harga_satuan * (1 + (ppn || 0.11));

  try {
    const result = db.prepare(`
      INSERT INTO kontrak (
        no_kontrak, do_number, relasi_id, relasi_nama, produk,
        quantity_kg, harga_satuan, ppn, nilai_kontrak, lokasi_penyerahan,
        tanggal_penyerahan, jatuh_tempo, status_pengiriman,
        dp, jatuh_tempo_dp, arah, catatan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      no_kontrak, do_number, relasi_id, relasi_nama, produk,
      quantity_kg, harga_satuan, ppn || 0.11, nilai, lokasi_penyerahan,
      tanggal_penyerahan, jatuh_tempo, status_pengiriman,
      dp || 0, jatuh_tempo_dp, arah || 'IN', catatan
    );
    res.json({ id: result.lastInsertRowid, message: 'Kontrak berhasil disimpan' });
  } catch (e) {
    res.status(400).json({ error: 'No. Kontrak sudah ada' });
  }
});

router.put('/:id', requireRole('admin', 'manajer'), (req, res) => {
  const {
    no_kontrak, do_number, relasi_id, relasi_nama, produk,
    quantity_kg, harga_satuan, ppn, lokasi_penyerahan,
    tanggal_penyerahan, jatuh_tempo, status_pengiriman,
    dp, jatuh_tempo_dp, arah, catatan
  } = req.body;

  const nilai = quantity_kg * harga_satuan * (1 + (ppn || 0.11));

  db.prepare(`
    UPDATE kontrak SET
      no_kontrak=?, do_number=?, relasi_id=?, relasi_nama=?, produk=?,
      quantity_kg=?, harga_satuan=?, ppn=?, nilai_kontrak=?, lokasi_penyerahan=?,
      tanggal_penyerahan=?, jatuh_tempo=?, status_pengiriman=?,
      dp=?, jatuh_tempo_dp=?, arah=?, catatan=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    no_kontrak, do_number, relasi_id, relasi_nama, produk,
    quantity_kg, harga_satuan, ppn || 0.11, nilai, lokasi_penyerahan,
    tanggal_penyerahan, jatuh_tempo, status_pengiriman,
    dp || 0, jatuh_tempo_dp, arah || 'IN', catatan,
    req.params.id
  );

  res.json({ message: 'Kontrak berhasil diupdate' });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM kontrak WHERE id = ?').run(req.params.id);
  res.json({ message: 'Kontrak berhasil dihapus' });
});

module.exports = router;
