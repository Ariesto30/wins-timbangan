const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/pg');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });

    const user = await db.get('SELECT * FROM users WHERE username = $1 AND aktif = 1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap } });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/me', authenticate, (req, res) => res.json(req.user));

router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, nama_lengkap, role, aktif, created_at FROM users ORDER BY id');
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', authenticate, async (req, res) => {
  try {
    const { username, password, nama_lengkap, role } = req.body;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa tambah user' });
    const hash = bcrypt.hashSync(password, 10);
    const r = await db.run('INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES ($1,$2,$3,$4) RETURNING id', [username, hash, nama_lengkap, role || 'operator']);
    res.json({ id: r.lastInsertRowid, message: 'User berhasil dibuat' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username sudah dipakai' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id/password', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    const targetId = parseInt(req.params.id);
    if (req.user.role !== 'admin' && req.user.id !== targetId) return res.status(403).json({ error: 'Akses ditolak' });
    const hash = bcrypt.hashSync(password, 10);
    await db.run('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, targetId]);
    res.json({ message: 'Password berhasil diubah' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
