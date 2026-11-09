// ============================================================
// routes/admin.js - Fitur khusus Admin (Kelompok 3 / platform)
//   GET   /api/admin/users?role=            daftar pengguna
//   PATCH /api/admin/users/:id/status       verifikasi mitra / aktif / nonaktif
//   GET   /api/admin/vehicles               semua kendaraan
//   PATCH /api/admin/vehicles/:id/verify    setujui / tolak kendaraan mitra
//   GET   /api/admin/bookings               semua pesanan + status pembayaran
//   GET   /api/admin/settings               PUT /api/admin/settings   (persentase komisi)
//   GET   /api/admin/payouts                PATCH /api/admin/payouts/:id   (proses payout)
// ============================================================
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { BASE } = require('./bookings');
const { expireBookings, getCommissionPercent } = require('../utils/helpers');

const router = express.Router();
router.use(auth('admin'));

router.get('/users', (req, res) => {
  const { role } = req.query;
  let sql = `SELECT id,name,email,phone,role,status,bank_name,bank_account,created_at FROM users`;
  const params = [];
  if (['pelanggan', 'mitra', 'admin'].includes(role)) { sql += ' WHERE role = ?'; params.push(role); }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.patch('/users/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['aktif', 'ditolak', 'nonaktif'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  if (u.role === 'admin') return res.status(400).json({ error: 'Akun admin tidak bisa diubah' });
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, u.id);
  res.json({ ok: true });
});

router.get('/vehicles', (req, res) => {
  const rows = db
    .prepare(`SELECT v.*, u.name AS owner_name, u.role AS owner_role FROM vehicles v JOIN users u ON u.id=v.owner_id
              WHERE v.status != 'dihapus' ORDER BY (v.status='menunggu') DESC, v.id DESC`)
    .all();
  res.json(rows);
});

router.patch('/vehicles/:id/verify', (req, res) => {
  const { status } = req.body || {};
  if (!['tayang', 'ditolak'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  const v = db.prepare(`SELECT * FROM vehicles WHERE id = ? AND status != 'dihapus'`).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });
  db.prepare('UPDATE vehicles SET status = ? WHERE id = ?').run(status, v.id);
  res.json({ ok: true });
});

router.get('/bookings', (req, res) => {
  expireBookings();
  res.json(db.prepare(`${BASE} ORDER BY b.id DESC`).all());
});

router.get('/settings', (req, res) => res.json({ commission_percent: getCommissionPercent() }));

router.put('/settings', (req, res) => {
  const p = Number((req.body || {}).commission_percent);
  if (isNaN(p) || p < 0 || p > 50) return res.status(400).json({ error: 'Komisi harus antara 0 sampai 50 persen' });
  db.prepare(`INSERT INTO settings (key,value) VALUES ('commission_percent', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(p));
  res.json({ commission_percent: p });
});

router.get('/payouts', (req, res) => {
  const rows = db
    .prepare(`SELECT p.*, u.name AS partner_name, u.bank_name, u.bank_account FROM payouts p JOIN users u ON u.id=p.partner_id
              ORDER BY (p.status='diajukan') DESC, p.id DESC`)
    .all();
  res.json(rows);
});

router.patch('/payouts/:id', (req, res) => {
  const { status, note } = req.body || {};
  if (!['dibayar', 'ditolak'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  const p = db.prepare('SELECT * FROM payouts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Payout tidak ditemukan' });
  if (p.status !== 'diajukan') return res.status(409).json({ error: 'Payout ini sudah diproses' });
  db.prepare('UPDATE payouts SET status=?, note=?, processed_at=? WHERE id=?').run(status, note || null, new Date().toISOString(), p.id);
  res.json({ ok: true });
});

module.exports = router;
