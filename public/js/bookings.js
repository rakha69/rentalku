// ============================================================
// bookings.js - Pesanan pelanggan: Stepper visual, countdown timer, WhatsApp, bayar, invoice, ulasan
// ============================================================
if (!requireRole('pelanggan')) throw new Error('redirect');

let midtransLoaded = false;
let pollTimer = null;
let countdownInterval = null;

function loadSnap() {
  return new Promise((resolve, reject) => {
    if (midtransLoaded || window.snap) { resolve(); return; }
    const s = document.createElement('script');
    s.src = APP_CONFIG.isProduction ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js';
    s.setAttribute('data-client-key', APP_CONFIG.midtransClientKey);
    s.onload = () => { midtransLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Gagal memuat Midtrans Snap. Periksa koneksi internet.'));
    document.head.appendChild(s);
  });
}

function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
function openModal(html) {
  document.getElementById('modalRoot').innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}

// Stepper Status Pesanan yang Modern
function renderStepper(b) {
  const steps = [
    { key: 'menunggu_mitra', label: '1. Konfirmasi Mitra' },
    { key: 'menunggu_bayar', label: '2. Pembayaran' },
    { key: 'dibayar', label: '3. Siap Digunakan' },
    { key: 'selesai', label: '4. Selesai' }
  ];

  if (b.status === 'dibatalkan' || b.status === 'ditolak') {
    return `<div class="alert warn" style="margin:12px 0 6px;">❌ Status Pesanan: <b>${b.status === 'ditolak' ? 'Ditolak oleh Mitra' : 'Dibatalkan'}</b></div>`;
  }

  let currentIdx = 0;
  if (b.status === 'menunggu_bayar') currentIdx = 1;
  else if (b.status === 'dibayar') currentIdx = 2;
  else if (b.status === 'selesai') currentIdx = 3;

  return `
    <div class="stepper">
      ${steps.map((st, i) => {
        let cls = '';
        if (i < currentIdx) cls = 'done';
        else if (i === currentIdx) cls = 'active';
        return `
          <div class="step ${cls}">
            <div class="step-circle">${i < currentIdx ? '✓' : (i + 1)}</div>
            <div class="step-label">${st.label}</div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// Format countdown mm:ss
function formatTimeRemaining(ms) {
  if (ms <= 0) return '00:00 (Waktu Habis)';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

function actions(b) {
  const a = [];
  if (b.status === 'menunggu_bayar') {
    a.push(`<button class="btn ok" onclick="pay(${b.id})">💳 Bayar Sekarang</button>`);
    a.push(`<button class="btn ghost sm" onclick="cancelBooking(${b.id})">Batalkan Pesanan</button>`);
  }
  if (b.status === 'menunggu_mitra') {
    a.push(`<button class="btn ghost sm" onclick="cancelBooking(${b.id})">Batalkan Pesanan</button>`);
  }
  if (b.payment_status === 'lunas') {
    a.push(`<button class="btn" onclick="downloadFile('/invoices/${b.id}/pdf','invoice-${b.code}.pdf')">📄 Unduh Invoice PDF</button>`);
  }
  if (b.status === 'selesai' && !b.reviewed) {
    a.push(`<button class="btn warn" onclick="reviewModal(${b.id})">⭐ Beri Ulasan</button>`);
  }

  // Tombol Hubungi WhatsApp Mitra / CS RentalKu (jika pesanan dikonfirmasi atau dibayar)
  if (['menunggu_bayar', 'dibayar', 'selesai'].includes(b.status)) {
    const textMsg = encodeURIComponent(`Halo RentalKu / Mitra (${b.partner_name}), saya penyewa unit ${b.vehicle_brand} ${b.vehicle_name} dengan kode pesanan ${b.code}.`);
    const waUrl = `https://wa.me/6281310214043?text=${textMsg}`;
    a.push(`<a class="btn light sm" href="${waUrl}" target="_blank" rel="noopener">💬 Chat WhatsApp</a>`);
  }

  return a.join(' ');
}

function note(b) {
  if (b.status === 'menunggu_mitra') {
    return '<div class="muted" style="margin-top:8px;">⏳ Menunggu mitra mengonfirmasi kesiapan armada kendaraan Anda.</div>';
  }
  if (b.status === 'menunggu_bayar') {
    const gagal = b.payment_status === 'gagal' ? '<div style="color:var(--danger); margin-bottom:6px;">⚠️ Pembayaran sebelumnya gagal. Silakan klik Bayar Sekarang untuk mencoba lagi.</div>' : '';
    const pending = b.payment_status === 'pending' ? '<div style="color:var(--warn); margin-bottom:6px;">⌛ Pembayaran sedang diproses di Payment Gateway...</div>' : '';
    return `
      ${gagal}${pending}
      <div class="countdown-box" data-expire="${b.expires_at}">
        ⏱️ Batas Pembayaran: <span class="timer-text">${fmtDateTime(b.expires_at)}</span>
      </div>`;
  }
  if (['dibatalkan', 'ditolak'].includes(b.status)) {
    return `<div class="muted" style="margin-top:6px;">Alasan: ${esc(b.cancel_reason || 'Tidak ada alasan khusus')}</div>`;
  }
  return '';
}

async function load() {
  try {
    const data = await api('/bookings/mine');
    const el = document.getElementById('list');
    if (!data.length) {
      el.innerHTML = `
        <div class="card empty" style="padding:48px 20px;">
          <div style="font-size:3rem; margin-bottom:12px;">🚗</div>
          <h3>Belum ada riwayat pesanan</h3>
          <p class="muted">Armada nyaman siap menemani perjalanan Anda kapan pun.</p>
          <a href="/" class="btn ok" style="margin-top:8px;">Jelajahi Katalog &rarr;</a>
        </div>`;
      return;
    }

    el.innerHTML = data.map((b) => {
      const driverBadge = b.driver_option === 'sopir'
        ? '<span class="badge b-blue" style="margin-left:6px;">+ Sopir</span>'
        : '<span class="badge b-gray" style="margin-left:6px;">Lepas Kunci</span>';

      return `
        <div class="card booking-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <span class="muted" style="font-size:0.85rem;">Kode: <b>${esc(b.code)}</b> &middot; Dipesan ${fmtDate(b.created_at)}</span>
              <div>${badge(b.status)} ${badge(b.payment_status)}</div>
            </div>

            <h3 style="margin:10px 0 6px;">
              ${esc(b.vehicle_brand)} ${esc(b.vehicle_name)}
              <span class="muted" style="font-size:0.95rem; font-weight:normal;">(${esc(b.vehicle_plate)})</span>
              ${driverBadge}
            </h3>

            ${renderStepper(b)}

            <div style="font-size:0.92rem; color:#334155;">
              🗓️ <b>${fmtDate(b.start_date)} &rarr; ${fmtDate(b.end_date)}</b> (${b.days} hari sewa) &middot; Total: <b class="price" style="font-size:1.15rem;">${rupiah(b.total_price)}</b>
            </div>

            ${b.pickup_location ? `<div class="muted" style="font-size:0.84rem; margin-top:4px;">📍 Lokasi Antar/Jemput: <b>${esc(b.pickup_location)}</b></div>` : ''}
            
            ${note(b)}
          </div>

          <div class="actions" style="flex-direction:column; align-items:stretch; min-width:180px;">
            ${actions(b)}
          </div>
        </div>`;
    }).join('');

    startLiveCountdown();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function startLiveCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    document.querySelectorAll('.countdown-box[data-expire]').forEach((box) => {
      const expStr = box.getAttribute('data-expire');
      if (!expStr) return;
      const target = new Date(expStr).getTime();
      const now = Date.now();
      const diff = target - now;
      const timerSpan = box.querySelector('.timer-text');
      if (timerSpan) {
        if (diff <= 0) {
          timerSpan.textContent = 'Batas Waktu Habis';
        } else {
          timerSpan.textContent = formatTimeRemaining(diff);
        }
      }
    });
  }, 1000);
}

async function cancelBooking(id) {
  const confirmed = await confirmModal(
    'Batalkan Pesanan',
    'Apakah Anda yakin ingin membatalkan pesanan ini? Unit akan otomatis kembali tersedia untuk pelanggan lain.',
    'Ya, Batalkan',
    true
  );
  if (!confirmed) return;

  try {
    await api(`/bookings/${id}/cancel`, { method: 'PATCH' });
    toast('Pesanan berhasil dibatalkan', 'success');
    load();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---------- Pembayaran ----------
async function pay(id) {
  try {
    const r = await api(`/payments/${id}/pay`, { method: 'POST', body: {} });
    if (r.mode === 'simulasi') { simulateModal(id); return; }
    await loadSnap();
    window.snap.pay(r.token, {
      onSuccess: () => { toast('Pembayaran berhasil!', 'success'); syncStatus(id); },
      onPending: () => { toast('Menunggu pembayaran diselesaikan...', ''); syncStatus(id, true); },
      onError: () => { toast('Pembayaran gagal', 'error'); syncStatus(id); },
      onClose: () => { syncStatus(id); },
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function syncStatus(id, poll = false) {
  clearInterval(pollTimer);
  const check = async () => {
    try {
      const s = await api(`/payments/${id}/status`);
      await load();
      if (s.payment_status === 'lunas' || s.payment_status === 'gagal') clearInterval(pollTimer);
    } catch { /* abaikan */ }
  };
  await check();
  if (poll) pollTimer = setInterval(check, 5000);
}

// ---------- Mode simulasi (tanpa akun Midtrans) ----------
function simulateModal(id) {
  openModal(`
    <h3>Payment Gateway (Mode Simulasi)</h3>
    <div class="alert info">Ini adalah simulasi interaktif untuk pengujian / presentasi demo. Anda dapat mencoba alur pembayaran sukses maupun gagal.</div>
    <div class="field">
      <label for="simMethod">Metode Pembayaran</label>
      <select id="simMethod">
        <option>QRIS Instant</option>
        <option>Virtual Account BCA</option>
        <option>Virtual Account BNI</option>
        <option>Virtual Account Mandiri</option>
      </select>
    </div>
    <p style="font-weight:600; margin-bottom:8px;">Pilih Hasil Pembayaran:</p>
    <div class="actions" style="margin-bottom:14px;">
      <button class="btn ok" onclick="simulate(${id},'lunas')">✓ Bayar Berhasil (Lunas)</button>
      <button class="btn warn" onclick="simulate(${id},'pending')">⏳ Pending</button>
      <button class="btn danger" onclick="simulate(${id},'gagal')">✕ Simulasi Gagal</button>
    </div>
    <div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Tutup</button></div>`);
}

async function simulate(id, result) {
  try {
    await api(`/payments/${id}/simulate`, { method: 'POST', body: { result, method: document.getElementById('simMethod').value } });
    closeModal();
    toast(result === 'lunas' ? 'Pembayaran berhasil dikonfirmasi lunas!' : result === 'pending' ? 'Status pembayaran pending' : 'Pembayaran gagal', result === 'lunas' ? 'success' : result === 'gagal' ? 'error' : '');
    load();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Ulasan ----------
function reviewModal(id) {
  openModal(`
    <h3>Beri Ulasan Perjalanan</h3>
    <p class="muted">Bagikan pengalaman Anda menyewa armada ini untuk membantu calon penyewa lainnya.</p>
    <div class="field">
      <label for="rate">Rating Kepuasan</label>
      <select id="rate">
        <option value="5">★★★★★ - Sangat Puas (5 Bintang)</option>
        <option value="4">★★★★☆ - Puas (4 Bintang)</option>
        <option value="3">★★★☆☆ - Cukup (3 Bintang)</option>
        <option value="2">★★☆☆☆ - Kurang (2 Bintang)</option>
        <option value="1">★☆☆☆☆ - Buruk (1 Bintang)</option>
      </select>
    </div>
    <div class="field">
      <label for="comment">Ulasan / Pengalaman Anda</label>
      <textarea id="comment" rows="3" placeholder="Contoh: Unit bersih, AC sangat dingin, pemilik ramah dan responsif!" maxlength="500"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Batal</button>
      <button class="btn ok" onclick="sendReview(${id})">Kirim Ulasan</button>
    </div>`);
}

async function sendReview(id) {
  try {
    await api(`/bookings/${id}/review`, { method: 'POST', body: { rating: Number(document.getElementById('rate').value), comment: document.getElementById('comment').value } });
    closeModal();
    toast('Terima kasih atas ulasan berharga Anda!', 'success');
    load();
  } catch (e) { toast(e.message, 'error'); }
}

load();
setInterval(load, 30000);
