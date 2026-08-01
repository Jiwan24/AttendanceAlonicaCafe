import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AbsenPage from './pages/AbsenPage';
import AdminDashboard from './pages/AdminDashboard';
import EnrollPage from './pages/EnrollPage';
import ShiftPage from './pages/ShiftPage';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Halaman publik — absensi karyawan */}
        <Route path="/" element={<AbsenPage />} />

        {/* Halaman login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Halaman admin — dilindungi login */}
        <Route path="/admin" element={
          <ProtectedRoute><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/enroll" element={
          <ProtectedRoute><EnrollPage /></ProtectedRoute>
        } />
        <Route path="/admin/shifts" element={
          <ProtectedRoute><ShiftPage /></ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;
