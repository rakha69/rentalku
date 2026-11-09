// ============================================================
// routes/bookings.js - Booking kendaraan
//   GET   /api/bookings/quote            hitung harga (publik)
//   POST  /api/bookings                  buat pesanan (pelanggan)
//   GET   /api/bookings/mine             pesanan saya (pelanggan)
//   GET   /api/bookings/partner          pesanan masuk (mitra)
//   PATCH /api/bookings/:id/respond      mitra terima / tolak
//   PATCH /api/bookings/:id/cancel       pelanggan batalkan
//   PATCH /api/bookings/:id/complete     mitra tandai selesai
//   POST  /api/bookings/:id/review       pelanggan beri ulasan
//
// Alur status:
//   menunggu_mitra -> (mitra terima) -> menunggu_bayar -> (lunas) -> dibayar -> (mitra konfirmasi) -> selesai
//   cabang: ditolak (mitra menolak) / dibatalkan (pelanggan batal / waktu habis)
// ============================================================
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validateDates, isAvailable, calcQuote, makeCode, expireBookings } = require('../utils/helpers');

const router = express.Router();

const BASE = `
  SELECT b.*, v.name AS vehicle_name, v.brand AS vehicle_brand, v.plate AS vehicle_plate, v.type AS vehicle_type,
         v.owner_id, c.name AS customer_name, c.phone AS customer_phone, o.name AS partner_name
  FROM bookings b
  JOIN vehicles v ON v.id = b.vehicle_id
  JOIN users c ON c.id = b.customer_id
  JOIN users o ON o.id = v.owner_id`;

function forCustomer(row) {
  const { commission_amount, commission_percent, partner_amount, midtrans_token, gateway_order_id, ...rest } = row;
  return rest;
}

const plusMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

// ---------- Hitung harga (tanpa login) ----------
router.get('/quote', (req, res) => {
  const { vehicle_id, start, end, driver_option } = req.query;
  const v = db.prepare(`SELECT v.*, u.role AS owner_role FROM vehicles v JOIN users u ON u.id=v.owner_id WHERE v.id = ? AND v.status='tayang'`).get(vehicle_id);
  if (!v) return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });
  const err = validateDates(start, end);
  if (err) return res.status(400).json({ error: err });
  const q = calcQuote(v, start, end, v.owner_role, driver_option);
  res.json({
    days: q.days, price_per_day: q.price_per_day, base_price: q.base_price,
    driver_daily_fee: q.driver_daily_fee, total_driver_fee: q.total_driver_fee,
    driver_option: q.driver_option, total_price: q.total_price,
    available: isAvailable(v.id, start, end),
  });
});

