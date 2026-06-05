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

/* Tarik dari online & simpan (dipakai route + cron) */
async function runFetchAndStore() {
  const data = await fetchSource();
  if (!data) return { ok: false, saved: 0 };
  let saved = 0;
  for (const r of data.rows) {
    await db.run(`INSERT INTO harga_pasar (tanggal, sumber, produk, harga, mata_uang, basis, periode, auto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true)
      ON CONFLICT (tanggal, sumber, produk, periode) DO UPDATE SET harga=EXCLUDED.harga, mata_uang=EXCLUDED.mata_uang, basis=EXCLUDED.basis, auto=true`,
      [r.tanggal, r.sumber, r.produk, r.harga, r.mata_uang, r.basis, 'spot']);
    saved++;
  }
  const k = await fetchKurs(); // sekalian update kurs
  return { ok: true, saved, tanggal: data.tanggal, url: data.url, rows: data.rows, kurs: k.ok ? k.kurs : null };
}

/* ─── KURS: ambil USD & MYR -> IDR dari API gratis (open.er-api.com) ─── */
async function fetchKurs() {
  try {
    const r = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 12000 });
    const rates = r.data?.rates; if (!rates?.IDR) return { ok: false };
    const tanggal = new Date().toISOString().slice(0, 10);
    const out = [{ mata_uang: 'USD', nilai_idr: rates.IDR }];
    if (rates.MYR) out.push({ mata_uang: 'MYR', nilai_idr: rates.IDR / rates.MYR });
    for (const k of out) {
      await db.run(`INSERT INTO kurs (tanggal, mata_uang, nilai_idr) VALUES ($1,$2,$3)
        ON CONFLICT (tanggal, mata_uang) DO UPDATE SET nilai_idr=EXCLUDED.nilai_idr`,
        [tanggal, k.mata_uang, Math.round(k.nilai_idr)]);
    }
    return { ok: true, tanggal, kurs: out.map(k => ({ ...k, nilai_idr: Math.round(k.nilai_idr) })) };
  } catch (e) { return { ok: false, error: e.message }; }
}
// kurs terkini per mata uang (fallback default)
async function kursMap() {
  const rows = await db.all(`SELECT DISTINCT ON (mata_uang) mata_uang, nilai_idr, tanggal FROM kurs ORDER BY mata_uang, tanggal DESC`);
  const m = { USD: 16000, MYR: 3500, IDR: 1 }; let tgl = null;
  rows.forEach(r => { m[r.mata_uang] = Number(r.nilai_idr); tgl = r.tanggal; });
  return { map: m, tanggal: tgl };
}
const toIDR = (harga, mu, km) => Math.round(harga * (km[mu] || 1));

/* POST /kurs/fetch — tarik kurs online */
router.post('/kurs/fetch', requireRole('admin', 'manajer'), async (req, res) => {
  const r = await fetchKurs();
  if (!r.ok) return res.status(502).json({ error: 'Gagal ambil kurs online: ' + (r.error || 'sumber tak terjangkau') });
  res.json({ message: `Kurs ter-update (${r.tanggal})`, ...r });
});

