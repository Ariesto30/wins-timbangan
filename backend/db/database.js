const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Production: pakai persistent disk di /data (Render mount path)
// Development: pakai file di folder backend
const DB_DIR = process.env.DATABASE_DIR || path.join(__dirname, '..');
if (DB_DIR !== path.join(__dirname, '..') && !fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'wins_timbangan.db');
console.log(`📂 Database path: ${DB_PATH}`);
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nama_lengkap TEXT,
      role TEXT NOT NULL DEFAULT 'operator', -- admin | operator | manajer
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS relasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT UNIQUE,
      nama TEXT NOT NULL,
      lokasi TEXT,
      transportir TEXT,
      aktif INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS produk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timbangan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_seri TEXT,
      no_seri_relasi TEXT,
      no_polisi TEXT,
      no_kontrak TEXT,
      do_number TEXT,
      relasi_id INTEGER REFERENCES relasi(id),
      relasi_nama TEXT,
      produk TEXT,
      truck_type TEXT,
      tanggal_masuk TEXT,
      berat_masuk INTEGER,
      berat_keluar INTEGER,
      berat_netto_wins INTEGER GENERATED ALWAYS AS (berat_masuk - berat_keluar) VIRTUAL,
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
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS kontrak (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      tanggal_penyerahan TEXT,
      jatuh_tempo TEXT,
      status_pengiriman TEXT,
      dp REAL DEFAULT 0,
      jatuh_tempo_dp TEXT,
      arah TEXT DEFAULT 'IN',
      catatan TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

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
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS oat_relasi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    CREATE INDEX IF NOT EXISTS idx_timbangan_tanggal ON timbangan(tanggal_masuk);
    CREATE INDEX IF NOT EXISTS idx_timbangan_relasi ON timbangan(relasi_id);
    CREATE INDEX IF NOT EXISTS idx_timbangan_produk ON timbangan(produk);
    CREATE INDEX IF NOT EXISTS idx_timbangan_no_polisi ON timbangan(no_polisi);
  `);

  // Seed default admin user
  const admin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES (?, ?, ?, ?)").run('admin', hash, 'Administrator', 'admin');

    const opHash = bcrypt.hashSync('operator123', 10);
    db.prepare("INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES (?, ?, ?, ?)").run('operator', opHash, 'Operator Timbangan', 'operator');

    const mgrHash = bcrypt.hashSync('manajer123', 10);
    db.prepare("INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES (?, ?, ?, ?)").run('manajer', mgrHash, 'Manajer', 'manajer');
  }

  // Seed master data relasi
  const relasiCount = db.prepare('SELECT COUNT(*) as c FROM relasi').get().c;
  if (relasiCount === 0) {
    const insertRelasi = db.prepare('INSERT INTO relasi (kode, nama, lokasi, transportir) VALUES (?, ?, ?, ?)');
    [
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
    ].forEach(r => insertRelasi.run(...r));
  }

  // Seed OAT parameters
  const oatParam = db.prepare('SELECT id FROM oat_param WHERE id = 1').get();
  if (!oatParam) {
    db.prepare('INSERT INTO oat_param (id) VALUES (1)').run();
  }

  // Seed OAT relasi default (akan di-update via import_oat.js)
  const oatRelCount = db.prepare('SELECT COUNT(*) as c FROM oat_relasi').get().c;
  if (oatRelCount === 0) {
    const ins = db.prepare('INSERT INTO oat_relasi (relasi_nama, produk, lokasi, jarak_pp, oat_6r, oat_10r, oat_12r) VALUES (?, ?, ?, ?, ?, ?, ?)');
    [
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
    ].forEach(r => ins.run(...r));
  }

  // Seed produk
  const produkCount = db.prepare('SELECT COUNT(*) as c FROM produk').get().c;
  if (produkCount === 0) {
    const insertProduk = db.prepare('INSERT INTO produk (kode, nama) VALUES (?, ?)');
    [['CPO', 'CPO'], ['RBDPL', 'RBDPL'], ['B-40', 'B-40'], ['BE', 'BE'], ['PFAD', 'PFAD']].forEach(p => insertProduk.run(...p));
  }
}

initDB();
module.exports = db;
