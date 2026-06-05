/* Generator Excel "Form Pengisian Operasional WINS"
   5 sheet: Petunjuk + Lab Harian + Mutasi Stok + Pembayaran + Backfill Timbangan
   Dropdown + contoh terisi + data existing pra-isi. */
require('dotenv').config();
const ExcelJS = require('exceljs');
const db = require('../db/pg');
const path = require('path');

const OUT = '/Users/ariestotopayung/wins-timbangan/Data TImbangan/Form_Operasional_WINS.xlsx';
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
const HEAD_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const FILL_INPUT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };   // kuning = isi manual
const FILL_AUTO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };     // abu = otomatis/ref

function header(ws, cols) {
  ws.columns = cols.map(c => ({ header: c.h, key: c.k, width: c.w || 16 }));
  const row = ws.getRow(1);
  row.height = 26;
  row.eachCell(c => { c.fill = HEAD_FILL; c.font = HEAD_FONT; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = { bottom: { style: 'thin' } }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}
// data validation list dari named-range di sheet _ref
function dvList(ws, colLetter, formulae, fromRow = 2, toRow = 600) {
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(`${colLetter}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae };
  }
}

async function run() {
  const tanks = await db.all(`SELECT no_urut, nama, produk FROM tank WHERE aktif=1 ORDER BY no_urut`);
  const produk = await db.all(`SELECT kode FROM produk ORDER BY kode`);
  const kontrak = await db.all(`SELECT no_kontrak, relasi_nama FROM kontrak WHERE no_kontrak IS NOT NULL ORDER BY no_kontrak`);
  const backfill = await db.all(`
    SELECT id, no_seri, to_char(tanggal_masuk,'YYYY-MM-DD') tgl, no_polisi, relasi_nama, produk,
      COALESCE(driver,'') driver, COALESCE(transportir,'') transportir,
      COALESCE(berat_relasi,0) berat_relasi
    FROM timbangan
    WHERE (driver IS NULL OR driver='') OR (transportir IS NULL OR transportir='') OR (berat_relasi IS NULL OR berat_relasi=0)
    ORDER BY tanggal_masuk DESC, no_seri DESC`);

  const tankNames = tanks.map(t => t.nama);
  const prodKodes = produk.map(p => p.kode);
  const kontrakNos = kontrak.map(k => k.no_kontrak);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'WINS Timbangan'; wb.created = new Date();

  /* ── Sheet _ref (hidden) untuk dropdown ── */
  const ref = wb.addWorksheet('_ref');
  ref.state = 'veryHidden';
  tankNames.forEach((v, i) => ref.getCell(`A${i + 1}`).value = v);
  prodKodes.forEach((v, i) => ref.getCell(`B${i + 1}`).value = v);
  kontrakNos.forEach((v, i) => ref.getCell(`C${i + 1}`).value = v);
  ['Transfer', 'Tunai', 'Giro', 'Cek', 'Lainnya'].forEach((v, i) => ref.getCell(`D${i + 1}`).value = v);
  const refTank = `_ref!$A$1:$A$${Math.max(tankNames.length, 1)}`;
  const refProd = `_ref!$B$1:$B$${Math.max(prodKodes.length, 1)}`;
  const refKon = `_ref!$C$1:$C$${Math.max(kontrakNos.length, 1)}`;
  const refMet = `_ref!$D$1:$D$5`;

  /* ── Sheet 0: PETUNJUK ── */
  const info = wb.addWorksheet('PETUNJUK');
  info.columns = [{ width: 4 }, { width: 100 }];
  const lines = [
    ['', 'FORM PENGISIAN OPERASIONAL — WINS TIMBANGAN'],
    ['', `Dibuat: ${new Date().toLocaleString('id-ID')}`],
    ['', ''],
    ['', 'PETUNJUK UMUM:'],
    ['', '• Sel berwarna KUNING = diisi manual oleh operator.'],
    ['', '• Sel berwarna ABU = otomatis dihitung sistem / referensi (jangan diisi).'],
    ['', '• Kolom dengan dropdown: klik sel, pilih dari daftar (jangan ketik bebas).'],
    ['', '• Baris contoh (ditandai "CONTOH") boleh dihapus sebelum diserahkan.'],
    ['', '• Tanggal format: YYYY-MM-DD (mis. 2026-06-04).'],
    ['', ''],
    ['', 'SHEET 1 — LAB HARIAN TANGKI'],
    ['', '  Hasil lab harian per tangki. Min 2 entri/tangki agar Evaluasi Stabilitas Mutu jalan.'],
    ['', '  Isi parameter yang relevan saja per produk (CPO: FFA/M&I/DOBI/IV; Olein: FFA/IV/CP; Stearin: FFA/IV/MP; RBDPO: FFA/IV/PV).'],
    ['', ''],
    ['', 'SHEET 2 — MUTASI STOK TANGKI'],
    ['', '  Pergerakan stok harian. Isi MASUK & KELUAR (kg). Stok awal/akhir dihitung sistem otomatis.'],
    ['', ''],
    ['', 'SHEET 3 — PEMBAYARAN KONTRAK'],
    ['', '  Catatan pembayaran per kontrak untuk aging piutang. Pilih No. Kontrak dari dropdown.'],
    ['', ''],
    ['', 'SHEET 4 — BACKFILL TIMBANGAN'],
    ['', '  Trip yang Driver/Transportir/Berat Relasi-nya masih kosong. Lengkapi sel kuning.'],
    ['', '  JANGAN ubah kolom ID & No. Seri (dipakai sistem untuk mencocokkan saat import).'],
    ['', ''],
    ['', 'Setelah terisi, serahkan file ini ke admin sistem untuk di-import.'],
  ];
  lines.forEach((l, i) => {
    const row = info.addRow(l);
    if (i === 0) row.getCell(2).font = { bold: true, size: 14, color: { argb: 'FF0D9488' } };
    else if (l[1].endsWith('TANGKI') || l[1].startsWith('SHEET') || l[1] === 'PETUNJUK UMUM:') row.getCell(2).font = { bold: true, size: 11 };
  });

  /* ── Sheet 1: LAB HARIAN ── */
  const lab = wb.addWorksheet('1-Lab Harian');
  header(lab, [
    { h: 'Tanggal*', k: 'tanggal', w: 13 }, { h: 'Tangki*', k: 'tank', w: 16 }, { h: 'Produk', k: 'produk', w: 10 },
    { h: 'Tonase (kg)', k: 'tonase', w: 12 }, { h: 'FFA (%)', k: 'ffa', w: 9 }, { h: 'M&I (%)', k: 'mni', w: 9 },
    { h: 'IV', k: 'iv', w: 8 }, { h: 'DOBI', k: 'dobi', w: 8 }, { h: 'PV', k: 'pv', w: 8 }, { h: 'ANV', k: 'anv', w: 8 },
    { h: 'TOX', k: 'tox', w: 8 }, { h: 'CP (°C)', k: 'cp', w: 9 }, { h: 'MP (°C)', k: 'mp', w: 9 },
    { h: 'Color', k: 'color', w: 10 }, { h: 'Catatan', k: 'catatan', w: 22 },
  ]);
  // contoh
  lab.addRow({ tanggal: '2026-06-01', tank: tankNames[0] || 'CPO ST01', produk: 'CPO', tonase: 2500000, ffa: 4.9, mni: 0.27, iv: 51.7, dobi: 1.87, pv: 2.45, anv: 2.2, tox: 7.1, color: '3.0 R', catatan: 'CONTOH — boleh dihapus' });
  lab.addRow({ tanggal: '2026-06-01', tank: tankNames[6] || 'Olein ST07', produk: 'Olein', tonase: 536860, ffa: 0.08, iv: 56.2, cp: 9.8, color: '2.1', catatan: 'CONTOH — boleh dihapus' });
  dvList(lab, 'B', [refTank]); dvList(lab, 'C', [refProd]);
  paintInputs(lab, 15, 2);

  /* ── Sheet 2: MUTASI STOK ── */
  const mut = wb.addWorksheet('2-Mutasi Stok');
  header(mut, [
    { h: 'Tanggal*', k: 'tanggal', w: 13 }, { h: 'Tangki*', k: 'tank', w: 16 },
    { h: 'Masuk (kg)', k: 'masuk', w: 12 }, { h: 'No DO Masuk', k: 'do_in', w: 14 },
    { h: 'Keluar (kg)', k: 'keluar', w: 12 }, { h: 'No DO Keluar', k: 'do_out', w: 14 },
    { h: 'Tujuan / Pembeli', k: 'tujuan', w: 22 }, { h: 'Catatan', k: 'catatan', w: 20 },
  ]);
  mut.addRow({ tanggal: '2026-06-01', tank: tankNames[6] || 'Olein ST07', keluar: 112200, do_out: 'DO-2026-0612', tujuan: 'CV Duta Abadi', catatan: 'CONTOH — boleh dihapus' });
  mut.addRow({ tanggal: '2026-06-02', tank: tankNames[0] || 'CPO ST01', masuk: 38500, do_in: 'DO-CPO-0455', tujuan: '', catatan: 'CONTOH — boleh dihapus' });
  dvList(mut, 'B', [refTank]);
  paintInputs(mut, 8, 2);

  /* ── Sheet 3: PEMBAYARAN ── */
  const pay = wb.addWorksheet('3-Pembayaran');
  header(pay, [
    { h: 'No. Kontrak*', k: 'kontrak', w: 26 }, { h: 'Tanggal Bayar*', k: 'tanggal', w: 14 },
    { h: 'Jumlah (Rp)*', k: 'jumlah', w: 16 }, { h: 'Metode', k: 'metode', w: 12 }, { h: 'Keterangan', k: 'ket', w: 26 },
  ]);
  pay.addRow({ kontrak: kontrakNos[0] || '006/OLEIN/WINS', tanggal: '2026-06-03', jumlah: 500000000, metode: 'Transfer', ket: 'CONTOH — boleh dihapus' });
  dvList(pay, 'A', [refKon]); dvList(pay, 'D', [refMet]);
  paintInputs(pay, 5, 2);

  /* ── Sheet 4: BACKFILL TIMBANGAN ── */
  const bf = wb.addWorksheet('4-Backfill Timbangan');
  header(bf, [
    { h: 'ID (jangan ubah)', k: 'id', w: 10 }, { h: 'No. Seri', k: 'seri', w: 10 }, { h: 'Tanggal', k: 'tgl', w: 12 },
    { h: 'No. Polisi', k: 'polisi', w: 12 }, { h: 'Relasi', k: 'relasi', w: 22 }, { h: 'Produk', k: 'produk', w: 9 },
    { h: 'Driver (isi)', k: 'driver', w: 16 }, { h: 'Transportir (isi)', k: 'transportir', w: 16 }, { h: 'Berat Relasi kg (isi)', k: 'brelasi', w: 18 },
  ]);
  backfill.forEach(t => bf.addRow({
    id: t.id, seri: t.no_seri, tgl: t.tgl, polisi: t.no_polisi, relasi: t.relasi_nama, produk: t.produk,
    driver: t.driver || '', transportir: t.transportir || '', brelasi: t.berat_relasi || '',
  }));
  // kolom A-F = abu (ref, jangan ubah), G-I = kuning (isi)
  const bfRows = backfill.length + 1;
  for (let r = 2; r <= bfRows; r++) {
    ['A','B','C','D','E','F'].forEach(c => bf.getCell(`${c}${r}`).fill = FILL_AUTO);
    ['G','H','I'].forEach(c => bf.getCell(`${c}${r}`).fill = FILL_INPUT);
  }
  // Transportir (kol H) & Driver (kol G) = teks bebas, tanpa dropdown.

  await wb.xlsx.writeFile(OUT);
  console.log('✅ File dibuat:', OUT);
  console.log('   Sheet: PETUNJUK, 1-Lab Harian, 2-Mutasi Stok, 3-Pembayaran, 4-Backfill Timbangan');
  console.log('   Backfill trip yg perlu dilengkapi:', backfill.length);
  console.log('   Dropdown tangki:', tankNames.length, '| produk:', prodKodes.length, '| kontrak:', kontrakNos.length);
  process.exit(0);
}

function paintInputs(ws, nCols, fromRow) {
  // semua kolom input = kuning (form kosong utk diisi)
  for (let r = fromRow; r <= 400; r++) {
    for (let c = 1; c <= nCols; c++) ws.getRow(r).getCell(c).fill = FILL_INPUT;
  }
}

run().catch(e => { console.error('ERR', e.message); process.exit(1); });
