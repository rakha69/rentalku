// ============================================================
// auth.js - Halaman login & registrasi Pelanggan
// ============================================================
const params = new URLSearchParams(location.search);
const next = params.get('next');

initTabs();
if (params.get('tab') === 'register') {
  const regTab = document.querySelector('[data-tab="register"]');
  if (regTab) regTab.click();
}

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
  location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: {
        email: lEmail.value,
        password: lPass.value,
        required_role: 'pelanggan'
      }
    });
    setSession(r.token, r.user);
    toast('Login berhasil! Selamat datang, ' + r.user.name, 'success');
    setTimeout(() => goAfterLogin(r.user), 400);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/register', {
      method: 'POST',
      body: {
        name: rName.value,
        email: rEmail.value,
        phone: rPhone.value,
        password: rPass.value,
        role: 'pelanggan',
      },
    });
    setSession(r.token, r.user);
    toast('Pendaftaran akun berhasil! Selamat datang di RentalKu.', 'success');
    setTimeout(() => goAfterLogin(r.user), 700);
  } catch (err) {
    toast(err.message, 'error');
  }
});
