// ============================================================
// mitra-auth.js - Halaman login & registrasi Mitra Armada
// ============================================================
const params = new URLSearchParams(location.search);
const next = params.get('next');

initTabs();
if (params.get('tab') === 'register') {
  const regTab = document.querySelector('[data-tab="register"]');
  if (regTab) regTab.click();
}

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
  location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/mitra.html';
}

document.getElementById('mitraLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: {
        email: mEmail.value,
        password: mPass.value,
        required_role: 'mitra'
      }
    });
    setSession(r.token, r.user);
    toast('Login Mitra berhasil! Mengalihkan ke dashboard...', 'success');
    setTimeout(() => goAfterLogin(r.user), 400);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('mitraRegForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/register', {
      method: 'POST',
      body: {
        name: mrName.value,
        email: mrEmail.value,
        phone: mrPhone.value,
        password: mrPass.value,
        role: 'mitra',
        bank_name: mrBank.value,
        bank_account: mrRek.value
      },
    });
    setSession(r.token, r.user);
    toast('Pendaftaran Mitra berhasil! Menunggu verifikasi dari admin.', 'success');
    setTimeout(() => goAfterLogin(r.user), 900);
  } catch (err) {
    toast(err.message, 'error');
  }
});
