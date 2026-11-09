// ============================================================
// api.js - Dipakai SEMUA halaman: panggil API, sesi login, navbar, util
// ============================================================
const TOKEN_KEY = 'rk_token';
const USER_KEY = 'rk_user';

const getToken = () => localStorage.getItem(TOKEN_KEY);
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
function logout() { clearSession(); location.href = '/'; }

// Panggil API. Contoh: await api('/vehicles') atau await api('/bookings', {method:'POST', body:{...}})
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (getToken()) headers.Authorization = 'Bearer ' + getToken();
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* bukan JSON */ }
  if (!res.ok) {
    if (res.status === 401 && getToken()) { clearSession(); }
    throw new Error((data && data.error) || 'Terjadi kesalahan (' + res.status + ')');
  }
  return data;
}

// Unduh file (PDF/Excel) yang butuh login
async function downloadFile(path, filename) {
  try {
    const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) {
      let msg = 'Gagal mengunduh file';
      try { msg = (await res.json()).error || msg; } catch { /* */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Util tampilan ----------
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtDate = (s) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const fmtDateTime = (s) => (s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
// Escape HTML agar input pengguna tidak bisa menyisipkan script (XSS)
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const addDaysISO = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// Custom Confirmation Modal pengganti window.confirm()
function confirmModal(title, message, confirmText = 'Ya, Lanjutkan', danger = false) {
  return new Promise((resolve) => {
    let root = document.getElementById('modalRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modalRoot';
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <div class="overlay" id="confirmOverlay">
        <div class="modal" style="max-width:420px; animation: fadeIn 0.2s ease;">
          <h3 style="margin-top:0">${esc(title)}</h3>
          <p style="color:var(--muted); margin: 12px 0 20px;">${esc(message)}</p>
          <div class="modal-actions">
            <button class="btn ghost" id="btnCancelModal">Batal</button>
            <button class="btn ${danger ? 'danger' : 'ok'}" id="btnConfirmModal">${esc(confirmText)}</button>
          </div>
        </div>
      </div>
    `;
    const cleanup = (res) => {
      root.innerHTML = '';
      resolve(res);
    };
    document.getElementById('btnCancelModal').onclick = () => cleanup(false);
    document.getElementById('btnConfirmModal').onclick = () => cleanup(true);
    document.getElementById('confirmOverlay').onclick = (e) => { if (e.target.id === 'confirmOverlay') cleanup(false); };
  });
}

function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

const STATUS_LABEL = {
  menunggu_mitra: ['Menunggu konfirmasi mitra', 'b-yellow'], menunggu_bayar: ['Menunggu pembayaran', 'b-blue'],
  dibayar: ['Dibayar', 'b-green'], selesai: ['Selesai', 'b-green'], dibatalkan: ['Dibatalkan', 'b-red'], ditolak: ['Ditolak', 'b-red'],
  belum: ['Belum bayar', 'b-gray'], pending: ['Pending', 'b-yellow'], lunas: ['Lunas', 'b-green'], gagal: ['Gagal', 'b-red'],
  aktif: ['Aktif', 'b-green'], menunggu: ['Menunggu verifikasi', 'b-yellow'], nonaktif: ['Nonaktif', 'b-gray'],
  tayang: ['Tayang', 'b-green'], diajukan: ['Diajukan', 'b-yellow'], dibayar_payout: ['Dibayar', 'b-green'],
};
function badge(key) {
  const [label, cls] = STATUS_LABEL[key] || [key, 'b-gray'];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

// ---------- Navbar ----------
let APP_CONFIG = { appName: 'RentalKu', paymentMode: 'simulasi' };
async function loadConfig() {
  try { APP_CONFIG = await api('/config'); } catch { /* pakai default */ }
  return APP_CONFIG;
}

function renderNav() {
  const el = document.getElementById('nav');
  if (!el) return;
  const u = getUser();
  const page = location.pathname.split('/').pop() || 'index.html';
  const link = (href, text, icon) => `
    <a class="link ${page === href ? 'active' : ''}" href="/${href}">
      <span>${icon}</span> <span>${text}</span>
    </a>`;

  let links = link('index.html', 'Katalog Armada', '🚗');
  if (u && u.role === 'pelanggan') links += link('bookings.html', 'Pesanan Saya', '📋');
  if (u && u.role === 'mitra') links += link('mitra.html', 'Dashboard Mitra', '🏢');
  if (u && u.role === 'admin') links += link('admin.html', 'Dashboard Admin', '⚙️');

  const right = u
    ? `
      <div class="nav-user-pill">
        <div class="nav-user-avatar">${esc(u.name.charAt(0).toUpperCase())}</div>
        <div style="font-size:0.88rem; line-height:1.2;">
          <div style="font-weight:700;">${esc(u.name.split(' ')[0])}</div>
          <div class="muted" style="font-size:0.75rem; text-transform:capitalize;">${esc(u.role)}</div>
        </div>
      </div>
      <button class="btn sm ghost" onclick="logout()" style="border-radius:20px; padding:6px 14px;">Keluar</button>`
    : `
      <a class="btn sm ok" href="/login.html" style="border-radius:20px; padding:8px 18px; font-weight:700;">
        Masuk / Daftar &rarr;
      </a>`;

  el.innerHTML = `
    <nav class="nav">
      <div class="nav-inner">
        <a class="brand" href="/">
          <div class="brand-logo-icon">🚗</div>
          <span>Rental<span style="color:var(--primary-accent)">Ku</span></span>
        </a>
        <div class="nav-links">${links}</div>
        <div class="nav-user">${right}</div>
      </div>
    </nav>`;
}

// Paksa login & role tertentu untuk halaman dashboard
function requireRole(...roles) {
  const u = getUser();
  if (!u || !getToken()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return false; }
  if (roles.length && !roles.includes(u.role)) { location.href = '/'; return false; }
  return true;
}

// Tab sederhana: tombol .tab-btn[data-tab="x"] menampilkan panel #tab-x
function initTabs(onChange) {
  const btns = document.querySelectorAll('.tab-btn');
  const show = (name) => {
    btns.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + name));
    if (onChange) onChange(name);
  };
  btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show(btns[0].dataset.tab);
  return show;
}

function vehicleImg(v) {
  const emoji = v.type === 'motor' ? '🏍️' : '🚗';
  const typeBadge = `<span class="vimg-badge">${v.type === 'motor' ? 'Motor' : 'Mobil'}</span>`;
  const ratingBadge = v.rating
    ? `<span class="vimg-rating"><span class="stars">★</span> ${v.rating} <small style="color:var(--muted)">(${v.review_count})</small></span>`
    : '';

  // Tambahkan query parameter timestamp cache buster agar browser selalu memuat file terbaru
  let imgUrl = v.image_url;
  if (imgUrl && !imgUrl.startsWith('data:') && !imgUrl.includes('?')) {
    imgUrl += '?v=' + Date.now();
  }

  if (v.image_url) {
    return `
      <div class="vimg-wrap">
        <img class="vimg" src="${esc(imgUrl)}" alt="${esc(v.name)}" style="object-fit:cover;" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=600&q=80';">
        ${typeBadge}
        ${ratingBadge}
      </div>`;
  }
  return `
    <div class="vimg-wrap">
      <div class="vimg" style="background: linear-gradient(135deg, #e2e8f0, #cbd5e1);">${emoji}</div>
      ${typeBadge}
      ${ratingBadge}
    </div>`;
}

// Tombol Floating WhatsApp CS
function renderFloatingWhatsApp() {
  if (document.getElementById('floatingWaBtn')) return;
  const a = document.createElement('a');
  a.id = 'floatingWaBtn';
  a.href = `https://wa.me/6281310214043?text=${encodeURIComponent('Halo CS RentalKu, saya ingin bertanya seputar rental mobil dan motor.')}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.title = 'Hubungi Layanan Pelanggan via WhatsApp';
  a.innerHTML = `
    <div class="floating-wa">
      <span style="font-size:1.45rem;">💬</span>
      <span class="floating-wa-label">Chat WhatsApp</span>
    </div>
  `;
  document.body.appendChild(a);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  renderNav();
  renderFloatingWhatsApp();
  // Perbarui data user (status mitra bisa berubah setelah diverifikasi admin)
  if (getToken()) {
    try { const r = await api('/auth/me'); setSession(getToken(), r.user); renderNav(); } catch { renderNav(); }
  }
});
