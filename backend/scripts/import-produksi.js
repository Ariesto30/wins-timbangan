/* Import "2. Rekap ALl2026.xlsx":
   - sheet "Data Center" -> production_log (175 hari, MT)
   - sheet "Refinery"    -> sounding_recon (sounding fisik vs DC buku, per bulan per produk)
   Mapping kolom sudah diverifikasi (geser 1 kolom). */
require('dotenv').config();
const ExcelJS = require('exceljs');
const db = require('../db/pg');
const FILE = '/Users/ariestotopayung/wins-timbangan/Data TImbangan/2. Rekap ALl2026.xlsx';

const num = c => { let v = c && c.value; if (v == null) return null; if (typeof v === 'object') v = v.result != null ? v.result : (v.text != null ? v.text : null); const n = Number(v); return isNaN(n) ? null : n; };
const serialToDate = s => { if (s == null) return null; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86400000); return d.toISOString().slice(0, 10); };
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

async function run() {
  const admin = await db.get("SELECT id FROM users WHERE username='admin' LIMIT 1");
  const adminId = admin?.id || 1;

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(FILE, { worksheets: 'emit', sharedStrings: 'cache' });
  const prodRows = [];
  const soundRows = [];

  for await (const ws of reader) {
    if (ws.name === 'Data Center') {
      let n = 0;
      for await (const row of ws) {
        n++; if (n < 8) continue;
        const no = num(row.getCell(2)), ser = num(row.getCell(3));
        if (no == null || ser == null || ser < 44000 || ser > 47000) continue;
        const g = i => num(row.getCell(i)) || 0;
        prodRows.push({
          tanggal: serialToDate(ser),
          cpo_in: g(4), cpo_stock_timbangan: g(5), cpo_stock: g(6), cpo_feed: g(7), cpo_reject: g(8), cpo_stock_akhir: g(9),
          rbdpo: g(10), rbdpo_feed: g(11), rbdpo_reject: g(12), rbdpo_stock: g(13),
          olein: g(14), olein_reject: g(15), olein_despatch: g(16),
          stearin: g(18), stearin_reject: g(19), stearin_despatch: g(20), pfad: g(22),
        });
      }
    } else if (ws.name === 'Refinery') {
      let n = 0;
      const PROD = [['CPO', 3], ['RBDPO', 7], ['PFAD', 11], ['RBDPL', 15], ['RBDPS', 19]];
      for await (const row of ws) {
        n++; if (n < 7) continue;
        const ser = num(row.getCell(2));
        if (ser == null || ser < 44000 || ser > 47000) continue;
        const tgl = serialToDate(ser);
        const d = new Date(tgl);
        const label = MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
        for (const [prod, base] of PROD) {
          const sound = num(row.getCell(base)), dc = num(row.getCell(base + 1));
          if (sound == null && dc == null) continue;
          const s = sound || 0, b = dc || 0;
          // selalu hitung dari sounding/dc agar konsisten (kolom % Excel dibulatkan)
          soundRows.push({
            periode: tgl, periode_label: label, produk: prod,
            sounding_kg: s, dc_kg: b,
            variance_kg: +(s - b).toFixed(0),
            variance_pct: b ? +((s - b) / b * 100).toFixed(3) : 0,
          });
        }
      }
    } else { for await (const _ of ws) { } }
  }

  // UPSERT production_log
  let pIns = 0;
  for (const r of prodRows) {
    await db.run(`INSERT INTO production_log
      (tanggal,cpo_in,cpo_stock_timbangan,cpo_stock,cpo_feed,cpo_reject,cpo_stock_akhir,rbdpo,rbdpo_feed,rbdpo_reject,rbdpo_stock,olein,olein_reject,olein_despatch,stearin,stearin_reject,stearin_despatch,pfad,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (tanggal) DO UPDATE SET
        cpo_in=EXCLUDED.cpo_in,cpo_stock_timbangan=EXCLUDED.cpo_stock_timbangan,cpo_stock=EXCLUDED.cpo_stock,
        cpo_feed=EXCLUDED.cpo_feed,cpo_reject=EXCLUDED.cpo_reject,cpo_stock_akhir=EXCLUDED.cpo_stock_akhir,
        rbdpo=EXCLUDED.rbdpo,rbdpo_feed=EXCLUDED.rbdpo_feed,rbdpo_reject=EXCLUDED.rbdpo_reject,rbdpo_stock=EXCLUDED.rbdpo_stock,
        olein=EXCLUDED.olein,olein_reject=EXCLUDED.olein_reject,olein_despatch=EXCLUDED.olein_despatch,
        stearin=EXCLUDED.stearin,stearin_reject=EXCLUDED.stearin_reject,stearin_despatch=EXCLUDED.stearin_despatch,pfad=EXCLUDED.pfad,updated_at=NOW()`,
      [r.tanggal, r.cpo_in, r.cpo_stock_timbangan, r.cpo_stock, r.cpo_feed, r.cpo_reject, r.cpo_stock_akhir, r.rbdpo, r.rbdpo_feed, r.rbdpo_reject, r.rbdpo_stock, r.olein, r.olein_reject, r.olein_despatch, r.stearin, r.stearin_reject, r.stearin_despatch, r.pfad, adminId]);
    pIns++;
  }

  // UPSERT sounding_recon
  let sIns = 0;
  for (const r of soundRows) {
    await db.run(`INSERT INTO sounding_recon (periode,periode_label,produk,sounding_kg,dc_kg,variance_kg,variance_pct,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (periode,produk) DO UPDATE SET sounding_kg=EXCLUDED.sounding_kg,dc_kg=EXCLUDED.dc_kg,variance_kg=EXCLUDED.variance_kg,variance_pct=EXCLUDED.variance_pct`,
      [r.periode, r.periode_label, r.produk, r.sounding_kg, r.dc_kg, r.variance_kg, r.variance_pct, adminId]);
    sIns++;
  }

  console.log('=== IMPORT SELESAI ===');
  const pv = await db.get('SELECT COUNT(*)::int c, MIN(tanggal) mn, MAX(tanggal) mx, SUM(cpo_in)::numeric ci, SUM(olein)::numeric ol, SUM(pfad)::numeric pf FROM production_log');
  console.log(`production_log: ${pv.c} hari | ${pv.mn} s/d ${pv.mx}`);
  console.log(`  Σ CPO_IN=${(+pv.ci).toFixed(1)} MT | Σ Olein=${(+pv.ol).toFixed(1)} MT | Σ PFAD=${(+pv.pf).toFixed(1)} MT`);
  const sv = await db.get('SELECT COUNT(*)::int c, COUNT(DISTINCT periode)::int bln FROM sounding_recon');
  console.log(`sounding_recon: ${sv.c} baris | ${sv.bln} bulan`);
  process.exit(0);
}
run().catch(e => { console.error('ERR', e.message); process.exit(1); });
