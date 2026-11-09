// ============================================================
// routes/reports.js - Laporan keuangan admin + export PDF / Excel
//   GET /api/reports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD
//   GET /api/reports/finance/export/pdf?from=&to=
//   GET /api/reports/finance/export/excel?from=&to=
// ============================================================
const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { rupiah, isDate } = require('../utils/helpers');

const router = express.Router();
const APP_NAME = () => process.env.APP_NAME || 'RentalKu';

function buildReport(from, to) {
  const f = isDate(from) ? from : '1970-01-01';
  const t = isDate(to) ? to : '9999-12-31';
  const rows = db
    .prepare(`SELECT b.code, b.paid_at, b.payment_method, b.total_price, b.commission_percent, b.commission_amount, b.partner_amount,
                     v.name AS vehicle_name, c.name AS customer_name, o.name AS partner_name
              FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id JOIN users c ON c.id=b.customer_id JOIN users o ON o.id=v.owner_id
              WHERE b.payment_status='lunas' AND date(b.paid_at,'localtime') BETWEEN ? AND ?
              ORDER BY b.paid_at DESC`)
    .all(f, t);
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const payouts = db
    .prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM payouts WHERE status='dibayar' AND date(processed_at,'localtime') BETWEEN ? AND ?`)
    .get(f, t).s;
  return {
    from: isDate(from) ? from : null,
    to: isDate(to) ? to : null,
    summary: {
      transactions: rows.length,
      gross: sum('total_price'),
      commission: sum('commission_amount'),
      partner_share: sum('partner_amount'),
      payouts_paid: payouts,
    },
    rows,
  };
}

const dt = (s) => (s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const periodText = (r) => `Periode: ${r.from || 'awal'} s/d ${r.to || 'sekarang'}`;

router.get('/finance', auth('admin'), (req, res) => {
  res.json(buildReport(req.query.from, req.query.to));
});

// ---------- Export Excel ----------
router.get('/finance/export/excel', auth('admin'), async (req, res) => {
  const r = buildReport(req.query.from, req.query.to);
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME();
  const ws = wb.addWorksheet('Laporan Keuangan');
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = `LAPORAN KEUANGAN - ${APP_NAME()}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = periodText(r);

  ws.addRow([]);
  ws.addRow(['Jumlah Transaksi', r.summary.transactions]);
  ws.addRow(['Total Transaksi (Bruto)', r.summary.gross]);
  ws.addRow(['Pendapatan Platform (Komisi)', r.summary.commission]);
  ws.addRow(['Bagian Mitra', r.summary.partner_share]);
  ws.addRow(['Payout Dibayar ke Mitra', r.summary.payouts_paid]);
  for (let i = 4; i <= 8; i++) {
    ws.getRow(i).getCell(1).font = { bold: true };
    if (i > 4) ws.getRow(i).getCell(2).numFmt = '"Rp" #,##0';
  }
  ws.addRow([]);

  const header = ws.addRow(['No', 'Kode', 'Tanggal Bayar', 'Kendaraan', 'Pelanggan', 'Mitra', 'Total (Rp)', 'Komisi (Rp)', 'Bagian Mitra (Rp)']);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } };
  });
  r.rows.forEach((x, i) => {
    ws.addRow([i + 1, x.code, dt(x.paid_at), x.vehicle_name, x.customer_name, x.partner_name, x.total_price, x.commission_amount, x.partner_amount]);
  });
  const totalRow = ws.addRow(['', '', '', '', '', 'TOTAL', r.summary.gross, r.summary.commission, r.summary.partner_share]);
  totalRow.font = { bold: true };
  ws.columns = [{ width: 6 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 20 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }];
  ws.getColumn(1).width = 30; // kolom A dipakai label ringkasan juga
  [7, 8, 9].forEach((c) => (ws.getColumn(c).numFmt = '#,##0'));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-keuangan.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// ---------- Export PDF ----------
router.get('/finance/export/pdf', auth('admin'), (req, res) => {
  const r = buildReport(req.query.from, req.query.to);
  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="laporan-keuangan.pdf"');
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f4c81').text(`Laporan Keuangan - ${APP_NAME()}`, 40, 40);
  doc.font('Helvetica').fontSize(10).fillColor('#555555').text(periodText(r), 40, 64);
  doc.fillColor('#222222').fontSize(11)
    .text(`Jumlah transaksi: ${r.summary.transactions}`, 40, 90)
    .text(`Total transaksi (bruto): ${rupiah(r.summary.gross)}`, 40, 106)
    .text(`Pendapatan platform (komisi): ${rupiah(r.summary.commission)}`, 330, 90)
    .text(`Bagian mitra: ${rupiah(r.summary.partner_share)}`, 330, 106)
    .text(`Payout dibayar ke mitra: ${rupiah(r.summary.payouts_paid)}`, 330, 122);

  const cols = [
    ['No', 30, 'left'], ['Kode', 110, 'left'], ['Tanggal Bayar', 105, 'left'], ['Kendaraan', 120, 'left'],
    ['Pelanggan', 100, 'left'], ['Total', 80, 'right'], ['Komisi', 75, 'right'], ['Bagian Mitra', 80, 'right'],
  ];
  let y = 150;
  const drawHeader = () => {
    doc.rect(40, y, 700, 22).fill('#0f4c81');
    let x = 40;
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    cols.forEach(([t, w, a]) => { doc.text(t, x + 4, y + 7, { width: w - 8, align: a }); x += w; });
    y += 26;
  };
  drawHeader();
  doc.font('Helvetica').fontSize(9).fillColor('#222222');
  r.rows.forEach((x, i) => {
    if (y > 520) { doc.addPage({ size: 'A4', margin: 40, layout: 'landscape' }); y = 40; drawHeader(); doc.font('Helvetica').fontSize(9).fillColor('#222222'); }
    if (i % 2 === 0) doc.rect(40, y - 3, 700, 18).fill('#f5f8fc');
    doc.fillColor('#222222');
    const vals = [String(i + 1), x.code, dt(x.paid_at), x.vehicle_name, x.customer_name, rupiah(x.total_price), rupiah(x.commission_amount), rupiah(x.partner_amount)];
    let cx = 40;
    cols.forEach(([, w, a], k) => { doc.text(vals[k], cx + 4, y, { width: w - 8, align: a, lineBreak: false, ellipsis: true }); cx += w; });
    y += 18;
  });
  if (!r.rows.length) doc.text('Belum ada transaksi pada periode ini.', 44, y);
  doc.end();
});

module.exports = router;
