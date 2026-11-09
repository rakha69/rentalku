// ============================================================
// routes/vehicles.js - CRUD Kendaraan
//   GET    /api/vehicles            katalog publik (filter q, type, max_price, start, end)
//   GET    /api/vehicles/mine       kendaraan milik mitra/admin yang login
//   GET    /api/vehicles/:id        detail + ulasan + tanggal terpesan
//   POST   /api/vehicles            tambah (mitra aktif / admin)
//   PUT    /api/vehicles/:id        ubah   (pemilik / admin)
//   DELETE /api/vehicles/:id        hapus  (pemilik / admin) - soft delete
//   PATCH  /api/vehicles/:id/availability   aktif/nonaktifkan ketersediaan
// ============================================================
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { validateDates, isAvailable, todayStr } = require('../utils/helpers');

const router = express.Router();

const LIST_SQL = `
  SELECT v.*, u.name AS owner_name,
    (SELECT ROUND(AVG(rating),1) FROM reviews r WHERE r.vehicle_id = v.id) AS rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.vehicle_id = v.id) AS review_count
  FROM vehicles v JOIN users u ON u.id = v.owner_id`;

function validateVehicle(b) {
  if (!b.name || !b.brand) return 'Nama dan merek kendaraan wajib diisi';
  if (!['mobil', 'motor'].includes(b.type)) return 'Jenis kendaraan harus mobil atau motor';
  if (!b.plate) return 'Plat nomor wajib diisi';
  const price = Number(b.price_per_day);
  if (!Number.isInteger(price) || price < 10000) return 'Harga sewa per hari minimal Rp 10.000';
  return null;
}

