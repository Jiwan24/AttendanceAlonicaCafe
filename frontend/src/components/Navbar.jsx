import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, UserPlus, ArrowRight } from 'lucide-react';
import './Navbar.css';

/**
 * Navbar — Navigasi untuk halaman Admin.
 */
export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="navbar">
      <div className="container navbar__container">
        <Link to="/admin" className="navbar__brand">
          <div className="navbar__logo">
            <img src="/allo.png" alt="Alonica" className="navbar__logo-img" />
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

