const router = require('express').Router();
const db = require('../db/pg');
const { authenticate } = require('../middleware/auth');
const ai = require('../ai/orchestrator');

router.use(authenticate);

/* ─────────────────────────────────────────────────────────────
   INSIGHT ENGINE — Decision Support
   /insight/briefing  → Owner Daily Briefing
   /insight/center    → Executive Insight Center (5 dimensi)
   Semua dihitung dari data existing (timbangan, tank, harga, refinery).
   ───────────────────────────────────────────────────────────── */

const KURS = 16000; // IDR per USD (default)

async function tankState() {
  const tanks = await db.all(`SELECT id, no_urut, nama, produk, kapasitas_mt, akhir_filling FROM tank WHERE aktif=1 ORDER BY no_urut`);
  const today = new Date();
  for (const t of tanks) {
    const last = await db.get(`SELECT closing, tanggal FROM tank_movement WHERE tank_id=$1 ORDER BY tanggal DESC, id DESC LIMIT 1`, [t.id]);
    t.stok = last ? Number(last.closing) : 0;
    t.last_move = last ? last.tanggal : null;
    t.util = t.kapasitas_mt > 0 ? +(t.stok / t.kapasitas_mt * 100).toFixed(1) : 0;
    t.retensi = t.akhir_filling ? Math.floor((today - new Date(t.akhir_filling)) / 86400000) : null;
  }
  return tanks;
}

async function hargaMap() {
  const rows = await db.all(`SELECT DISTINCT ON (produk) produk, harga FROM harga_pasar WHERE sumber='PORAM' ORDER BY produk, tanggal DESC`);
  const m = {}; rows.forEach(r => m[r.produk] = r.harga);
  return m;
}
const PALIAS = { RBDPL: 'Olein', Olein: 'Olein', RBDPS: 'Stearin', Stearin: 'Stearin', PFAD: 'PFAD', RBDPO: 'RBDPO', CPO: 'CPO' };

const pct = (a, b) => (b ? +(a / b * 100).toFixed(2) : 0);
function calcYield(t) {
  return {
    refining: pct(t.rbdpo, t.cpo_feed), pfad: pct(t.pfad, t.cpo_feed),
    refining_loss: +(100 - pct(t.rbdpo, t.cpo_feed) - pct(t.pfad, t.cpo_feed)).toFixed(2),
    olein: pct(t.olein, t.rbdpo_feed), stearin: pct(t.stearin, t.rbdpo_feed),
    frac_loss: +(100 - pct(t.olein, t.rbdpo_feed) - pct(t.stearin, t.rbdpo_feed)).toFixed(2),
    cpo_reject: pct(t.cpo_reject, t.cpo_feed),
  };
}
const PSUM = 'COALESCE(SUM(cpo_feed),0) cpo_feed,COALESCE(SUM(cpo_reject),0) cpo_reject,COALESCE(SUM(rbdpo),0) rbdpo,COALESCE(SUM(rbdpo_feed),0) rbdpo_feed,COALESCE(SUM(olein),0) olein,COALESCE(SUM(stearin),0) stearin,COALESCE(SUM(pfad),0) pfad';
/* Ringkasan yield produksi: keseluruhan + 30 hari terakhir */
async function prodYield() {
  const has = await db.get(`SELECT COUNT(*)::int c, MAX(tanggal) mx, MIN(tanggal) mn FROM production_log`);
  if (!has.c) return null;
  const all = await db.get(`SELECT ${PSUM} FROM production_log`);
  const last = await db.get(`SELECT ${PSUM} FROM production_log WHERE tanggal > $1::date - INTERVAL '30 days'`, [has.mx]);
  return { hari: has.c, dari: has.mn, sampai: has.mx, overall: calcYield(all), last30: calcYield(last) };
}

