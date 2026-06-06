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

/* GET /ai-usage — transparansi pemakaian & budget AI bulan ini */
router.get('/ai-usage', async (req, res) => {
  try { res.json(await ai.usageSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
