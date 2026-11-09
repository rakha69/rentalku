// ============================================================
// routes/uploads.js - Endpoint upload gambar (disimpan di public/uploads/vehicles)
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const { auth } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'vehicles');
fs.mkdirSync(uploadDir, { recursive: true });

// Upload base64 atau data URL image
router.post('/vehicle-image', auth('mitra', 'admin'), (req, res) => {
  const { data, filename } = req.body || {};
  if (!data) {
    return res.status(400).json({ error: 'Data gambar wajib disertakan' });
  }

  // Regex untuk membaca format base64
  const matches = data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  let ext = 'jpg';
  let buffer;

  if (matches && matches.length === 3) {
    ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    // Coba decode langsung jika raw base64
    try {
      buffer = Buffer.from(data, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Format gambar tidak valid' });
    }
  }

  // Validasi ukuran maks 5MB
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran foto maksimal 5MB' });
  }

  const safeName = `veh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const filePath = path.join(uploadDir, safeName);

  try {
    fs.writeFileSync(filePath, buffer);
    const publicUrl = `/uploads/vehicles/${safeName}`;
    return res.json({ url: publicUrl, filename: safeName });
  } catch (err) {
    console.error('Gagal menyimpan file upload:', err);
    return res.status(500).json({ error: 'Gagal menyimpan file foto di server' });
  }
});

module.exports = router;

