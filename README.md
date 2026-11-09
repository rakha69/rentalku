# RentalKu - Platform Rental Kendaraan

Tugas **Digital Entrepreneurship - Kelompok 3**.
Model bisnis: **Kelompok 3 = Admin/platform**, pemilik kendaraan = **Mitra**, pembeli jasa = **Pelanggan**.
Pelanggan bayar lewat **Payment Gateway (Midtrans)** ke platform, platform **mengambil komisi**, sisanya jadi saldo mitra dan dicairkan lewat **payout**.

---

## 1. Cara menjalankan (Windows / VS Code)

1. **Install Node.js versi 22 atau lebih baru** (disarankan LTS terbaru) dari https://nodejs.org
   Cek di terminal: `node -v` (harus `v22...` atau lebih tinggi).
2. Ekstrak zip, lalu buka folder `rental-kendaraan` di VS Code (File → Open Folder).
3. Buka terminal VS Code (`Ctrl + ~`), jalankan:
   ```
   npm install
   copy .env.example .env
   npm start
   ```
   (di Mac/Linux: `cp .env.example .env`)
4. Buka browser: **http://localhost:3000**

Database SQLite (`database/rental.db`) **dibuat otomatis** beserta data contoh. Tidak perlu install database apa pun.

Untuk mode pengembangan (server restart otomatis saat file berubah): `npm run dev`.
Untuk mengosongkan database dan mulai dari data contoh lagi: hentikan server, lalu `npm run reset-db`.

### Akun demo

| Peran | Email | Password |
|---|---|---|
| Admin (Kelompok 3) | admin@rental.test | admin123 |
| Mitra | mitra@rental.test | mitra123 |
| Pelanggan | user@rental.test | user123 |

---

## 2. Struktur folder dan isi tiap file

```
rental-kendaraan/
├── package.json            Daftar dependency & perintah (npm start, npm run dev, npm run reset-db)
├── .env.example            Contoh konfigurasi. Salin jadi ".env" (jangan di-upload ke GitHub)
├── .gitignore              File yang tidak ikut Git (node_modules, .env, database)
├── .npmrc                  Pengaturan npm (ignore-scripts=true) agar install tidak perlu kompilasi C++
├── README.md               Panduan ini
│
├── server/                 ===== BACKEND (Node.js + Express) =====
│   ├── app.js              Titik masuk server: pasang semua route, jalankan folder public, auto-batalkan pesanan kedaluwarsa
│   ├── db.js               Koneksi SQLite, pembuatan tabel, data contoh (seed)
│   ├── middleware/
│   │   └── auth.js         Login JWT + pembatasan akses per peran (pelanggan / mitra / admin)
│   ├── utils/
│   │   └── helpers.js      Validasi tanggal, hitung harga & komisi, cek ketersediaan, kode pesanan
│   └── routes/             Kumpulan endpoint API
│       ├── auth.js         Registrasi (pelanggan & mitra) dan login
│       ├── vehicles.js     CRUD kendaraan, katalog, detail, ulasan
│       ├── bookings.js     Booking, hitung harga, mitra terima/tolak, batal, selesai, ulasan
│       ├── payments.js     Payment Gateway Midtrans Snap + mode simulasi + webhook
│       ├── invoices.js     Invoice PDF
│       ├── partner.js      Saldo mitra dan pengajuan payout
│       ├── admin.js        Verifikasi mitra/kendaraan, pelanggan, pesanan, payout, komisi
│       └── reports.js      Laporan keuangan + export PDF dan Excel
│
├── database/               File database (rental.db dibuat otomatis di sini)
│
└── public/                 ===== FRONTEND (HTML + CSS + JavaScript) =====
    ├── index.html          Katalog + pencarian/filter kendaraan
    ├── vehicle.html        Detail kendaraan + form booking + harga otomatis
    ├── login.html          Login & registrasi (pelanggan / mitra)
    ├── bookings.html       Pesanan Saya: bayar, batal, unduh invoice, ulasan
    ├── mitra.html          Dashboard mitra: kendaraan, pesanan masuk, saldo & payout
    ├── admin.html          Dashboard admin: laporan keuangan, verifikasi, payout, komisi
    ├── css/style.css       Seluruh tampilan (warna utama ada di bagian :root)
    └── js/
        ├── api.js          Dipakai semua halaman: panggil API, sesi login, navbar, format rupiah/tanggal
        ├── index.js · vehicle.js · auth.js · bookings.js · mitra.js · admin.js   (logika tiap halaman)
```

---

## 3. Alur demo (untuk presentasi)

1. **Pelanggan** `user@rental.test` → pilih kendaraan → pilih tanggal (harga terhitung otomatis) → *Pesan Sekarang*.
2. **Mitra** `mitra@rental.test` → tab *Pesanan Masuk* → *Terima*.
3. **Pelanggan** → *Pesanan Saya* → *Bayar Sekarang* → (mode simulasi) pilih *Bayar Berhasil*. Coba juga *Gagal* lalu bayar ulang.
4. **Pelanggan** → *Unduh Invoice PDF*.
5. **Mitra** → *Tandai Selesai* → saldo muncul di *Saldo bisa ditarik* → tab *Penarikan Dana* → ajukan payout.
6. **Admin** `admin@rental.test` → *Laporan Keuangan* (komisi = keuntungan platform) → *Export Excel / PDF* → tab *Payout Mitra* → *Tandai Dibayar*.
7. Daftar sebagai **mitra baru** di halaman Login → di Admin muncul di *Verifikasi Mitra*; kendaraan baru mitra muncul di *Verifikasi Kendaraan*.

