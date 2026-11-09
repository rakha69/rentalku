// ============================================================
// auth.js - Halaman login & registrasi
// ============================================================
const params = new URLSearchParams(location.search);
const next = params.get('next');

initTabs();
if (params.get('tab') === 'register') document.querySelector('[data-tab="register"]').click();

// Toggle intip / sembunyikan password (fitur mata)
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  btn.textContent = isPass ? '🙈' : '👁️';
}

function goAfterLogin(user) {
  if (user.role === 'admin') return (location.href = '/admin.html');
  if (user.role === 'mitra') return (location.href = '/mitra.html');
  // hanya izinkan redirect ke path internal
  location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/login', { method: 'POST', body: { email: lEmail.value, password: lPass.value } });
    setSession(r.token, r.user);
    goAfterLogin(r.user);
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('rRole').addEventListener('change', (e) => {
  document.getElementById('mitraFields').classList.toggle('hidden', e.target.value !== 'mitra');
});

document.getElementById('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const role = rRole.value;
    const r = await api('/auth/register', {
      method: 'POST',
      body: { name: rName.value, email: rEmail.value, phone: rPhone.value, password: rPass.value, role, bank_name: rBank.value, bank_account: rRek.value },
    });
    setSession(r.token, r.user);
    toast(role === 'mitra' ? 'Pendaftaran berhasil. Menunggu verifikasi admin.' : 'Pendaftaran berhasil!', 'success');
    setTimeout(() => goAfterLogin(r.user), 700);
  } catch (err) { toast(err.message, 'error'); }
});
