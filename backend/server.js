require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const db = require('./db/pg');
const { authenticate } = require('./middleware/auth');

// Init schema saat startup
db.initDB().catch(err => { console.error('❌ Schema init gagal:', err); process.exit(1); });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/timbangan', require('./routes/timbangan'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/kontrak', require('./routes/kontrak'));
app.use('/api/armada', require('./routes/armada'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/refinery', require('./routes/refinery'));
app.use('/api/production', require('./routes/production'));
app.use('/api/tank', require('./routes/tank'));
app.use('/api/quality', require('./routes/quality'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/harga', require('./routes/harga'));
app.use('/api/insight', require('./routes/insight'));
app.use('/api/import', require('./routes/import'));
const cronRoute = require('./routes/cron');
app.use('/api/cron', cronRoute);

// Scheduler in-process (backup): jalankan tugas harian ~18:00 selama server hidup
let lastCronDate = null;
setInterval(async () => {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600000); // UTC+7
  const today = wib.toISOString().slice(0, 10);
  if (wib.getUTCHours() === 11 && lastCronDate !== today) { // 11 UTC = 18:00 WIB
    lastCronDate = today;
    try { const r = await cronRoute.runDaily(); console.log('⏰ Cron harian:', JSON.stringify(r).slice(0, 200)); }
    catch (e) { console.error('Cron error:', e.message); }
  }
}, 10 * 60 * 1000); // cek tiap 10 menit

// Master data
app.get('/api/relasi', authenticate, async (req, res) => {
  try {
    const { produk } = req.query;
    if (produk && produk !== 'Semua') {
      const rows = await db.all(`
        SELECT DISTINCT r.* FROM relasi r
        INNER JOIN timbangan t ON (t.relasi_id = r.id OR UPPER(REPLACE(REPLACE(t.relasi_nama,'.',''),' ','')) = UPPER(REPLACE(REPLACE(r.nama,'.',''),' ','')))
        WHERE r.aktif = 1 AND t.produk = $1
        ORDER BY r.nama
      `, [produk]);
      return res.json(rows);
    }
    res.json(await db.all('SELECT * FROM relasi WHERE aktif=1 ORDER BY nama'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/master/produk-aktif', authenticate, async (req, res) => {
  try {
    res.json(await db.all(`
      SELECT produk, COUNT(*)::int as trip FROM timbangan
      WHERE produk IS NOT NULL AND produk != ''
      GROUP BY produk ORDER BY trip DESC
    `));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/relasi', authenticate, async (req, res) => {
  try {
    if (!['admin', 'manajer'].includes(req.user?.role)) return res.status(403).json({ error: 'Akses ditolak' });
    const { kode, nama, lokasi, transportir } = req.body;
    const r = await db.get('INSERT INTO relasi (kode, nama, lokasi, transportir) VALUES ($1,$2,$3,$4) RETURNING id', [kode, nama, lokasi, transportir]);
    res.json({ id: r.id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Kode relasi sudah ada' });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/produk', authenticate, async (req, res) => {
  try { res.json(await db.all('SELECT * FROM produk ORDER BY kode')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));
}

app.listen(PORT, () => {
  console.log(`\n✅ Server WINS Timbangan (PostgreSQL/Neon) berjalan di http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`\nAkun default:`);
  console.log(`  admin     / admin123`);
  console.log(`  operator  / operator123`);
  console.log(`  manajer   / manajer123\n`);
});

module.exports = app;