// ---------- Buat pesanan ----------
router.post('/', auth('pelanggan'), (req, res) => {
  expireBookings();
  const { vehicle_id, start_date, end_date, driver_option, pickup_location, id_card_number, driver_license_number, notes } = req.body || {};
  const v = db
    .prepare(`SELECT v.*, u.role AS owner_role FROM vehicles v JOIN users u ON u.id=v.owner_id
              WHERE v.id = ? AND v.status='tayang' AND v.is_available = 1`)
    .get(vehicle_id);
  if (!v) return res.status(404).json({ error: 'Kendaraan tidak tersedia' });
  const err = validateDates(start_date, end_date);
  if (err) return res.status(400).json({ error: err });
  if (!isAvailable(v.id, start_date, end_date)) {
    return res.status(409).json({ error: 'Kendaraan sudah dipesan pada tanggal tersebut. Pilih tanggal atau kendaraan lain.' });
  }
  const q = calcQuote(v, start_date, end_date, v.owner_role, driver_option);
  // Armada milik admin tidak perlu konfirmasi mitra -> langsung menunggu pembayaran
  const autoAccept = v.owner_role === 'admin';
  const status = autoAccept ? 'menunggu_bayar' : 'menunggu_mitra';
  const expires = autoAccept ? plusMinutes(60) : plusMinutes(24 * 60);
  const info = db
    .prepare(`INSERT INTO bookings (code,customer_id,vehicle_id,start_date,end_date,days,price_per_day,total_price,
                commission_percent,commission_amount,partner_amount,status,expires_at,driver_option,driver_fee,pickup_location,id_card_number,driver_license_number,notes)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(makeCode(), req.user.id, v.id, start_date, end_date, q.days, q.price_per_day, q.total_price,
      q.commission_percent, q.commission_amount, q.partner_amount, status, expires,
      q.driver_option, q.total_driver_fee, pickup_location || null, id_card_number || null, driver_license_number || null, notes || null);
  const row = db.prepare(`${BASE} WHERE b.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(forCustomer(row));
});

// ---------- Pesanan pelanggan ----------
router.get('/mine', auth('pelanggan'), (req, res) => {
  expireBookings();
  const rows = db.prepare(`${BASE} WHERE b.customer_id = ? ORDER BY b.id DESC`).all(req.user.id);
  const reviewed = new Set(db.prepare('SELECT booking_id FROM reviews WHERE customer_id = ?').all(req.user.id).map((r) => r.booking_id));
  res.json(rows.map((r) => ({ ...forCustomer(r), reviewed: reviewed.has(r.id) })));
});

// ---------- Pesanan masuk mitra ----------
router.get('/partner', auth('mitra', 'admin'), (req, res) => {
  expireBookings();
  const rows = db.prepare(`${BASE} WHERE v.owner_id = ? ORDER BY b.id DESC`).all(req.user.id);
  res.json(rows);
});

function loadBooking(id) {
  return db.prepare(`${BASE} WHERE b.id = ?`).get(id);
}

// ---------- Mitra terima / tolak ----------
router.patch('/:id/respond', auth('mitra'), (req, res) => {
  expireBookings();
  const b = loadBooking(req.params.id);
  if (!b || b.owner_id !== req.user.id) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (b.status !== 'menunggu_mitra') return res.status(409).json({ error: 'Pesanan ini sudah diproses atau kedaluwarsa' });
  if (req.body && req.body.accept) {
    db.prepare(`UPDATE bookings SET status='menunggu_bayar', expires_at=? WHERE id=?`).run(plusMinutes(60), b.id);
  } else {
    db.prepare(`UPDATE bookings SET status='ditolak', cancel_reason='Ditolak oleh mitra' WHERE id=?`).run(b.id);
  }
  res.json({ ok: true });
});

// ---------- Pelanggan batalkan ----------
router.patch('/:id/cancel', auth('pelanggan'), (req, res) => {
  const b = loadBooking(req.params.id);
  if (!b || b.customer_id !== req.user.id) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (!['menunggu_mitra', 'menunggu_bayar'].includes(b.status) || b.payment_status === 'lunas') {
    return res.status(409).json({ error: 'Pesanan ini tidak bisa dibatalkan' });
  }
  db.prepare(`UPDATE bookings SET status='dibatalkan', cancel_reason='Dibatalkan pelanggan' WHERE id=?`).run(b.id);
  res.json({ ok: true });
});

// ---------- Mitra konfirmasi selesai ----------
router.patch('/:id/complete', auth('mitra', 'admin'), (req, res) => {
  const b = loadBooking(req.params.id);
  if (!b || b.owner_id !== req.user.id) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (b.status !== 'dibayar') return res.status(409).json({ error: 'Hanya pesanan yang sudah dibayar yang bisa diselesaikan' });
  db.prepare(`UPDATE bookings SET status='selesai' WHERE id=?`).run(b.id);
  res.json({ ok: true });
});

// ---------- Ulasan ----------
router.post('/:id/review', auth('pelanggan'), (req, res) => {
  const b = loadBooking(req.params.id);
  if (!b || b.customer_id !== req.user.id) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  if (b.status !== 'selesai') return res.status(409).json({ error: 'Ulasan hanya bisa diberikan setelah pesanan selesai' });
  const rating = Number(req.body && req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating harus 1 sampai 5' });
  if (db.prepare('SELECT 1 FROM reviews WHERE booking_id = ?').get(b.id)) return res.status(409).json({ error: 'Anda sudah memberi ulasan' });
  db.prepare('INSERT INTO reviews (booking_id,vehicle_id,customer_id,rating,comment) VALUES (?,?,?,?,?)')
    .run(b.id, b.vehicle_id, req.user.id, rating, (req.body.comment || '').slice(0, 500));
  res.status(201).json({ ok: true });
});

module.exports = router;
module.exports.BASE = BASE;
