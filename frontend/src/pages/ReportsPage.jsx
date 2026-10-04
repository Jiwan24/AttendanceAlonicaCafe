import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Award, Calendar, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import './ReportsPage.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function ReportsPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ranking, setRanking] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeDetail, setEmployeeDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchRanking();
  }, [month]);

  async function fetchRanking() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/attendance/ranking?month=${month}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Gagal memuat data');
      const data = await res.json();
      setRanking(data.ranking || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchEmployeeDetail(employeeId) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE}/api/attendance/monthly-report?month=${month}&employee_id=${employeeId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Gagal memuat detail');
      const data = await res.json();
      setEmployeeDetail(data.employees[0] || null);
    } catch (err) {
      console.error(err);
    }
  }

  function handleEmployeeClick(emp) {
    setSelectedEmployee(emp);
    fetchEmployeeDetail(emp.employee_id);
  }

  function getColor(percentage) {
    if (percentage >= 90) return '#10b981'; // green
    if (percentage >= 70) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  }

  // Stats cards
  const avgPercentage = ranking.length > 0
    ? (ranking.reduce((sum, e) => sum + e.percentage, 0) / ranking.length).toFixed(1)
    : 0;
  const totalTelat = ranking.reduce((sum, e) => sum + e.telat, 0);
  const bonusWorthy = ranking.filter(e => e.bonus_worthy).length;

  return (
    <div className="reports-page">
      <Navbar />
      <div className="reports-container">
        <header className="reports-header">
          <h1>Laporan Kehadiran Bulanan</h1>
          <div className="reports-header__controls">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="reports-month-input"
            />
          </div>
        </header>

        {error && (
          <div className="reports-error">
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {loading ? (
          <div className="reports-loading">Memuat data...</div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="reports-stats">
              <div className="reports-stat-card">
                <TrendingUp className="reports-stat-icon" />
                <div>
                  <p className="reports-stat-label">Kehadiran Rata-rata</p>
                  <p className="reports-stat-value">{avgPercentage}%</p>
                </div>
              </div>
              <div className="reports-stat-card">
                <Calendar className="reports-stat-icon" />
                <div>
                  <p className="reports-stat-label">Total Keterlambatan</p>
                  <p className="reports-stat-value">{totalTelat}x</p>
                </div>
              </div>
              <div className="reports-stat-card">
                <Award className="reports-stat-icon" />
                <div>
                  <p className="reports-stat-label">Karyawan Rajin</p>
                  <p className="reports-stat-value">{bonusWorthy} dari {ranking.length}</p>
                </div>
              </div>
            </div>

            {/* Ranking Bar Chart */}
            <div className="reports-chart-section">
              <h2>Ranking Kehadiran</h2>
              <ResponsiveContainer width="100%" height={Math.max(400, ranking.length * 50)}>
                <BarChart
                  data={ranking}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="employee_nama" type="category" width={140} />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || !payload[0]) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="reports-tooltip">
                          <p><strong>{data.employee_nama}</strong></p>
                          <p>Kehadiran: {data.hadir}/{data.total_hari_kerja} hari</p>
                          <p>Alpha: {data.alpha}x</p>
                          <p>Telat: {data.telat}x</p>
                          <p>Persentase: {data.percentage}%</p>
                          {data.bonus_worthy && <p className="reports-bonus-badge">🏆 Bonus Worthy</p>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="percentage" radius={[0, 8, 8, 0]} onClick={(data) => handleEmployeeClick(data)}>
                    {ranking.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getColor(entry.percentage)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="reports-chart-legend">
                <span style={{ color: '#10b981' }}>■ 90-100%</span>
                <span style={{ color: '#f59e0b' }}>■ 70-89%</span>
                <span style={{ color: '#ef4444' }}>■ &lt;70%</span>
              </p>
            </div>

            {/* Employee Detail (Calendar Heatmap) */}
            {selectedEmployee && employeeDetail && (
              <div className="reports-detail-section">
                <h2>
                  Detail Kehadiran: {selectedEmployee.employee_nama} ({selectedEmployee.employee_kode})
                </h2>
                <div className="reports-heatmap">
                  {employeeDetail.daily_details.map((day) => {
                    const dayOfWeek = new Date(day.date).getDay();
                    const dayNum = new Date(day.date).getDate();
                    let colorClass = 'reports-day-libur';
                    if (day.status === 'hadir') {
                      colorClass = day.telat ? 'reports-day-telat' : 'reports-day-hadir';
                    } else if (day.status === 'alpha') {
                      colorClass = 'reports-day-alpha';
                    }

                    return (
                      <div
                        key={day.date}
                        className={`reports-day ${colorClass}`}
                        title={`${day.date} - ${day.status}${day.telat ? ' (telat)' : ''}`}
                      >
                        {dayNum}
                      </div>
                    );
                  })}
                </div>
                <div className="reports-heatmap-legend">
                  <span><span className="reports-day reports-day-hadir"></span> Hadir tepat waktu</span>
                  <span><span className="reports-day reports-day-telat"></span> Hadir terlambat</span>
                  <span><span className="reports-day reports-day-alpha"></span> Tidak hadir</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ReportsPage;
