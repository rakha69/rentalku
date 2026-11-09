// ============================================================
// index.js - Halaman katalog: tampil & filter kendaraan
// ============================================================
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');
startEl.min = todayISO();
endEl.min = addDaysISO(todayISO(), 1);

startEl.addEventListener('change', () => {
  if (startEl.value) {
    endEl.min = addDaysISO(startEl.value, 1);
    if (!endEl.value || endEl.value <= startEl.value) endEl.value = addDaysISO(startEl.value, 1);
  }
});

function card(v) {
  const qs = startEl.value && endEl.value ? `&start=${startEl.value}&end=${endEl.value}` : '';
  return `
    <div class="card vcard">
      ${vehicleImg(v)}
      <div class="vbody">
        <div class="vtitle" title="${esc(v.brand)} ${esc(v.name)}">${esc(v.brand)} ${esc(v.name)}</div>
        <div class="tags">
          ${v.transmission ? `<span class="tag">🕹️ ${esc(v.transmission)}</span>` : ''}
          ${v.seats ? `<span class="tag">👥 ${esc(v.seats)} Kursi</span>` : ''}
          ${v.year ? `<span class="tag">📅 ${esc(v.year)}</span>` : ''}
        </div>
        <div class="muted" style="font-size:0.84rem; display:flex; align-items:center; gap:4px;">
          <span>👤 Mitra:</span> <b>${esc(v.owner_name)}</b>
        </div>
        <div style="margin-top:auto; padding-top:10px; border-top:1px dashed var(--border); display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <div class="muted" style="font-size:0.75rem;">Mulai dari</div>
            <div class="price">${rupiah(v.price_per_day)} <small>/ hari</small></div>
          </div>
          <a class="btn sm" href="/vehicle.html?id=${v.id}${qs}">Pilih Unit &rarr;</a>
        </div>
      </div>
    </div>`;
}

async function load() {
  const p = new URLSearchParams();
  const q = document.getElementById('q').value.trim();
  const type = document.getElementById('type').value;
  const transmission = document.getElementById('transmission').value;
  const seats = document.getElementById('seats').value;
  const sort = document.getElementById('sort').value;

  if (q) p.set('q', q);
  if (type) p.set('type', type);
  if (transmission) p.set('transmission', transmission);
  if (seats) p.set('seats', seats);
  if (sort) p.set('sort', sort);
  if (startEl.value && endEl.value) { p.set('start', startEl.value); p.set('end', endEl.value); }

  const list = document.getElementById('list');
  list.innerHTML = '<div class="empty" style="grid-column:1/-1">Memuat armada terbaik untuk Anda...</div>';

  try {
    const data = await api('/vehicles?' + p.toString());
    document.getElementById('resultTitle').textContent = `${data.length} Kendaraan Tersedia`;
    
    if (data.length) {
      list.innerHTML = data.map(card).join('');
    } else {
      list.innerHTML = `
        <div class="empty card" style="grid-column:1/-1; padding:40px 20px;">
          <div style="font-size:2.8rem; margin-bottom:12px;">🔍</div>
          <h3>Tidak ada kendaraan yang sesuai kriteria</h3>
          <p class="muted">Coba ubah kata kunci, transmisi, kapasitas kursi, atau pilih tanggal sewa yang lain.</p>
          <button class="btn ghost sm" onclick="resetFilter()" style="margin-top:8px;">Reset Semua Filter</button>
        </div>`;
    }
  } catch (e) {
    toast(e.message, 'error');
    list.innerHTML = `<div class="empty" style="grid-column:1/-1; color:var(--danger)">${esc(e.message)}</div>`;
  }
}

function resetFilter() {
  document.getElementById('q').value = '';
  document.getElementById('type').value = '';
  document.getElementById('transmission').value = '';
  document.getElementById('seats').value = '';
  document.getElementById('sort').value = '';
  startEl.value = '';
  endEl.value = '';
  load();
}

document.getElementById('filterForm').addEventListener('submit', (e) => {
  e.preventDefault();
  load();
});

document.getElementById('btnReset').addEventListener('click', resetFilter);
document.getElementById('sort').addEventListener('change', load);
document.getElementById('type').addEventListener('change', load);
document.getElementById('transmission').addEventListener('change', load);
document.getElementById('seats').addEventListener('change', load);

load();
