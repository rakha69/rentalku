// ============================================================
// vehicle.js - Detail kendaraan + form booking + hitung harga langsung + opsi sopir/lepas kunci
// ============================================================
const qs = new URLSearchParams(location.search);
const vid = qs.get('id');
let vehicle = null;
let quote = null;

function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

async function init() {
  try {
    vehicle = await api('/vehicles/' + encodeURIComponent(vid));
  } catch (e) {
    document.getElementById('content').innerHTML = `
      <div class="empty card" style="padding:40px;">
        <h3>Kendaraan tidak ditemukan</h3>
        <p class="muted">${esc(e.message)}</p>
        <a href="/" class="btn ghost sm">Kembali ke Katalog</a>
      </div>`;
    return;
  }
  const v = vehicle;
  const reviews = v.reviews.length
    ? v.reviews.map((r) => `
        <div class="review">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <b>${esc(r.customer_name)}</b>
            <span class="muted" style="font-size:0.8rem;">${fmtDate(r.created_at)}</span>
          </div>
          <div class="stars" style="margin:2px 0 6px;">${stars(r.rating)}</div>
          <div style="font-size:0.92rem; color:#334155;">${esc(r.comment || 'Penyewa tidak menyertakan catatan.')}</div>
        </div>`).join('')
    : '<div class="muted" style="padding:16px 0;">Belum ada ulasan untuk unit ini. Jadilah penyewa pertama!</div>';

  const bookedTags = v.booked.length
    ? `<div class="alert warn" style="margin-top:14px;">
         <b>⚠️ Jadwal Sudah Terpesan:</b>
         <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
           ${v.booked.map((b) => `<span class="badge b-yellow">${fmtDate(b.start_date)} s/d ${fmtDate(b.end_date)}</span>`).join('')}
         </div>
       </div>`
    : '';

  const isCar = v.type === 'mobil';

  document.getElementById('content').innerHTML = `
    <div class="detail">
      <div>
        ${vehicleImg(v)}
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:20px; flex-wrap:wrap; gap:12px;">
          <div>
            <h1 style="margin-bottom:4px;">${esc(v.brand)} ${esc(v.name)}</h1>
            <div class="muted">Plat Nomor: <b>${esc(v.plate)}</b> &middot; Disediakan oleh mitra: <b>${esc(v.owner_name)}</b></div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <div class="price" style="font-size:1.6rem; text-align:right;">
              ${rupiah(v.price_per_day)} <br><small style="font-size:0.85rem;">/ hari</small>
            </div>
            <a class="btn sm light" href="https://wa.me/6281310214043?text=${encodeURIComponent(`Halo RentalKu, saya ingin bertanya tentang ketersediaan unit ${v.brand} ${v.name} (${v.plate}).`)}" target="_blank" rel="noopener" style="border-radius:20px; padding:6px 14px; font-weight:600;">
              💬 Tanya via WhatsApp
            </a>
          </div>
        </div>

        <div class="tags" style="margin:16px 0 20px;">
          <span class="tag" style="padding:6px 12px; font-size:0.85rem;">🚘 ${v.type === 'motor' ? 'Sepeda Motor' : 'Mobil Penumpang'}</span>
          ${v.transmission ? `<span class="tag" style="padding:6px 12px; font-size:0.85rem;">🕹️ Transmisi ${esc(v.transmission)}</span>` : ''}
          ${v.seats ? `<span class="tag" style="padding:6px 12px; font-size:0.85rem;">👥 Kapasitas ${esc(v.seats)} Kursi</span>` : ''}
          ${v.year ? `<span class="tag" style="padding:6px 12px; font-size:0.85rem;">📅 Tahun ${esc(v.year)}</span>` : ''}
        </div>

        <div class="card" style="margin-bottom:24px;">
          <h3 style="margin-top:0;">Deskripsi &amp; Fasilitas Unit</h3>
          <p style="color:#334155; line-height:1.6; margin-bottom:0;">${esc(v.description || 'Unit dalam kondisi prima, selalu diservis berkala, AC dingin, dan siap jalan jarak dekat maupun jarak jauh.')}</p>
        </div>

        <div class="card">
          <h3 style="margin-top:0; display:flex; justify-content:space-between; align-items:center;">
            <span>Ulasan Pelanggan</span>
            ${v.rating ? `<span style="font-size:0.95rem; font-weight:600;"><span class="stars">★</span> ${v.rating} (${v.review_count} ulasan)</span>` : ''}
          </h3>
          ${reviews}
        </div>
      </div>

      <div>
        <div class="card" style="position:sticky; top:88px; box-shadow:var(--shadow-lg);">
          <h3 style="margin-top:0; border-bottom:1.5px solid var(--border); padding-bottom:12px;">Formulir Pemesanan</h3>
          ${bookedTags}

          <div class="row" style="margin-top:14px;">
            <div class="field">
              <label for="start">Tanggal Mulai</label>
              <input type="date" id="start">
            </div>
            <div class="field">
              <label for="end">Tanggal Selesai</label>
              <input type="date" id="end">
            </div>
          </div>

          ${isCar ? `
            <div class="field">
              <label>Pilihan Layanan</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <label style="border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px; cursor:pointer; display:flex; align-items:center; gap:8px;" id="lblLepasKunci">
                  <input type="radio" name="driverOpt" value="lepas_kunci" checked style="width:auto; margin:0;">
                  <div>
                    <div style="font-weight:700; font-size:0.88rem;">Lepas Kunci</div>
                    <div class="muted" style="font-size:0.75rem;">Kemudikan sendiri</div>
                  </div>
                </label>
                <label style="border:1.5px solid var(--border); border-radius:var(--radius-sm); padding:10px; cursor:pointer; display:flex; align-items:center; gap:8px;" id="lblSopir">
                  <input type="radio" name="driverOpt" value="sopir" style="width:auto; margin:0;">
                  <div>
                    <div style="font-weight:700; font-size:0.88rem;">+ Sopir</div>
                    <div class="muted" style="font-size:0.75rem;">+Rp 150.000 / hari</div>
                  </div>
                </label>
              </div>
            </div>
          ` : ''}

          <div class="field">
            <label for="pickupLoc">Lokasi Penjemputan / Serah Terima Unit</label>
            <input id="pickupLoc" placeholder="Contoh: Bandara, Stasiun, Hotel, atau Alamat Rumah">
          </div>

          <div class="row">
            <div class="field">
              <label for="idCard">Nomor KTP (NIK) <small class="muted">(Opsional)</small></label>
              <input id="idCard" placeholder="16 digit NIK" maxlength="16">
            </div>
            <div class="field">
              <label for="driverLicense">Nomor SIM ${isCar ? 'A' : 'C'} <small class="muted">(Opsional)</small></label>
              <input id="driverLicense" placeholder="Nomor SIM aktif">
            </div>
          </div>

          <div class="field">
            <label for="notes">Catatan Tambahan (Opsional)</label>
            <textarea id="notes" rows="2" placeholder="Tujuan perjalanan, permintaan khusus, dll."></textarea>
          </div>

          <div id="quoteBox" class="quote-box muted">Pilih tanggal sewa untuk menghitung total biaya otomatis.</div>

          <button class="btn ok block" id="bookBtn" disabled style="padding:12px; font-size:1rem;">Lanjut Pesan Sekarang &rarr;</button>
          
          <div style="margin-top:12px; font-size:0.8rem; color:var(--muted); text-align:center;">
            🔒 Bebas biaya pembatalan sebelum mitra mengonfirmasi pesanan.
          </div>
        </div>
      </div>
    </div>`;

  const startEl = document.getElementById('start');
  const endEl = document.getElementById('end');
  startEl.min = todayISO();
  endEl.min = addDaysISO(todayISO(), 1);
  if (qs.get('start')) startEl.value = qs.get('start');
  if (qs.get('end')) endEl.value = qs.get('end');

  startEl.addEventListener('change', () => {
    if (startEl.value) {
      endEl.min = addDaysISO(startEl.value, 1);
      if (!endEl.value || endEl.value <= startEl.value) endEl.value = addDaysISO(startEl.value, 1);
    }
    updateQuote();
  });
  endEl.addEventListener('change', updateQuote);

  document.querySelectorAll('input[name="driverOpt"]').forEach((el) => {
    el.addEventListener('change', updateQuote);
  });

  document.getElementById('bookBtn').addEventListener('click', book);
  updateQuote();
}

