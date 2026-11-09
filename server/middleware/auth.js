// ============================================================
// auth.js - Middleware login (JWT) dan pembatasan hak akses (role)
// Pemakaian: router.get('/x', auth('admin'), handler)
//            auth()  -> semua user yang sudah login
// ============================================================
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-ubah-di-env';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
}

function auth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
    try {
      const payload = jwt.verify(token, SECRET);
      const user = db
        .prepare('SELECT id,name,email,phone,role,status,bank_name,bank_account FROM users WHERE id = ?')
        .get(payload.id);
      if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan' });
      if (['nonaktif', 'ditolak'].includes(user.status)) {
        return res.status(403).json({ error: 'Akun tidak aktif. Hubungi admin.' });
      }
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'Anda tidak punya akses ke fitur ini' });
      }
      req.user = user;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Sesi habis, silakan login ulang' });
    }
  };
}

module.exports = { auth, sign };
