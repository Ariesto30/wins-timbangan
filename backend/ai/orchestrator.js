/* AI Orchestrator — fondasi hemat biaya untuk WINS.
   Tiga lapis: (1) cache harian, (2) model router, (3) budget guard.
   Semua pemanggilan LLM Anthropic lewat sini supaya:
   - 1 hit LLM/hari/jenis (sisanya dari cache)
   - otomatis fallback ke rule-based bila tak ada API key / budget habis / error
   - tercatat token & biaya per bulan. */
const db = require('../db/pg');
const axios = require('axios');

// Tarif per 1 juta token (USD) — sesuaikan bila harga Anthropic berubah
const PRICING = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 15, out: 75 },
};
const MODEL = {
  HAIKU: 'claude-haiku-4-5',
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-8',
};
const budgetUsd = () => parseFloat(process.env.AI_BUDGET_USD || '5');
const costOf = (model, inTok, outTok) => {
  const p = PRICING[model] || PRICING[MODEL.HAIKU];
  return +((inTok / 1e6 * p.in) + (outTok / 1e6 * p.out)).toFixed(6);
};

async function monthCost() {
  const r = await db.get(`SELECT COALESCE(SUM(cost_usd),0) c FROM ai_usage WHERE tanggal >= date_trunc('month', CURRENT_DATE)`).catch(() => ({ c: 0 }));
  return Number(r.c);
}

async function callClaude(model, prompt, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('NO_KEY');
  const r = await axios.post('https://api.anthropic.com/v1/messages', {
    model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }],
  }, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 25000 });
  const u = r.data?.usage || {};
  return { text: r.data?.content?.[0]?.text || '', inTok: u.input_tokens || 0, outTok: u.output_tokens || 0 };
}

/* getInsight: ambil insight (array {level,title,text}) dgn cache+router+budget.
   opts: { kind, model, buildPrompt(), ruleItems[], maxTokens?, force? } */
async function getInsight({ kind, model, buildPrompt, ruleItems, maxTokens = 900, force = false }) {
  const today = new Date().toISOString().slice(0, 10);
  const fallback = note => ({ source: 'rule', items: ruleItems, note, generated_at: new Date().toISOString() });

  // 1) Cache harian
  if (!force) {
    const c = await db.get(`SELECT payload FROM ai_cache WHERE kind=$1 AND tanggal=$2`, [kind, today]).catch(() => null);
    if (c?.payload) return { ...c.payload, cached: true };
  }
  // 2) Tanpa key → rule
  if (!process.env.ANTHROPIC_API_KEY) return fallback('Set ANTHROPIC_API_KEY untuk AI naratif.');
  // 3) Budget guard
  const budget = budgetUsd();
  const used = await monthCost();
  if (used >= budget) return fallback(`Budget AI bulan ini ($${budget}) tercapai — sementara pakai rule-based.`);
  // 4) Panggil LLM
  try {
    const { text, inTok, outTok } = await callClaude(model, buildPrompt(), maxTokens);
    const c = costOf(model, inTok, outTok);
    await db.run(`INSERT INTO ai_usage (tanggal, kind, model, in_tok, out_tok, cost_usd) VALUES ($1,$2,$3,$4,$5,$6)`, [today, kind, model, inTok, outTok, c]);
    // Ekstrak array JSON walau ada prosa di sekitarnya
    let clean = text.replace(/```json|```/g, '').trim();
    const a = clean.indexOf('['), b = clean.lastIndexOf(']');
    if (a >= 0 && b > a) clean = clean.slice(a, b + 1);
    const items = JSON.parse(clean);
    if (!Array.isArray(items) || !items.length) return fallback('Respons AI kosong — pakai rule-based.');
    const payload = { source: 'llm', model, items, cost_usd: c, generated_at: new Date().toISOString() };
    await db.run(`INSERT INTO ai_cache (kind, tanggal, payload, source) VALUES ($1,$2,$3,'llm')
      ON CONFLICT (kind, tanggal) DO UPDATE SET payload=EXCLUDED.payload, created_at=NOW()`, [kind, today, JSON.stringify(payload)]);
    return payload;
  } catch (e) {
    return fallback('LLM gagal (' + (e.response?.status || e.message) + ') — pakai rule-based.');
  }
}

async function usageSummary() {
  const m = await db.get(`SELECT COALESCE(SUM(cost_usd),0) cost, COALESCE(SUM(in_tok),0) intok, COALESCE(SUM(out_tok),0) outtok, COUNT(*)::int calls FROM ai_usage WHERE tanggal >= date_trunc('month', CURRENT_DATE)`).catch(() => ({ cost: 0, intok: 0, outtok: 0, calls: 0 }));
  const budget = budgetUsd();
  const cost = +(+m.cost).toFixed(4);
  return {
    budget_usd: budget, terpakai_usd: cost, sisa_usd: +(budget - cost).toFixed(4),
    persen: budget ? +(cost / budget * 100).toFixed(1) : 0,
    panggilan: m.calls, in_tok: Number(m.intok), out_tok: Number(m.outtok),
    aktif: !!process.env.ANTHROPIC_API_KEY,
  };
}

/* ask: tanya-jawab bebas (tanpa cache, tetap budget-guarded). */
async function ask({ question, context, model = MODEL.SONNET, maxTokens = 700 }) {
  if (!process.env.ANTHROPIC_API_KEY) return { answer: null, source: 'none', note: 'AI belum aktif — set ANTHROPIC_API_KEY.' };
  const budget = budgetUsd();
  if ((await monthCost()) >= budget) return { answer: null, source: 'none', note: `Budget AI bulan ini ($${budget}) tercapai.` };
  try {
    const prompt = `Anda asisten data untuk Owner refinery sawit "WINS". Jawab pertanyaan HANYA berdasar data berikut (JSON), Bahasa Indonesia, ringkas & angka spesifik. Bila data tak cukup, katakan jujur.

DATA:
${JSON.stringify(context)}

PERTANYAAN: ${question}`;
    const { text, inTok, outTok } = await callClaude(model, prompt, maxTokens);
    const c = costOf(model, inTok, outTok);
    const today = new Date().toISOString().slice(0, 10);
    await db.run(`INSERT INTO ai_usage (tanggal, kind, model, in_tok, out_tok, cost_usd) VALUES ($1,'ask',$2,$3,$4,$5)`, [today, model, inTok, outTok, c]);
    return { answer: text.trim(), source: 'llm', model, cost_usd: c };
  } catch (e) {
    return { answer: null, source: 'error', note: 'AI gagal: ' + (e.response?.status || e.message) };
  }
}

module.exports = { getInsight, ask, usageSummary, MODEL, costOf };
