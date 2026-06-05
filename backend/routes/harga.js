const router = require('express').Router();
const db = require('../db/pg');
const { authenticate, requireRole } = require('../middleware/auth');
const axios = require('axios');
const cheerio = require('cheerio');

router.use(authenticate);

const PRODUK_LIST = ['CPO', 'RBDPO', 'Olein', 'Stearin', 'PFAD'];

/* ─── Scraper: ambil harga harian PORAM (FOB) + FCPO (MYR) + CPO Dumai ─── */
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

async function fetchSource() {
  // Coba URL "prices at closing" beberapa hari terakhir (blog kadang lag/libur)
  const today = new Date();
  for (let back = 0; back < 7; back++) {
    const d = new Date(today.getTime() - back * 86400000);
    const yy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    const day = d.getDate(), mon = MONTHS[d.getMonth()];
    for (const variant of ['closing', 'midday']) {
      const url = `https://agropost.wordpress.com/${yy}/${mm}/${dd}/${day}-${mon}-${yy}-palm-oil-prices-at-${variant}/`;
      try {
        const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(r.data);
        const text = ($('.entry-content, article').text() || $('body').text()).replace(/[’']/g, "'").replace(/\s+/g, ' ');
        const parsed = parsePrices(text, `${yy}-${mm}-${dd}`);
        if (parsed.length >= 3) return { url, tanggal: `${yy}-${mm}-${dd}`, rows: parsed };
      } catch (e) { /* coba tanggal/variant lain */ }
    }
  }
  return null;
}

function num(s) { return s ? parseFloat(String(s).replace(/,/g, '')) : null; }

function parsePrices(text, tanggal) {
  const rows = [];
  const add = (produk, harga, sumber, mata_uang, basis) => { if (harga != null && !isNaN(harga)) rows.push({ tanggal, produk, harga, sumber, mata_uang, basis }); };

  // PORAM physical (USD/MT FOB Malaysia) — ambil angka "Selling" pertama
  const por = [
    [/RBD Palm Olein Selling\s+([\d.,]+)/i, 'Olein'],
    [/RBD Palm Oil Selling\s+([\d.,]+)/i, 'RBDPO'],
    [/RBD Palm Stearin Selling\s+([\d.,]+)/i, 'Stearin'],
    [/Palm Fatty Acid Distillates? Selling\s+([\d.,]+)/i, 'PFAD'],
    [/(?:^|\s)Crude Palm Oil Selling\s+([\d.,]+)/i, 'CPO'],
  ];
  por.forEach(([re, prod]) => { const m = text.match(re); if (m) add(prod, num(m[1]), 'PORAM', 'USD', 'FOB Malaysia'); });

  // CPO Indonesia (Dumai/Belawan)
  const idn = text.match(/INDONESIAN CRUDE PALM OIL[^]*?Selling\s+([\d.,]+)/i);
  if (idn) add('CPO', num(idn[1]), 'KPBN/Dumai', 'USD', 'FOB Belawan/Dumai');

  // FCPO front month (MYR) — baris pertama setelah "Low"
  const fcpo = text.match(/RINGGIT MALAYSIA[^]*?Low\s+\S+'?\d{2}\s+([\d.,]+)/i);
  if (fcpo) add('CPO', num(fcpo[1]), 'FCPO', 'MYR', 'Futures MDEX');

  return rows;
}

/* POST /fetch — tarik dari online & simpan */
router.post('/fetch', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const data = await fetchSource();
    if (!data) return res.status(502).json({ error: 'Sumber harga online tidak dapat dijangkau / belum ada update hari ini. Coba lagi nanti atau input manual.' });
    let saved = 0;
    for (const r of data.rows) {
      await db.run(`INSERT INTO harga_pasar (tanggal, sumber, produk, harga, mata_uang, basis, periode, auto)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true)
        ON CONFLICT (tanggal, sumber, produk, periode) DO UPDATE SET harga=EXCLUDED.harga, mata_uang=EXCLUDED.mata_uang, basis=EXCLUDED.basis, auto=true`,
        [r.tanggal, r.sumber, r.produk, r.harga, r.mata_uang, r.basis, 'spot']);
      saved++;
    }
    res.json({ message: `${saved} harga ter-update dari online (${data.tanggal})`, tanggal: data.tanggal, source_url: data.url, rows: data.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET / — harga terkini per produk per sumber */
router.get('/', async (req, res) => {
  try {
    const latest = await db.all(`
      SELECT DISTINCT ON (sumber, produk) tanggal, sumber, produk, harga, mata_uang, basis, perubahan, auto
      FROM harga_pasar ORDER BY sumber, produk, tanggal DESC, id DESC
    `);
    // perubahan vs hari sebelumnya (per sumber+produk)
    for (const r of latest) {
      const prev = await db.get(`SELECT harga FROM harga_pasar WHERE sumber=$1 AND produk=$2 AND tanggal<$3 ORDER BY tanggal DESC LIMIT 1`, [r.sumber, r.produk, r.tanggal]);
      r.prev = prev ? prev.harga : null;
      r.delta = prev ? +(r.harga - prev.harga).toFixed(2) : null;
      r.delta_pct = prev && prev.harga ? +((r.harga - prev.harga) / prev.harga * 100).toFixed(2) : null;
    }
    const lastUpdate = await db.get(`SELECT MAX(tanggal) tgl, BOOL_OR(auto) ada_auto FROM harga_pasar`);
    res.json({ latest, lastUpdate: lastUpdate?.tgl || null });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /history — time series untuk chart */
router.get('/history', async (req, res) => {
  try {
    const { produk, sumber, hari = 60 } = req.query;
    const w = []; const p = []; let n = 1;
    if (produk) { w.push(`produk=$${n++}`); p.push(produk); }
    if (sumber) { w.push(`sumber=$${n++}`); p.push(sumber); }
    w.push(`tanggal >= CURRENT_DATE - $${n++}::int`); p.push(parseInt(hari));
    const rows = await db.all(`SELECT tanggal, sumber, produk, harga, mata_uang FROM harga_pasar WHERE ${w.join(' AND ')} ORDER BY tanggal`, p);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /inventory-value — nilai stok tangki dgn harga pasar (integrasi) */
router.get('/inventory-value', async (req, res) => {
  try {
    const kurs = parseFloat(req.query.kurs_usd) || 16000; // IDR per USD default
    // harga PORAM terkini per produk (USD/MT)
    const harga = await db.all(`SELECT DISTINCT ON (produk) produk, harga FROM harga_pasar WHERE sumber='PORAM' ORDER BY produk, tanggal DESC`);
    const hMap = {}; harga.forEach(h => { hMap[h.produk] = h.harga; });
    // map produk tangki → produk harga
    const alias = { RBDPL: 'Olein', Olein: 'Olein', RBDPS: 'Stearin', Stearin: 'Stearin', PFAD: 'PFAD', RBDPO: 'RBDPO', CPO: 'CPO' };
    const tanks = await db.all(`SELECT t.id, t.nama, t.produk, COALESCE((SELECT closing FROM tank_movement WHERE tank_id=t.id ORDER BY tanggal DESC, id DESC LIMIT 1),0) stok_mt FROM tank t WHERE aktif=1`);
    let totalUsd = 0; const rows = [];
    tanks.forEach(t => {
      const hp = hMap[alias[t.produk]] || null;
      const nilaiUsd = hp ? hp * Number(t.stok_mt) : 0;
      totalUsd += nilaiUsd;
      rows.push({ nama: t.nama, produk: t.produk, stok_mt: +Number(t.stok_mt).toFixed(1), harga_usd: hp, nilai_usd: Math.round(nilaiUsd), nilai_idr: Math.round(nilaiUsd * kurs) });
    });
    res.json({ kurs, total_usd: Math.round(totalUsd), total_idr: Math.round(totalUsd * kurs), rows: rows.sort((a, b) => b.nilai_usd - a.nilai_usd) });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST / — input manual */
router.post('/', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.tanggal || !b.produk || b.harga == null) return res.status(400).json({ error: 'Tanggal, produk, harga wajib' });
    const r = await db.get(`INSERT INTO harga_pasar (tanggal, sumber, produk, harga, mata_uang, basis, periode, auto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,false)
      ON CONFLICT (tanggal, sumber, produk, periode) DO UPDATE SET harga=EXCLUDED.harga, mata_uang=EXCLUDED.mata_uang, basis=EXCLUDED.basis, auto=false RETURNING *`,
      [b.tanggal, b.sumber || 'Manual', b.produk, Number(b.harga), b.mata_uang || 'USD', b.basis || null, b.periode || 'spot']);
    res.json(r);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireRole('admin', 'manajer'), async (req, res) => {
  try { await db.run(`DELETE FROM harga_pasar WHERE id=$1`, [req.params.id]); res.json({ message: 'Terhapus' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
