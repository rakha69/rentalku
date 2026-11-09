// ============================================================
// db.js - Koneksi database SQLite + pembuatan tabel + data contoh
// Database tersimpan di file: database/rental.db (otomatis dibuat)
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dir = path.join(__dirname, '..', 'database');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'rental.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('pelanggan','mitra','admin')),
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','menunggu','ditolak','nonaktif')),
  bank_name TEXT,
  bank_account TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mobil','motor')),
  plate TEXT NOT NULL,
  year INTEGER,
  seats INTEGER,
  transmission TEXT,
  price_per_day INTEGER NOT NULL,
  image_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','tayang','ditolak','dihapus')),
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  price_per_day INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  commission_percent REAL NOT NULL,
  commission_amount INTEGER NOT NULL,
  partner_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'menunggu_mitra'
    CHECK (status IN ('menunggu_mitra','menunggu_bayar','dibayar','selesai','dibatalkan','ditolak')),
  payment_status TEXT NOT NULL DEFAULT 'belum' CHECK (payment_status IN ('belum','pending','lunas','gagal')),
  payment_method TEXT,
  gateway_order_id TEXT,
  midtrans_token TEXT,
  paid_at TEXT,
  expires_at TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'diajukan' CHECK (status IN ('diajukan','dibayar','ditolak')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---------- Data contoh (hanya saat database masih kosong) ----------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const insUser = db.prepare(
    `INSERT INTO users (name,email,password_hash,phone,role,status,bank_name,bank_account)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const admin = insUser.run('Admin Kelompok 3', 'admin@rental.test', bcrypt.hashSync('admin123', 10), '081200000001', 'admin', 'aktif', null, null).lastInsertRowid;
  const mitra = insUser.run('Budi Mitra Rental', 'mitra@rental.test', bcrypt.hashSync('mitra123', 10), '081200000002', 'mitra', 'aktif', 'BCA', '1234567890').lastInsertRowid;
  insUser.run('Siti Pelanggan', 'user@rental.test', bcrypt.hashSync('user123', 10), '081200000003', 'pelanggan', 'aktif', null, null);

  db.prepare(`INSERT INTO settings (key,value) VALUES ('commission_percent','10')`).run();

  const insVeh = db.prepare(
    `INSERT INTO vehicles (owner_id,name,brand,type,plate,year,seats,transmission,price_per_day,image_url,description,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'tayang')`
  );
  insVeh.run(mitra, 'Avanza 1.3 G', 'Toyota', 'mobil', 'B 1234 ABC', 2021, 7, 'Manual', 350000, '/images/vehicles/avanza.jpg', 'MPV keluarga 7-seater yang irit, nyaman, dan siap untuk perjalanan dinas maupun liburan keluarga.');
  insVeh.run(mitra, 'Brio RS', 'Honda', 'mobil', 'B 2345 BCD', 2022, 5, 'Otomatis', 300000, '/images/vehicles/brio.jpg', 'City car lincah dan gesit, sangat hemat bahan bakar dan nyaman untuk selap-selip di jalanan perkotaan.');
  insVeh.run(mitra, 'Innova Zenix', 'Toyota', 'mobil', 'B 3456 CDE', 2023, 7, 'Otomatis', 650000, '/images/vehicles/innova.jpg', 'MPV hybrid premium dengan kabin senyap luas, captain seat, dan fitur keselamatan modern.');
  insVeh.run(mitra, 'NMAX 155 Connected', 'Yamaha', 'motor', 'B 4567 DEF', 2022, 2, 'Otomatis', 100000, '/images/vehicles/nmax.jpg', 'Maxi scooter bertenaga dan stabil dengan bagasi luas untuk harian maupun touring santai.');
  insVeh.run(mitra, 'Vario 160 ABS', 'Honda', 'motor', 'B 5678 EFG', 2023, 2, 'Otomatis', 90000, '/images/vehicles/vario.jpg', 'Motor matic responsif, sangat lincah di kemacetan kota dengan konsumsi BBM yang luar biasa efisien.');
  insVeh.run(admin, 'Pajero Sport Dakar 4x2', 'Mitsubishi', 'mobil', 'B 9999 ADM', 2022, 7, 'Otomatis', 900000, '/images/vehicles/pajero.jpg', 'SUV tangguh dan gagah dari armada platform kami. Mesin bertenaga tinggi, interior mewah, siap segala medan.');
}
seed();

module.exports = db;
