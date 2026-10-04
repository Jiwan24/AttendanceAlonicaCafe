# Dokumentasi Frontend — Alonica Cafe Sistem Absensi Wajah

## Gambaran Umum

Frontend dibangun menggunakan **React 19 + Vite** sebagai Single Page Application (SPA). Antarmuka terdiri dari dua bagian utama:

- **Halaman Absensi** (`/`) — kiosk full-screen untuk karyawan, tidak perlu login
- **Dashboard Admin** (`/admin`) — panel manajemen yang dilindungi autentikasi JWT

---

## Teknologi & Dependensi

| Package | Versi | Fungsi |
|---|---|---|
| `react` | 19.2.7 | Library UI utama |
| `react-dom` | 19.2.7 | Renderer React ke DOM |
| `react-router-dom` | 7.18.1 | Routing SPA (navigasi antar halaman) |
| `lucide-react` | 1.26.0 | Ikon-ikon UI |
| `vite` | 8.1.1 | Build tool & dev server |
| `face-api.js` | (CDN) | Deteksi wajah & landmark real-time di browser |

> `face-api.js` dimuat dari CDN di `index.html`, bukan lewat npm. Model disimpan di `public/models/`.

---

## Struktur Folder

```
frontend/src/
├── App.jsx                    # Entry point routing
├── App.css                    # Global styles tambahan
├── index.css                  # CSS design system (variabel, utilitas)
├── main.jsx                   # React root entry
│
├── context/
│   └── AuthContext.jsx        # Context autentikasi global
│
├── pages/
│   ├── AbsenPage.jsx          # Halaman kiosk absensi karyawan
│   ├── AbsenPage.css
│   ├── AdminDashboard.jsx     # Dashboard admin (rekap, karyawan, shift)
│   ├── AdminDashboard.css
│   ├── EnrollPage.jsx         # Registrasi karyawan baru + enrollment wajah
│   ├── EnrollPage.css
│   ├── LoginPage.jsx          # Halaman login admin
│   ├── LoginPage.css
│   ├── ShiftPage.jsx          # Manajemen jadwal shift mingguan
│   └── ShiftPage.css
│
├── components/
│   ├── Navbar.jsx             # Navigasi halaman admin
│   ├── Navbar.css
│   ├── ProtectedRoute.jsx     # Guard route — redirect ke login jika belum auth
│   ├── PinFallback.jsx        # Modal absensi via PIN
│   ├── PinFallback.css
│   ├── AlreadyCompletedModal.jsx  # Pop-up saat karyawan sudah absen hari ini
│   ├── AlreadyCompletedModal.css
│   ├── EditEmployeeModal.jsx  # Modal edit data + wajah karyawan
│   ├── EditEmployeeModal.css
│   └── TimeInput.jsx          # Input waktu HH:MM custom
│
└── lib/
    ├── api.js                 # API client HTTP ke backend
    ├── auth.js                # Utilitas token JWT (localStorage)
    └── faceDetection.js       # Wrapper face-api.js + deteksi masker
```

---

## Routing — `App.jsx`

```jsx
<Routes>
  <Route path="/"              element={<AbsenPage />} />
  <Route path="/login"         element={<LoginPage />} />
  <Route path="/admin"         element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
  <Route path="/admin/enroll"  element={<ProtectedRoute><EnrollPage /></ProtectedRoute>} />
  <Route path="/admin/shifts"  element={<ProtectedRoute><ShiftPage /></ProtectedRoute>} />
</Routes>
```

| Route | Akses | Halaman |
|---|---|---|
| `/` | Publik | Kiosk absensi karyawan |
| `/login` | Publik | Form login admin |
| `/admin` | Protected | Dashboard admin |
| `/admin/enroll` | Protected | Registrasi karyawan baru |
| `/admin/shifts` | Protected | Jadwal shift mingguan |

---

## Halaman & Komponen

---

### `pages/AbsenPage.jsx` — Kiosk Absensi Utama

Halaman full-screen yang dipasang di tablet untuk karyawan absen tanpa login.

**State penting:**

| State | Tipe | Keterangan |
|---|---|---|
| `status` | string | `loading` / `ready` / `detecting` / `processing` / `success` / `failed` / `error` |
| `scanMode` | string\|null | `null` / `'masuk'` / `'pulang'` |
| `matchResult` | object\|null | Data karyawan yang berhasil dikenali |
| `failScore` | float\|null | Skor kecocokan saat wajah tidak dikenali |
| `maskDetected` | boolean | `true` jika wajah terdeteksi memakai masker |
| `showPin` | boolean | `true` untuk menampilkan modal PIN fallback |

