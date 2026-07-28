import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AbsenPage from './pages/AbsenPage';
import AdminDashboard from './pages/AdminDashboard';
import EnrollPage from './pages/EnrollPage';
import ShiftPage from './pages/ShiftPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AbsenPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/enroll" element={<EnrollPage />} />
        <Route path="/admin/shifts" element={<ShiftPage />} />
      </Routes>
    </Router>
  );
}

export default App;
