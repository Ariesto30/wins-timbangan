const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND aktif = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, nama: user.nama_lengkap } });
});

router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

router.get('/users', authenticate, (req, res) => {
  const users = db.prepare('SELECT id, username, nama_lengkap, role, aktif, created_at FROM users ORDER BY id').all();
  res.json(users);
});

router.post('/users', authenticate, (req, res) => {
  const { username, password, nama_lengkap, role } = req.body;
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa tambah user' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES (?, ?, ?, ?)').run(username, hash, nama_lengkap, role || 'operator');
    res.json({ id: result.lastInsertRowid, message: 'User berhasil dibuat' });
  } catch (e) {
    res.status(400).json({ error: 'Username sudah dipakai' });
  }
});

router.put('/users/:id/password', authenticate, (req, res) => {
  const { password } = req.body;
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== targetId) return res.status(403).json({ error: 'Akses ditolak' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, targetId);
  res.json({ message: 'Password berhasil diubah' });
});

module.exports = router;