**Contoh hitungan:** sewa Avanza 2 hari × Rp350.000 = Rp700.000 → komisi platform 10% = **Rp70.000** (pendapatan Kelompok 3), bagian mitra = **Rp630.000**.

---

## 4. Payment Gateway (Midtrans)

Secara bawaan aplikasi berjalan di **mode simulasi** (tombol bayar palsu) sehingga bisa didemokan tanpa akun apa pun.

Untuk memakai **Midtrans Sandbox** sungguhan (uang tidak sungguhan):
1. Daftar di https://dashboard.midtrans.com, pilih environment **Sandbox**.
2. Menu *Settings → Access Keys*, salin **Server Key** dan **Client Key**.
3. Isi di file `.env`:
   ```
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
   MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
   MIDTRANS_IS_PRODUCTION=false
   ```
4. Restart server (`Ctrl+C`, lalu `npm start`). Terminal akan menampilkan "Mode pembayaran: Midtrans".
5. Saat membayar, popup Midtrans muncul. Untuk menyelesaikan pembayaran uji, pakai simulator: https://simulator.sandbox.midtrans.com (QRIS / Virtual Account).

Catatan: di `localhost` webhook dari Midtrans tidak bisa masuk, jadi sistem **menanyakan status langsung ke Midtrans** tiap beberapa detik setelah pembayaran. Jika nanti di-deploy online, isi *Payment Notification URL* di dashboard Midtrans dengan `https://domain-anda/api/payments/notification`.

---

## 5. Aturan bisnis yang dipakai

- Komisi platform default **10%** (Admin → *Pengaturan Komisi*). Pesanan lama tetap memakai persentase saat dibuat.
- Pesanan menunggu konfirmasi mitra maksimal **24 jam**; setelah diterima, pelanggan punya **60 menit** untuk membayar. Lewat batas, pesanan otomatis **dibatalkan** dan kendaraan tersedia lagi.
- Kendaraan yang bentrok tanggal tidak bisa dipesan dua kali.
- Mitra baru dan kendaraan baru harus **diverifikasi admin** sebelum tayang.
- Saldo mitra baru bisa ditarik setelah mitra menandai pesanan **Selesai**. Minimal payout Rp10.000.
- Armada milik admin (contoh: Pajero Sport) = 100% masuk platform dan tidak perlu konfirmasi mitra.

---

## 6. Pemetaan fitur ke tahapan tugas

| Tahap | Fitur | File utama |
|---|---|---|
| Website mulai berjalan | Frontend HTML/CSS/JS | `public/*.html`, `public/css`, `public/js` |
| | Backend + Database | `server/app.js`, `server/db.js` |
| | Login & hak akses | `server/routes/auth.js`, `server/middleware/auth.js` |
| | CRUD kendaraan | `server/routes/vehicles.js`, `public/js/mitra.js` |
| | Booking | `server/routes/bookings.js`, `public/js/vehicle.js` |
| Fitur utama berfungsi | Payment Gateway | `server/routes/payments.js`, `public/js/bookings.js` |
| | Invoice PDF | `server/routes/invoices.js` |
| | Laporan keuangan | `server/routes/reports.js`, `public/admin.html` |
| | Export PDF / Excel | `server/routes/reports.js` |

---

## 7. Keterbatasan (jujur, untuk dicatat di laporan)

- Ini **prototipe tugas kuliah**: belum ada refund otomatis, notifikasi email/WhatsApp, atau upload foto (foto lewat URL; kalau kosong tampil ikon).
- Mode Midtrans Sandbox sudah ditulis sesuai dokumentasi Midtrans, tetapi pengujian otomatis kami hanya mencakup mode simulasi dan verifikasi webhook. Coba satu kali dengan akun sandbox Anda sebelum presentasi.
- Penambahan armada milik admin lewat tampilan belum ada (hanya data contoh).
- Untuk produksi: ganti `JWT_SECRET` di `.env`, pakai HTTPS, dan gunakan database server (PostgreSQL/MySQL).

## 8. Masalah umum

| Masalah | Solusi |
|---|---|
| `npm install` error soal `better-sqlite3` / `node-gyp` / Visual Studio | Pastikan Node ≥ 22 (`node -v`) dan file `.npmrc` ada di folder project (isinya `ignore-scripts=true`, supaya npm tidak mencoba mengompilasi). Hapus folder `node_modules`, lalu ulangi `npm install` |
| `EADDRINUSE` (port dipakai) | Ubah `PORT=3001` di `.env`, atau tutup program lain yang memakai port 3000 |
| Lupa password akun demo / data berantakan | Hentikan server → `npm run reset-db` → `npm start` |
| Perubahan di `.env` tidak berlaku | Restart server |
