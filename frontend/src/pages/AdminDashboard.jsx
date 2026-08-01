import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UserPlus, 
  ClipboardList, 
  Users, 
  Search, 
  Download, 
  ScanFace, 
  KeyRound, 
  UserX, 
  UserCheck, 
  UserCheck2, 
  Clock, 
  UserMinus,
  LogIn,
  LogOut,
  CalendarClock,
  AlarmClock,
  CheckCircle2,
} from 'lucide-react';
import { getEmployees, getAttendanceLogs, getAttendanceSummary, deleteEmployee, exportAttendance, reactivateEmployee } from '../lib/api';
import Navbar from '../components/Navbar';
import './AdminDashboard.css';

/**
 * AdminDashboard — Dashboard admin untuk kelola karyawan & lihat rekap absensi.
 *
 * Features:
 * - Summary cards (hadir, belum hadir, sudah pulang)
 * - Tabel absensi dengan filter
 * - Daftar karyawan
 * - Export CSV
 */

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('attendance'); // attendance | employees
  const [summary, setSummary] = useState(null);
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterEmployee, setFilterEmployee] = useState('');

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [summaryRes, logsRes, empRes] = await Promise.all([
        getAttendanceSummary(),
        getAttendanceLogs({ date_from: dateFrom, date_to: dateTo, limit: 100 }),
        getEmployees(),
      ]);
      setSummary(summaryRes);
      setLogs(logsRes.logs);
      setEmployees(empRes.employees);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFilterLogs() {
    try {
      const filters = { date_from: dateFrom, date_to: dateTo, limit: 100 };
      if (filterEmployee) filters.employee_id = filterEmployee;
      const result = await getAttendanceLogs(filters);
      setLogs(result.logs);
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleExport() {
    try {
      await exportAttendance({ date_from: dateFrom, date_to: dateTo, employee_id: filterEmployee || undefined });
      showToast('success', 'File CSV berhasil di-download');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleDeleteEmployee(id, nama) {
    if (!confirm(`Nonaktifkan karyawan "${nama}"?`)) return;
    try {
      await deleteEmployee(id);
      showToast('success', `${nama} telah dinonaktifkan`);
      const empRes = await getEmployees();
      setEmployees(empRes.employees);
    } catch (err) {
      showToast('error', err.message);
    }
  }

  async function handleReactivateEmployee(id, nama) {
    try {
      await reactivateEmployee(id);
      showToast('success', `${nama} telah diaktifkan kembali`);
      const empRes = await getEmployees();
      setEmployees(empRes.employees);
    } catch (err) {
      showToast('error', err.message);
    }
  }

  function formatTimestamp(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  }

  return (
    <>
      <Navbar />
      <div className="admin-page page">
        <div className="container">
          {/* Page header */}
          <div className="admin-header animate-fade-in">
            <div>
              <h1 className="admin-header__title">Dashboard Admin</h1>
              <p className="text-secondary">Kelola karyawan & rekap absensi Alonica Cafe</p>
            </div>
            <button className="btn btn--primary btn--lg flex items-center gap-2" onClick={() => navigate('/admin/enroll')}>
              <UserPlus size={18} />
              <span>Tambah Karyawan</span>
            </button>
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="admin-summary grid grid-cols-4 gap-4 animate-slide-up">
              <div className="stat-card stat-card--accent">
                <div className="flex items-center justify-between">
                  <span className="stat-card__label">Total Karyawan</span>
                  <Users size={20} className="text-accent" />
                </div>
                <span className="stat-card__value">{summary.total_karyawan}</span>
              </div>
              <div className="stat-card stat-card--success">
                <div className="flex items-center justify-between">
                  <span className="stat-card__label">Hadir Hari Ini</span>
                  <UserCheck2 size={20} className="text-emerald-400" />
                </div>
                <span className="stat-card__value">{summary.hadir}</span>
              </div>
              <div className="stat-card stat-card--warning">
                <div className="flex items-center justify-between">
                  <span className="stat-card__label">Belum Hadir</span>
                  <Clock size={20} className="text-amber-400" />
                </div>
                <span className="stat-card__value">{summary.belum_hadir}</span>
              </div>
              <div className="stat-card stat-card--danger">
                <div className="flex items-center justify-between">
                  <span className="stat-card__label">Sudah Pulang</span>
                  <UserMinus size={20} className="text-rose-400" />
                </div>
                <span className="stat-card__value">{summary.sudah_pulang}</span>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="admin-tabs">
            <button
              className={`admin-tab ${activeTab === 'attendance' ? 'admin-tab--active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              <ClipboardList size={16} />
              <span>Rekap Absensi</span>
            </button>
            <button
              className={`admin-tab ${activeTab === 'employees' ? 'admin-tab--active' : ''}`}
              onClick={() => setActiveTab('employees')}
            >
              <Users size={16} />
              <span>Karyawan</span>
            </button>
            <button
              className="admin-tab"
              onClick={() => navigate('/admin/shifts')}
            >
              <CalendarClock size={16} />
              <span>Jadwal Shift</span>
            </button>
          </div>

          {/* Tab: Attendance Logs */}
          {activeTab === 'attendance' && (
            <div className="admin-section glass-card animate-fade-in">
              {/* Filters */}
              <div className="admin-filters">
                <div className="form-group">
                  <label className="form-label">Dari Tanggal</label>
                  <input
                    type="date"
                    className="form-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Sampai Tanggal</label>
                  <input
                    type="date"
                    className="form-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Karyawan</label>
                  <select
                    className="form-select"
                    value={filterEmployee}
                    onChange={(e) => setFilterEmployee(e.target.value)}
                  >
                    <option value="">Semua</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.nama}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-filters__actions">
                  <button className="btn btn--primary flex items-center gap-2" onClick={handleFilterLogs}>
                    <Search size={16} />
                    <span>Filter</span>
                  </button>
                  <button className="btn btn--outline flex items-center gap-2" onClick={handleExport}>
                    <Download size={16} />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Nama</th>
                      <th>Kode</th>
                      <th>Jenis</th>
                      <th>Waktu</th>
                      <th>Metode</th>
                      <th>Skor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>
                          Belum ada data absensi
                        </td>
                      </tr>
                    ) : (
                      logs.map((log, i) => (
                        <tr key={log.id}>
                          <td>{i + 1}</td>
                          <td className="font-semibold">{log.employee_nama}</td>
                          <td className="text-muted">{log.employee_kode}</td>
                          <td>
                            <span className={`badge ${log.jenis === 'masuk' ? 'badge--success' : 'badge--warning'} inline-flex items-center gap-1`}>
                              {log.jenis === 'masuk' ? <LogIn size={12} /> : <LogOut size={12} />}
                              <span>{log.jenis}</span>
                            </span>
                          </td>
                          <td>{formatTimestamp(log.timestamp)}</td>
                          <td>
                            <span className={`badge ${log.metode === 'wajah' ? 'badge--info' : 'badge--warning'} inline-flex items-center gap-1`}>
                              {log.metode === 'wajah' ? (
                                <><ScanFace size={13} /> <span>Wajah</span></>
                              ) : (
                                <><KeyRound size={13} /> <span>PIN</span></>
                              )}
                            </span>
                          </td>
                          <td className="text-muted">
                            {log.similarity_score ? `${(log.similarity_score * 100).toFixed(1)}%` : '-'}
                          </td>
                          <td>
                            {log.jenis === 'masuk' ? (
                              log.terlambat ? (
                                <span className="badge badge--danger inline-flex items-center gap-1" title={`Terlambat ${log.menit_terlambat} menit`}>
                                  <AlarmClock size={12} />
                                  <span>Terlambat {log.menit_terlambat}m</span>
                                </span>
                              ) : (
                                <span className="badge badge--success inline-flex items-center gap-1">
                                  <CheckCircle2 size={12} />
                                  <span>Tepat Waktu</span>
                                </span>
                              )
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab: Employees */}
          {activeTab === 'employees' && (
            <div className="admin-section glass-card animate-fade-in">
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Kode</th>
                      <th>Role</th>
                      <th>Wajah Terdaftar</th>
                      <th>Status</th>
                      <th>Terdaftar</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center text-muted" style={{ padding: 'var(--space-8)' }}>
                          Belum ada karyawan terdaftar
                        </td>
                      </tr>
                    ) : (
                      employees.map((emp) => (
                        <tr key={emp.id}>
                          <td className="font-semibold">{emp.nama}</td>
                          <td className="text-muted">{emp.kode_karyawan}</td>
                          <td>{emp.role}</td>
                          <td>
                            <span className={`badge ${emp.face_count > 0 ? 'badge--success' : 'badge--danger'}`}>
                              {emp.face_count}/5
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${emp.status ? 'badge--success' : 'badge--danger'}`}>
                              {emp.status ? 'Aktif' : 'Non-aktif'}
                            </span>
                          </td>
                          <td className="text-muted text-sm">
                            {emp.created_at ? new Date(emp.created_at).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              {emp.status ? (
                                <button
                                  className="btn btn--sm btn--danger flex items-center gap-1"
                                  onClick={() => handleDeleteEmployee(emp.id, emp.nama)}
                                >
                                  <UserX size={13} />
                                  <span>Nonaktifkan</span>
                                </button>
                              ) : (
                                <button
                                  className="btn btn--sm btn--success flex items-center gap-1"
                                  onClick={() => handleReactivateEmployee(emp.id, emp.nama)}
                                >
                                  <UserCheck size={13} />
                                  <span>Aktifkan</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`toast toast--${toast.type}`}>
            {toast.message}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="admin-loading">
            <div className="spinner spinner--lg" />
          </div>
        )}
      </div>
    </>
  );
}