**Refs penting (tidak trigger re-render):**

| Ref | Keterangan |
|---|---|
| `videoRef` | Elemen `<video>` kamera |
| `canvasRef` | Elemen `<canvas>` overlay deteksi wajah |
| `isProcessingRef` | Flag mencegah capture ganda saat memproses |
| `stableCountRef` | Counter frame wajah stabil berturut-turut |
| `failCountRef` | Counter kegagalan pengenalan (max 3x → PIN) |

**Alur kerja utama:**

```
Halaman dibuka
    ↓
loadFaceModels() — muat TinyFaceDetector & Landmark model
    ↓
getUserMedia() — akses kamera browser
    ↓
User klik ABSEN MASUK / ABSEN PULANG
    ↓
Detection loop (interval 300ms):
    ├── detectFaces() — deteksi wajah
    ├── checkFaceStability() — cek posisi & ukuran wajah
    ├── detectMask() — cek masker → tampil banner merah jika terpakai
    └── Setelah 5 frame stabil → handleCapture()
    ↓
handleCapture():
    ├── captureFrame() — ambil snapshot dari video
    ├── verifyFace(blob, jenis) — kirim ke backend
    └── Tampilkan hasil:
        ├── matched=true → kartu sukses (nama, badge, skor)
        ├── wajah tidak dikenali → failScore ditampilkan, max 3x → PIN
        └── error lain (spoof, shift, dll) → pesan error
```

**Penanganan hasil verifikasi:**

```javascript
if (result.matched) {
  // Sukses → tampilkan kartu nama karyawan
} else if (result.error) {
  const isNotRecognized = result.similarity_score !== null;
  if (isNotRecognized) {
    // Wajah tidak dikenali → tampilkan skor, counter 1/3, 2/3, 3/3 → PIN
  } else {
    // Error validasi (spoof, shift) → tampilkan pesan saja
  }
}
```

**Fitur khusus:**
- **Banner masker** — muncul di atas kamera jika masker terdeteksi, capture dibatalkan
- **Fail score badge** — menampilkan `Kecocokan: 38.5%` saat wajah tidak dikenali
- **Jam real-time** — diperbarui setiap detik di header
- **Auto-reset** — halaman kembali ke awal setelah 8 detik sukses

---

### `pages/AdminDashboard.jsx` — Dashboard Admin

Panel utama admin dengan 3 tab: **Rekap Absensi**, **Karyawan**, dan navigasi ke **Jadwal Shift**.

**State:**

| State | Keterangan |
|---|---|
| `activeTab` | `'attendance'` / `'employees'` |
| `summary` | Data ringkasan harian (hadir, belum hadir, pulang) |
| `logs` | Array log absensi |
| `employees` | Array data karyawan |
| `absentEmployees` | Array karyawan tidak hadir hari ini |

**Tab: Rekap Absensi**
- Filter berdasarkan rentang tanggal dan karyawan
- Tabel dengan kolom: No, Nama, Kode, Jenis, Waktu, Metode, Skor, Status, Aksi
- Badge **Terlambat Xm** (merah) atau **Tepat Waktu** (hijau) untuk absen masuk
- Tombol hapus per baris log absensi
- Tabel **Karyawan Tidak Hadir Hari Ini** muncul otomatis di bawah jika ada yang tidak hadir setelah toleransi shift habis
- Tombol **Export CSV**

**Tab: Karyawan**
- Tabel semua karyawan dengan kolom: Nama, Kode, Role, Wajah Terdaftar, Status, Terdaftar, Aksi
- Tombol **Edit** membuka `EditEmployeeModal`
- Tombol **Nonaktifkan** / **Aktifkan** untuk soft delete

**Summary Cards (4 kartu):**
- Total Karyawan
- Hadir Hari Ini
- Belum Hadir
- Sudah Pulang

---

### `pages/EnrollPage.jsx` — Registrasi Karyawan Baru

Formulir 3 langkah untuk mendaftarkan karyawan baru beserta foto wajahnya.

**Alur 3 Step:**

