/**
 * Auth utilities — simpan/ambil/hapus JWT token dari localStorage.
 */

const TOKEN_KEY = 'alonica_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;

  // Decode payload (tanpa verifikasi — verifikasi dilakukan di backend)
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  } catch {
    return false;
  }
}
