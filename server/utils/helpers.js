// ============================================================
// helpers.js - Fungsi bantu: tanggal, harga, komisi, ketersediaan
// ============================================================
const db = require('../db');

const DAY_MS = 86400000;

function todayStr() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s));
const diffDays = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY_MS);

// Mengembalikan teks error, atau null jika tanggal valid
function validateDates(start, end) {
  if (!isDate(start) || !isDate(end)) return 'Tanggal tidak valid';
  if (start < todayStr()) return 'Tanggal mulai tidak boleh sebelum hari ini';
  if (end <= start) return 'Tanggal kembali harus setelah tanggal mulai';
  if (diffDays(start, end) > 60) return 'Maksimal sewa 60 hari';
  return null;
}

function getCommissionPercent() {
  const row = db.prepare(`SELECT value FROM settings WHERE key='commission_percent'`).get();
  const v = row ? parseFloat(row.value) : 10;
  return isNaN(v) ? 10 : v;
}

// Hitung total harga + pembagian komisi platform dan bagian mitra
// driverOption: 'lepas_kunci' atau 'sopir' (biaya sopir default Rp 150.000 / hari jika mobil)
function calcQuote(vehicle, start, end, ownerRole, driverOption = 'lepas_kunci') {
  const days = diffDays(start, end);
  const basePrice = days * vehicle.price_per_day;
  const isDriver = driverOption === 'sopir' && vehicle.type === 'mobil';
  const driverDailyFee = isDriver ? 150000 : 0;
  const totalDriverFee = days * driverDailyFee;
  const total = basePrice + totalDriverFee;

  // Armada milik admin (platform) = 100% masuk platform
  const percent = ownerRole === 'admin' ? 100 : getCommissionPercent();
  const commission = Math.round((total * percent) / 100);
  return {
    days,
    price_per_day: vehicle.price_per_day,
    driver_daily_fee: driverDailyFee,
    total_driver_fee: totalDriverFee,
    driver_option: isDriver ? 'sopir' : 'lepas_kunci',
    base_price: basePrice,
    total_price: total,
    commission_percent: percent,
    commission_amount: commission,
    partner_amount: total - commission,
  };
}

// Cek apakah kendaraan bebas dari pesanan lain pada rentang tanggal
function isAvailable(vehicleId, start, end, excludeBookingId = 0) {
  const row = db
    .prepare(
      `SELECT 1 FROM bookings
       WHERE vehicle_id = ? AND id != ?
         AND status IN ('menunggu_mitra','menunggu_bayar','dibayar')
         AND start_date < ? AND end_date > ?
       LIMIT 1`
    )
    .get(vehicleId, excludeBookingId, end, start);
  return !row;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `RNT-${todayStr().replace(/-/g, '')}-${r}`;
}

// Batalkan otomatis pesanan yang melewati batas waktu
function expireBookings() {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE bookings SET status='dibatalkan', cancel_reason='Batas waktu habis'
     WHERE status IN ('menunggu_mitra','menunggu_bayar')
       AND payment_status != 'pending'
       AND expires_at IS NOT NULL AND expires_at < ?`
  ).run(now);
}

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

module.exports = { todayStr, isDate, diffDays, validateDates, getCommissionPercent, calcQuote, isAvailable, makeCode, expireBookings, rupiah };