```
Step 1: Form data karyawan
    ├── Nama lengkap
    ├── Kode karyawan (auto-generate format ALN-XXX, bisa diubah)
    ├── Role/posisi (dropdown)
    └── PIN fallback (opsional, 4-6 digit)
         ↓ Submit → addEmployee() → dapat employee ID
Step 2: Capture foto wajah
    ├── Buka kamera (getUserMedia)
    ├── Pose guide 5 sudut: Depan, Kiri, Kanan, Atas, Bawah
    ├── Tombol "Ambil Foto" aktif saat wajah stabil
    ├── Alternatif: Upload dari galeri/file
    ├── Thumbnail setiap foto yang berhasil
    └── Minimum 3 foto → tombol "Selesai" aktif
         ↓ Selesai
Step 3: Konfirmasi berhasil
    ├── Pesan sukses dengan nama & jumlah foto
    └── Tombol kembali ke dashboard atau daftar lagi
```

**Fitur:**
- Kode karyawan digenerate otomatis (`GET /api/employees/generate-kode`)
- Setiap foto langsung dikirim ke backend untuk enrollment (`POST /api/employees/{id}/enroll-face`)
- Maksimal 20 foto per karyawan
- Progress bar menunjukkan jumlah foto terdaftar

---

### `pages/LoginPage.jsx` — Login Admin

Halaman login sederhana dengan form username + password.

**Fitur:**
- Menggunakan `useAuth()` context untuk proses login
- Tombol show/hide password
- Setelah login berhasil, redirect ke halaman yang sebelumnya dituju (via `location.state.from`) atau ke `/admin`
- Link kembali ke halaman absensi

---

### `pages/ShiftPage.jsx` — Jadwal Shift Mingguan

Halaman kalender grid 7 hari × karyawan untuk melihat dan mengatur jadwal shift.

**Fitur:**
- **Navigasi minggu** — tombol Sebelumnya / Berikutnya / Minggu Ini
- **Grid kalender** — baris per karyawan, kolom per hari
- **Chip shift** — ditampilkan dengan warna sesuai definisi shift, klik × untuk hapus
- **Tombol +** di setiap sel untuk assign shift baru dengan cepat
- **Modal Assign Shift** — pilih karyawan, shift, rentang tanggal, keterangan
- **Bulk assignment** — satu request bisa membuat jadwal untuk range tanggal (multi-hari)
- **Legend** — daftar shift dengan warna di atas kalender

---

## Komponen

---

### `components/ProtectedRoute.jsx`

```jsx
export default function ProtectedRoute({ children }) {
  const { loggedIn } = useAuth();
  const location = useLocation();
  if (!loggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
```

Wrapper sederhana yang memeriksa status login. Jika belum login, redirect ke `/login` sambil menyimpan `location` saat ini agar bisa kembali setelah login berhasil.

---

### `components/Navbar.jsx`

Navigasi admin dengan tautan ke Dashboard, Registrasi, Layar Absen, dan tombol Logout. Menggunakan `useLocation()` untuk highlight tautan aktif. Logout memanggil `logout()` dari context lalu redirect ke `/login`.

---

### `components/PinFallback.jsx`

Modal yang muncul setelah karyawan gagal dikenali **3 kali berturut-turut**. Berisi form:
- Input kode karyawan (format ALN-XXX)
- Input PIN

Memanggil `verifyPin(kodeKaryawan, pin, scanMode)` ke backend. Jika berhasil, memanggil `onSuccess(result)` ke parent.

---

### `components/AlreadyCompletedModal.jsx`

Modal pop-up yang tampil jika karyawan sudah melakukan **absen masuk & pulang** hari ini dan mencoba absen lagi. Menampilkan:
- Nama dan role karyawan
- Waktu absen masuk dan pulang hari ini
- Countdown 8 detik lalu otomatis tutup

---

### `components/EditEmployeeModal.jsx`

Modal 2 tab untuk mengedit data karyawan yang sudah terdaftar.

**Tab 1: Data Karyawan**
- Form: Nama, Kode Karyawan, Role, PIN baru (opsional + konfirmasi)
- Validasi: nama & kode wajib, PIN harus cocok dengan konfirmasi

**Tab 2: Data Wajah**
- Tampilkan jumlah foto wajah terdaftar dengan progress bar
- Tombol buka kamera untuk tambah foto baru dengan pose guide
- Alternatif upload dari file
- Tombol hapus semua embedding (untuk re-enroll)
- Thumbnail foto yang baru ditambahkan di sesi ini

