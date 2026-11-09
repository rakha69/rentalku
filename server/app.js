// ============================================================
// app.js - Titik masuk server (jalankan dengan: npm start)
// ============================================================
require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
require('./db'); // membuat tabel + data contoh
const { expireBookings } = require('./utils/helpers');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ---------- API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/partner', require('./routes/partner'));
app.use('/api/uploads', require('./routes/uploads'));

// Konfigurasi yang boleh dibaca frontend (client key aman dipublikasikan)
app.get('/api/config', (req, res) => {
  const hasKey = !!process.env.MIDTRANS_SERVER_KEY;
  res.json({
    appName: process.env.APP_NAME || 'RentalKu',
    paymentMode: hasKey ? 'midtrans' : 'simulasi',
    midtransClientKey: process.env.MIDTRANS_CLIENT_KEY || '',
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// ---------- Frontend (folder public) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

// Batalkan pesanan yang melewati batas waktu tiap 1 menit
expireBookings();
setInterval(expireBookings, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Server berjalan di http://localhost:${PORT}`);
  console.log(`  Mode pembayaran: ${process.env.MIDTRANS_SERVER_KEY ? 'Midtrans' : 'SIMULASI (isi MIDTRANS_SERVER_KEY di .env untuk Midtrans Sandbox)'}`);
  console.log('  Akun demo: admin@rental.test / admin123 | mitra@rental.test / mitra123 | user@rental.test / user123\n');
});
