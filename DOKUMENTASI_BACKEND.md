# Dokumentasi Backend — Alonica Cafe Sistem Absensi Wajah

## Gambaran Umum

Backend dibangun menggunakan **FastAPI** (Python) dengan database **SQLite**. Sistem ini menyediakan REST API untuk absensi karyawan berbasis pengenalan wajah menggunakan **InsightFace** (RetinaFace + ArcFace).

---

## Struktur Folder

```
backend/
├── app/
│   ├── main.py              # Entry point aplikasi FastAPI
│   ├── db.py                # Koneksi database & session management
│   ├── models.py            # Model tabel database (SQLAlchemy ORM)
│   ├── routers/
│   │   ├── auth.py          # Endpoint autentikasi admin (JWT)
│   │   ├── employees.py     # Endpoint manajemen karyawan
│   │   ├── attendance.py    # Endpoint absensi & verifikasi wajah
│   │   ├── shifts.py        # Endpoint shift & jadwal kerja
│   │   └── __init__.py
│   └── services/
│       ├── face_engine.py   # Deteksi & embedding wajah (InsightFace)
│       ├── matcher.py       # Pencocokan wajah (cosine similarity)
│       ├── antispoofing.py  # Anti-spoofing / liveness detection
│       └── __init__.py
├── models/
│   └── facenox_antispoof.onnx  # Model ONNX anti-spoofing (MiniFASNetV2-SE)
├── .env                     # Konfigurasi environment (tidak di-commit)
├── .env.example             # Contoh konfigurasi environment
├── requirements.txt         # Daftar dependensi Python
└── alonica_attendance.db    # File database SQLite
```

---

## Penjelasan Tiap File

### `app/main.py` — Entry Point

File utama yang menginisialisasi aplikasi FastAPI. Menjalankan proses startup seperti inisialisasi database, seeding data shift, dan memuat model InsightFace ke memori.

**Fungsi utama:**
- `lifespan()` — konteks startup/shutdown: inisialisasi DB, seeding shift, load model InsightFace
- `root()` — endpoint health check (`GET /`) untuk memastikan server berjalan

**Konfigurasi:**
- CORS middleware dikonfigurasi untuk mengizinkan request dari frontend (`http://localhost:5173`)
- Semua router didaftarkan: auth, employees, attendance, shifts, schedules

---

### `app/db.py` — Database

Mengelola koneksi ke database SQLite menggunakan SQLAlchemy.

**Komponen:**
- `engine` — koneksi ke SQLite
- `SessionLocal` — factory untuk membuat sesi database
- `Base` — base class untuk semua model ORM
- `get_db()` — dependency FastAPI, menyediakan sesi DB dan auto-close setelah request selesai
- `init_db()` — membuat semua tabel jika belum ada (dipanggil saat startup)
- `seed_shifts()` — mengisi data 2 shift tetap Alonica Cafe (Shift 1: 08:00–16:00, Shift 2: 16:00–00:00) jika belum ada

---

### `app/models.py` — Model Database

Mendefinisikan 4 tabel database menggunakan SQLAlchemy ORM.

#### Tabel `employees` — Data Karyawan

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `nama` | String | Nama lengkap karyawan |
| `kode_karyawan` | String | Kode unik (format: ALN-001) |
| `role` | String | Jabatan (Barista, Kasir, dll.) |
| `pin_fallback` | String | PIN terenkripsi bcrypt (opsional) |
| `face_embeddings_json` | Text | Array JSON berisi vektor embedding wajah (512 dimensi) |
| `foto_referensi_url` | Text | URL foto referensi |
| `status` | Boolean | True = aktif, False = non-aktif (soft delete) |
| `created_at` | DateTime | Waktu pendaftaran |

**Method penting:**
- `face_embeddings` (property) — serialize/deserialize embedding dari JSON
- `add_embedding()` — tambah embedding baru, maksimal 20 per karyawan
- `to_dict()` — konversi ke dictionary untuk response API

#### Tabel `attendance_logs` — Log Absensi

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `employee_id` | String (FK) | Referensi ke tabel employees |
| `jenis` | Enum | `masuk` atau `pulang` |
| `timestamp` | DateTime | Waktu absen (UTC) |
| `similarity_score` | Float | Skor kecocokan wajah (0–1), NULL jika via PIN |
| `metode` | Enum | `wajah` atau `pin_fallback` |
| `terlambat` | Boolean | True jika absen masuk melebihi jam shift |
| `menit_terlambat` | Integer | Selisih keterlambatan dalam menit |