---

### `components/TimeInput.jsx`

Komponen input waktu custom yang menghindari picker AM/PM bawaan browser. Terdiri dari dua `<input type="number">` terpisah (jam 0–23 dan menit 0–59) yang menghasilkan string format `"HH:MM"`. Digunakan di halaman manajemen shift.

---

## Library Utilities

---

### `lib/api.js` — API Client

Semua komunikasi HTTP ke backend melalui file ini.

**Fungsi `request()` (internal):**
```javascript
async function request(url, options = {}) {
  const token = getToken();
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  // ...fetch dengan authHeader injected...
  // Jika response 401 → removeToken() + redirect ke /login
  // Jika content-type CSV → return blob
  // Selain itu → return response.json()
}
```

Fitur:
- Auto-inject `Authorization: Bearer <token>` untuk semua request
- Auto-logout saat server kembalikan `401`
- Handle CSV download (return `Blob`)
- Pesan error user-friendly jika backend tidak bisa dihubungi

**Fungsi yang tersedia:**

| Fungsi | Method | Endpoint | Keterangan |
|---|---|---|---|
| `loginAdmin()` | POST | `/auth/login` | Login admin, dapatkan JWT |
| `verifyAuthToken()` | GET | `/auth/verify` | Cek token masih valid |
| `getEmployees()` | GET | `/employees` | Daftar karyawan |
| `getEmployee(id)` | GET | `/employees/{id}` | Detail karyawan |
| `generateKodeKaryawan()` | GET | `/employees/generate-kode` | Auto-generate kode ALN-XXX |
| `addEmployee(data)` | POST | `/employees` | Tambah karyawan baru |
| `enrollFace(id, blob)` | POST | `/employees/{id}/enroll-face` | Upload foto wajah |
| `updateEmployee(id, data)` | PUT | `/employees/{id}` | Update data karyawan |
| `deleteEmployee(id)` | DELETE | `/employees/{id}` | Nonaktifkan karyawan |
| `reactivateEmployee(id)` | PUT | `/employees/{id}/reactivate` | Aktifkan kembali |
| `clearFaceEmbeddings(id)` | DELETE | `/employees/{id}/face-embeddings` | Hapus semua data wajah |
| `verifyFace(blob, jenis)` | POST | `/attendance/verify-face` | Verifikasi wajah untuk absen |
| `verifyPin(kode, pin, jenis)` | POST | `/attendance/pin-fallback` | Absen via PIN |
| `getAttendanceLogs(filters)` | GET | `/attendance/logs` | Rekap absensi |
| `exportAttendance(filters)` | GET | `/attendance/export` | Export CSV + auto-download |
| `getAttendanceSummary(date)` | GET | `/attendance/summary` | Ringkasan harian |
| `getAbsentEmployees(date)` | GET | `/attendance/absent` | Karyawan tidak hadir |
| `deleteAttendanceLog(id)` | DELETE | `/attendance/logs/{id}` | Hapus satu log absensi |
| `getShifts()` | GET | `/shifts` | Daftar definisi shift |
| `createShift(data)` | POST | `/shifts` | Buat shift baru |
| `updateShift(id, data)` | PUT | `/shifts/{id}` | Update shift |
| `deleteShift(id)` | DELETE | `/shifts/{id}` | Hapus shift |
| `getSchedules(filters)` | GET | `/schedules` | Ambil jadwal |
| `createSchedule(data)` | POST | `/schedules` | Assign shift ke karyawan |
| `deleteSchedule(id)` | DELETE | `/schedules/{id}` | Hapus jadwal |

---

### `lib/auth.js` — Utilitas JWT

Mengelola JWT token di `localStorage`.

```javascript
const TOKEN_KEY = 'alonica_admin_token';

getToken()     // ambil token dari localStorage
setToken(t)    // simpan token
removeToken()  // hapus token (logout)
isLoggedIn()   // decode payload JWT, cek exp > now
```

**Catatan:** Verifikasi token hanya memeriksa tanggal expiry di sisi client. Verifikasi signature tetap dilakukan di backend setiap request.

---

### `lib/faceDetection.js` — Wrapper face-api.js

Modul untuk semua operasi deteksi wajah di browser.

**Fungsi yang diekspor:**

