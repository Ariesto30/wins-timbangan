/* Import MONITORING TANK 2026.xlsx (format matriks lebar) -> quality_log
   1 baris = 1 tanggal; kolom = tangki × parameter (Tonase,FFA,M+I,DOBI,IV,PV,Anv,Totox).
   6 bulan (Jan-Jun), buat Buffer 1-4 bila belum ada. */
require('dotenv').config();
const ExcelJS = require('exceljs');
const db = require('../db/pg');
const FILE = '/Users/ariestotopayung/wins-timbangan/Data TImbangan/MONITORING TANK 2026.xlsx';

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function mapParam(label) {
  const p = String(label || '').toLowerCase().replace(/\s/g, '');
  if (p.includes('ffa')) return 'ffa';
  if (p.includes('m+i') || p.includes('m&i') || p === 'mi') return 'mni';
  if (p.includes('dobi')) return 'dobi';
  if (p === 'iv') return 'iv';
  if (p === 'pv') return 'pv';
  if (p.includes('anv')) return 'anv';
  if (p.includes('totox') || p.includes('tox')) return 'tox';
  if (p.includes('tonase')) return 'tonase';
  return null;
}
function normProduk(p) {
  const P = String(p || '').toUpperCase();
  if (P.includes('CPO')) return 'CPO';
  if (P.includes('PFAD')) return 'PFAD';
  if (P.includes('STEARIN')) return 'Stearin';
  if (P.includes('OLEIN') || P.includes('COOKING')) return 'Olein';
  if (P.includes('RBDPO')) return 'RBDPO';
  return p || null;
}
function parseDate(v) {
  if (!v) return null;
  if (typeof v === 'object' && !(v instanceof Date)) v = v.result ?? v.text ?? null; // formula -> hasil
  if (!v) return null;
  let d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d)) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const num = v => { if (v == null || v === '') return null; if (typeof v === 'object') v = v.result ?? v.text ?? null; const n = Number(v); return isNaN(n) ? null : n; };

async function run() {
  // 1. peta tangki (kode -> id)
  const tanks = await db.all('SELECT id, kode, nama, no_urut FROM tank');
  const tmap = {};
  tanks.forEach(t => { if (t.kode) tmap[norm(t.kode)] = t.id; tmap[norm(t.nama)] = tmap[norm(t.nama)] || t.id; });
  // buat Buffer 1-4 bila belum ada
  let nextUrut = Math.max(0, ...tanks.map(t => t.no_urut || 0)) + 1;
  for (let i = 1; i <= 4; i++) {
    const key = norm('Buffer ' + i);
    if (!tmap[key]) {
      const r = await db.get(`INSERT INTO tank (no_urut, kode, nama, produk, aktif) VALUES ($1,$2,$3,'Olein',1) RETURNING id`, [nextUrut++, 'BUF' + i, 'Buffer ' + i]);
      tmap[key] = r.id; tmap[norm('BUF' + i)] = r.id;
      console.log('Buat tangki Buffer', i, '-> id', r.id);
    }
  }
  const findTank = code => tmap[norm(code)] || null;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const months = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI'];
  const admin = await db.get("SELECT id FROM users WHERE username='admin' LIMIT 1");
  const adminId = admin?.id || 1;

  let totalIns = 0, totalSkipTank = 0;
  const PARAMCOLS = ['tonase', 'ffa', 'mni', 'dobi', 'iv', 'pv', 'anv', 'tox'];

  for (const mo of months) {
    const ws = wb.getWorksheet(mo);
    if (!ws) continue;
    // bangun colMap: col -> {tankCode, produk, param}; + cari kolom tanggal
    const colMap = {}; let dateCol = null; let curTank = null;
    for (let c = 1; c <= ws.actualColumnCount; c++) {
      const tcode = String(ws.getCell(3, c).value || '').trim();
      const prod = ws.getCell(2, c).value;
      const plabel = ws.getCell(4, c).value;
      if (/tanggal/i.test(tcode) || /tanggal/i.test(String(prod || ''))) { dateCol = c; curTank = null; continue; }
      if (!tcode) continue;
      let param;
      if (norm(tcode) !== norm(curTank)) { curTank = tcode; param = 'tonase'; } // kolom pertama blok = tonase
      else param = mapParam(plabel);
      if (param) colMap[c] = { tankCode: tcode, produk: normProduk(prod), param };
    }
    if (!dateCol) { console.log(mo, ': kolom tanggal tidak ketemu, lewati'); continue; }

    // kumpulkan per (row, tank)
    const rows = [];
    for (let r = 6; r <= ws.actualRowCount; r++) {
      const tgl = parseDate(ws.getCell(r, dateCol).value);
      if (!tgl) continue;
      const perTank = {};
      for (const [c, m] of Object.entries(colMap)) {
        const v = num(ws.getCell(r, parseInt(c)).value);
        if (v == null) continue;
        const key = m.tankCode;
        perTank[key] = perTank[key] || { produk: m.produk, vals: {} };
        perTank[key].vals[m.param] = v;
      }
      for (const [tcode, d] of Object.entries(perTank)) {
        const tankId = findTank(tcode);
        if (!tankId) { totalSkipTank++; continue; }
        if (Object.keys(d.vals).length === 0) continue;
        rows.push({ tgl, tankId, produk: d.produk, ...d.vals });
      }
    }

    // batch insert
    const CHUNK = 150;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const vals = []; const ph = chunk.map((rw, ci) => {
        const b = ci * 12;
        vals.push(rw.tgl, rw.tankId, rw.produk, rw.tonase ?? null, rw.ffa ?? null, rw.mni ?? null, rw.iv ?? null, rw.dobi ?? null, rw.pv ?? null, rw.anv ?? null, rw.tox ?? null, adminId);
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`;
      }).join(',');
      await db.query(`INSERT INTO quality_log (tanggal,tank_id,produk,tonase,ffa,mni,iv,dobi,pv,anv,tox,created_by) VALUES ${ph}`, vals);
      totalIns += chunk.length;
    }
    console.log(mo.padEnd(10), '->', rows.length, 'entri lab');
  }
  console.log('\n=== SELESAI ===');
  console.log('Total entri lab masuk:', totalIns, '| skip (tangki tak cocok):', totalSkipTank);
  const verif = await db.get('SELECT COUNT(*)::int c, COUNT(DISTINCT tank_id)::int tk, MIN(tanggal) mn, MAX(tanggal) mx FROM quality_log');
  console.log('quality_log:', verif.c, 'baris |', verif.tk, 'tangki | periode', verif.mn, 's/d', verif.mx);
  process.exit(0);
}
run().catch(e => { console.error('ERR', e.message); process.exit(1); });
