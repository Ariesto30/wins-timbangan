/**
 * Koneksi Postgres pool + helper async query.
 * Kompatibel dengan style better-sqlite3 untuk minimize perubahan di route files.
 */
const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

// Fix timezone bug: pgsql DATE (OID 1082) default di-konversi ke Date object UTC midnight
// yang menggeser hari saat di-display di timezone lokal. Solusi: return as string apa adanya.
types.setTypeParser(1082, (val) => val); // 1082 = DATE
types.setTypeParser(1114, (val) => val); // 1114 = TIMESTAMP (without timezone)

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error('❌ DATABASE_URL belum diset!');
  console.error('Set env DATABASE_URL ke connection string Neon Postgres.');
  console.error('Contoh: postgresql://user:pass@host.neon.tech/db?sslmode=require');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('PG Pool error:', err));

/* ─── Helper API mirip better-sqlite3 ─── */
async function query(sql, params = []) {
  return pool.query(sql, params);
}
async function all(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}
async function get(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}
async function run(sql, params = []) {
  const r = await pool.query(sql, params);
  return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id ?? null };
}

/* ─── Inisialisasi schema ─── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nama_lengkap TEXT,
      role TEXT NOT NULL DEFAULT 'operator',
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS relasi (
      id SERIAL PRIMARY KEY,
      kode TEXT UNIQUE,
      nama TEXT NOT NULL,
      lokasi TEXT,
      transportir TEXT,
      aktif INTEGER NOT NULL DEFAULT 1
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS produk (
      id SERIAL PRIMARY KEY,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timbangan (
      id SERIAL PRIMARY KEY,
      no_seri TEXT,
      no_seri_relasi TEXT,
      no_polisi TEXT,
      no_kontrak TEXT,
      do_number TEXT,
      relasi_id INTEGER REFERENCES relasi(id),
      relasi_nama TEXT,
      produk TEXT,
      truck_type TEXT,
      tanggal_masuk DATE,
      berat_masuk INTEGER,
      berat_keluar INTEGER,
      berat_netto_wins INTEGER GENERATED ALWAYS AS (ABS(berat_masuk - berat_keluar)) STORED,
      berat_relasi INTEGER,
      jam_masuk TEXT,
      jam_keluar TEXT,
      penimbang TEXT,
      driver TEXT,
      distance_km REAL DEFAULT 0,
      transportir TEXT,
      lokasi_pengiriman TEXT,
      catatan TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kontrak (
      id SERIAL PRIMARY KEY,
      no_kontrak TEXT UNIQUE NOT NULL,
      do_number TEXT,
      relasi_id INTEGER REFERENCES relasi(id),
      relasi_nama TEXT,
      produk TEXT,
      quantity_kg REAL,
      harga_satuan REAL,
      ppn REAL DEFAULT 0.11,
      nilai_kontrak REAL,
      lokasi_penyerahan TEXT,
      tanggal_penyerahan DATE,
      jatuh_tempo DATE,
      status_pengiriman TEXT,
      dp REAL DEFAULT 0,
      jatuh_tempo_dp DATE,
      arah TEXT DEFAULT 'IN',
      catatan TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Tank inventory — master tangki + log pergerakan stok
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tank (
      id SERIAL PRIMARY KEY,
      no_urut INTEGER,
      kode TEXT,
      nama TEXT NOT NULL,
      produk TEXT,
      kapasitas_mt REAL DEFAULT 0,
      lokasi TEXT,
      awal_filling DATE,
      akhir_filling DATE,
      be_digunakan TEXT,
      catatan TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Kolom retensi (idempotent — untuk tabel tank yang sudah terlanjur dibuat)
  await pool.query(`ALTER TABLE tank ADD COLUMN IF NOT EXISTS no_urut INTEGER`);
  await pool.query(`ALTER TABLE tank ADD COLUMN IF NOT EXISTS awal_filling DATE`);
  await pool.query(`ALTER TABLE tank ADD COLUMN IF NOT EXISTS akhir_filling DATE`);
  await pool.query(`ALTER TABLE tank ADD COLUMN IF NOT EXISTS be_digunakan TEXT`);
  await pool.query(`ALTER TABLE tank ADD COLUMN IF NOT EXISTS catatan TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tank_movement (
      id SERIAL PRIMARY KEY,
      tank_id INTEGER REFERENCES tank(id) ON DELETE CASCADE,
      tanggal DATE NOT NULL,
      opening REAL DEFAULT 0,
      inbound REAL DEFAULT 0,
      outbound REAL DEFAULT 0,
      closing REAL DEFAULT 0,
      catatan TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Quality log — parameter lab per batch/sampel
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quality_log (
      id SERIAL PRIMARY KEY,
      tanggal DATE NOT NULL,
      produk TEXT,
      relasi_nama TEXT,
      sampel TEXT,
      ffa REAL,
      mni REAL,
      iv REAL,
      dobi REAL,
      color TEXT,
      catatan TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Pembayaran — catatan bayar per kontrak untuk aging piutang
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pembayaran (
      id SERIAL PRIMARY KEY,
      no_kontrak TEXT,
      relasi_nama TEXT,
      tanggal DATE NOT NULL,
      jumlah REAL DEFAULT 0,
      metode TEXT,
      keterangan TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Refinery mass-balance / raw & stock balancing per periode cut-off
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refinery_balance (
      id SERIAL PRIMARY KEY,
      periode_label TEXT NOT NULL,
      tgl_start DATE,
      tgl_end DATE,
      -- Bahan baku CPO (MT)
      cpo_received REAL DEFAULT 0,
      cpo_processed REAL DEFAULT 0,
      cpo_stock REAL DEFAULT 0,
      cpo_reject REAL DEFAULT 0,
      cpo_lost_pct REAL DEFAULT 0.5,
      -- Produk fraksinasi (MT)
      olein_gross REAL DEFAULT 0,
      olein_dispatch REAL DEFAULT 0,
      olein_stock REAL DEFAULT 0,
      olein_reject REAL DEFAULT 0,
      stearin_gross REAL DEFAULT 0,
      stearin_dispatch REAL DEFAULT 0,
      stearin_stock REAL DEFAULT 0,
      stearin_reject REAL DEFAULT 0,
      pfad REAL DEFAULT 0,
      rbdpo REAL DEFAULT 0,
      catatan TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oat_param (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      harga_solar REAL DEFAULT 10600,
      kap_6r INTEGER DEFAULT 10000,
      kap_10r INTEGER DEFAULT 15000,
      kap_12r INTEGER DEFAULT 29000,
      kml_muat_6r REAL DEFAULT 5,
      kml_muat_10r REAL DEFAULT 4,
      kml_muat_12r REAL DEFAULT 3,
      kml_kosong_6r REAL DEFAULT 7,
      kml_kosong_10r REAL DEFAULT 6,
      kml_kosong_12r REAL DEFAULT 5,
      target_margin REAL DEFAULT 0.15,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oat_relasi (
      id SERIAL PRIMARY KEY,
      relasi_nama TEXT NOT NULL,
      produk TEXT,
      lokasi TEXT,
      jarak_pp REAL DEFAULT 0,
      oat_6r REAL DEFAULT 0,
      oat_10r REAL DEFAULT 0,
      oat_12r REAL DEFAULT 0,
      makan_jalan REAL DEFAULT 0,
      tol_retribusi REAL DEFAULT 0,
      penginapan REAL DEFAULT 0,
      UNIQUE(relasi_nama, produk)
    );
  `);

  // Index
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_timbangan_tanggal ON timbangan(tanggal_masuk);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_timbangan_relasi ON timbangan(relasi_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_timbangan_produk ON timbangan(produk);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_timbangan_no_polisi ON timbangan(no_polisi);`);

  // Seed users default
  const userCheck = await pool.query("SELECT id FROM users WHERE username = 'admin'");
  if (userCheck.rows.length === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const opHash    = bcrypt.hashSync('operator123', 10);
    const mgrHash   = bcrypt.hashSync('manajer123', 10);
    await pool.query("INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES ($1,$2,$3,$4)", ['admin', adminHash, 'Administrator', 'admin']);
    await pool.query("INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES ($1,$2,$3,$4)", ['operator', opHash, 'Operator Timbangan', 'operator']);
    await pool.query("INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES ($1,$2,$3,$4)", ['manajer', mgrHash, 'Manajer', 'manajer']);
  }

  // Seed relasi
  const relCount = await pool.query('SELECT COUNT(*) as c FROM relasi');
  if (relCount.rows[0].c == 0) {
    const relasi = [
      ['JAS', 'PT. JAS MULIA', 'Makassar', ''],
      ['KMP', 'PT. KASMAR MATANO PERSADA', 'Palu', 'BJL'],
      ['MIS', 'PT. MADINRA INTI SAWIT', 'Bone Bone', 'CV WIL'],
      ['PN', 'PT. PERKEBUNAN NUSANTARA', 'Masamba', 'CV WIL'],
      ['BJL', 'PT. BUKIT JEJER LESTARI', 'Pomala', 'CV Lingkar'],
      ['WNE', 'PT. WIJAYA NUSANTARA ENERGI', 'Burau', 'CV WIL'],
      ['WPE', 'PT. WISAN PETRO ENERGI', 'Makassar', ''],
      ['WIN', 'PT. WIJAYA INTI NUSANTARA', 'Makassar', ''],
      ['MLR', 'PT. MADU LINGGA RAHARJA', 'Makassar', ''],
      ['DA', 'CV. DUTA ABADI', 'Makassar', ''],
      ['SCM', 'CV. SURYA CAHAYA MAS', 'Makassar', ''],
      ['HSA', 'CV. HALILINTAR SAKTI ABADI', 'Makassar', ''],
      ['TDJ', 'PT. TRI DAYA JAYA', 'Makassar', ''],
      ['PUP', 'PT. PANDU URANE PERKASA', 'Makassar', ''],
      ['NDJ', 'CV. Nusantara Daya Jaya', 'Makassar', ''],
    ];
    for (const r of relasi) {
      await pool.query("INSERT INTO relasi (kode, nama, lokasi, transportir) VALUES ($1,$2,$3,$4)", r);
    }
  }

  // Seed produk
  const prodCount = await pool.query('SELECT COUNT(*) as c FROM produk');
  if (prodCount.rows[0].c == 0) {
    for (const p of [['CPO','CPO'],['RBDPL','RBDPL'],['B-40','B-40'],['BE','BE'],['PFAD','PFAD']]) {
      await pool.query("INSERT INTO produk (kode, nama) VALUES ($1,$2)", p);
    }
  }

  // Seed OAT param + relasi
  const oatCheck = await pool.query('SELECT id FROM oat_param WHERE id = 1');
  if (oatCheck.rows.length === 0) {
    await pool.query('INSERT INTO oat_param (id) VALUES (1)');
  }

  const oatRelCount = await pool.query('SELECT COUNT(*) as c FROM oat_relasi');
  if (oatRelCount.rows[0].c == 0) {
    const oat = [
      ['CV. DUTA ABADI','RBDPL','Makassar',720,475,475,475],
      ['CV. HALILINTAR SAKTI ABADI','RBDPL','Makassar',720,475,475,475],
      ['CV. Nusantara Daya Jaya','RBDPL','',0,0,0,0],
      ['CV. SURYA CAHAYA MAS','RBDPL','Gowa',800,475,475,475],
      ['PT. BUKIT JEJER LESTARI','RBDPL','Palu',1124,1200,1200,1200],
      ['PT. JAS MULIA','CPO','Bone Bone',136,120,120,120],
      ['PT. KASMAR MATANO PERSADA','CPO','Masamba',106,110,110,110],
      ['PT. MADINRA INTI SAWIT','CPO','Pomala',988,800,800,800],
      ['PT. PANDU URANE PERKASA','RBDPL','Torobulu',1284,1500,1500,1500],
      ['PT. PERKEBUNAN NUSANTARA','CPO','Burau',198,140,140,140],
      ['PT. TRI DAYA JAYA','RBDPL','Siumbatu',946,1000,1000,1000],
      ['PT. WIJAYA INTI NUSANTARA','RBDPL','Torobulu',1284,1500,1500,1500],
    ];
    for (const r of oat) {
      await pool.query('INSERT INTO oat_relasi (relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r) VALUES ($1,$2,$3,$4,$5,$6,$7)', r);
    }
  }

  console.log('✅ Schema Postgres siap');
}

module.exports = { pool, query, all, get, run, initDB };
