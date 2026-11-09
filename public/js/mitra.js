// ============================================================
// mitra.js - Dashboard mitra: CRUD kendaraan (dengan Upload Foto), pesanan masuk, saldo & payout
// ============================================================
if (!requireRole('mitra')) throw new Error('redirect');

let myVehicles = [];

function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
function openModal(html) {
  document.getElementById('modalRoot').innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}

async function loadStats() {
  const s = await api('/partner/summary');
  document.getElementById('stats').innerHTML = `
    <div class="stat highlight"><div class="label">Saldo Siap Ditarik</div><div class="value">${rupiah(s.available)}</div></div>
    <div class="stat"><div class="label">Menunggu Sewa Selesai</div><div class="value">${rupiah(s.pending)}</div></div>
    <div class="stat"><div class="label">Total Akumulasi Pendapatan</div><div class="value">${rupiah(s.total_earned)}</div></div>
    <div class="stat"><div class="label">Total Sudah Ditransfer</div><div class="value">${rupiah(s.paid_out)}</div></div>`;
}

// ---------- Kendaraan (CRUD) ----------
async function loadVehicles() {
  myVehicles = await api('/vehicles/mine');
  document.getElementById('vBody').innerHTML = myVehicles.length ? myVehicles.map((v) => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:48px; height:48px; border-radius:8px; background-size:cover; background-position:center; background-image:url('${esc(v.image_url || '')}'); background-color:#e2e8f0; flex-shrink:0;"></div>
          <div>
            <b>${esc(v.brand)} ${esc(v.name)}</b>
            <div class="muted" style="font-size:0.8rem;">${v.type === 'motor' ? '🏍️ Motor' : '🚗 Mobil'} &middot; ${esc(v.transmission || '-')} &middot; ${esc(v.year || '')}</div>
          </div>
        </div>
      </td>
      <td><b>${esc(v.plate)}</b></td>
      <td>${rupiah(v.price_per_day)}</td>
      <td>${badge(v.status === 'menunggu' ? 'menunggu' : v.status)}</td>
      <td><input type="checkbox" style="width:auto; cursor:pointer;" ${v.is_available ? 'checked' : ''} onchange="toggleAvail(${v.id}, this.checked)" ${v.status !== 'tayang' ? 'disabled' : ''}></td>
      <td>
        <div class="actions">
          <button class="btn sm" onclick="vehicleForm(${v.id})">Ubah</button>
          <button class="btn sm danger" onclick="delVehicle(${v.id})">Hapus</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">Belum ada kendaraan yang didaftarkan. Klik "+ Tambah Kendaraan" untuk mulai menyewakan.</td></tr>';
}

function vehicleForm(id) {
  const v = myVehicles.find((x) => x.id === id) || { type: 'mobil', transmission: 'Manual' };
  openModal(`
    <h3 style="margin-top:0;">${id ? 'Ubah' : 'Tambah'} Unit Kendaraan</h3>
    <form id="vForm">
      <div class="row">
        <div class="field">
          <label>Jenis Kendaraan</label>
          <select id="fType">
            <option value="mobil" ${v.type === 'mobil' ? 'selected' : ''}>Mobil Penumpang</option>
            <option value="motor" ${v.type === 'motor' ? 'selected' : ''}>Sepeda Motor</option>
          </select>
        </div>
        <div class="field">
          <label>Transmisi</label>
          <select id="fTrans">
            <option ${v.transmission === 'Manual' ? 'selected' : ''}>Manual</option>
            <option ${v.transmission === 'Otomatis' ? 'selected' : ''}>Otomatis</option>
          </select>
        </div>
      </div>

      <div class="row">
        <div class="field"><label>Merek Kendaraan</label><input id="fBrand" required value="${esc(v.brand || '')}" placeholder="Contoh: Toyota, Honda"></div>
        <div class="field"><label>Model / Nama Unit</label><input id="fName" required value="${esc(v.name || '')}" placeholder="Contoh: Avanza 1.3 G"></div>
      </div>

      <div class="row">
        <div class="field"><label>Nomor Plat Polisi</label><input id="fPlate" required value="${esc(v.plate || '')}" placeholder="Contoh: B 1234 ABC"></div>
        <div class="field"><label>Tahun Perakitan</label><input type="number" id="fYear" min="1990" max="2100" value="${esc(v.year || '')}" placeholder="2022"></div>
      </div>

      <div class="row">
        <div class="field"><label>Kapasitas Kursi</label><input type="number" id="fSeats" min="1" max="60" value="${esc(v.seats || '')}" placeholder="Contoh: 7"></div>
        <div class="field"><label>Tarif Sewa / Hari (Rp)</label><input type="number" id="fPrice" required min="10000" step="1000" value="${esc(v.price_per_day || '')}" placeholder="Contoh: 350000"></div>
      </div>

      <div class="field">
        <label>Foto Kendaraan</label>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="file" id="fFileInput" accept="image/*" style="display:none;" onchange="handleFileUpload(event)">
          <button type="button" class="btn light sm" onclick="document.getElementById('fFileInput').click()">📁 Pilih File Foto</button>
          <span class="muted" style="font-size:0.8rem;" id="uploadStatus">Atau masukkan link gambar di bawah:</span>
        </div>
        <input id="fImg" style="margin-top:8px;" value="${esc(v.image_url || '')}" placeholder="https://... atau hasil unggah file" oninput="previewImage(this.value)">
        <div id="imgPreviewWrap" style="margin-top:8px; display:${v.image_url ? 'block' : 'none'};">
          <img id="imgPreview" src="${esc(v.image_url || '')}" style="width:100%; max-height:160px; object-fit:cover; border-radius:8px; border:1px solid var(--border);">
        </div>
      </div>

      <div class="field"><label>Deskripsi &amp; Kondisi Unit</label><textarea id="fDesc" rows="3" placeholder="Jelaskan fasilitas: AC, bensin irit, kondisi ban, audio bluetooth, dll.">${esc(v.description || '')}</textarea></div>
      
      ${id ? '' : '<div class="alert info" style="margin-bottom:14px;">ℹ️ Unit kendaraan baru akan tayang di katalog publik setelah diverifikasi oleh Admin.</div>'}
      
      <div class="modal-actions">
        <button type="button" class="btn ghost" onclick="closeModal()">Batal</button>
        <button class="btn ok" type="submit">Simpan Kendaraan</button>
      </div>
    </form>`);

  document.getElementById('vForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      type: fType.value, transmission: fTrans.value, brand: fBrand.value, name: fName.value, plate: fPlate.value,
      year: fYear.value, seats: fSeats.value, price_per_day: Number(fPrice.value), image_url: fImg.value, description: fDesc.value,
    };
    try {
      await api(id ? `/vehicles/${id}` : '/vehicles', { method: id ? 'PUT' : 'POST', body });
      closeModal(); toast('Unit kendaraan berhasil disimpan', 'success'); loadVehicles();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function previewImage(url) {
  const wrap = document.getElementById('imgPreviewWrap');
  const img = document.getElementById('imgPreview');
  if (url && url.trim()) {
    img.src = url;
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('uploadStatus');
  statusEl.textContent = 'Mengunggah foto...';

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api('/uploads/vehicle-image', {
        method: 'POST',
        body: { data: reader.result, filename: file.name },
      });
      document.getElementById('fImg').value = res.url;
      previewImage(res.url);
      statusEl.textContent = '✓ Foto berhasil diunggah!';
      toast('Foto kendaraan berhasil diunggah', 'success');
    } catch (err) {
      statusEl.textContent = 'Gagal unggah foto';
      toast(err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function delVehicle(id) {
  const confirmed = await confirmModal(
    'Hapus Kendaraan',
    'Yakin ingin menghapus unit kendaraan ini? Data tidak dapat dipulihkan jika sudah dihapus.',
    'Ya, Hapus',
    true
  );
  if (!confirmed) return;

  try {
    await api('/vehicles/' + id, { method: 'DELETE' });
    toast('Kendaraan berhasil dihapus', 'success');
    loadVehicles();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleAvail(id, on) {
  try {
    await api(`/vehicles/${id}/availability`, { method: 'PATCH', body: { is_available: on } });
    toast(on ? 'Unit aktif dan tersedia di katalog' : 'Unit dinonaktifkan sementara', 'success');
  } catch (e) {
    toast(e.message, 'error');
    loadVehicles();
  }
}

// ---------- Pesanan masuk ----------
async function loadOrders() {
  const rows = await api('/bookings/partner');
  document.getElementById('oBody').innerHTML = rows.length ? rows.map((b) => {
    let act = '';
    if (b.status === 'menunggu_mitra') {
      act = `<button class="btn sm ok" onclick="respond(${b.id},true)">Terima</button><button class="btn sm danger" onclick="respond(${b.id},false)">Tolak</button>`;
    }
    if (b.status === 'dibayar') {
      act = `<button class="btn sm" onclick="complete(${b.id})">Tandai Selesai</button>`;
    }

    const waMsg = encodeURIComponent(`Halo ${b.customer_name}, terima kasih telah menyewa unit ${b.vehicle_name} di RentalKu.`);
    const waButton = b.customer_phone
      ? `<a class="btn light sm" href="https://wa.me/${b.customer_phone.replace(/\D/g, '')}?text=${waMsg}" target="_blank" rel="noopener">💬 WhatsApp</a>`
      : '';

    const driverBadge = b.driver_option === 'sopir' ? '<span class="badge b-blue">+ Sopir</span>' : '<span class="badge b-gray">Lepas Kunci</span>';

    return `<tr>
      <td><b>${esc(b.code)}</b></td>
      <td>
        <b>${esc(b.customer_name)}</b>
        <div class="muted">${esc(b.customer_phone || '-')}</div>
        ${b.pickup_location ? `<div style="font-size:0.75rem; color:var(--primary); margin-top:2px;">📍 ${esc(b.pickup_location)}</div>` : ''}
      </td>
      <td>${esc(b.vehicle_name)} <div>${driverBadge}</div></td>
      <td>${fmtDate(b.start_date)} &rarr; ${fmtDate(b.end_date)}<div class="muted">${b.days} hari</div></td>
      <td>${rupiah(b.total_price)}</td>
      <td><b>${rupiah(b.partner_amount)}</b><div class="muted" style="font-size:0.75rem;">Platform ${b.commission_percent}%</div></td>
      <td>${badge(b.status)}<div style="margin-top:4px;">${badge(b.payment_status)}</div></td>
      <td><div class="actions">${act} ${waButton}</div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty">Belum ada pesanan masuk dari pelanggan.</td></tr>';
}

async function respond(id, accept) {
  try {
    await api(`/bookings/${id}/respond`, { method: 'PATCH', body: { accept } });
    toast(accept ? 'Pesanan diterima! Menunggu pelanggan menyelesaikan pembayaran.' : 'Pesanan ditolak', 'success');
    loadOrders();
  } catch (e) { toast(e.message, 'error'); }
}

async function complete(id) {
  const confirmed = await confirmModal(
    'Konfirmasi Selesai',
    'Pastikan unit kendaraan sudah dikembalikan oleh pelanggan dengan baik. Setelah diselesaikan, dana otomatis masuk ke saldo yang bisa ditarik.',
    'Konfirmasi Selesai',
    false
  );
  if (!confirmed) return;

  try {
    await api(`/bookings/${id}/complete`, { method: 'PATCH' });
    toast('Pesanan selesai! Saldo Anda telah diperbarui.', 'success');
    loadOrders();
    loadStats();
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Payout ----------
async function loadPayouts() {
  const rows = await api('/partner/payouts');
  const u = getUser();
  document.getElementById('bankInfo').textContent = u.bank_name ? `${u.bank_name} - ${u.bank_account}` : '(rekening belum diisi di profil)';
  document.getElementById('pBody').innerHTML = rows.length ? rows.map((p) => `
    <tr>
      <td>${fmtDateTime(p.created_at)}</td>
      <td><b>${rupiah(p.amount)}</b></td>
      <td>${badge(p.status === 'dibayar' ? 'dibayar_payout' : p.status)}</td>
      <td>${esc(p.note || '-')}</td>
    </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Belum ada riwayat pengajuan penarikan dana.</td></tr>';
}

async function requestPayout() {
  const amt = Number(document.getElementById('payAmount').value);
  if (!amt || amt < 10000) {
    toast('Jumlah penarikan minimal Rp 10.000', 'error');
    return;
  }

  try {
    await api('/partner/payouts', { method: 'POST', body: { amount: amt } });
    toast('Pengajuan penarikan dana berhasil dikirim ke Admin.', 'success');
    document.getElementById('payAmount').value = '';
    loadPayouts();
    loadStats();
  } catch (e) { toast(e.message, 'error'); }
}

async function refreshAll() {
  const u = getUser();
  if (u && u.status !== 'aktif') {
    document.getElementById('pendingAlert').innerHTML = '<div class="alert warn"><b>Akun Mitra Anda Sedang Dalam Proses Verifikasi.</b> Anda dapat mendaftarkan unit setelah Admin menyetujui akun Anda.</div>';
  } else {
    document.getElementById('pendingAlert').innerHTML = '';
  }
  try {
    await Promise.all([loadStats(), loadVehicles(), loadOrders(), loadPayouts()]);
  } catch (e) {
    toast(e.message, 'error');
  }
}

initTabs();
setTimeout(refreshAll, 300);