#### Tabel `shifts` — Definisi Shift Kerja

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `nama` | String | Nama shift (contoh: "Shift 1") |
| `jam_masuk` | String | Jam mulai kerja (format: "HH:MM") |
| `jam_pulang` | String | Jam selesai kerja (format: "HH:MM") |
| `warna` | String | Warna hex untuk tampilan kalender |

#### Tabel `scheduled_shifts` — Jadwal Shift Karyawan

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | String (UUID) | Primary key |
| `employee_id` | String (FK) | Referensi ke employees |
| `shift_id` | String (FK) | Referensi ke shifts |
| `tanggal` | Date | Tanggal berlakunya jadwal |
| `keterangan` | String | Catatan tambahan (opsional) |

---

### `app/routers/auth.py` — Autentikasi Admin

Mengelola login admin menggunakan JWT (JSON Web Token) yang dibuat secara manual tanpa library eksternal.

**Endpoint:**

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/login` | Login admin, mengembalikan JWT token |
| GET | `/api/auth/verify` | Verifikasi apakah token masih valid |

**Mekanisme JWT:**
- Algoritma: **HS256** (HMAC-SHA256)
- Token berlaku selama **8 jam**
- Dibuat dari stdlib Python (`hmac`, `hashlib`, `base64`) tanpa dependensi tambahan
- `create_token()` — membuat JWT dengan payload dan expiry
- `decode_token()` — memverifikasi signature dan expiry token
- `get_current_admin()` — FastAPI dependency untuk proteksi endpoint

**Keamanan:**
- Perbandingan password menggunakan `hmac.compare_digest()` untuk mencegah timing attack

---

### `app/routers/employees.py` — Manajemen Karyawan

Mengelola data karyawan dan proses pendaftaran wajah (enrollment).

**Endpoint:**

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/employees/generate-kode` | Generate kode karyawan otomatis (ALN-XXX) |
| POST | `/api/employees` | Tambah karyawan baru |
| GET | `/api/employees` | Daftar semua karyawan (filter by status) |
| GET | `/api/employees/{id}` | Detail satu karyawan |
| POST | `/api/employees/{id}/enroll-face` | Upload foto wajah untuk registrasi |
| PUT | `/api/employees/{id}` | Update data karyawan |
| DELETE | `/api/employees/{id}` | Nonaktifkan karyawan (soft delete) |
| PUT | `/api/employees/{id}/reactivate` | Aktifkan kembali karyawan |
| DELETE | `/api/employees/{id}/face-embeddings` | Hapus semua data wajah |

**Proses Enrollment Wajah:**
1. Menerima gambar dari frontend
2. Memanggil `get_single_face_embedding()` dari `face_engine.py`
3. Menyimpan vektor embedding 512 dimensi ke kolom `face_embeddings_json`
4. Satu karyawan bisa memiliki hingga **20 embedding** dari berbagai sudut

---

### `app/routers/attendance.py` — Absensi

Mengelola proses absensi karyawan, verifikasi wajah, dan rekap data.

**Endpoint:**

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/attendance/verify-face` | Verifikasi wajah untuk absensi |
| POST | `/api/attendance/pin-fallback` | Absensi via PIN (fallback) |
| DELETE | `/api/attendance/log/{id}` | Hapus satu record absensi |
| GET | `/api/attendance/logs` | Rekap absensi dengan filter |
| GET | `/api/attendance/export` | Export rekap ke CSV |
| GET | `/api/attendance/absent` | Daftar karyawan tidak hadir hari ini |
| GET | `/api/attendance/summary` | Ringkasan absensi harian |

**Alur `POST /api/attendance/verify-face`:**

```
1. Terima gambar (multipart/form-data)
2. get_single_face_embedding() → deteksi & ekstraksi embedding wajah
3. check_liveness() → anti-spoofing: tolak jika foto/layar
4. find_best_match() → cocokkan dengan semua embedding karyawan aktif
5. _check_shift_schedule() → validasi apakah dalam toleransi jam shift
6. Catat AttendanceLog ke database
7. Hitung keterlambatan jika absen masuk
```

**Toleransi Waktu Absen:**
- Absen masuk: 30 menit sebelum jam masuk s/d 2 jam setelah jam masuk
- Setelah melewati batas: karyawan dinyatakan **tidak hadir**

**Endpoint `GET /api/attendance/absent`:**
- Mengembalikan daftar karyawan yang punya jadwal shift hari ini namun belum absen setelah batas toleransi habis

---

### `app/routers/shifts.py` — Shift & Jadwal

Mengelola definisi shift kerja dan penugasan shift ke karyawan.

**Endpoint Shift:**

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/shifts` | Buat shift baru |
| GET | `/api/shifts` | Daftar semua shift |
| PUT | `/api/shifts/{id}` | Update shift |
| DELETE | `/api/shifts/{id}` | Hapus shift (beserta semua jadwalnya) |

