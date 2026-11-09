// ============================================================
// routes/payments.js - Payment Gateway (Midtrans Snap Sandbox + Mode Simulasi)
//   POST /api/payments/:id/pay         mulai pembayaran (dapat token Snap / mode simulasi)
//   POST /api/payments/:id/simulate    (hanya mode simulasi) set hasil pembayaran
//   GET  /api/payments/:id/status      cek / sinkron status pembayaran
//   POST /api/payments/notification    webhook dari Midtrans
//
// MODE: jika MIDTRANS_SERVER_KEY kosong di .env -> MODE SIMULASI (tanpa akun Midtrans).
// ============================================================
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

const SERVER_KEY = () => process.env.MIDTRANS_SERVER_KEY || '';
const IS_PROD = () => process.env.MIDTRANS_IS_PRODUCTION === 'true';
const SNAP_URL = () => (IS_PROD() ? 'https://app.midtrans.com/snap/v1/transactions' : 'https://app.sandbox.midtrans.com/snap/v1/transactions');
const API_URL = () => (IS_PROD() ? 'https://api.midtrans.com/v2' : 'https://api.sandbox.midtrans.com/v2');
const basicAuth = () => 'Basic ' + Buffer.from(SERVER_KEY() + ':').toString('base64');

// Terapkan hasil pembayaran ke pesanan
function applyPayment(booking, paymentStatus, method) {
  if (booking.payment_status === 'lunas') return; // sudah lunas, abaikan
  if (paymentStatus === 'lunas') {
    db.prepare(`UPDATE bookings SET payment_status='lunas', status='dibayar', paid_at=?, payment_method=COALESCE(?, payment_method) WHERE id=?`)
      .run(new Date().toISOString(), method || null, booking.id);
  } else {
    db.prepare(`UPDATE bookings SET payment_status=?, payment_method=COALESCE(?, payment_method) WHERE id=?`)
      .run(paymentStatus, method || null, booking.id);
  }
}

function mapMidtrans(trx) {
  const s = trx.transaction_status;
  if (s === 'settlement') return 'lunas';
  if (s === 'capture') return trx.fraud_status === 'challenge' ? 'pending' : 'lunas';
  if (s === 'pending') return 'pending';
  return 'gagal'; // deny, cancel, expire, failure
}

function methodName(trx) {
  const t = trx.payment_type || '';
  if (t === 'bank_transfer') return 'Virtual Account ' + ((trx.va_numbers && trx.va_numbers[0] && trx.va_numbers[0].bank) || '').toUpperCase();
  if (t === 'qris') return 'QRIS';
  return t || null;
}

function myBooking(req) {
  return db.prepare(`SELECT b.*, v.name AS vehicle_name FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.id=? AND b.customer_id=?`)
    .get(req.params.id, req.user.id);
}

// ---------- Mulai pembayaran ----------
router.post('/:id/pay', auth('pelanggan'), async (req, res) => {
  const b = myBooking(req);
  if (!b) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (b.status !== 'menunggu_bayar' || b.payment_status === 'lunas') {
    return res.status(409).json({ error: 'Pesanan ini tidak sedang menunggu pembayaran' });
  }
  if (!SERVER_KEY()) return res.json({ mode: 'simulasi' });

  try {
    const orderId = `${b.code}-${Date.now()}`; // order_id Midtrans harus unik tiap percobaan
    const body = {
      transaction_details: { order_id: orderId, gross_amount: b.total_price },
      customer_details: { first_name: req.user.name, email: req.user.email, phone: req.user.phone || undefined },
      item_details: [{ id: 'V' + b.vehicle_id, price: b.total_price, quantity: 1, name: `${b.vehicle_name} (${b.days} hari)`.slice(0, 50) }],
      expiry: { unit: 'minutes', duration: 60 },
    };
    const r = await fetch(SNAP_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: basicAuth() },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok || !data.token) {
      console.error('Midtrans error:', data);
      return res.status(502).json({ error: 'Gagal membuat transaksi di Midtrans: ' + ((data.error_messages && data.error_messages.join(', ')) || r.status) });
    }
    db.prepare(`UPDATE bookings SET gateway_order_id=?, midtrans_token=? WHERE id=?`).run(orderId, data.token, b.id);
    res.json({ mode: 'midtrans', token: data.token, redirect_url: data.redirect_url });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Tidak bisa menghubungi Midtrans. Periksa koneksi dan server key.' });
  }
});

// ---------- Simulasi (hanya jika tanpa server key) ----------
router.post('/:id/simulate', auth('pelanggan'), (req, res) => {
  if (SERVER_KEY()) return res.status(400).json({ error: 'Mode simulasi tidak aktif' });
  const b = myBooking(req);
  if (!b) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (b.status !== 'menunggu_bayar') return res.status(409).json({ error: 'Pesanan ini tidak sedang menunggu pembayaran' });
  const result = (req.body || {}).result;
  const map = { lunas: 'lunas', pending: 'pending', gagal: 'gagal' };
  if (!map[result]) return res.status(400).json({ error: 'Hasil tidak valid' });
  applyPayment(b, map[result], (req.body.method || 'Simulasi') );
  res.json({ ok: true });
});

// ---------- Cek / sinkron status ----------
router.get('/:id/status', auth('pelanggan'), async (req, res) => {
  let b = myBooking(req);
  if (!b) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  // Di localhost webhook tidak bisa masuk, jadi status ditanyakan langsung ke Midtrans
  if (SERVER_KEY() && b.gateway_order_id && b.payment_status !== 'lunas') {
    try {
      const r = await fetch(`${API_URL()}/${encodeURIComponent(b.gateway_order_id)}/status`, {
        headers: { Accept: 'application/json', Authorization: basicAuth() },
      });
      const trx = await r.json();
      if (trx.transaction_status) {
        applyPayment(b, mapMidtrans(trx), methodName(trx));
        b = myBooking(req);
      }
    } catch (e) { /* abaikan, pakai status terakhir di database */ }
  }
  res.json({ status: b.status, payment_status: b.payment_status });
});

// ---------- Webhook Midtrans ----------
router.post('/notification', (req, res) => {
  const n = req.body || {};
  if (!SERVER_KEY()) return res.status(400).json({ error: 'Mode simulasi' });
  const expected = crypto.createHash('sha512').update(`${n.order_id}${n.status_code}${n.gross_amount}${SERVER_KEY()}`).digest('hex');
  if (expected !== n.signature_key) return res.status(403).json({ error: 'Signature tidak valid' });
  const b = db.prepare('SELECT * FROM bookings WHERE gateway_order_id = ?').get(n.order_id);
  if (!b) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  applyPayment(b, mapMidtrans(n), methodName(n));
  res.json({ ok: true });
});

module.exports = router;
