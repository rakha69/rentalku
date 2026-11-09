// ============================================================
// routes/invoices.js - Invoice PDF
//   GET /api/invoices/:bookingId/pdf   (pelanggan pemilik pesanan / mitra pemilik kendaraan / admin)
// ============================================================
const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { rupiah } = require('../utils/helpers');

const router = express.Router();
const APP_NAME = () => process.env.APP_NAME || 'RentalKu';

router.get('/:id/pdf', auth(), (req, res) => {
  const b = db
    .prepare(`SELECT b.*, v.name AS vehicle_name, v.brand AS vehicle_brand, v.plate AS vehicle_plate, v.owner_id,
                     c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, o.name AS partner_name
              FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id JOIN users c ON c.id=b.customer_id JOIN users o ON o.id=v.owner_id
              WHERE b.id = ?`)
    .get(req.params.id);
  if (!b) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  const allowed = req.user.role === 'admin' || b.customer_id === req.user.id || b.owner_id === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Tidak punya akses ke invoice ini' });
  if (b.payment_status !== 'lunas') return res.status(409).json({ error: 'Invoice tersedia setelah pembayaran lunas' });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${b.code}.pdf"`);
  doc.pipe(res);

  const dateId = (s) => new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  // Header
  doc.rect(0, 0, 595, 110).fill('#0f4c81');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text(APP_NAME(), 50, 40);
  doc.font('Helvetica').fontSize(10).text('Platform Rental Kendaraan', 50, 72);
  doc.font('Helvetica-Bold').fontSize(22).text('INVOICE', 350, 40, { width: 195, align: 'right' });
  doc.font('Helvetica').fontSize(10).text(`No: INV-${b.code}`, 350, 72, { width: 195, align: 'right' });

  // Info
  doc.fillColor('#222222');
  let y = 140;
  doc.font('Helvetica-Bold').fontSize(10).text('DITAGIHKAN KEPADA', 50, y);
  doc.font('Helvetica').fontSize(11)
    .text(b.customer_name, 50, y + 16)
    .text(b.customer_email || '-', 50, y + 32)
    .text(b.customer_phone || '-', 50, y + 48);
  doc.font('Helvetica-Bold').fontSize(10).text('DETAIL PEMBAYARAN', 340, y);
  doc.font('Helvetica').fontSize(11)
    .text(`Kode Pesanan : ${b.code}`, 340, y + 16)
    .text(`Tanggal Bayar : ${b.paid_at ? dateId(b.paid_at) : '-'}`, 340, y + 32)
    .text(`Metode : ${b.payment_method || '-'}`, 340, y + 48);

  // Tabel
  y = 240;
  doc.rect(50, y, 495, 26).fill('#eef3f9');
  doc.fillColor('#0f4c81').font('Helvetica-Bold').fontSize(10)
    .text('Kendaraan', 58, y + 8).text('Periode', 230, y + 8).text('Hari', 360, y + 8, { width: 40, align: 'right' })
    .text('Harga/hari', 405, y + 8, { width: 65, align: 'right' }).text('Subtotal', 470, y + 8, { width: 68, align: 'right' });
  y += 36;
  doc.fillColor('#222222').font('Helvetica').fontSize(10);
  doc.text(`${b.vehicle_brand} ${b.vehicle_name}`, 58, y, { width: 165 });
  doc.fontSize(9).fillColor('#666666').text(`Plat: ${b.vehicle_plate}`, 58, y + 14);
  doc.fillColor('#222222').fontSize(10)
    .text(`${dateId(b.start_date)}\ns/d ${dateId(b.end_date)}`, 230, y, { width: 125 })
    .text(String(b.days), 360, y, { width: 40, align: 'right' })
    .text(rupiah(b.price_per_day), 405, y, { width: 65, align: 'right' })
    .text(rupiah(b.total_price), 470, y, { width: 68, align: 'right' });
  y += 56;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#dddddd').stroke();

  // Total
  y += 14;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f4c81').text('TOTAL DIBAYAR', 300, y, { width: 100 })
    .text(rupiah(b.total_price), 405, y, { width: 133, align: 'right' });
  y += 40;
  doc.roundedRect(50, y, 90, 28, 4).fill('#1f9d55');
  doc.fillColor('#ffffff').fontSize(13).text('LUNAS', 50, y + 8, { width: 90, align: 'center' });

  doc.fillColor('#666666').font('Helvetica').fontSize(9)
    .text(`Kendaraan disediakan oleh mitra: ${b.partner_name}`, 50, y + 50)
    .text('Invoice ini dibuat otomatis oleh sistem dan sah tanpa tanda tangan.', 50, y + 64);
  doc.end();
});

module.exports = router;