**Endpoint Jadwal:**

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/schedules` | Assign shift ke karyawan (bisa range tanggal) |
| GET | `/api/schedules` | Ambil jadwal (filter by tanggal & karyawan) |
| DELETE | `/api/schedules/{id}` | Hapus satu jadwal |

**Fitur Bulk Assignment:**
Satu request `POST /api/schedules` dapat membuat jadwal untuk range tanggal sekaligus (maksimal 365 hari). Jadwal duplikat (employee + shift + tanggal sama) akan dilewati otomatis.

---

### `app/services/face_engine.py` — Engine Pengenalan Wajah

Modul inti yang menangani deteksi dan ekstraksi fitur wajah menggunakan **InsightFace**.

**Model yang digunakan:**

| File Model | Fungsi |
|---|---|
| `det_10g.onnx` | **RetinaFace** — deteksi posisi wajah dalam gambar |
| `w600k_r50.onnx` | **ArcFace R50** — ekstraksi embedding wajah 512 dimensi |
| `1k3d68.onnx` | Estimasi landmark wajah 3D (68 titik) |
| `2d106det.onnx` | Estimasi landmark wajah 2D (106 titik) |
| `genderage.onnx` | Estimasi gender dan usia |

Semua model di atas tergabung dalam **model pack `buffalo_l`** dari InsightFace dan berjalan di CPU.

**Fungsi utama:**

- `load_model()` — memuat model buffalo_l ke memori saat server startup (sekali saja)
- `detect_and_embed()` — mendeteksi semua wajah dalam gambar dan menghasilkan embedding
- `get_single_face_embedding()` — khusus untuk kasus tepat 1 wajah (enrollment & verifikasi)

**Alur pemrosesan gambar:**
```
Input gambar (JPEG/PNG)
    ↓ Decode → PIL Image → RGB
    ↓ Konversi ke BGR (konvensi OpenCV)
    ↓ RetinaFace: deteksi bounding box wajah
    ↓ ArcFace: ekstraksi embedding 512 dimensi
