import { Link, useLocation } from 'react-router-dom';
import { Coffee, LayoutDashboard, UserPlus, ArrowRight } from 'lucide-react';
import './Navbar.css';

/**
 * Navbar — Navigasi untuk halaman Admin.
 */
export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="navbar glass-card">
      <div className="container navbar__container">
        <Link to="/admin" className="navbar__brand">
          <div className="navbar__logo">
            <Coffee size={24} className="navbar__logo-icon" />
          </div>
          <div>
            <div className="navbar__title">Alonica Admin</div>
            <div className="navbar__subtitle">Sistem Absensi Wajah</div>
          </div>
        </Link>

        <div className="navbar__links">
          <Link 
            to="/admin" 
            className={`navbar__link ${location.pathname === '/admin' ? 'navbar__link--active' : ''}`}
          >
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </Link>
          <Link 
            to="/admin/enroll" 
            className={`navbar__link ${location.pathname === '/admin/enroll' ? 'navbar__link--active' : ''}`}
          >
            <UserPlus size={16} />
            <span>Registrasi</span>
          </Link>
          <Link to="/" className="navbar__link navbar__link--outline">
            <span>Ke Layar Absen</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

