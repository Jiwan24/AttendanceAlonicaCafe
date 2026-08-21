/**
 * API client for Alonica Attendance System backend.
 * All methods return parsed JSON responses.
 */

import { getToken, removeToken } from './auth';

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api';

/**
 * Generic fetch wrapper with error handling.
 * Otomatis inject Authorization header jika token tersedia.
 * Redirect ke /login jika server kembalikan 401.
 */
async function request(url, options = {}) {
  const token = getToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        ...authHeader,
        ...options.headers,
      },
    });

    // Token expired atau tidak valid — paksa logout
    if (response.status === 401) {
      removeToken();
      window.location.href = '/login';
      throw new Error('Sesi habis. Silakan login kembali.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle CSV downloads
    if (response.headers.get('content-type')?.includes('text/csv')) {
      return response.blob();
    }

    return response.json();
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Tidak dapat terhubung ke server. Pastikan backend berjalan di localhost:8000');
    }
    throw error;
  }
}

// ==========================================
// AUTH API
// ==========================================

/**
 * Login admin — tidak perlu token, jadi pakai fetch langsung.
 */
export async function loginAdmin(username, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Login gagal.');
  }

  return response.json();
}

/**
 * Verifikasi token masih valid.
 */
export async function verifyAuthToken() {
  return request('/auth/verify');
}

// ==========================================
// EMPLOYEE API
// ==========================================

/**
 * Get all employees.
 * @param {boolean|null} status - Filter by active status
 */
export async function getEmployees(status = null) {
  const params = status !== null ? `?status=${status}` : '';
  return request(`/employees${params}`);
}

/**
 * Get single employee by ID.
 */
export async function getEmployee(id) {
  return request(`/employees/${id}`);
}

/**
 * Generate kode karyawan otomatis (format ALN-XXX).
 */
export async function generateKodeKaryawan() {
  return request('/employees/generate-kode');
}

/**
 * Create a new employee.
 * @param {{ nama: string, kode_karyawan: string, role: string, pin_fallback?: string }} data
 */
export async function addEmployee(data) {
  const formData = new FormData();
  formData.append('nama', data.nama);
  formData.append('kode_karyawan', data.kode_karyawan);
  formData.append('role', data.role);
  if (data.pin_fallback) {
    formData.append('pin_fallback', data.pin_fallback);
  }

  return request('/employees', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Enroll a face photo for an employee.
 * @param {string} employeeId
 * @param {Blob} imageBlob - Face image as Blob
 */
export async function enrollFace(employeeId, imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'face.jpg');

  return request(`/employees/${employeeId}/enroll-face`, {
    method: 'POST',
    body: formData,
  });
}

/**
 * Update employee details (nama, kode_karyawan, role, pin_fallback).
 * Only include fields you want to change.
 * @param {string} id
 * @param {{ nama?: string, kode_karyawan?: string, role?: string, pin_fallback?: string }} data
 */
export async function updateEmployee(id, data) {
  const formData = new FormData();
  if (data.nama !== undefined) formData.append('nama', data.nama);
  if (data.kode_karyawan !== undefined) formData.append('kode_karyawan', data.kode_karyawan);
  if (data.role !== undefined) formData.append('role', data.role);
  if (data.pin_fallback !== undefined) formData.append('pin_fallback', data.pin_fallback);

  return request(`/employees/${id}`, {
    method: 'PUT',
    body: formData,
  });
}

/**
 * Deactivate an employee (soft delete).
 */
export async function deleteEmployee(id) {
  return request(`/employees/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Reactivate an employee.
 */
export async function reactivateEmployee(id) {
  return request(`/employees/${id}/reactivate`, {
    method: 'PUT',
  });
}

/**
 * Clear all face embeddings for re-enrollment.
 */
export async function clearFaceEmbeddings(id) {
  return request(`/employees/${id}/face-embeddings`, {
    method: 'DELETE',
  });
}

// ==========================================
// ATTENDANCE API
// ==========================================

/**
 * Verify a face for attendance.
 * @param {Blob} imageBlob - Face image as Blob
 * @param {string|null} jenis - 'masuk' | 'pulang' (optional)
 */
export async function verifyFace(imageBlob, jenis = null) {
  const formData = new FormData();
  formData.append('file', imageBlob, 'capture.jpg');
  if (jenis) {
    formData.append('jenis', jenis);
  }

  return request('/attendance/verify-face', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Attendance via PIN fallback.
 * @param {string} kodeKaryawan
 * @param {string} pin
 * @param {string|null} jenis - 'masuk' | 'pulang' (optional)
 */
export async function verifyPin(kodeKaryawan, pin, jenis = null) {
  const formData = new FormData();
  formData.append('kode_karyawan', kodeKaryawan);
  formData.append('pin', pin);
  if (jenis) {
    formData.append('jenis', jenis);
  }

  return request('/attendance/pin-fallback', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Get attendance logs with optional filters.
 * @param {{ date_from?: string, date_to?: string, employee_id?: string, jenis?: string, limit?: number, offset?: number }} filters
 */
export async function getAttendanceLogs(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, value);
    }
  });
  const queryString = params.toString();
  return request(`/attendance/logs${queryString ? `?${queryString}` : ''}`);
}

/**
 * Export attendance as CSV.
 * @param {{ date_from?: string, date_to?: string, employee_id?: string }} filters
 */
export async function exportAttendance(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, value);
    }
  });
  const queryString = params.toString();
  const blob = await request(`/attendance/export${queryString ? `?${queryString}` : ''}`);

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `absensi_${filters.date_from || 'all'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get daily attendance summary.
 * @param {string|null} date - Format: YYYY-MM-DD (null = today)
 */
export async function getAttendanceSummary(date = null) {
  const params = date ? `?date=${date}` : '';
  return request(`/attendance/summary${params}`);
}

// ==========================================
// SHIFT API
// ==========================================

/**
 * Get all shift definitions.
 */
export async function getShifts() {
  return request('/shifts');
}

/**
 * Create a new shift definition.
 * @param {{ nama: string, jam_masuk: string, jam_pulang: string, warna: string }} data
 */
export async function createShift(data) {
  return request('/shifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Update a shift definition.
 * @param {string} id
 * @param {{ nama?: string, jam_masuk?: string, jam_pulang?: string, warna?: string }} data
 */
export async function updateShift(id, data) {
  return request(`/shifts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Delete a shift definition (and all its schedules).
 * @param {string} id
 */
export async function deleteShift(id) {
  return request(`/shifts/${id}`, { method: 'DELETE' });
}

// ==========================================
// SCHEDULE API
// ==========================================

/**
 * Get schedules with optional filters.
 * @param {{ date_from?: string, date_to?: string, employee_id?: string }} filters
 */
export async function getSchedules(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params.append(key, value);
    }
  });
  const queryString = params.toString();
  return request(`/schedules${queryString ? `?${queryString}` : ''}`);
}

/**
 * Create schedule assignment(s) for a date range.
 * @param {{ employee_id: string, shift_id: string, tanggal_mulai: string, tanggal_selesai: string, keterangan?: string }} data
 */
export async function createSchedule(data) {
  return request('/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * Delete a single scheduled shift by ID.
 * @param {string} id
 */
export async function deleteSchedule(id) {
  return request(`/schedules/${id}`, { method: 'DELETE' });
}

/**
 * Delete an attendance log by ID.
 * @param {string} logId - ID of the attendance log to delete
 */
export async function deleteAttendanceLog(logId) {
  return request(`/attendance/logs/${logId}`, {
    method: 'DELETE',
  });
}
