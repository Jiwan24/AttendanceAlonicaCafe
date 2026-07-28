import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  ArrowLeft,
} from 'lucide-react';
import {
  getShifts,
  getSchedules,
  createSchedule,
  deleteSchedule,
  getEmployees,
} from '../lib/api';
import Navbar from '../components/Navbar';
import './ShiftPage.css';

/**
 * ShiftPage — Halaman jadwal shift karyawan.
 * Shift sudah tetap: Shift 1 (08:00–16:00) dan Shift 2 (16:00–00:00).
 */

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Get Monday of the week containing `date` */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format date to YYYY-MM-DD */
function toISO(date) {
  return date.toISOString().split('T')[0];
}

/** Format date nicely */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/** Get initials from name */
function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export default function ShiftPage() {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  // Assign modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignData, setAssignData] = useState({
    employee_id: '',
    shift_id: '',
    tanggal_mulai: '',
    tanggal_selesai: '',
    keterangan: '',
  });
  const [assignLoading, setAssignLoading] = useState(false);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ----------------------------------------
  // Load data
  // ----------------------------------------
  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [weekStart]);

  async function loadAll() {
    setLoading(true);
    try {
      const [shiftsRes, empRes] = await Promise.all([getShifts(), getEmployees()]);
      setShifts(shiftsRes.shifts);
      setEmployees(empRes.employees.filter((e) => e.status));
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedules() {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    try {
      const res = await getSchedules({
        date_from: toISO(weekStart),
        date_to: toISO(weekEnd),
      });
      setSchedules(res.schedules);
    } catch (err) {
      showToast('error', err.message);
    }
  }

  // ----------------------------------------
  // Week navigation
  // ----------------------------------------
  function prevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function nextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToToday() {
    setWeekStart(getWeekStart(new Date()));
  }

  // Build array of 7 dates for this week
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayISO = toISO(new Date());

  // ----------------------------------------
  // Schedule assignment
  // ----------------------------------------
  function openAssignModal(employeeId = '', tanggal = '') {
    setAssignData({
      employee_id: employeeId,
      shift_id: shifts[0]?.id || '',
      tanggal_mulai: tanggal,
      tanggal_selesai: tanggal,
      keterangan: '',
    });
    setShowAssignModal(true);
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignData.employee_id || !assignData.shift_id || !assignData.tanggal_mulai || !assignData.tanggal_selesai) {
      showToast('error', 'Semua field wajib diisi.');
      return;
    }
    setAssignLoading(true);
    try {
      const res = await createSchedule(assignData);
      showToast('success', res.message);
      setShowAssignModal(false);
      await loadSchedules();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleDeleteSchedule(scheduleId) {
    try {
      await deleteSchedule(scheduleId);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      showToast('success', 'Jadwal dihapus.');
    } catch (err) {
      showToast('error', err.message);
    }
  }

  // Build schedule lookup: { employee_id: { date_iso: [schedule, ...] } }
  const scheduleLookup = {};
  for (const sc of schedules) {
    if (!scheduleLookup[sc.employee_id]) scheduleLookup[sc.employee_id] = {};
    if (!scheduleLookup[sc.employee_id][sc.tanggal]) scheduleLookup[sc.employee_id][sc.tanggal] = [];
    scheduleLookup[sc.employee_id][sc.tanggal].push(sc);
  }

  // Selected shift preview in assign modal
  const selectedShift = shifts.find((s) => s.id === assignData.shift_id);

  // Week label
  const weekEnd = weekDates[6];
  const weekLabel = `${formatDate(toISO(weekStart))} – ${formatDate(toISO(weekEnd))} ${weekEnd.getFullYear()}`;

  return (
    <>
      <Navbar />
      <div className="shift-page page">
        <div className="container">

          {/* Header */}
          <div className="shift-header animate-fade-in">
            <div>
              <button
                className="btn btn--ghost btn--sm flex items-center gap-2"
                style={{ marginBottom: 'var(--space-3)' }}
                onClick={() => navigate('/admin')}
              >
                <ArrowLeft size={16} />
                <span>Kembali ke Dashboard</span>
              </button>
              <h1 className="shift-header__title">Jadwal Shift Karyawan</h1>
              <p className="text-secondary">Atur jadwal mingguan karyawan Alonica Cafe</p>
            </div>
            <div className="shift-header__actions">
              <button
                className="btn btn--primary flex items-center gap-2"
                onClick={() => openAssignModal()}
                disabled={shifts.length === 0 || employees.length === 0}
              >
                <Plus size={16} />
                <span>Assign Shift</span>
              </button>
            </div>
          </div>

          {/* ====================================
               JADWAL MINGGUAN
               ==================================== */}
          <div className="shift-section animate-fade-in">

              {/* Shift Legend */}
              {shifts.length > 0 && (
                <div className="shift-legend">
                  {shifts.map((s) => (
                    <div key={s.id} className="shift-legend__item">
                      <div className="shift-legend__dot" style={{ background: s.warna }} />
                      <span>{s.nama} ({s.jam_masuk}–{s.jam_pulang})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Week Navigation */}
              <div className="week-nav glass-card">
                <button className="week-nav__btn" onClick={prevWeek}>
                  <ChevronLeft size={16} /> Sebelumnya
                </button>
                <div className="flex flex-col items-center gap-1">
                  <div className="week-nav__title">{weekLabel}</div>
                  <button className="btn btn--ghost btn--sm" onClick={goToToday}>Minggu Ini</button>
                </div>
                <button className="week-nav__btn" onClick={nextWeek}>
                  Berikutnya <ChevronRight size={16} />
                </button>
              </div>

              {/* Calendar Grid */}
              {employees.length === 0 ? (
                <div className="glass-card" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="empty-state">
                    <div className="empty-state__icon">👥</div>
                    <div className="empty-state__title">Belum ada karyawan aktif</div>
                    <p className="empty-state__desc">Tambahkan karyawan terlebih dahulu untuk membuat jadwal.</p>
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ marginTop: 'var(--space-4)', padding: 0, overflow: 'hidden' }}>
                  <div className="calendar-grid-wrapper">
                    <table className="calendar-grid">
                      <thead>
                        <tr>
                          <th>Karyawan</th>
                          {weekDates.map((d) => {
                            const iso = toISO(d);
                            const isToday = iso === todayISO;
                            return (
                              <th key={iso} className={isToday ? 'today-header' : ''}>
                                <div className="day-header">
                                  <span className="day-header__name">{DAY_NAMES[d.getDay()]}</span>
                                  <span className="day-header__date">{d.getDate()}/{d.getMonth() + 1}</span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp) => (
                          <tr key={emp.id}>
                            {/* Employee name */}
                            <td>
                              <div className="emp-cell">
                                <div className="emp-cell__avatar">{getInitials(emp.nama)}</div>
                                <div>
                                  <div className="emp-cell__name">{emp.nama}</div>
                                  <div className="emp-cell__role">{emp.role}</div>
                                </div>
                              </div>
                            </td>
                            {/* Shift cells for each day */}
                            {weekDates.map((d) => {
                              const iso = toISO(d);
                              const isToday = iso === todayISO;
                              const daySchedules = scheduleLookup[emp.id]?.[iso] || [];
                              return (
                                <td key={iso} className={isToday ? 'today-cell' : ''}>
                                  <div className="shift-cell">
                                    {daySchedules.map((sc) => {
                                      const shiftColor = sc.shift_warna || '#3b82f6';
                                      return (
                                        <div
                                          key={sc.id}
                                          className="shift-chip"
                                          title={`${sc.shift_nama}: ${sc.shift_jam_masuk}–${sc.shift_jam_pulang}`}
                                          style={{
                                            '--chip-bg': hexToRgba(shiftColor, 0.18),
                                            '--chip-color': shiftColor,
                                            '--chip-border': hexToRgba(shiftColor, 0.35),
                                          }}
                                        >
                                          <span>{sc.shift_jam_masuk}</span>
                                          <button
                                            className="shift-chip__delete"
                                            onClick={() => handleDeleteSchedule(sc.id)}
                                            title="Hapus jadwal"
                                          >
                                            ×
                                          </button>
                                        </div>
                                      );
                                    })}
                                    <button
                                      className="add-shift-cell-btn"
                                      onClick={() => openAssignModal(emp.id, iso)}
                                      title="Tambah shift"
                                      disabled={shifts.length === 0}
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
        </div>

        {/* ====================================
             ASSIGN SHIFT MODAL
             ==================================== */}
        {showAssignModal && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAssignModal(false)}>
            <div className="modal-content modal-content--wide">
              <div className="modal-title">
                <Calendar size={22} className="text-accent" />
                Assign Shift Karyawan
              </div>

              <form onSubmit={handleAssign}>
                <div className="modal-form-grid">
                  <div className="form-group">
                    <label className="form-label">Karyawan</label>
                    <select
                      id="assign-employee-select"
                      className="form-select"
                      value={assignData.employee_id}
                      onChange={(e) => setAssignData({ ...assignData, employee_id: e.target.value })}
                      required
                    >
                      <option value="">-- Pilih Karyawan --</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.nama} ({emp.role})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Shift</label>
                    <select
                      id="assign-shift-select"
                      className="form-select"
                      value={assignData.shift_id}
                      onChange={(e) => setAssignData({ ...assignData, shift_id: e.target.value })}
                      required
                    >
                      <option value="">-- Pilih Shift --</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>{s.nama} ({s.jam_masuk}–{s.jam_pulang})</option>
                      ))}
                    </select>
                    {/* Shift preview */}
                    {selectedShift && (
                      <div className="shift-preview">
                        <div className="shift-preview__dot" style={{ background: selectedShift.warna }} />
                        <div className="shift-preview__info">
                          <div className="shift-preview__name">{selectedShift.nama}</div>
                          <div>{selectedShift.jam_masuk} – {selectedShift.jam_pulang}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="modal-form-row">
                    <div className="form-group">
                      <label className="form-label">Dari Tanggal</label>
                      <input
                        type="date"
                        className="form-input"
                        value={assignData.tanggal_mulai}
                        onChange={(e) => {
                          setAssignData({ ...assignData, tanggal_mulai: e.target.value, tanggal_selesai: e.target.value });
                        }}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sampai Tanggal</label>
                      <input
                        type="date"
                        className="form-input"
                        value={assignData.tanggal_selesai}
                        min={assignData.tanggal_mulai}
                        onChange={(e) => setAssignData({ ...assignData, tanggal_selesai: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Keterangan (opsional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Pengganti, Lembur..."
                      value={assignData.keterangan}
                      onChange={(e) => setAssignData({ ...assignData, keterangan: e.target.value })}
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn--outline flex items-center gap-2"
                    onClick={() => setShowAssignModal(false)}
                  >
                    <X size={15} /> Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn--primary flex items-center gap-2"
                    disabled={assignLoading}
                  >
                    {assignLoading ? <div className="spinner" /> : <Check size={15} />}
                    <span>Simpan Jadwal</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`toast toast--${toast.type}`}>
            {toast.message}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="admin-loading" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div className="spinner spinner--lg" />
          </div>
        )}
      </div>
    </>
  );
}
