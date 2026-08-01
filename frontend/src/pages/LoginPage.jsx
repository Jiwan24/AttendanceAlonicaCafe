import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading, error } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Setelah login, kembali ke halaman yang dicoba sebelumnya (atau /admin)
  const from = location.state?.from?.pathname || '/admin';

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = await login(username.trim(), password);
    if (ok) navigate(from, { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-page__bg" />

      <div className="login-card glass-card animate-fade-in-scale">
        {/* Logo */}
        <div className="login-card__logo">
          <img src="/allo.png" alt="Alonica Cafe" className="login-card__logo-img" />
        </div>

        <div className="login-card__header">
          <h1 className="login-card__title">Masuk Admin</h1>
          <p className="login-card__subtitle text-secondary">
            Masukkan kredensial untuk mengakses dashboard
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              className="form-input"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div className="login-password-wrapper">
              <input
                id="password"
                className="form-input"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPass((v) => !v)}
                tabIndex={-1}
                aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn--primary w-full login-submit"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <><div className="spinner" /> <span>Memproses...</span></>
            ) : (
              <><LogIn size={17} /> <span>Masuk</span></>
            )}
          </button>
        </form>

        <p className="login-card__back text-secondary text-sm">
          Bukan halaman admin?{' '}
          <a href="/">Kembali ke Absensi</a>
        </p>
      </div>
    </div>
  );
}