#### `loadFaceModels()`
```javascript
await Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
]);
```
Memuat 2 model dari folder `public/models/`. Dipanggil sekali saat halaman pertama dibuka. Idempotent — tidak reload jika sudah dimuat.

---

#### `detectFaces(video)`
Menjalankan `faceapi.detectAllFaces().withFaceLandmarks(true)` pada elemen `<video>`. Mengembalikan array detection objects termasuk bounding box dan 68 titik landmark.

---

#### `checkFaceStability(detections, videoWidth, videoHeight)`
Memvalidasi apakah ada tepat **1 wajah** yang layak untuk di-capture:

| Kondisi | Pesan |
|---|---|
| Tidak ada wajah | "Tidak ada wajah terdeteksi" |
| Lebih dari 1 wajah | "Terdeteksi lebih dari 1 wajah" |
| Terlalu jauh (`ratio < 4%`) | "Terlalu jauh. Dekatkan wajah ke kamera" |
| Tidak di tengah (offset > 30%) | "Posisikan wajah di tengah frame" |
| Skor kepercayaan < 0.6 | "Wajah kurang jelas. Perbaiki pencahayaan" |
| Semua kondisi terpenuhi | `stable: true` |

---

#### `captureFrame(video, format, quality)`
Mengambil satu frame dari elemen `<video>` menggunakan canvas sementara, lalu mengonversinya menjadi `Blob` JPEG (kualitas default 0.92).

---

#### `drawFaceOverlay(canvas, detections, isStable)`
Menggambar visual **corner marker** di sekitar wajah yang terdeteksi:
- Biru (`#3b82f6`) — wajah terdeteksi tapi belum stabil
- Hijau (`#10b981`) — wajah stabil, siap capture
- Canvas di-clear setiap frame

---

#### `detectMask(landmarks)`
Mendeteksi apakah wajah memakai masker berdasarkan **3 indikator geometri** dari 68 titik landmark:

| Indikator | Landmark | Threshold Masker |
|---|---|---|
| Rasio jarak hidung–mulut | Titik 33 (hidung), 51/57 (bibir) | `< 0.12` skor + 0.45 |
| Posisi mulut vs tinggi wajah | Titik 39/42 (mata), 57 (bibir), 8 (dagu) | `< 0.55` skor + 0.35 |
| Lebar bibir vs lebar mata | Titik 48/54 (sudut bibir), 36/45 (sudut mata) | `< 0.35` skor + 0.25 |

Keputusan: `maskScore >= 0.50` → `hasMask = true`

Return value:
```javascript
{
  hasMask: boolean,
  confidence: number,  // 0.0 – 1.0
  reason: string       // penjelasan jika masker terdeteksi
}
```

---

## Context

### `context/AuthContext.jsx`

Context global yang menyediakan state dan fungsi autentikasi ke seluruh aplikasi.

**Yang disediakan:**
- `loggedIn` — boolean, status login saat ini
- `loading` — boolean, sedang proses login
- `error` — string, pesan error login
- `login(username, password)` — memanggil `loginAdmin()`, simpan token, update state
- `logout()` — hapus token dari localStorage

---

## Alur Data Lengkap

```
[Browser / Kamera]
       │
       │ Setiap 300ms (detection loop)
       ▼
face-api.js: detectFaces() + withFaceLandmarks()
       │
       ├─► checkFaceStability() → cek posisi & ukuran
       │
       ├─► detectMask() → cek masker (3 indikator landmark)
       │
       └─► 5 frame stabil → captureFrame() → Blob JPEG
                │
                │ POST multipart/form-data
                ▼
         Backend: /api/attendance/verify-face
                │
                ▼
         InsightFace (RetinaFace + ArcFace)
         Anti-spoofing (5 indikator heuristik)
         Cosine similarity matching
                │
                ▼
         Response JSON → UI update
         (sukses / gagal / spoof / masker / shift)
```

---

## Cara Menjalankan Frontend

```bash
# Masuk ke folder frontend
cd frontend

# Install dependensi (jika belum)
npm install

# Jalankan development server
npm run dev
# → http://localhost:5173

# Build untuk production
npm run build

# Preview hasil build
npm run preview
```

> **Catatan:** Backend harus berjalan di `http://localhost:8000` sebelum membuka frontend. URL backend dapat dikonfigurasi di `src/lib/api.js` pada konstanta `API_BASE`.
