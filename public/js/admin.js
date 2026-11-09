// ============================================================
// admin.js - Dashboard admin: laporan keuangan, verifikasi mitra & kendaraan,
//            armada platform, pesanan/pembayaran, payout mitra, pelanggan, komisi
// ============================================================
if (!requireRole('admin')) throw new Error('redirect');

const $ = (id) => document.getElementById(id);
const state = { users: [], vehicles: [], bookings: [], payouts: [] };

function setCount(id, n) {
  const el = $(id);
  if (!el) return;
  el.textContent = n;
  el.classList.toggle('hidden', !n);
}

function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
function openModal(html) {
  document.getElementById('modalRoot').innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}

// ---------- Laporan keuangan ----------
function reportQuery() {
  const p = new URLSearchParams();
  if ($('rFrom').value) p.set('from', $('rFrom').value);
  if ($('rTo').value) p.set('to', $('rTo').value);
  const s = p.toString();
  return s ? '?' + s : '';
}

function presetReport(kind) {
  const today = todayISO();
  if (kind === 'all') { $('rFrom').value = ''; $('rTo').value = ''; }
  if (kind === '7') { $('rFrom').value = addDaysISO(today, -6); $('rTo').value = today; }
  if (kind === 'month') { $('rFrom').value = today.slice(0, 8) + '01'; $('rTo').value = today; }
  loadReport();
}

