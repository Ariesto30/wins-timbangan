/* Saldo awal aktual tangki per hari ini (dari tabel STORAGE TANKS user).
   Set kapasitas + produk + kode/nama, lalu reset movement -> 1 baris saldo awal. */
require('dotenv').config();
const db = require('../db/pg');
const TGL = '2026-06-05';

// no_urut -> [kode, nama, produk, kapasitas_MT, stok_MT]
const ROWS = [
  [1,  'ST01', 'CPO ST01',     'CPO',     2500, 541.254],
  [2,  'ST02', 'CPO ST02',     'CPO',     2500, 2593.880],
  [3,  'ST03', 'CPO ST03',     'CPO',     2500, 2492.727],
  [4,  'ST04', 'PFAD ST04',    'PFAD',    500,  476.862],
  [5,  'ST05', 'Stearin ST05', 'Stearin', 500,  504.204],
  [6,  'ST06', 'Stearin ST06', 'Stearin', 500,  554.452],
  [7,  'ST07', 'PFAD ST07',    'PFAD',    500,  219.111],
  [8,  'ST08', 'Olein ST08',   'Olein',   500,  0],
  [9,  'ST09', 'Olein ST09',   'Olein',   500,  0],
  [10, 'ST10', 'Olein ST10',   'Olein',   500,  136.708],
  [11, 'ST11', 'Olein ST11',   'Olein',   500,  0],
  [12, 'ST12', 'Olein ST12',   'Olein',   500,  526.953],
  [13, 'ST13', 'RBDPO ST13',   'RBDPO',   1000, 43.247],
  [14, 'ST14', 'Stearin ST14', 'Stearin', 1000, 1084.861],
  [15, 'BUF1', 'Buffer 1',     'Olein',   100,  0],
  [16, 'BUF2', 'Buffer 2',     'Olein',   100,  0],
  [17, 'BUF3', 'Buffer 3',     'Olein',   50,   0],
  [18, 'BUF4', 'Buffer 4',     'Olein',   50,   0],
];

async function run() {
  const admin = await db.get("SELECT id FROM users WHERE username='admin' LIMIT 1");
  const adminId = admin?.id || 1;
  let updated = 0, seeded = 0;

  for (const [urut, kode, nama, produk, kap, stok] of ROWS) {
    const t = await db.get('SELECT id FROM tank WHERE no_urut=$1', [urut]);
    if (!t) { console.log('  ! no_urut', urut, 'tidak ditemukan, lewati'); continue; }

    // 1. set master tangki (kapasitas + produk + kode/nama benar)
    await db.run('UPDATE tank SET kode=$1, nama=$2, produk=$3, kapasitas_mt=$4 WHERE id=$5',
      [kode, nama, produk, kap, t.id]);
    updated++;

    // 2. reset pergerakan -> mulai bersih dari saldo awal hari ini
    await db.run('DELETE FROM tank_movement WHERE tank_id=$1', [t.id]);
    if (stok > 0) {
      await db.run(`INSERT INTO tank_movement (tank_id, tanggal, opening, inbound, outbound, closing, catatan, created_by)
        VALUES ($1,$2,0,$3,0,$4,$5,$6)`,
        [t.id, TGL, stok, stok, 'Saldo awal aktual per ' + TGL, adminId]);
      seeded++;
    }
    const util = kap > 0 ? (stok / kap * 100).toFixed(1) : '0';
    console.log('  ' + kode.padEnd(5), produk.padEnd(8), 'kap=' + String(kap).padStart(4),
      '| stok=' + String(stok).padStart(9), '| util=' + util + '%' + (stok > kap ? '  ⚠OVER' : ''));
  }

  console.log('\n=== SELESAI ===');
  console.log('Tangki di-update:', updated, '| saldo awal di-seed:', seeded);
  const tot = await db.get(`SELECT
    (SELECT COALESCE(SUM(kapasitas_mt),0) FROM tank WHERE aktif=1) kap,
    (SELECT COALESCE(SUM(closing),0) FROM tank_movement m WHERE id=(SELECT id FROM tank_movement WHERE tank_id=m.tank_id ORDER BY tanggal DESC,id DESC LIMIT 1)) stk`);
  console.log('Total kapasitas:', Number(tot.kap).toLocaleString('id-ID'), 'MT | Total stok:', Number(tot.stk).toLocaleString('id-ID'), 'MT');
  process.exit(0);
}
run().catch(e => { console.error('ERR', e.message); process.exit(1); });
