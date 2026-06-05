const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');
const ExcelJS = require('exceljs');

router.use(authenticate);

// Baca worksheet jadi array objek (key = header baris 1, lowercase tanpa spasi)
function readSheet(ws) {
  if (!ws) return [];
  const headers = {};
  ws.getRow(1).eachCell((cell, col) => { headers[col] = String(cell.value || '').toLowerCase().trim(); });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    let empty = true;
    row.eachCell((cell, col) => {
      const h = headers[col]; if (!h) return;
      let v = cell.value;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      if (v && typeof v === 'object' && v.text !== undefined) v = v.text;
      obj[h] = v;
      if (v !== null && v !== undefined && v !== '') empty = false;
    });
    if (!empty) rows.push(obj);
  }
  return rows;
}
const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? null : n; };
const dstr = v => { if (!v) return null; if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v).trim(); const m = s.match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : s.slice(0, 10); };
const isContoh = o => Object.values(o).some(v => String(v).toUpperCase().includes('CONTOH'));

router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b64 = req.body.base64;
    if (!b64) return res.status(400).json({ error: 'File kosong' });
    const buf = Buffer.from(b64.replace(/^data:.*;base64,/, ''), 'base64');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const result = {};
    const tanks = await db.all(`SELECT id, nama FROM tank WHERE aktif=1`);
    const tankMap = {}; tanks.forEach(t => { tankMap[String(t.nama).toLowerCase().trim()] = t.id; });
    const findTank = nm => tankMap[String(nm || '').toLowerCase().trim()] || null;
    const adminId = req.user.id;

    // ── 1. Lab Harian → quality_log ──
    const labRows = readSheet(wb.getWorksheet('1-Lab Harian'));
    let labOk = 0; const labErr = [];
    for (const r of labRows) {
      if (isContoh(r)) continue;
      const tgl = dstr(r['tanggal*'] || r['tanggal']);
      if (!tgl) { labErr.push('baris tanpa tanggal'); continue; }
      const tankId = findTank(r['tangki*'] || r['tangki']);
      try {
        await db.run(`INSERT INTO quality_log (tanggal,tank_id,produk,tonase,ffa,mni,iv,dobi,pv,anv,tox,cp,mp,color,catatan,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [tgl, tankId, r['produk'] || null, num(r['tonase (kg)'] || r['tonase']), num(r['ffa (%)'] || r['ffa']), num(r['m&i (%)'] || r['m&i']),
            num(r['iv']), num(r['dobi']), num(r['pv']), num(r['anv']), num(r['tox']), num(r['cp (°c)'] || r['cp']), num(r['mp (°c)'] || r['mp']),
            r['color'] || null, r['catatan'] || null, adminId]);
        labOk++;
      } catch (e) { labErr.push(e.message.slice(0, 60)); }
    }
    if (labRows.length) result['Lab Harian'] = { ok: labOk, error: labErr.length, errors: labErr.slice(0, 5) };

    // ── 2. Mutasi Stok → tank_movement (opening = closing terakhir, urut tanggal) ──
    const mutRows = readSheet(wb.getWorksheet('2-Mutasi Stok')).filter(r => !isContoh(r));
    let mutOk = 0; const mutErr = [];
    // urutkan per tangki per tanggal
    mutRows.sort((a, b) => String(dstr(a['tanggal*'] || a['tanggal'])).localeCompare(String(dstr(b['tanggal*'] || b['tanggal']))));
    for (const r of mutRows) {
      const tgl = dstr(r['tanggal*'] || r['tanggal']); const tankId = findTank(r['tangki*'] || r['tangki']);
      if (!tgl || !tankId) { mutErr.push('tangki/tanggal tidak valid'); continue; }
      try {
        const last = await db.get(`SELECT closing FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [tankId]);
        const opening = last ? Number(last.closing) : 0;
        const masuk = (num(r['masuk (kg)'] || r['masuk']) || 0) / 1000;   // kg → MT
        const keluar = (num(r['keluar (kg)'] || r['keluar']) || 0) / 1000;
        const closing = opening + masuk - keluar;
        await db.run(`INSERT INTO tank_movement (tank_id,tanggal,opening,inbound,outbound,closing,catatan,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [tankId, tgl, opening, masuk, keluar, closing,
            [r['no do masuk'], r['no do keluar'], r['tujuan / pembeli'], r['catatan']].filter(Boolean).join(' | ') || null, adminId]);
        mutOk++;
      } catch (e) { mutErr.push(e.message.slice(0, 60)); }
    }
    if (mutRows.length) result['Mutasi Stok'] = { ok: mutOk, error: mutErr.length, errors: mutErr.slice(0, 5) };

    // ── 3. Pembayaran → pembayaran ──
    const payRows = readSheet(wb.getWorksheet('3-Pembayaran')).filter(r => !isContoh(r));
    let payOk = 0; const payErr = [];
    for (const r of payRows) {
      const kontrak = r['no. kontrak*'] || r['no. kontrak']; const tgl = dstr(r['tanggal bayar*'] || r['tanggal bayar']);
      if (!kontrak || !tgl) { payErr.push('kontrak/tanggal kosong'); continue; }
      try {
        const k = await db.get(`SELECT relasi_nama FROM kontrak WHERE no_kontrak=$1`, [String(kontrak).trim()]);
        await db.run(`INSERT INTO pembayaran (no_kontrak,relasi_nama,tanggal,jumlah,metode,keterangan,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [String(kontrak).trim(), k?.relasi_nama || null, tgl, num(r['jumlah (rp)*'] || r['jumlah (rp)']) || 0, r['metode'] || null, r['keterangan'] || null, adminId]);
        payOk++;
      } catch (e) { payErr.push(e.message.slice(0, 60)); }
    }
    if (payRows.length) result['Pembayaran'] = { ok: payOk, error: payErr.length, errors: payErr.slice(0, 5) };

    // ── 4. Backfill Timbangan → UPDATE by id ──
    const bfRows = readSheet(wb.getWorksheet('4-Backfill Timbangan'));
    let bfOk = 0; const bfErr = [];
    for (const r of bfRows) {
      const id = num(r['id (jangan ubah)'] || r['id']);
      if (!id) continue;
      const driver = r['driver (isi)'] || r['driver']; const transp = r['transportir (isi)'] || r['transportir']; const brel = num(r['berat relasi kg (isi)'] || r['berat relasi']);
      const sets = []; const params = []; let n = 1;
      if (driver && String(driver).trim()) { sets.push(`driver=$${n++}`); params.push(String(driver).trim()); }
      if (transp && String(transp).trim()) { sets.push(`transportir=$${n++}`); params.push(String(transp).trim()); }
      if (brel) { sets.push(`berat_relasi=$${n++}`); params.push(brel); }
      if (sets.length === 0) continue;
      params.push(id);
      try { const rr = await db.run(`UPDATE timbangan SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${n}`, params); if (rr.changes) bfOk++; }
      catch (e) { bfErr.push(e.message.slice(0, 60)); }
    }
    if (bfRows.length) result['Backfill Timbangan'] = { ok: bfOk, error: bfErr.length, errors: bfErr.slice(0, 5) };

    if (Object.keys(result).length === 0) return res.status(400).json({ error: 'Tidak ada sheet yang dikenali (1-Lab Harian / 2-Mutasi Stok / 3-Pembayaran / 4-Backfill Timbangan)' });
    res.json({ message: 'Import selesai', result });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

module.exports = router;