Output: vektor float32[512]
```

---

### `app/services/matcher.py` — Pencocokan Wajah

Membandingkan embedding wajah hasil tangkapan kamera dengan seluruh embedding karyawan yang tersimpan di database.

**Metode:** Cosine Similarity

```
similarity = (A · B) / (|A| × |B|)
```

Nilai antara -1 sampai 1. Semakin mendekati 1 berarti semakin mirip.

**Fungsi utama:**

- `cosine_similarity(a, b)` — hitung kemiripan dua vektor embedding
- `find_best_match(query, employees)` — bandingkan embedding query dengan seluruh karyawan

**Logika pencocokan:**
- Setiap karyawan bisa punya lebih dari 1 embedding (dari berbagai sudut wajah)
- Diambil skor tertinggi dari semua embedding milik satu karyawan
- Karyawan dengan skor tertinggi dinyatakan sebagai hasil terbaik
- Hasil diterima hanya jika skor ≥ **threshold** (default: `0.55`, dapat diatur via `.env`)

---

### `app/services/antispoofing.py` — Anti-Spoofing / Liveness Detection

Mendeteksi apakah wajah di depan kamera adalah wajah asli (3D/live) atau serangan spoofing 2D seperti foto cetak atau gambar di layar HP.

**Metode yang digunakan:** Analisis heuristik berbasis tekstur dan frekuensi gambar (tanpa model ML tambahan).

**5 Indikator yang dihitung:**

| Indikator | Penjelasan |
|---|---|
| **LBP Texture Variance** | Kulit wajah asli punya pola tekstur kompleks; foto di layar lebih halus/flat |
| **Laplacian Variance (Sharpness)** | Wajah asli tajam; foto di layar sering blur akibat double-lens effect |
| **FFT Frequency Ratio** | Analisis distribusi energi frekuensi tinggi vs rendah |
| **Color Channel Variance** | Layar HP menampilkan warna lebih seragam dibanding wajah asli |
| **Brightness CoV** | Layar HP sering memancarkan cahaya seragam |

**Scoring:**
```
Laplacian (bobot 55%) + LBP (15%) + Frequency (15%) + Color (10%) + Brightness (5%)
```

**Keputusan:**
- Skor ≥ `0.50` → wajah dinyatakan **asli (live)**
- Skor < `0.50` → wajah dinyatakan **spoof (tolak)**
- Hard rule: jika `lap_score < 0.35` → langsung tolak tanpa menghitung bobot lainnya

---

### `.env.example` — Konfigurasi Environment

Template file konfigurasi yang harus disalin menjadi `.env` sebelum menjalankan server.

| Variabel | Default | Keterangan |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./alonica_attendance.db` | URL koneksi database |
| `SIMILARITY_THRESHOLD` | `0.55` | Ambang batas kecocokan wajah (0–1) |
| `FRONTEND_URL` | `http://localhost:5173` | URL frontend untuk CORS |
| `ADMIN_USERNAME` | `admin` | Username login admin |
| `ADMIN_PASSWORD` | `admin123` | Password login admin |
| `SECRET_KEY` | *(harus diganti)* | Kunci rahasia untuk signing JWT token |

> **Penting:** Ganti nilai `SECRET_KEY`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD` sebelum deploy ke production.

---

### `requirements.txt` — Dependensi Python

| Package | Versi | Fungsi |
|---|---|---|
| `fastapi` | 0.115.0 | Web framework REST API |
| `uvicorn[standard]` | 0.30.0 | ASGI server untuk menjalankan FastAPI |
| `sqlalchemy` | 2.0.31 | ORM untuk manajemen database |
| `insightface` | 0.7.3 | Library face recognition (RetinaFace + ArcFace) |
| `onnxruntime` | 1.19.2 | Runtime untuk menjalankan model ONNX (CPU) |
| `numpy` | ≥1.24.0 | Komputasi numerik (embedding, similarity) |
| `pillow` | 10.4.0 | Pemrosesan gambar |
| `bcrypt` | 4.2.0 | Enkripsi PIN karyawan |
| `python-dotenv` | 1.0.1 | Membaca file `.env` |
| `python-multipart` | 0.0.9 | Parsing form data & file upload |
| `python-jose[cryptography]` | 3.3.0 | JWT (disertakan tapi tidak digunakan aktif) |
| `aiofiles` | 24.1.0 | File I/O asynchronous |

---

## Cara Menjalankan Backend

```bash
# 1. Masuk ke folder backend
cd backend

# 2. Aktifkan virtual environment
venv\Scripts\activate          # Windows
source venv/bin/activate       # Linux/Mac

# 3. Install dependensi (jika belum)
pip install -r requirements.txt

# 4. Salin konfigurasi environment
cp .env.example .env
# Edit .env sesuai kebutuhan

# 5. Jalankan server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server akan berjalan di **http://localhost:8000**  
Dokumentasi API (Swagger UI) tersedia di **http://localhost:8000/docs**

---

## Alur Data Sistem

```
[Frontend / Kamera]
        │
        │ POST multipart/form-data (gambar + jenis)
        ▼
[attendance.py: /api/attendance/verify-face]
        │
        ├─► face_engine.py → RetinaFace: deteksi bbox wajah
        │                  → ArcFace: embedding 512-d
        │
        ├─► antispoofing.py → Analisis tekstur & frekuensi
        │                   → Tolak jika foto/layar
        │
        ├─► matcher.py → Cosine similarity vs semua karyawan
        │              → Threshold ≥ 0.55 → match
        │
        ├─► Validasi jadwal shift (toleransi waktu)
        │
        └─► Simpan AttendanceLog ke SQLite
```