async function loadReport() {
  try {
    const r = await api('/reports/finance' + reportQuery());
    const s = r.summary;
    $('rStats').innerHTML = `
      <div class="stat highlight">
        <div class="label">Keuntungan Platform (Komisi)</div>
        <div class="value">${rupiah(s.commission)}</div>
      </div>
      <div class="stat">
        <div class="label">Total Transaksi Lunas</div>
        <div class="value">${s.transactions} Transaksi</div>
      </div>
      <div class="stat">
        <div class="label">Total Omset Kotor</div>
        <div class="value">${rupiah(s.gross)}</div>
      </div>
      <div class="stat">
        <div class="label">Hak Pendapatan Mitra</div>
        <div class="value">${rupiah(s.partner_share)}</div>
      </div>
      <div class="stat">
        <div class="label">Payout Berhasil Ditransfer</div>
        <div class="value">${rupiah(s.payouts_paid)}</div>
      </div>`;
    
    $('rBody').innerHTML = r.rows.length ? r.rows.map((x) => `
      <tr>
        <td>${fmtDateTime(x.paid_at)}</td>
        <td><b>${esc(x.code)}</b></td>
        <td>${esc(x.customer_name)}</td>
        <td>${esc(x.partner_name)}</td>
        <td>${esc(x.vehicle_name)}</td>
        <td>${esc(x.payment_method || '-')}</td>
        <td class="right">${rupiah(x.total_price)}</td>
        <td class="right" style="color:var(--primary); font-weight:700;">${rupiah(x.commission_amount)} <small class="muted">(${x.commission_percent}%)</small></td>
        <td class="right"><b>${rupiah(x.partner_amount)}</b></td>
      </tr>`).join('')
      : '<tr><td colspan="9" class="empty">Belum ada riwayat transaksi lunas pada rentang periode ini.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

function exportReport(kind) {
  const ext = kind === 'excel' ? 'xlsx' : 'pdf';
  downloadFile(`/reports/finance/export/${kind}${reportQuery()}`, `laporan-keuangan.${ext}`);
}

// ---------- Mitra ----------
function userActions(u) {
  const b = (st, label, cls) => `<button class="btn sm ${cls}" onclick="setUserStatus(${u.id},'${st}')">${label}</button>`;
  if (u.status === 'menunggu') return b('aktif', 'Setujui', 'ok') + b('ditolak', 'Tolak', 'danger');
  if (u.status === 'aktif') return b('nonaktif', 'Nonaktifkan', 'warn');
  return b('aktif', 'Aktifkan Kembali', 'ok');
}

function renderMitra() {
  const rows = state.users.filter((u) => u.role === 'mitra');
  setCount('cMitra', rows.filter((u) => u.status === 'menunggu').length);
  $('mBody').innerHTML = rows.length ? rows.map((u) => `
    <tr>
      <td><b>${esc(u.name)}</b></td>
      <td>
        ${esc(u.email)}
        <div class="muted">${esc(u.phone || '-')}</div>
      </td>
      <td>${esc(u.bank_name || '-')} <b>${esc(u.bank_account || '')}</b></td>
      <td>${fmtDate(u.created_at.replace(' ', 'T') + 'Z')}</td>
      <td>${badge(u.status)}</td>
      <td><div class="actions">${userActions(u)}</div></td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="empty">Belum ada data mitra yang terdaftar.</td></tr>';
}

function renderCustomers() {
  const rows = state.users.filter((u) => u.role === 'pelanggan');
  $('cBody').innerHTML = rows.length ? rows.map((u) => `
    <tr>
      <td><b>${esc(u.name)}</b></td>
      <td>${esc(u.email)}</td>
      <td>${esc(u.phone || '-')}</td>
      <td>${fmtDate(u.created_at.replace(' ', 'T') + 'Z')}</td>
      <td>${badge(u.status)}</td>
      <td><div class="actions">${u.status === 'aktif'
        ? `<button class="btn sm warn" onclick="setUserStatus(${u.id},'nonaktif')">Nonaktifkan</button>`
        : `<button class="btn sm ok" onclick="setUserStatus(${u.id},'aktif')">Aktifkan</button>`}</div></td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="empty">Belum ada pelanggan terdaftar.</td></tr>';
}

async function setUserStatus(id, status) {
  const msg = { aktif: 'Akun berhasil disetujui / diaktifkan', ditolak: 'Pendaftaran mitra ditolak', nonaktif: 'Akun berhasil dinonaktifkan' }[status];
  try {
    await api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } });
    toast(msg, 'success');
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Kendaraan Mitra & Verifikasi ----------
function renderVehicles() {
  const rows = state.vehicles.filter((v) => v.owner_role !== 'admin');
  setCount('cVehicles', rows.filter((v) => v.status === 'menunggu').length);
  $('vBody').innerHTML = rows.length ? rows.map((v) => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:48px; height:48px; border-radius:8px; background-size:cover; background-position:center; background-image:url('${esc(v.image_url || '')}'); background-color:#e2e8f0; flex-shrink:0;"></div>
          <div>
            <b>${esc(v.brand)} ${esc(v.name)}</b>
            <div class="muted" style="font-size:0.8rem;">${v.type === 'motor' ? '🏍️ Motor' : '🚗 Mobil'} &middot; ${esc(v.year || '')} &middot; ${esc(v.transmission || '')}</div>
          </div>
        </div>
      </td>
      <td><b>${esc(v.owner_name)}</b></td>
      <td>${esc(v.plate)}</td>
      <td>${rupiah(v.price_per_day)}</td>
      <td>${badge(v.status)}</td>
      <td>
        <div class="actions">
          ${v.status === 'menunggu'
            ? `<button class="btn sm ok" onclick="verifyVehicle(${v.id},'tayang')">Setujui</button><button class="btn sm danger" onclick="verifyVehicle(${v.id},'ditolak')">Tolak</button>`
            : v.status === 'tayang'
              ? `<button class="btn sm danger" onclick="verifyVehicle(${v.id},'ditolak')">Turunkan</button>`
              : `<button class="btn sm ok" onclick="verifyVehicle(${v.id},'tayang')">Tayangkan</button>`}
        </div>
      </td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="empty">Tidak ada unit kendaraan mitra.</td></tr>';
}

// ---------- Armada Milik Platform ----------
function renderPlatformFleet() {
  const rows = state.vehicles.filter((v) => v.owner_role === 'admin');
  $('pfBody').innerHTML = rows.length ? rows.map((v) => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:50px; height:50px; border-radius:8px; background-size:cover; background-position:center; background-image:url('${esc(v.image_url || '')}'); background-color:#e2e8f0; flex-shrink:0;"></div>
          <div>
            <b>${esc(v.brand)} ${esc(v.name)}</b>
            <div class="muted" style="font-size:0.8rem;">${v.type === 'motor' ? '🏍️ Motor' : '🚗 Mobil'} &middot; ${esc(v.transmission || '')} &middot; ${v.seats || 0} Kursi</div>
          </div>
        </div>
      </td>
      <td><b>${esc(v.plate)}</b></td>
      <td><b>${rupiah(v.price_per_day)}</b></td>
      <td><span class="badge b-green">Armada Platform (100%)</span></td>
      <td><input type="checkbox" style="width:auto; cursor:pointer;" ${v.is_available ? 'checked' : ''} onchange="togglePlatformAvail(${v.id}, this.checked)"></td>
      <td>
        <div class="actions">
          <button class="btn sm" onclick="adminAddVehicleForm(${v.id})">Ubah</button>
          <button class="btn sm danger" onclick="delVehicleAdmin(${v.id})">Hapus</button>
        </div>
      </td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="empty">Belum ada armada milik platform. Klik "+ Tambah Armada Platform" di atas.</td></tr>';
}

function adminAddVehicleForm(id) {
  const v = (id ? state.vehicles.find((x) => x.id === id) : null) || { type: 'mobil', transmission: 'Otomatis' };
  openModal(`
    <h3 style="margin-top:0;">${id ? 'Ubah' : 'Tambah'} Armada Platform</h3>
    <form id="afForm">
      <div class="row">
        <div class="field">
          <label>Jenis</label>
          <select id="afType">
            <option value="mobil" ${v.type === 'mobil' ? 'selected' : ''}>Mobil Penumpang</option>
            <option value="motor" ${v.type === 'motor' ? 'selected' : ''}>Sepeda Motor</option>
          </select>
        </div>
        <div class="field">
          <label>Transmisi</label>
          <select id="afTrans">
            <option ${v.transmission === 'Otomatis' ? 'selected' : ''}>Otomatis</option>
            <option ${v.transmission === 'Manual' ? 'selected' : ''}>Manual</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="field"><label>Merek</label><input id="afBrand" required value="${esc(v.brand || '')}" placeholder="Mitsubishi / Toyota"></div>
        <div class="field"><label>Model Unit</label><input id="afName" required value="${esc(v.name || '')}" placeholder="Pajero Sport Dakar"></div>
      </div>
      <div class="row">
        <div class="field"><label>Plat Nomor</label><input id="afPlate" required value="${esc(v.plate || '')}" placeholder="B 9999 ADM"></div>
        <div class="field"><label>Tahun</label><input type="number" id="afYear" value="${esc(v.year || '')}" placeholder="2023"></div>
      </div>
      <div class="row">
        <div class="field"><label>Kapasitas Kursi</label><input type="number" id="afSeats" value="${esc(v.seats || '')}" placeholder="7"></div>
        <div class="field"><label>Tarif Sewa / Hari (Rp)</label><input type="number" id="afPrice" required min="10000" step="1000" value="${esc(v.price_per_day || '')}" placeholder="900000"></div>
      </div>
      <div class="field">
        <label>Foto Kendaraan</label>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="file" id="afFileInput" accept="image/*" style="display:none;" onchange="handleAdminFileUpload(event)">
          <button type="button" class="btn light sm" onclick="document.getElementById('afFileInput').click()">📁 Pilih File Foto</button>
          <span class="muted" style="font-size:0.8rem;" id="afUploadStatus">Atau masukkan link gambar di bawah:</span>
        </div>
        <input id="afImg" style="margin-top:8px;" value="${esc(v.image_url || '')}" placeholder="https://... atau hasil unggah" oninput="previewAdminImg(this.value)">
        <div id="afPreviewWrap" style="margin-top:8px; display:${v.image_url ? 'block' : 'none'};">
          <img id="afPreview" src="${esc(v.image_url || '')}" style="width:100%; max-height:160px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">
        </div>
      </div>
      <div class="field"><label>Deskripsi Unit</label><textarea id="afDesc" rows="3">${esc(v.description || '')}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Batal</button>
        <button class="btn ok" type="submit">Simpan Armada</button>
      </div>
    </form>
  `);

  document.getElementById('afForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      type: afType.value, transmission: afTrans.value, brand: afBrand.value, name: afName.value, plate: afPlate.value,
      year: afYear.value, seats: afSeats.value, price_per_day: Number(afPrice.value), image_url: afImg.value, description: afDesc.value,
    };
    try {
      await api(id ? `/vehicles/${id}` : '/vehicles', { method: id ? 'PUT' : 'POST', body });
      closeModal();
      toast('Armada platform berhasil disimpan', 'success');
      loadVehicles();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function previewAdminImg(url) {
  const wrap = document.getElementById('afPreviewWrap');
  const img = document.getElementById('afPreview');
  if (url && url.trim()) {
    img.src = url;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

async function handleAdminFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('afUploadStatus');
  statusEl.textContent = 'Mengunggah foto...';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api('/uploads/vehicle-image', {
        method: 'POST',
        body: { data: reader.result, filename: file.name },
      });
      document.getElementById('afImg').value = res.url;
      previewAdminImg(res.url);
      statusEl.textContent = '✓ Foto berhasil diunggah!';
      toast('Foto berhasil diunggah', 'success');
    } catch (err) {
      statusEl.textContent = 'Gagal unggah foto';
      toast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function togglePlatformAvail(id, on) {
  try {
    await api(`/vehicles/${id}/availability`, { method: 'PATCH', body: { is_available: on } });
    toast(on ? 'Armada platform tersedia' : 'Armada dinonaktifkan', 'success');
  } catch (e) { toast(e.message, 'error'); loadVehicles(); }
}

async function delVehicleAdmin(id) {
  const confirmed = await confirmModal(
    'Hapus Armada Platform',
    'Apakah Anda yakin ingin menghapus unit kendaraan platform ini?',
    'Hapus Sekarang',
    true
  );
  if (!confirmed) return;
  try {
    await api('/vehicles/' + id, { method: 'DELETE' });
    toast('Armada platform dihapus', 'success');
    loadVehicles();
  } catch (e) { toast(e.message, 'error'); }
}

async function verifyVehicle(id, status) {
  try {
    await api(`/admin/vehicles/${id}/verify`, { method: 'PATCH', body: { status } });
    toast(status === 'tayang' ? 'Kendaraan berhasil disetujui & tayang di katalog' : 'Kendaraan ditolak / diturunkan', 'success');
    loadVehicles();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Pesanan & pembayaran ----------
function renderOrders() {
  const f = $('oFilter').value;
  const rows = state.bookings.filter((b) => !f || b.status === f);
  $('oBody').innerHTML = rows.length ? rows.map((b) => {
    let completeBtn = '';
    // Jika armada admin dan sudah dibayar, admin bisa selesaikan sewa
    if (b.owner_role === 'admin' && b.status === 'dibayar') {
      completeBtn = `<button class="btn sm ok" onclick="adminCompleteBooking(${b.id})">Tandai Selesai</button>`;
    }

    return `
      <tr>
        <td><b>${esc(b.code)}</b></td>
        <td>
          <b>${esc(b.customer_name)}</b>
          <div class="muted">${esc(b.customer_phone || '-')}</div>
        </td>
        <td>
          ${esc(b.vehicle_name)}
          <div class="muted">${esc(b.partner_name)}</div>
        </td>
        <td>${fmtDate(b.start_date)} &rarr; ${fmtDate(b.end_date)}<div class="muted">${b.days} hari</div></td>
        <td class="right">${rupiah(b.total_price)}</td>
        <td class="right"><b>${rupiah(b.commission_amount)}</b><div class="muted">${b.commission_percent}%</div></td>
        <td>${badge(b.status)}${b.cancel_reason ? `<div class="muted" style="font-size:0.75rem;">${esc(b.cancel_reason)}</div>` : ''}</td>
        <td>${badge(b.payment_status)}<div class="muted" style="font-size:0.75rem;">${esc(b.payment_method || '')}</div></td>
        <td><div class="actions">${completeBtn}</div></td>
      </tr>`;
  }).join('')
  : '<tr><td colspan="9" class="empty">Tidak ada riwayat pesanan yang sesuai filter.</td></tr>';
}

async function adminCompleteBooking(id) {
  const confirmed = await confirmModal('Selesaikan Sewa Armada', 'Konfirmasi bahwa armada platform sudah kembali dan sewa telah selesai?', 'Konfirmasi Selesai');
  if (!confirmed) return;
  try {
    await api(`/bookings/${id}/complete`, { method: 'PATCH' });
    toast('Pesanan armada platform selesai!', 'success');
    loadOrders();
    loadReport();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Payout ----------
function renderPayouts() {
  const rows = state.payouts;
  setCount('cPayouts', rows.filter((p) => p.status === 'diajukan').length);
  $('pBody').innerHTML = rows.length ? rows.map((p) => `
    <tr>
      <td>${fmtDateTime(p.created_at)}</td>
      <td><b>${esc(p.partner_name)}</b></td>
      <td>${esc(p.bank_name || '-')} <b>${esc(p.bank_account || '')}</b></td>
      <td class="right"><b style="font-size:1.05rem; color:var(--primary);">${rupiah(p.amount)}</b></td>
      <td>${badge(p.status === 'dibayar' ? 'dibayar_payout' : p.status)}${p.processed_at ? `<div class="muted" style="font-size:0.75rem;">${fmtDateTime(p.processed_at)}</div>` : ''}</td>
      <td>${esc(p.note || '-')}</td>
      <td>
        <div class="actions">
          ${p.status === 'diajukan'
            ? `<button class="btn sm ok" onclick="promptPayout(${p.id},'dibayar')">Tandai Dibayar</button><button class="btn sm danger" onclick="promptPayout(${p.id},'ditolak')">Tolak</button>`
            : ''}
        </div>
      </td>
    </tr>`).join('')
    : '<tr><td colspan="7" class="empty">Belum ada pengajuan payout saldo dari mitra.</td></tr>';
}

function promptPayout(id, status) {
  openModal(`
    <h3 style="margin-top:0;">${status === 'dibayar' ? 'Konfirmasi Payout Dibayar' : 'Tolak Payout Mitra'}</h3>
    <p class="muted">${status === 'dibayar' ? 'Masukkan nomor referensi transfer bank / catatan transaksi untuk mitra:' : 'Masukkan alasan penolakan pencairan dana:'}</p>
    <div class="field">
      <input id="payoutNoteInput" placeholder="${status === 'dibayar' ? 'Contoh: Ref BCA-89218291' : 'Contoh: Nomor rekening tidak cocok'}" required>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Batal</button>
      <button class="btn ${status === 'dibayar' ? 'ok' : 'danger'}" onclick="submitPayout(${id}, '${status}')">${status === 'dibayar' ? 'Simpan & Tandai Dibayar' : 'Tolak Payout'}</button>
    </div>
  `);
}

async function submitPayout(id, status) {
  const note = document.getElementById('payoutNoteInput').value.trim();
  try {
    await api(`/admin/payouts/${id}`, { method: 'PATCH', body: { status, note } });
    closeModal();
    toast(status === 'dibayar' ? 'Payout tercatat berhasil ditransfer' : 'Payout ditolak', 'success');
    loadPayouts();
    loadReport();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Pengaturan ----------
async function loadSettings() {
  const s = await api('/admin/settings');
  $('sComm').value = s.commission_percent;
}
$('setForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admin/settings', { method: 'PUT', body: { commission_percent: Number($('sComm').value) } });
    toast('Persentase komisi platform berhasil disimpan', 'success');
  } catch (err) { toast(err.message, 'error'); }
});

// ---------- Muat data ----------
async function loadUsers() { state.users = await api('/admin/users'); renderMitra(); renderCustomers(); }
async function loadVehicles() {
  state.vehicles = await api('/admin/vehicles');
  renderVehicles();
  renderPlatformFleet();
}
async function loadOrders() { state.bookings = await api('/admin/bookings'); renderOrders(); }
async function loadPayouts() { state.payouts = await api('/admin/payouts'); renderPayouts(); }

initTabs();
Promise.all([loadReport(), loadUsers(), loadVehicles(), loadOrders(), loadPayouts(), loadSettings()])
  .catch((e) => toast(e.message, 'error'));
