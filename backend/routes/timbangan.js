const router = require('express').Router();
const db = require('../db/pg');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET list dengan filter
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, produk, relasi_id, bulan, tahun, no_polisi, search } = req.query;
    const offset = (page - 1) * limit;
    let where = [];
    let params = [];
    let n = 1;

    if (produk) { where.push(`t.produk = $${n++}`); params.push(produk); }
    if (relasi_id) { where.push(`t.relasi_id = $${n++}`); params.push(parseInt(relasi_id)); }
    if (bulan && tahun) {
      where.push(`to_char(t.tanggal_masuk, 'MM-YYYY') = $${n++}`);
      params.push(`${String(bulan).padStart(2,'0')}-${tahun}`);
    } else if (tahun) {
      where.push(`to_char(t.tanggal_masuk, 'YYYY') = $${n++}`); params.push(tahun);
    }
    if (no_polisi) { where.push(`t.no_polisi ILIKE $${n++}`); params.push(`%${no_polisi}%`); }
    if (search) {
      where.push(`(t.no_polisi ILIKE $${n} OR t.relasi_nama ILIKE $${n} OR t.driver ILIKE $${n} OR t.no_kontrak ILIKE $${n})`);
      params.push(`%${search}%`); n++;
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const totalRow = await db.get(`SELECT COUNT(*)::int as c FROM timbangan t ${w}`, params);
    const rows = await db.all(`
      SELECT t.*, u.nama_lengkap as created_by_nama
      FROM timbangan t LEFT JOIN users u ON t.created_by = u.id ${w}
      ORDER BY t.tanggal_masuk DESC, t.id DESC
      LIMIT $${n++} OFFSET $${n++}
    `, [...params, parseInt(limit), offset]);
    res.json({ data: rows, total: totalRow.c, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM timbangan WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create
router.post('/', async (req, res) => {
  try {
    const {
      no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
      relasi_id, relasi_nama, produk, truck_type,
      tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
      jam_masuk, jam_keluar, penimbang, driver,
      distance_km, transportir, lokasi_pengiriman, catatan
    } = req.body;
    if (!tanggal_masuk || !berat_masuk || !berat_keluar) return res.status(400).json({ error: 'Tanggal, berat masuk, dan berat keluar wajib diisi' });

    let seri = no_seri;
    if (!seri) {
      const last = await db.get("SELECT no_seri FROM timbangan WHERE no_seri ~ '^[0-9]+$' ORDER BY (no_seri::int) DESC LIMIT 1");
      seri = String((last ? parseInt(last.no_seri) : 0) + 1).padStart(6, '0');
    }

    const r = await db.get(`
      INSERT INTO timbangan (
        no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
        relasi_id, relasi_nama, produk, truck_type,
        tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
        jam_masuk, jam_keluar, penimbang, driver,
        distance_km, transportir, lokasi_pengiriman, catatan, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id
    `, [seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
      relasi_id || null, relasi_nama, produk, truck_type,
      tanggal_masuk, berat_masuk, berat_keluar, berat_relasi || null,
      jam_masuk || null, jam_keluar || null, penimbang, driver,
      distance_km || 0, transportir, lokasi_pengiriman, catatan, req.user.id]);
    res.json({ id: r.id, no_seri: seri, message: 'Data berhasil disimpan' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST bulk
router.post('/bulk', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Data kosong' });

    const relasiList = await db.all('SELECT id, nama FROM relasi');
    const relMap = {};
    relasiList.forEach(r => { relMap[r.nama.toUpperCase().replace(/[.\s]/g,'')] = r; });
    function findRelasi(nama) {
      if (!nama) return { id: null, nama: null };
      const key = String(nama).toUpperCase().replace(/[.\s]/g, '');
      if (relMap[key]) return relMap[key];
      for (const [k, r] of Object.entries(relMap)) if (k.includes(key) || key.includes(k)) return r;
      return { id: null, nama };
    }

    const last = await db.get("SELECT no_seri FROM timbangan WHERE no_seri ~ '^[0-9]+$' ORDER BY (no_seri::int) DESC LIMIT 1");
    let nextSeri = last ? parseInt(last.no_seri) + 1 : 1;

    const errors = [];
    let ok = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.tanggal_masuk || !r.berat_masuk || !r.berat_keluar) {
          errors.push({ row: i + 1, error: 'Tanggal/berat masuk/berat keluar wajib' });
          continue;
        }
        const rel = findRelasi(r.relasi_nama);
        const seri = r.no_seri || String(nextSeri++).padStart(6, '0');
        await db.run(`INSERT INTO timbangan (
          no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
          relasi_id, relasi_nama, produk, truck_type,
          tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
          jam_masuk, jam_keluar, penimbang, driver,
          distance_km, transportir, lokasi_pengiriman, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [seri, r.no_seri_relasi || null, r.no_polisi || null, r.no_kontrak || null, r.do_number || null,
          rel.id, rel.nama || r.relasi_nama, r.produk || null, r.truck_type || null,
          r.tanggal_masuk, parseInt(r.berat_masuk), parseInt(r.berat_keluar),
          r.berat_relasi ? parseInt(r.berat_relasi) : null,
          r.jam_masuk || null, r.jam_keluar || null, r.penimbang || null, r.driver || null,
          parseFloat(r.distance_km) || 0, r.transportir || null, r.lokasi_pengiriman || null, req.user.id]);
        ok++;
      } catch (e) { errors.push({ row: i + 1, error: e.message }); }
    }
    res.json({ ok, errors, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await db.get('SELECT * FROM timbangan WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Data tidak ditemukan' });
    if (req.user.role === 'operator' && existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Anda hanya bisa edit data milik Anda sendiri' });
    }
    const {
      no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
      relasi_id, relasi_nama, produk, truck_type,
      tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
      jam_masuk, jam_keluar, penimbang, driver,
      distance_km, transportir, lokasi_pengiriman, catatan
    } = req.body;
    await db.run(`UPDATE timbangan SET
      no_seri=$1, no_seri_relasi=$2, no_polisi=$3, no_kontrak=$4, do_number=$5,
      relasi_id=$6, relasi_nama=$7, produk=$8, truck_type=$9,
      tanggal_masuk=$10, berat_masuk=$11, berat_keluar=$12, berat_relasi=$13,
      jam_masuk=$14, jam_keluar=$15, penimbang=$16, driver=$17,
      distance_km=$18, transportir=$19, lokasi_pengiriman=$20, catatan=$21,
      updated_at=NOW()
      WHERE id=$22`,
      [no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
        relasi_id || null, relasi_nama, produk, truck_type,
        tanggal_masuk, berat_masuk, berat_keluar, berat_relasi || null,
        jam_masuk || null, jam_keluar || null, penimbang, driver,
        distance_km || 0, transportir, lokasi_pengiriman, catatan, req.params.id]);
    res.json({ message: 'Data berhasil diupdate' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role === 'operator') return res.status(403).json({ error: 'Operator tidak bisa hapus data' });
    await db.run('DELETE FROM timbangan WHERE id = $1', [req.params.id]);
    res.json({ message: 'Data berhasil dihapus' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
