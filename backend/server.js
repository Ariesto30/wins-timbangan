require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/timbangan', require('./routes/timbangan'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/kontrak', require('./routes/kontrak'));
app.use('/api/armada', require('./routes/armada'));

// Master data
const db = require('./db/database');
const { authenticate } = require('./middleware/auth');

app.get('/api/relasi', authenticate, (req, res) => {
  const { produk } = req.query;
  // Jika ada filter produk, hanya tampilkan relasi yang punya transaksi produk tersebut
  if (produk && produk !== 'Semua') {
    const rows = db.prepare(`
      SELECT DISTINCT r.* FROM relasi r
      INNER JOIN timbangan t ON (t.relasi_id = r.id OR UPPER(REPLACE(REPLACE(t.relasi_nama,'.',''),' ','')) = UPPER(REPLACE(REPLACE(r.nama,'.',''),' ','')))
      WHERE r.aktif = 1 AND t.produk = ?
      ORDER BY r.nama
    `).all(produk);
    return res.json(rows);
  }
  res.json(db.prepare('SELECT * FROM relasi WHERE aktif=1 ORDER BY nama').all());
});

// Endpoint untuk dapat list produk yang dipakai (untuk filter)
app.get('/api/master/produk-aktif', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT produk, COUNT(*) as trip
    FROM timbangan
    WHERE produk IS NOT NULL AND produk != ''
    GROUP BY produk ORDER BY trip DESC
  `).all();
  res.json(rows);
});
app.post('/api/relasi', authenticate, (req, res) => {
  if (!['admin', 'manajer'].includes(req.user?.role)) return res.status(403).json({ error: 'Akses ditolak' });
  const { kode, nama, lokasi, transportir } = req.body;
  try {
    const r = db.prepare('INSERT INTO relasi (kode, nama, lokasi, transportir) VALUES (?, ?, ?, ?)').run(kode, nama, lokasi, transportir);
    res.json({ id: r.lastInsertRowid });
  } catch { res.status(400).json({ error: 'Kode relasi sudah ada' }); }
});

app.get('/api/produk', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM produk ORDER BY kode').all());
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));
}

app.listen(PORT, () => {
  console.log(`\n✅ Server WINS Timbangan berjalan di http://localhost:${PORT}`);
  console.log(`📊 API tersedia di http://localhost:${PORT}/api`);
  console.log(`\nAkun default:`);
  console.log(`  admin     / admin123     (Administrator)`);
  console.log(`  operator  / operator123  (Operator Timbangan)`);
  console.log(`  manajer   / manajer123   (Manajer)\n`);
});

module.exports = app;
