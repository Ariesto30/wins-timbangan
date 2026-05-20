const router = require('express').Router();
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET all with filter
router.get('/', (req, res) => {
  const { page = 1, limit = 50, produk, relasi_id, bulan, tahun, no_polisi, search } = req.query;
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  if (produk) { where.push('t.produk = ?'); params.push(produk); }
  if (relasi_id) { where.push('t.relasi_id = ?'); params.push(relasi_id); }
  if (bulan && tahun) { where.push("strftime('%m-%Y', t.tanggal_masuk) = ?"); params.push(`${String(bulan).padStart(2,'0')}-${tahun}`); }
  else if (tahun) { where.push("strftime('%Y', t.tanggal_masuk) = ?"); params.push(tahun); }
  if (no_polisi) { where.push('t.no_polisi LIKE ?'); params.push(`%${no_polisi}%`); }
  if (search) { where.push('(t.no_polisi LIKE ? OR t.relasi_nama LIKE ? OR t.driver LIKE ? OR t.no_kontrak LIKE ?)'); params.push(...[search,search,search,search].map(s => `%${s}%`)); }

  const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) as c FROM timbangan t ${whereSQL}`).get(...params).c;
  const rows = db.prepare(`
    SELECT t.*, u.nama_lengkap as created_by_nama
    FROM timbangan t
    LEFT JOIN users u ON t.created_by = u.id
    ${whereSQL}
    ORDER BY t.tanggal_masuk DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET single
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM timbangan WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan' });
  res.json(row);
});

// POST create
router.post('/', (req, res) => {
  const {
    no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
    relasi_id, relasi_nama, produk, truck_type,
    tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
    jam_masuk, jam_keluar, penimbang, driver,
    distance_km, transportir, lokasi_pengiriman, catatan
  } = req.body;

  if (!tanggal_masuk || !berat_masuk || !berat_keluar) {
    return res.status(400).json({ error: 'Tanggal, berat masuk, dan berat keluar wajib diisi' });
  }

  // Auto-generate no_seri if empty
  let seri = no_seri;
  if (!seri) {
    const last = db.prepare("SELECT no_seri FROM timbangan WHERE no_seri GLOB '[0-9]*' ORDER BY CAST(no_seri AS INTEGER) DESC LIMIT 1").get();
    const lastNum = last ? parseInt(last.no_seri) : 0;
    seri = String(lastNum + 1).padStart(6, '0');
  }

  const result = db.prepare(`
    INSERT INTO timbangan (
      no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
      relasi_id, relasi_nama, produk, truck_type,
      tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
      jam_masuk, jam_keluar, penimbang, driver,
      distance_km, transportir, lokasi_pengiriman, catatan, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
    relasi_id, relasi_nama, produk, truck_type,
    tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
    jam_masuk, jam_keluar, penimbang, driver,
    distance_km || 0, transportir, lokasi_pengiriman, catatan, req.user.id
  );

  res.json({ id: result.lastInsertRowid, no_seri: seri, message: 'Data berhasil disimpan' });
});

// POST bulk insert dari paste Excel
router.post('/bulk', (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Data kosong' });

  // Map nama relasi -> id
  const relasiList = db.prepare('SELECT id, nama FROM relasi').all();
  const relMap = {};
  relasiList.forEach(r => { relMap[r.nama.toUpperCase().replace(/[.\s]/g,'')] = r; });
  function findRelasi(nama) {
    if (!nama) return { id: null, nama: null };
    const key = String(nama).toUpperCase().replace(/[.\s]/g, '');
    if (relMap[key]) return relMap[key];
    for (const [k, r] of Object.entries(relMap)) if (k.includes(key) || key.includes(k)) return r;
    return { id: null, nama };
  }

  // Auto seri start
  const last = db.prepare("SELECT no_seri FROM timbangan WHERE no_seri GLOB '[0-9]*' ORDER BY CAST(no_seri AS INTEGER) DESC LIMIT 1").get();
  let nextSeri = last ? parseInt(last.no_seri) + 1 : 1;

  const insert = db.prepare(`
    INSERT INTO timbangan (
      no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
      relasi_id, relasi_nama, produk, truck_type,
      tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
      jam_masuk, jam_keluar, penimbang, driver,
      distance_km, transportir, lokasi_pengiriman, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const errors = [];
  let ok = 0;
  const tx = db.transaction(() => {
    rows.forEach((r, i) => {
      try {
        if (!r.tanggal_masuk || !r.berat_masuk || !r.berat_keluar) {
          errors.push({ row: i + 1, error: 'Tanggal/berat masuk/berat keluar wajib' });
          return;
        }
        const rel = findRelasi(r.relasi_nama);
        const seri = r.no_seri || String(nextSeri++).padStart(6, '0');
        insert.run(
          seri, r.no_seri_relasi || null, r.no_polisi || null, r.no_kontrak || null, r.do_number || null,
          rel.id, rel.nama || r.relasi_nama, r.produk || null, r.truck_type || null,
          r.tanggal_masuk, parseInt(r.berat_masuk), parseInt(r.berat_keluar),
          r.berat_relasi ? parseInt(r.berat_relasi) : null,
          r.jam_masuk || null, r.jam_keluar || null,
          r.penimbang || null, r.driver || null,
          parseFloat(r.distance_km) || 0, r.transportir || null, r.lokasi_pengiriman || null,
          req.user.id
        );
        ok++;
      } catch (e) {
        errors.push({ row: i + 1, error: e.message });
      }
    });
  });
  tx();

  res.json({ ok, errors, total: rows.length });
});

// PUT update
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM timbangan WHERE id = ?').get(req.params.id);
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

  db.prepare(`
    UPDATE timbangan SET
      no_seri=?, no_seri_relasi=?, no_polisi=?, no_kontrak=?, do_number=?,
      relasi_id=?, relasi_nama=?, produk=?, truck_type=?,
      tanggal_masuk=?, berat_masuk=?, berat_keluar=?, berat_relasi=?,
      jam_masuk=?, jam_keluar=?, penimbang=?, driver=?,
      distance_km=?, transportir=?, lokasi_pengiriman=?, catatan=?,
      updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    no_seri, no_seri_relasi, no_polisi, no_kontrak, do_number,
    relasi_id, relasi_nama, produk, truck_type,
    tanggal_masuk, berat_masuk, berat_keluar, berat_relasi,
    jam_masuk, jam_keluar, penimbang, driver,
    distance_km || 0, transportir, lokasi_pengiriman, catatan,
    req.params.id
  );

  res.json({ message: 'Data berhasil diupdate' });
});

// DELETE
router.delete('/:id', (req, res) => {
  if (req.user.role === 'operator') return res.status(403).json({ error: 'Operator tidak bisa hapus data' });
  db.prepare('DELETE FROM timbangan WHERE id = ?').run(req.params.id);
  res.json({ message: 'Data berhasil dihapus' });
});

module.exports = router;