function getSelectedDriverOption() {
  const el = document.querySelector('input[name="driverOpt"]:checked');
  return el ? el.value : 'lepas_kunci';
}

async function updateQuote() {
  const s = document.getElementById('start').value;
  const e = document.getElementById('end').value;
  const box = document.getElementById('quoteBox');
  const btn = document.getElementById('bookBtn');
  const driverOpt = getSelectedDriverOption();

  quote = null;
  btn.disabled = true;

  if (!s || !e) {
    box.className = 'quote-box muted';
    box.textContent = 'Pilih tanggal sewa untuk menghitung total biaya otomatis.';
    return;
  }

  try {
    quote = await api(`/bookings/quote?vehicle_id=${vehicle.id}&start=${s}&end=${e}&driver_option=${driverOpt}`);
    if (!quote.available) {
      box.className = 'quote-box';
      box.innerHTML = '<span style="color:var(--danger); font-weight:700;">⚠️ Maaf, kendaraan sudah terpesan pada tanggal ini. Silakan pilih tanggal lain.</span>';
      return;
    }

    let breakdown = `<div>${quote.days} hari sewa unit &times; ${rupiah(quote.price_per_day)} = <b>${rupiah(quote.base_price)}</b></div>`;
    if (quote.driver_option === 'sopir' && quote.total_driver_fee > 0) {
      breakdown += `<div style="color:var(--primary); font-size:0.85rem; margin-top:4px;">+ Jasa Sopir (${quote.days} hari &times; ${rupiah(quote.driver_daily_fee)}) = <b>${rupiah(quote.total_driver_fee)}</b></div>`;
    }

    box.className = 'quote-box';
    box.innerHTML = `
      ${breakdown}
      <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:600;">Total Biaya:</span>
        <span class="total">${rupiah(quote.total_price)}</span>
      </div>`;
    btn.disabled = false;
  } catch (err) {
    box.className = 'quote-box';
    box.innerHTML = `<span style="color:var(--danger)">${esc(err.message)}</span>`;
  }
}