/* GET /kurs — kurs terkini + riwayat */
router.get('/kurs', async (req, res) => {
  try {
    const { map, tanggal } = await kursMap();
    const hist = await db.all(`SELECT tanggal, mata_uang, nilai_idr FROM kurs WHERE tanggal >= CURRENT_DATE - 90 ORDER BY tanggal`);
    res.json({ terkini: map, tanggal, history: hist });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /summary — KPI per produk×sumber: harga, Δ7h, Δ30h, hi/lo, USD & IDR */
router.get('/summary', async (req, res) => {
  try {
    const { map: km, tanggal: kursTgl } = await kursMap();
    const combos = await db.all(`SELECT DISTINCT sumber, produk FROM harga_pasar ORDER BY produk, sumber`);
    const out = [];
    for (const c of combos) {
      const series = await db.all(`SELECT tanggal, harga, mata_uang FROM harga_pasar WHERE sumber=$1 AND produk=$2 AND periode='spot' ORDER BY tanggal DESC LIMIT 90`, [c.sumber, c.produk]);
      if (!series.length) continue;
      const cur = series[0];
      const at = days => { const tgt = new Date(cur.tanggal); tgt.setDate(tgt.getDate() - days); return series.find(s => new Date(s.tanggal) <= tgt); };
      const d7 = at(7), d30 = at(30);
      const vals = series.map(s => s.harga);
      out.push({
        produk: c.produk, sumber: c.sumber, mata_uang: cur.mata_uang, tanggal: cur.tanggal,
        harga: cur.harga, harga_idr: toIDR(cur.harga, cur.mata_uang, km),
        d7: d7 ? +(cur.harga - d7.harga).toFixed(2) : null, d7_pct: d7 && d7.harga ? +((cur.harga - d7.harga) / d7.harga * 100).toFixed(2) : null,
        d30: d30 ? +(cur.harga - d30.harga).toFixed(2) : null, d30_pct: d30 && d30.harga ? +((cur.harga - d30.harga) / d30.harga * 100).toFixed(2) : null,
        hi90: Math.max(...vals), lo90: Math.min(...vals), n: series.length,
      });
    }
    res.json({ kurs: km, kurs_tanggal: kursTgl, items: out });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /series?produk=&sumber=&hari= — time series + Rupiah (multi via koma) */
router.get('/series', async (req, res) => {
  try {
    const { map: km } = await kursMap();
    const hari = parseInt(req.query.hari) || 90;
    const produk = (req.query.produk || '').split(',').filter(Boolean);
    const sumber = (req.query.sumber || '').split(',').filter(Boolean);
    const w = [`tanggal >= CURRENT_DATE - ${hari}`, `periode='spot'`]; const p = []; let n = 1;
    if (produk.length) { w.push(`produk = ANY($${n++})`); p.push(produk); }
    if (sumber.length) { w.push(`sumber = ANY($${n++})`); p.push(sumber); }
    const rows = await db.all(`SELECT tanggal, sumber, produk, harga, mata_uang FROM harga_pasar WHERE ${w.join(' AND ')} ORDER BY tanggal`, p);
    res.json(rows.map(r => ({ ...r, harga_idr: toIDR(r.harga, r.mata_uang, km), seri: `${r.produk} · ${r.sumber}` })));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /insight — Owner Decision: tren harga × stok tangki */
router.get('/insight', async (req, res) => {
  try {
    const { map: km } = await kursMap();
    const alias = { RBDPL: 'Olein', Olein: 'Olein', RBDPS: 'Stearin', Stearin: 'Stearin', PFAD: 'PFAD', RBDPO: 'RBDPO', CPO: 'CPO' };
    // stok per produk-harga
    const tanks = await db.all(`SELECT t.produk, COALESCE((SELECT closing FROM tank_movement WHERE tank_id=t.id ORDER BY tanggal DESC,id DESC LIMIT 1),0) stok FROM tank t WHERE aktif=1`);
    const stokByHarga = {};
    tanks.forEach(t => { const k = alias[t.produk] || t.produk; stokByHarga[k] = (stokByHarga[k] || 0) + Number(t.stok); });
    const insights = []; let nilaiTotal = 0;
    for (const produk of PRODUK_LIST) {
      const series = await db.all(`SELECT DISTINCT ON (tanggal) tanggal, harga, mata_uang FROM harga_pasar WHERE produk=$1 AND sumber IN ('PORAM','KPBN/Dumai') ORDER BY tanggal DESC LIMIT 30`, [produk]);
      if (!series.length) continue;
      const cur = series[0]; const stok = stokByHarga[produk] || 0;
      const at = d => { const t = new Date(cur.tanggal); t.setDate(t.getDate() - d); return series.find(s => new Date(s.tanggal) <= t); };
      const d7 = at(7); const chg7 = d7 && d7.harga ? (cur.harga - d7.harga) / d7.harga * 100 : 0;
      const nilai = toIDR(cur.harga, cur.mata_uang, km) * stok; nilaiTotal += nilai;
      let aksi = 'TAHAN', alasan = 'Harga stabil', level = 'netral';
      if (chg7 > 2) { aksi = stok > 0 ? 'JUAL BERTAHAP' : 'TUNDA BELI'; alasan = `Harga naik ${chg7.toFixed(1)}% (7h) — momentum baik untuk lepas stok`; level = 'naik'; }
      else if (chg7 < -2) { aksi = stok > 0 ? 'TAHAN / SEGERA JUAL bila mutu turun' : 'PELUANG BELI'; alasan = `Harga turun ${chg7.toFixed(1)}% (7h)`; level = 'turun'; }
      insights.push({ produk, harga: cur.harga, mata_uang: cur.mata_uang, harga_idr: toIDR(cur.harga, cur.mata_uang, km), chg7: +chg7.toFixed(2), stok_mt: +stok.toFixed(1), nilai_idr: Math.round(nilai), aksi, alasan, level });
    }
    insights.sort((a, b) => b.nilai_idr - a.nilai_idr);
    res.json({ kurs: km, total_nilai_idr: Math.round(nilaiTotal), insights });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /export.csv — unduh seluruh harga (+ Rupiah) */
router.get('/export.csv', async (req, res) => {
  try {
    const { map: km } = await kursMap();
    const rows = await db.all(`SELECT tanggal, produk, sumber, harga, mata_uang, basis FROM harga_pasar WHERE periode='spot' ORDER BY tanggal DESC, produk`);
    const head = 'Tanggal,Produk,Sumber,Harga,Mata Uang,Harga (Rp),Basis\n';
    const body = rows.map(r => [r.tanggal, r.produk, r.sumber, r.harga, r.mata_uang, toIDR(r.harga, r.mata_uang, km), (r.basis || '').replace(/,/g, ';')].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="harga_pasar_wins.csv"');
    res.send(head + body);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST /backfill — isi riwayat estimasi N hari (random walk dari harga terkini) utk kedalaman chart.
   Ditandai basis='estimasi' & auto=false; bisa ditimpa data nyata. */
router.post('/backfill', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const hari = Math.min(parseInt(req.body.hari) || 180, 400);
    const combos = await db.all(`SELECT DISTINCT ON (sumber, produk) sumber, produk, harga, mata_uang FROM harga_pasar WHERE periode='spot' ORDER BY sumber, produk, tanggal DESC`);
    let n = 0;
    for (const c of combos) {
      let h = c.harga;
      for (let d = 1; d <= hari; d++) {
        const tgl = new Date(); tgl.setDate(tgl.getDate() - d);
        const ds = tgl.toISOString().slice(0, 10);
        // random walk mundur ±0.8%/hari
        h = h * (1 + (Math.random() - 0.5) * 0.016);
        const harga = +h.toFixed(2);
        await db.run(`INSERT INTO harga_pasar (tanggal, sumber, produk, harga, mata_uang, basis, periode, auto)
          VALUES ($1,$2,$3,$4,$5,'estimasi','spot',false)
          ON CONFLICT (tanggal, sumber, produk, periode) DO NOTHING`,
          [ds, c.sumber, c.produk, harga, c.mata_uang]);
        n++;
      }
    }
    res.json({ message: `Backfill ${hari} hari estimasi selesai (${n} baris, ditandai "estimasi").`, baris: n });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* POST /fetch — tarik dari online & simpan */
router.post('/fetch', requireRole('admin', 'manajer'), async (req, res) => {
  try {
    const r = await runFetchAndStore();
    if (!r.ok) return res.status(502).json({ error: 'Sumber harga online tidak dapat dijangkau / belum ada update hari ini. Coba lagi nanti atau input manual.' });
    res.json({ message: `${r.saved} harga ter-update dari online (${r.tanggal})`, tanggal: r.tanggal, source_url: r.url, rows: r.rows });
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
module.exports.runFetchAndStore = runFetchAndStore;
module.exports.fetchKurs = fetchKurs;