// ---------- Katalog publik ----------
router.get('/', (req, res) => {
  const { q, type, transmission, seats, max_price, sort, start, end } = req.query;
  let sql = `${LIST_SQL} WHERE v.status = 'tayang' AND v.is_available = 1`;
  const params = [];
  if (q) { sql += ' AND (v.name LIKE ? OR v.brand LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (['mobil', 'motor'].includes(type)) { sql += ' AND v.type = ?'; params.push(type); }
  if (['Manual', 'Otomatis'].includes(transmission)) { sql += ' AND v.transmission = ?'; params.push(transmission); }
  if (seats) {
    const s = Number(seats);
    if (s === 4) sql += ' AND v.seats <= 4';
    else if (s === 5) sql += ' AND v.seats = 5';
    else if (s === 7) sql += ' AND v.seats >= 7';
  }
  if (max_price && Number(max_price) > 0) { sql += ' AND v.price_per_day <= ?'; params.push(Number(max_price)); }
  
  if (sort === 'price_asc') {
    sql += ' ORDER BY v.price_per_day ASC, v.id DESC';
  } else if (sort === 'price_desc') {
    sql += ' ORDER BY v.price_per_day DESC, v.id DESC';
  } else if (sort === 'rating_desc') {
    sql += ' ORDER BY rating DESC, review_count DESC, v.id DESC';
  } else {
    sql += ' ORDER BY v.created_at DESC, v.id DESC';
  }

  let rows = db.prepare(sql).all(...params);
  if (start && end && !validateDates(start, end)) {
    rows = rows.filter((v) => isAvailable(v.id, start, end));
  }
  res.json(rows);
});

// ---------- Kendaraan milik sendiri ----------
router.get('/mine', auth('mitra', 'admin'), (req, res) => {
  const rows = db.prepare(`${LIST_SQL} WHERE v.owner_id = ? AND v.status != 'dihapus' ORDER BY v.id DESC`).all(req.user.id);
  res.json(rows);
});

// ---------- Detail ----------
router.get('/:id', (req, res) => {
  const v = db.prepare(`${LIST_SQL} WHERE v.id = ? AND v.status = 'tayang'`).get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Kendaraan tidak ditemukan' });
  const reviews = db
    .prepare(`SELECT r.rating, r.comment, r.created_at, u.name AS customer_name
              FROM reviews r JOIN users u ON u.id = r.customer_id
              WHERE r.vehicle_id = ? ORDER BY r.id DESC LIMIT 20`)
    .all(v.id);
  const booked = db
    .prepare(`SELECT start_date, end_date FROM bookings
              WHERE vehicle_id = ? AND status IN ('menunggu_mitra','menunggu_bayar','dibayar') AND end_date >= ?
              ORDER BY start_date`)
    .all(v.id, todayStr());
  res.json({ ...v, reviews, booked });
});

// ---------- Tambah ----------
router.post('/', auth('mitra', 'admin'), (req, res) => {
  if (req.user.role === 'mitra' && req.user.status !== 'aktif') {
    return res.status(403).json({ error: 'Akun mitra Anda belum diverifikasi admin' });
  }
  const b = req.body || {};
  const err = validateVehicle(b);
  if (err) return res.status(400).json({ error: err });
  const status = req.user.role === 'admin' ? 'tayang' : 'menunggu'; // mitra: menunggu verifikasi admin
  const info = db
    .prepare(`INSERT INTO vehicles (owner_id,name,brand,type,plate,year,seats,transmission,price_per_day,image_url,description,status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, b.name.trim(), b.brand.trim(), b.type, b.plate.trim(), Number(b.year) || null, Number(b.seats) || null,
      b.transmission || null, Number(b.price_per_day), b.image_url || '', b.description || '', status);
  res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid));
});

function loadOwned(req, res) {
  const v = db.prepare(`SELECT * FROM vehicles WHERE id = ? AND status != 'dihapus'`).get(req.params.id);
  if (!v) { res.status(404).json({ error: 'Kendaraan tidak ditemukan' }); return null; }
  if (req.user.role !== 'admin' && v.owner_id !== req.user.id) {
    res.status(403).json({ error: 'Ini bukan kendaraan Anda' }); return null;
  }
  return v;
}

// ---------- Ubah ----------
router.put('/:id', auth('mitra', 'admin'), (req, res) => {
  const v = loadOwned(req, res); if (!v) return;
  const b = req.body || {};
  const err = validateVehicle(b);
  if (err) return res.status(400).json({ error: err });
  const status = v.status === 'ditolak' && req.user.role === 'mitra' ? 'menunggu' : v.status; // revisi -> verifikasi ulang
  db.prepare(`UPDATE vehicles SET name=?,brand=?,type=?,plate=?,year=?,seats=?,transmission=?,price_per_day=?,image_url=?,description=?,status=? WHERE id=?`)
    .run(b.name.trim(), b.brand.trim(), b.type, b.plate.trim(), Number(b.year) || null, Number(b.seats) || null,
      b.transmission || null, Number(b.price_per_day), b.image_url || '', b.description || '', status, v.id);
  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(v.id));
});

// ---------- Hapus (soft delete) ----------
router.delete('/:id', auth('mitra', 'admin'), (req, res) => {
  const v = loadOwned(req, res); if (!v) return;
  const active = db.prepare(`SELECT 1 FROM bookings WHERE vehicle_id = ? AND status IN ('menunggu_mitra','menunggu_bayar','dibayar')`).get(v.id);
  if (active) return res.status(409).json({ error: 'Tidak bisa dihapus, masih ada pesanan aktif untuk kendaraan ini' });
  db.prepare(`UPDATE vehicles SET status='dihapus' WHERE id = ?`).run(v.id);
  res.json({ ok: true });
});

// ---------- Aktif / nonaktif ketersediaan ----------
router.patch('/:id/availability', auth('mitra', 'admin'), (req, res) => {
  const v = loadOwned(req, res); if (!v) return;
  db.prepare('UPDATE vehicles SET is_available = ? WHERE id = ?').run(req.body && req.body.is_available ? 1 : 0, v.id);
  res.json({ ok: true });
});

module.exports = router;