/* ═══════════ OWNER DAILY BRIEFING ═══════════ */
router.get('/briefing', async (req, res) => {
  try {
    // Hari aktivitas terakhir (timbangan)
    const lastDay = await db.get(`SELECT MAX(tanggal_masuk) d FROM timbangan`);
    const refDate = lastDay?.d;
    // Ringkasan hari itu
    const yest = await db.get(`
      SELECT
        COUNT(*) FILTER (WHERE p.arah='IN')::int as in_trip,
        COUNT(*) FILTER (WHERE p.arah='OUT')::int as out_trip,
        COALESCE(SUM(t.berat_netto_wins) FILTER (WHERE p.arah='IN'),0)::bigint as in_kg,
        COALESCE(SUM(t.berat_netto_wins) FILTER (WHERE p.arah='OUT'),0)::bigint as out_kg
      FROM timbangan t LEFT JOIN produk p ON p.kode=t.produk
      WHERE t.tanggal_masuk = $1`, [refDate]);
    const transferYest = await db.get(`SELECT COUNT(*)::int c FROM tank_movement WHERE tanggal=$1`, [refDate]);

    const tanks = await tankState();
    const totalStok = tanks.reduce((s, t) => s + t.stok, 0);
    const totalKap = tanks.reduce((s, t) => s + (Number(t.kapasitas_mt) || 0), 0);
    const utilTotal = totalKap > 0 ? +(totalStok / totalKap * 100).toFixed(1) : 0;
    // produk dominan (by stok)
    const byProd = {};
    tanks.forEach(t => { byProd[t.produk] = (byProd[t.produk] || 0) + t.stok; });
    const dominan = Object.entries(byProd).sort((a, b) => b[1] - a[1])[0];

    // Risk alerts
    const risks = [];
    tanks.forEach(t => {
      if (t.util > 100) risks.push({ level: 'tinggi', tank: t.nama, msg: `${t.nama} OVER CAPACITY (${t.util}%)`, hint: 'Segera keluarkan / hentikan inbound' });
      else if (t.util >= 90) risks.push({ level: 'tinggi', tank: t.nama, msg: `${t.nama} hampir penuh (${t.util}%)`, hint: 'Jadwalkan dispatch' });
      else if (t.util > 0 && t.util < 8) risks.push({ level: 'sedang', tank: t.nama, msg: `${t.nama} hampir kosong (${t.util}%)`, hint: 'Cek kebutuhan isi ulang' });
      // Retensi hanya relevan untuk tangki yang ada isinya
      if (t.stok > 0 && t.retensi != null && t.retensi > 45) risks.push({ level: 'sedang', tank: t.nama, msg: `${t.nama} retensi ${t.retensi} hari`, hint: 'Mutu berisiko turun, prioritaskan keluarkan' });
    });

    // Rekomendasi (rule engine) — hanya untuk tangki berisi
    const recs = [];
    tanks.forEach(t => {
      if (t.stok <= 0) return; // tangki kosong: tak ada yang perlu direkomendasikan
      if (t.util >= 90 && t.util <= 100) recs.push(`${t.nama} terisi ${t.util}%, jadwalkan dispatch agar tidak overflow.`);
      if (t.util > 0 && t.util < 12) recs.push(`${t.nama} hanya terpakai ${t.util}%. Pertimbangkan realokasi produk / konsolidasi.`);
      if (t.retensi != null && t.retensi > 60) recs.push(`${t.nama} sudah ${t.retensi} hari (retensi tinggi). Prioritaskan jual untuk hindari penurunan mutu.`);
    });
    if (yest.out_trip === 0 && refDate) recs.push(`Tidak ada dispatch pada ${refDate}. Pastikan rencana pengiriman berjalan.`);

    // Produksi & yield (dari production_log)
    const py = await prodYield();
    if (py) {
      const o = py.overall, l = py.last30;
      if (l.refining > 0 && l.refining < 88) recs.push(`Refining yield 30 hari ${l.refining}% (di bawah ~90%). Cek kualitas CPO & setting proses.`);
      if (l.refining_loss > 2.5) recs.push(`Loss refining 30 hari ${l.refining_loss}% (tinggi). Investigasi susut proses.`);
      if (l.cpo_reject > 3) recs.push(`Reject CPO 30 hari ${l.cpo_reject}% (tinggi). Verifikasi mutu bahan baku masuk.`);
      if (l.refining > o.refining + 1) recs.push(`Refining yield membaik dari ${o.refining}% menjadi ${l.refining}% dalam 30 hari terakhir. Pertahankan.`);
    }

    res.json({
      ref_date: refDate,
      production: py ? {
        hari: py.hari, sampai: py.sampai,
        refining_yield: py.last30.refining, olein_yield: py.last30.olein, stearin_yield: py.last30.stearin,
        refining_loss: py.last30.refining_loss, cpo_reject: py.last30.cpo_reject,
        refining_overall: py.overall.refining,
      } : null,
      yesterday: {
        in_trip: yest.in_trip, out_trip: yest.out_trip,
        in_mt: +(Number(yest.in_kg) / 1000).toFixed(1), out_mt: +(Number(yest.out_kg) / 1000).toFixed(1),
        transfer: transferYest.c,
        delta_inv_mt: +((Number(yest.in_kg) - Number(yest.out_kg)) / 1000).toFixed(1),
      },
      current: {
        total_stok_mt: +(totalStok).toFixed(1), util_total: utilTotal,
        produk_dominan: dominan ? dominan[0] : '–',
        tangki_kritis: tanks.filter(t => t.util > 100 || (t.util > 0 && t.util < 8)).map(t => `${t.nama} (${t.util}%)`),
      },
      risks: risks.slice(0, 12),
      recommendations: [...new Set(recs)].slice(0, 8),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ EXECUTIVE INSIGHT CENTER ═══════════ */
router.get('/center', async (req, res) => {
  try {
    const tanks = await tankState();
    const harga = await hargaMap();

    /* OPERATIONAL */
    const sorted = [...tanks].sort((a, b) => a.util - b.util);
    const byCapProd = {};
    tanks.forEach(t => { byCapProd[t.produk] = (byCapProd[t.produk] || 0) + (Number(t.kapasitas_mt) || 0); });
    const operational = {
      util_terendah: sorted.slice(0, 3).map(t => ({ nama: t.nama, util: t.util, produk: t.produk })),
      util_tertinggi: sorted.slice(-3).reverse().map(t => ({ nama: t.nama, util: t.util, produk: t.produk })),
      retensi_panjang: tanks.filter(t => t.retensi != null && t.retensi > 45).map(t => ({ nama: t.nama, hari: t.retensi })).sort((a, b) => b.hari - a.hari),
      produk_kapasitas: Object.entries(byCapProd).map(([p, k]) => ({ produk: p, kapasitas: +k.toFixed(0) })).sort((a, b) => b.kapasitas - a.kapasitas),
    };

    /* PRODUCTION (timbangan OUT per bulan) */
    const prodTrend = await db.all(`
      SELECT to_char(t.tanggal_masuk,'YYYY-MM') bulan,
        COALESCE(SUM(t.berat_netto_wins) FILTER (WHERE p.arah='OUT'),0)::bigint out_kg,
        COALESCE(SUM(t.berat_netto_wins) FILTER (WHERE p.arah='IN'),0)::bigint in_kg
      FROM timbangan t LEFT JOIN produk p ON p.kode=t.produk
      GROUP BY bulan ORDER BY bulan`);
    // Yield bulanan dari production_log
    const yieldMonths = await db.all(`SELECT to_char(tanggal,'YYYY-MM') bulan, ${PSUM} FROM production_log GROUP BY bulan ORDER BY bulan`);
    const py = await prodYield();
    const production = {
      monthly: prodTrend.map(r => ({ bulan: r.bulan, out_mt: +(Number(r.out_kg) / 1000).toFixed(1), in_mt: +(Number(r.in_kg) / 1000).toFixed(1) })),
      yield: py ? {
        overall: py.overall, last30: py.last30, hari: py.hari, periode: `${py.dari} s/d ${py.sampai}`,
        trend: yieldMonths.map(m => ({ bulan: m.bulan, ...calcYield(m), olein_mt: +(+m.olein).toFixed(1), stearin_mt: +(+m.stearin).toFixed(1) })),
      } : null,
    };

    /* INVENTORY */
    const inventory = {
      dead_overstock: tanks.filter(t => t.util >= 90).map(t => ({ nama: t.nama, produk: t.produk, util: t.util, stok: +t.stok.toFixed(1) })),
      slow_low: tanks.filter(t => t.util > 0 && t.util < 12).map(t => ({ nama: t.nama, produk: t.produk, util: t.util, stok: +t.stok.toFixed(1) })),
      shortage_risk: tanks.filter(t => t.util > 0 && t.util < 8).map(t => ({ nama: t.nama, produk: t.produk, util: t.util })),
    };

    /* FINANCIAL — nilai stok @ harga pasar */
    let totalUsd = 0; const finRows = [];
    tanks.forEach(t => {
      const hp = harga[PALIAS[t.produk]] || null;
      const usd = hp ? hp * t.stok : 0; totalUsd += usd;
      if (t.stok > 0) finRows.push({ nama: t.nama, produk: t.produk, stok_mt: +t.stok.toFixed(1), harga_usd: hp, nilai_usd: Math.round(usd) });
    });
    finRows.sort((a, b) => b.nilai_usd - a.nilai_usd);
    const financial = {
      total_usd: Math.round(totalUsd), total_idr: Math.round(totalUsd * KURS), kurs: KURS,
      rows: finRows,
      working_capital_slow: Math.round(finRows.filter(r => { const t = tanks.find(x => x.nama === r.nama); return t && t.util < 12; }).reduce((s, r) => s + r.nilai_usd, 0)),
    };

    /* STRATEGIC — prediksi util & kapasitas */
    const totalStok = tanks.reduce((s, t) => s + t.stok, 0);
    const totalKap = tanks.reduce((s, t) => s + (Number(t.kapasitas_mt) || 0), 0);
    const strategic = {
      util_total: totalKap > 0 ? +(totalStok / totalKap * 100).toFixed(1) : 0,
      tangki_penuh: tanks.filter(t => t.util >= 90).length,
      tangki_kosong: tanks.filter(t => t.util < 8).length,
      catatan: 'Prediksi "hari menuju penuh" & forecast butuh data Mutasi Stok harian (Tank Snapshot). Aktifkan dengan mengisi sheet Mutasi Stok pada Form Operasional.',
    };

    res.json({ operational, production, inventory, financial, strategic });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ AI INSIGHT — TANK FARM (LLM + fallback rule-based) ═══════════ */

// Bangun insight aturan (fallback / saat LLM tak tersedia)
function ruleTankInsights(tanks, summary) {
  const out = [];
  const over = tanks.filter(t => t.util > 100);
  const penuh = tanks.filter(t => t.util >= 90 && t.util <= 100);
  const retensi = tanks.filter(t => t.stok > 0 && t.retensi != null && t.retensi > 45);
  const kosong = tanks.filter(t => t.util > 0 && t.util < 12);
  if (over.length) out.push({ level: 'tinggi', title: 'Risiko Over Capacity', text: `${over.length} tangki melebihi kapasitas (${over.map(t => t.nama + ' ' + t.util + '%').slice(0, 3).join(', ')}). Risiko luapan — segera keluarkan/dispatch.` });
  if (penuh.length) out.push({ level: 'sedang', title: 'Hampir Penuh', text: `${penuh.length} tangki di 90–100% (${penuh.map(t => t.nama).slice(0, 3).join(', ')}). Jadwalkan pengiriman agar tidak overflow.` });
  if (retensi.length) out.push({ level: 'sedang', title: 'Retensi Tinggi', text: `${retensi.length} tangki tersimpan >45 hari (${retensi.map(t => t.nama + ' ' + t.retensi + 'h').slice(0, 3).join(', ')}). Prioritaskan jual untuk jaga mutu.` });
  if (kosong.length) out.push({ level: 'info', title: 'Kapasitas Tersedia', text: `${kosong.length} tangki utilisasi <12% — ruang untuk produksi/penerimaan berikutnya.` });
  out.push({ level: 'info', title: 'Rekomendasi Distribusi', text: `Utilisasi tank farm ${summary.util_pct}%. ${summary.util_pct > 85 ? 'Tinggi — percepat dispatch produk jadi & tahan penerimaan CPO.' : 'Dalam batas aman.'}` });
  return out;
}

router.get('/ai-tank', async (req, res) => {
  try {
    const tanks = await tankState();
    const totalStok = tanks.reduce((s, t) => s + t.stok, 0);
    const totalKap = tanks.reduce((s, t) => s + (Number(t.kapasitas_mt) || 0), 0);
    const summary = { util_pct: totalKap > 0 ? +(totalStok / totalKap * 100).toFixed(1) : 0, total_stok: +totalStok.toFixed(1), penuh: tanks.filter(t => t.util >= 90).length };
    const rule = ruleTankInsights(tanks, summary);
    const ctx = tanks.filter(t => t.kapasitas_mt > 0).map(t => ({ tangki: t.nama, produk: t.produk, util_pct: t.util, stok_mt: +t.stok.toFixed(1), kapasitas_mt: t.kapasitas_mt, retensi_hari: t.retensi }));

    const result = await ai.getInsight({
      kind: 'tank',
      model: ai.MODEL.HAIKU,           // router: tank = Haiku (hemat)
      ruleItems: rule,
      force: req.query.force === '1',
      buildPrompt: () => `Anda analis operasional refinery kelapa sawit. Data tank farm hari ini (JSON):
${JSON.stringify({ ringkasan: summary, tangki: ctx })}

Berikan 4-5 insight keputusan untuk Owner dalam Bahasa Indonesia: risiko over-capacity, prediksi kebutuhan/ruang tangki, tren utilisasi, rekomendasi distribusi, early warning mutu (retensi). Ringkas, actionable, angka spesifik.
Jawab HANYA JSON array valid: [{"level":"tinggi|sedang|info","title":"...","text":"..."}]. Tanpa teks lain.`,
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ KONTEKS LINTAS MODUL (untuk AI) ═══════════ */
const BELI = new Set(['CPO']);
async function marketSnap() {
  const kurs = await db.get(`SELECT nilai_idr FROM kurs WHERE mata_uang='USD' ORDER BY tanggal DESC LIMIT 1`).catch(() => null);
  const out = [];
  for (const p of ['CPO', 'RBDPO', 'Olein', 'Stearin', 'PFAD']) {
    const series = await db.all(`SELECT tanggal, harga, mata_uang FROM harga_pasar WHERE produk=$1 AND sumber IN ('PORAM','KPBN/Dumai') AND periode='spot' ORDER BY tanggal DESC LIMIT 30`, [p]);
    if (!series.length) continue;
    const cur = series[0];
    const d7 = series.find(s => (new Date(cur.tanggal) - new Date(s.tanggal)) / 86400000 >= 7);
    out.push({ produk: p, harga: cur.harga, mata_uang: cur.mata_uang, chg7_pct: d7 && d7.harga ? +((cur.harga - d7.harga) / d7.harga * 100).toFixed(2) : 0 });
  }
  return { kurs_usd: kurs ? Number(kurs.nilai_idr) : 16000, harga: out };
}
async function paymentSnap() {
  const rows = await db.all(`SELECT k.produk, k.nilai_kontrak, k.jatuh_tempo, COALESCE((SELECT SUM(jumlah) FROM pembayaran WHERE no_kontrak=k.no_kontrak),0) dibayar FROM kontrak k WHERE k.nilai_kontrak>0`);
  const today = new Date(); let piut = 0, hut = 0, piutOd = 0, hutOd = 0;
  rows.forEach(r => {
    const sisa = Number(r.nilai_kontrak) - Number(r.dibayar); if (sisa <= 0.01) return;
    const od = r.jatuh_tempo && new Date(r.jatuh_tempo) < today;
    if (BELI.has(String(r.produk || '').toUpperCase())) { hut += sisa; if (od) hutOd += sisa; }
    else { piut += sisa; if (od) piutOd += sisa; }
  });
  return { piutang: Math.round(piut), hutang: Math.round(hut), piutang_overdue: Math.round(piutOd), hutang_overdue: Math.round(hutOd), posisi_bersih: Math.round(piut - hut) };
}
function tankSummary(tanks) {
  const stok = tanks.reduce((s, t) => s + t.stok, 0), kap = tanks.reduce((s, t) => s + (Number(t.kapasitas_mt) || 0), 0);
  return { util_pct: kap ? +(stok / kap * 100).toFixed(1) : 0, total_stok: +stok.toFixed(1), penuh: tanks.filter(t => t.util >= 90).length, over: tanks.filter(t => t.util > 100).length };
}
const rupM = v => 'Rp ' + (v / 1e9).toFixed(2) + ' M';

/* ═══════════ AI: OWNER DECISION INSIGHT (Sonnet, lintas modul) ═══════════ */
router.get('/ai-owner', async (req, res) => {
  try {
    const tanks = await tankState();
    const ts = tankSummary(tanks);
    const py = await prodYield();
    const market = await marketSnap();
    const pay = await paymentSnap();
    const ctx = {
      tank: ts,
      retensi_tinggi: tanks.filter(t => t.stok > 0 && t.retensi > 45).map(t => ({ nama: t.nama, produk: t.produk, hari: t.retensi })),
      produksi: py ? { refining_yield_30h: py.last30.refining, refining_loss_30h: py.last30.refining_loss } : null,
      harga: market, keuangan: pay,
    };
    const rule = [
      { level: pay.posisi_bersih < 0 ? 'tinggi' : 'info', title: 'Posisi Kas', text: `Piutang ${rupM(pay.piutang)} vs hutang ${rupM(pay.hutang)} → bersih ${rupM(pay.posisi_bersih)}. ${pay.posisi_bersih < 0 ? 'Defisit — prioritaskan tagih piutang & atur tempo CPO.' : 'Surplus.'}` },
      { level: ts.over ? 'tinggi' : 'sedang', title: 'Kondisi Stok', text: `Utilisasi tank ${ts.util_pct}%, ${ts.penuh} tangki ≥90%${ts.over ? `, ${ts.over} over-capacity` : ''}. ${py ? 'Refining yield ' + py.last30.refining + '%.' : ''}` },
    ];
    const result = await ai.getInsight({
      kind: 'owner', model: ai.MODEL.SONNET, ruleItems: rule, force: req.query.force === '1', maxTokens: 1600,
      buildPrompt: () => `Anda penasihat strategis Owner refinery kelapa sawit. Data lintas-modul hari ini (JSON):
${JSON.stringify(ctx)}

Beri 4-5 insight KEPUTUSAN tingkat Owner yang MENGGABUNGKAN stok + harga pasar + produksi + keuangan (piutang/hutang). Fokus: peluang margin, risiko likuiditas, timing jual/tahan, prioritas tindakan. Bahasa Indonesia, ringkas, angka spesifik (pakai juta/M Rupiah).
Jawab HANYA JSON array: [{"level":"tinggi|sedang|info","title":"...","text":"..."}].`,
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ AI: MARKET INTELLIGENCE (Sonnet) ═══════════ */
router.get('/ai-market', async (req, res) => {
  try {
    const market = await marketSnap();
    const tanks = await tankState();
    const stokByProduk = {};
    tanks.forEach(t => { const k = PALIAS[t.produk] || t.produk; stokByProduk[k] = (stokByProduk[k] || 0) + t.stok; });
    const ctx = { ...market, stok_produk_mt: stokByProduk };
    const rule = market.harga.map(h => ({
      level: Math.abs(h.chg7_pct) > 2 ? 'sedang' : 'info',
      title: `${h.produk} ${h.chg7_pct >= 0 ? 'naik' : 'turun'} ${Math.abs(h.chg7_pct)}%`,
      text: `Harga ${h.produk} ${h.harga} ${h.mata_uang} (7 hari ${h.chg7_pct >= 0 ? '+' : ''}${h.chg7_pct}%). ${h.chg7_pct > 2 ? 'Momentum jual.' : h.chg7_pct < -2 ? 'Tahan/peluang beli.' : 'Stabil.'}`,
    }));
    const result = await ai.getInsight({
      kind: 'market', model: ai.MODEL.SONNET, ruleItems: rule, force: req.query.force === '1',
      buildPrompt: () => `Anda analis pasar minyak sawit. Data harga & stok hari ini (JSON):
${JSON.stringify(ctx)}

Beri 4-5 insight pasar untuk Owner: arah tren tiap produk, pengaruh kurs USD, timing jual/tahan dikaitkan dengan stok yang dimiliki, peluang margin. Bahasa Indonesia, ringkas, actionable.
Jawab HANYA JSON array: [{"level":"tinggi|sedang|info","title":"...","text":"..."}].`,
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ AI: PAYMENT & CASHFLOW RISK (Haiku) ═══════════ */
router.get('/ai-payment', async (req, res) => {
  try {
    const pay = await paymentSnap();
    const rule = [
      { level: pay.hutang_overdue > 0 ? 'tinggi' : 'info', title: 'Hutang Jatuh Tempo', text: `Hutang CPO overdue ${rupM(pay.hutang_overdue)} dari total ${rupM(pay.hutang)}. Prioritaskan bayar/negosiasi tempo.` },
      { level: pay.piutang_overdue > 0 ? 'sedang' : 'info', title: 'Piutang Menunggak', text: `Piutang overdue ${rupM(pay.piutang_overdue)} dari total ${rupM(pay.piutang)}. Percepat penagihan.` },
      { level: pay.posisi_bersih < 0 ? 'tinggi' : 'info', title: 'Posisi Kas Bersih', text: `${rupM(pay.posisi_bersih)} ${pay.posisi_bersih < 0 ? '(defisit — siapkan modal kerja)' : '(surplus)'}.` },
    ];
    const result = await ai.getInsight({
      kind: 'payment', model: ai.MODEL.HAIKU, ruleItems: rule, force: req.query.force === '1',
      buildPrompt: () => `Anda analis keuangan refinery. Data arus kas hari ini (JSON, Rupiah):
${JSON.stringify(pay)}

Beri 3-4 insight risiko likuiditas & prediksi keterlambatan untuk Owner. Bahasa Indonesia, ringkas, angka dalam juta/M Rupiah, actionable.
Jawab HANYA JSON array: [{"level":"tinggi|sedang|info","title":"...","text":"..."}].`,
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ AI: TANYA WINS (Q&A lintas modul, Sonnet, tanpa cache) ═══════════ */
router.post('/ai-ask', async (req, res) => {
  try {
    const question = (req.body?.q || '').toString().slice(0, 500);
    if (!question.trim()) return res.status(400).json({ error: 'Pertanyaan kosong' });
    const tanks = await tankState();
    const refinery_balance = await db.all(`SELECT periode_label, tgl_start, tgl_end, cpo_received, cpo_processed, cpo_stock, rbdpo, olein_gross, stearin_gross, pfad FROM refinery_balance ORDER BY tgl_start`).catch(() => []);
    const produksi_bulanan = await db.all(`SELECT to_char(tanggal,'YYYY-MM') ym, ROUND(SUM(cpo_feed)::numeric,1) cpo_feed, ROUND(SUM(rbdpo)::numeric,1) rbdpo, ROUND(SUM(olein)::numeric,1) olein, ROUND(SUM(stearin)::numeric,1) stearin, ROUND(SUM(pfad)::numeric,1) pfad FROM production_log GROUP BY 1 ORDER BY 1`).catch(() => []);
    const context = {
      tank: tankSummary(tanks),
      tangki: tanks.map(t => ({ nama: t.nama, produk: t.produk, util: t.util, stok_mt: +t.stok.toFixed(1), retensi_hari: t.retensi })),
      produksi_yield: await prodYield(),
      produksi_bulanan,
      refinery_balance,
      harga: await marketSnap(),
      keuangan: await paymentSnap(),
    };
    res.json(await ai.ask({ question, context, model: ai.MODEL.SONNET }));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ AI: AUDIT FORENSIK NARASI (Haiku) ═══════════ */
async function auditSnap() {
  const tot = await db.get(`SELECT COUNT(*)::int c FROM timbangan`).catch(() => ({ c: 0 }));
  const seris = await db.all(`SELECT no_seri::bigint s FROM timbangan WHERE no_seri ~ '^[0-9]+$' ORDER BY 1`).catch(() => []);
  let missing = 0, gaps = 0;
  if (seris.length) {
    const min = Number(seris[0].s), max = Number(seris[seris.length - 1].s), set = new Set(seris.map(r => Number(r.s)));
    let inGap = false;
    for (let i = min; i <= max; i++) { if (!set.has(i)) { missing++; if (!inGap) { gaps++; inGap = true; } } else inGap = false; }
  }
  const selisih = await db.get(`SELECT COUNT(*)::int c FROM timbangan WHERE berat_netto_wins>0 AND berat_netto_relasi>0 AND ABS(berat_netto_wins-berat_netto_relasi)/berat_netto_wins > 0.005`).catch(() => ({ c: 0 }));
  const dup = await db.get(`SELECT COUNT(*)::int c FROM (SELECT no_seri_relasi FROM timbangan WHERE no_seri_relasi IS NOT NULL AND no_seri_relasi<>'' GROUP BY no_seri_relasi HAVING COUNT(*)>1) x`).catch(() => ({ c: 0 }));
  return { total_trip: tot.c, seri_hilang: missing, jumlah_gap: gaps, selisih_diluar_toleransi: selisih.c, duplikat_seri_relasi: dup.c };
}
router.get('/ai-audit', async (req, res) => {
  try {
    const a = await auditSnap();
    const rule = [
      { level: a.seri_hilang > 0 ? 'sedang' : 'info', title: 'Sequence Gap', text: `${a.seri_hilang} no. seri hilang dalam ${a.jumlah_gap} gap (dari ${a.total_trip} trip). Telusuri arsip nota fisik.` },
      { level: a.selisih_diluar_toleransi > 0 ? 'sedang' : 'info', title: 'Selisih Timbangan', text: `${a.selisih_diluar_toleransi} trip selisih netto WINS vs relasi >0,5%. Verifikasi penimbangan.` },
      { level: a.duplikat_seri_relasi > 0 ? 'tinggi' : 'info', title: 'Duplikat Seri Relasi', text: `${a.duplikat_seri_relasi} no_seri_relasi muncul lebih dari sekali — potensi entri ganda.` },
    ];
    const result = await ai.getInsight({
      kind: 'audit', model: ai.MODEL.HAIKU, ruleItems: rule, force: req.query.force === '1',
      buildPrompt: () => `Anda auditor forensik data timbangan refinery. Ringkasan temuan (JSON):
${JSON.stringify(a)}

Beri 3-4 narasi forensik untuk Owner: prioritas penyelidikan, kemungkinan penyebab (belum diinput / manipulasi / error), langkah verifikasi. CATATAN: ini indikator statistik, bukan tuduhan. Bahasa Indonesia, ringkas.
Jawab HANYA JSON array: [{"level":"tinggi|sedang|info","title":"...","text":"..."}].`,
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* ═══════════ AI: REVIEW STRATEGIS BULANAN (Opus, cache bulanan) ═══════════ */
router.get('/ai-strategic', async (req, res) => {
  try {
    const tanks = await tankState();
    const ctx = { tank: tankSummary(tanks), produksi: await prodYield(), harga: await marketSnap(), keuangan: await paymentSnap(), audit: await auditSnap() };
    const pay = ctx.keuangan;
    const rule = [
      { level: 'info', title: 'Ringkasan Strategis', text: `Posisi kas bersih ${rupM(pay.posisi_bersih)}, utilisasi tank ${ctx.tank.util_pct}%. Aktifkan AI untuk analisa skenario mendalam.` },
    ];
    const firstOfMonth = new Date(); firstOfMonth.setDate(1);
    const result = await ai.getInsight({
      kind: 'strategic', model: ai.MODEL.OPUS, ruleItems: rule, force: req.query.force === '1',
      cacheDate: firstOfMonth.toISOString().slice(0, 10), maxTokens: 2000,
      buildPrompt: () => `Anda Chief Strategy Advisor untuk Owner refinery kelapa sawit. Data komprehensif bulan ini (JSON):
${JSON.stringify(ctx)}

Buat REVIEW STRATEGIS BULANAN tingkat direksi: 5-6 poin yang menggabungkan operasi, pasar, keuangan, & integritas data. Fokus: arah strategis, alokasi modal kerja, manajemen risiko, peluang pertumbuhan margin, prioritas 30 hari ke depan. Analitis & berwawasan jauh. Bahasa Indonesia, angka spesifik (juta/M Rupiah).
Jawab HANYA JSON array: [{"level":"tinggi|sedang|info","title":"...","text":"..."}].`,
    });
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

/* GET /ai-usage — transparansi pemakaian & budget AI bulan ini */
router.get('/ai-usage', async (req, res) => {
  try { res.json(await ai.usageSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
