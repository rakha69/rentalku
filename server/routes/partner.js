// ============================================================
// routes/partner.js - Saldo & penarikan dana (payout) untuk Mitra
//   GET  /api/partner/summary
//   GET  /api/partner/payouts
//   POST /api/partner/payouts   { amount }
// ============================================================
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.use(auth('mitra'));

const MIN_PAYOUT = 10000;

function summary(partnerId) {
  const sumBookings = (status) =>
    db.prepare(`SELECT COALESCE(SUM(b.partner_amount),0) AS s FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id
                WHERE v.owner_id = ? AND b.status = ?`).get(partnerId, status).s;
  const earned = sumBookings('selesai');          // sudah selesai -> bisa ditarik
  const pending = sumBookings('dibayar');         // sudah dibayar tapi sewa belum selesai
  const withdrawn = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM payouts WHERE partner_id=? AND status IN ('diajukan','dibayar')`).get(partnerId).s;
  const paidOut = db.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM payouts WHERE partner_id=? AND status='dibayar'`).get(partnerId).s;
  return { available: earned - withdrawn, pending, total_earned: earned + pending, paid_out: paidOut };
}

router.get('/summary', (req, res) => res.json(summary(req.user.id)));

router.get('/payouts', (req, res) => {
  res.json(db.prepare('SELECT * FROM payouts WHERE partner_id = ? ORDER BY id DESC').all(req.user.id));
});

router.post('/payouts', (req, res) => {
  if (req.user.status !== 'aktif') return res.status(403).json({ error: 'Akun mitra belum diverifikasi' });
  if (!req.user.bank_name || !req.user.bank_account) return res.status(400).json({ error: 'Data rekening bank belum lengkap' });
  const amount = Number((req.body || {}).amount);
  if (!Number.isInteger(amount) || amount < MIN_PAYOUT) return res.status(400).json({ error: `Minimal penarikan Rp ${MIN_PAYOUT.toLocaleString('id-ID')}` });
  const { available } = summary(req.user.id);
  if (amount > available) return res.status(400).json({ error: 'Saldo yang bisa ditarik tidak mencukupi' });
  const info = db.prepare('INSERT INTO payouts (partner_id, amount) VALUES (?, ?)').run(req.user.id, amount);
  res.status(201).json(db.prepare('SELECT * FROM payouts WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
