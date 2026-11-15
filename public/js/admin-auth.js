// ============================================================
// admin-auth.js - Halaman login Administrator
// ============================================================
const params = new URLSearchParams(location.search);
const next = params.get('next');

function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  btn.textContent = isPass ? '🙈' : '👁️';
}

function goAfterLogin(user) {
  if (user.role === 'admin') {
    location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin.html';
    return;
  }
  location.href = '/admin.html';
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: {
        email: aEmail.value,
        password: aPass.value,
        required_role: 'admin'
      }
    });
    setSession(r.token, r.user);
    toast('Autentikasi Administrator Berhasil! Mengalihkan...', 'success');
    setTimeout(() => goAfterLogin(r.user), 400);
  } catch (err) {
    toast(err.message, 'error');
  }
});
