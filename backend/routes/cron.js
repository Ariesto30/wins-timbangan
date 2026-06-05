/* Cron endpoint — dipanggil scheduler eksternal (GitHub Actions / cron-job.org)
   Tanpa JWT, dilindungi secret key (?key=...). Jalankan: fetch harga + snapshot tangki. */
const router = require('express').Router();
const hargaRoute = require('./harga');
const tankRoute = require('./tank');

const CRON_KEY = process.env.CRON_KEY || 'wins-cron-2026';

async function runDaily() {
  const result = { tanggal: new Date().toISOString().slice(0, 10), harga: null, snapshot: null };
  try { result.harga = await hargaRoute.runFetchAndStore(); } catch (e) { result.harga = { ok: false, error: e.message }; }
  try { result.snapshot = await tankRoute.captureSnapshot(); } catch (e) { result.snapshot = { error: e.message }; }
  return result;
}

router.all('/daily', async (req, res) => {
  if ((req.query.key || req.headers['x-cron-key']) !== CRON_KEY) return res.status(403).json({ error: 'Forbidden' });
  try { res.json(await runDaily()); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.runDaily = runDaily;
