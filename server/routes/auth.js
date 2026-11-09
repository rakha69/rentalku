// ============================================================
// routes/auth.js - Registrasi & Login
//   POST /api/auth/register   POST /api/auth/login   GET /api/auth/me
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, sign } = require('../middleware/auth');

const router = express.Router();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: u.status, bank_name: u.bank_name, bank_account: u.bank_account };
}

router.post('/register', (req, res) => {
  const { name, email, password, phone, role, bank_name, bank_account } = req.body || {};
  if (!name || name.trim().length < 3) return res.status(400).json({ error: 'Nama minimal 3 karakter' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Format email tidak valid' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  const r = role === 'mitra' ? 'mitra' : 'pelanggan';
  if (r === 'mitra' && (!bank_name || !bank_account)) {
    return res.status(400).json({ error: 'Mitra wajib mengisi nama bank dan nomor rekening' });
  }
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email sudah terdaftar' });

  const status = r === 'mitra' ? 'menunggu' : 'aktif'; // mitra harus diverifikasi admin
  const info = db
    .prepare(`INSERT INTO users (name,email,password_hash,phone,role,status,bank_name,bank_account) VALUES (?,?,?,?,?,?,?,?)`)
    .run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), phone || null, r, status, bank_name || null, bank_account || null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }
  if (['nonaktif', 'ditolak'].includes(user.status)) {
    return res.status(403).json({ error: 'Akun tidak aktif. Hubungi admin.' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/me', auth(), (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