async function book() {
  const u = getUser();
  if (!u) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    return;
  }
  if (u.role !== 'pelanggan') {
    toast('Hanya akun pelanggan yang dapat melakukan pemesanan kendaraan.', 'error');
    return;
  }

  const s = document.getElementById('start').value;
  const e = document.getElementById('end').value;
  const pickup = document.getElementById('pickupLoc').value.trim();
  const idCard = document.getElementById('idCard').value.trim();
  const license = document.getElementById('driverLicense').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const driverOpt = getSelectedDriverOption();

  if (!pickup) {
    toast('Mohon isi lokasi penjemputan atau serah terima unit', 'error');
    document.getElementById('pickupLoc').focus();
    return;
  }

  const btn = document.getElementById('bookBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses Pesanan...';

  try {
    const b = await api('/bookings', {
      method: 'POST',
      body: {
        vehicle_id: vehicle.id,
        start_date: s,
        end_date: e,
        driver_option: driverOpt,
        pickup_location: pickup,
        id_card_number: idCard,
        driver_license_number: license,
        notes: notes,
      },
    });
    toast('Pesanan berhasil dibuat: ' + b.code, 'success');
    setTimeout(() => (location.href = '/bookings.html'), 700);
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Lanjut Pesan Sekarang →';
  }
}

init();
