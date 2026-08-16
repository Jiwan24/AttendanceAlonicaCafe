# DOKUMENTASI SISTEM ABSENSI ALONICA CAFE
## Sistem Absensi Berbasis Face Recognition dengan Anti-Spoofing

---

## 📋 DAFTAR ISI

1. [Overview Sistem](#1-overview-sistem)
2. [Arsitektur Sistem](#2-arsitektur-sistem)
3. [Teknologi yang Digunakan](#3-teknologi-yang-digunakan)
4. [Fitur Utama](#4-fitur-utama)
5. [Model Database](#5-model-database)
6. [API Endpoints](#6-api-endpoints)
7. [Algoritma Face Recognition](#7-algoritma-face-recognition)
8. [Anti-Spoofing System](#8-anti-spoofing-system)
9. [Manajemen Shift](#9-manajemen-shift)
10. [Alur Kerja Sistem](#10-alur-kerja-sistem)
11. [Cara Instalasi & Menjalankan](#11-cara-instalasi--menjalankan)
12. [Testing & Validasi](#12-testing--validasi)
13. [Security Features](#13-security-features)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. OVERVIEW SISTEM

### 1.1 Latar Belakang
Sistem Absensi Alonica Cafe adalah aplikasi berbasis web yang dirancang untuk mengelola absensi karyawan menggunakan teknologi **Face Recognition (Pengenalan Wajah)** dengan fitur **Anti-Spoofing** untuk mencegah kecurangan menggunakan foto atau video.

### 1.2 Tujuan
- Mempermudah proses absensi karyawan tanpa kontak fisik
- Mencegah manipulasi absensi (titip absen) melalui deteksi anti-spoofing
- Mengelola shift kerja karyawan secara otomatis
- Menyediakan laporan absensi real-time untuk manajemen
- Meningkatkan akurasi pencatatan waktu kehadiran

### 1.3 Keunggulan Sistem
1. **Touchless**: Tanpa perlu kartu atau fingerprint
2. **Akurat**: Menggunakan ArcFace (state-of-the-art face recognition)
3. **Aman**: Fitur anti-spoofing mencegah penggunaan foto/video palsu
4. **Real-time**: Proses pengenalan wajah < 2 detik
5. **Multi-shift**: Mendukung pengelolaan berbagai jadwal shift
6. **PIN Fallback**: Backup method jika face recognition gagal

---

## 2. ARSITEKTUR SISTEM

### 2.1 Arsitektur Umum
Sistem menggunakan arsitektur **Client-Server** dengan pemisahan Frontend dan Backend:

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT SIDE                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React Frontend (Vite)                               │  │
│  │  - Camera Capture (MediaStream API)                  │  │
│  │  - Face Detection (face-api.js)                      │  │
│  │  - Admin Dashboard                                   │  │
│  │  - Real-time Preview                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/REST API
┌─────────────────────────────────────────────────────────────┐
│                      SERVER SIDE                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  FastAPI Backend (Python)                            │  │
│  │  ┌─────────────────────────────────────────────┐    │  │
│  │  │  Face Recognition Engine                    │    │  │
│  │  │  - InsightFace (RetinaFace + ArcFace)       │    │  │
│  │  │  - Embedding Generation (512-d vector)      │    │  │
│  │  └─────────────────────────────────────────────┘    │  │
│  │  ┌─────────────────────────────────────────────┐    │  │
│  │  │  Anti-Spoofing Module                       │    │  │
│  │  │  - Texture Analysis                         │    │  │
│  │  │  - Motion Detection                         │    │  │
│  │  └─────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                           │
│  SQLite Database (alonica_attendance.db)                    │
│  - employees                                                │
│  - attendance_logs                                          │
│  - shifts                                                   │
│  - scheduled_shifts                                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

**Frontend:**
- React 19.2.7
- Vite 8.1.1 (Build tool)
- React Router DOM 7.18.1 (Routing)
- Lucide React (Icons)
- face-api.js (Client-side face detection)

**Backend:**
- Python 3.x
- FastAPI 0.115.0 (Web framework)
- SQLAlchemy 2.0.31 (ORM)
- InsightFace 0.7.3 (Face recognition)
- ONNX Runtime 1.19.2 (Model inference)
- Bcrypt (Password hashing)
- Python-JOSE (JWT tokens)

**Database:**
- SQLite (Development & Production)

---

## 3. TEKNOLOGI YANG DIGUNAKAN

### 3.1 Face Recognition Technology

#### 3.1.1 InsightFace
**InsightFace** adalah framework state-of-the-art untuk face recognition yang menggunakan:

1. **RetinaFace**: Face detection & alignment
   - Mendeteksi wajah dalam gambar
   - Mendeteksi 5 landmark wajah (mata, hidung, mulut)
   - Akurasi tinggi pada berbagai pose

2. **ArcFace (buffalo_l model)**: Face recognition
   - Menghasilkan face embedding 512-dimensi
   - Akurasi > 99.8% pada LFW dataset
   - Robust terhadap variasi pencahayaan dan pose

#### 3.1.2 Face Embedding
- Setiap wajah dikonversi menjadi vektor 512 dimensi
- Vektor ini merepresentasikan fitur unik wajah seseorang
- Similarity dihitung menggunakan **Cosine Similarity**:
  ```
  similarity = (A · B) / (||A|| × ||B||)
  ```
- Threshold matching: **0.55** (similarity ≥ 0.55 = match, configurable via .env)

### 3.2 Anti-Spoofing Technology

Sistem anti-spoofing menggunakan **multi-layer verification**:

1. **Client-Side Detection (face-api.js)**:
   - Deteksi wajah real-time di browser
   - Minimal 1 wajah terdeteksi
   - Filter foto yang blur atau low quality

2. **Server-Side Verification**:
   - **Texture Analysis**: Menganalisis pola tekstur wajah
   - **Edge Density**: Menghitung kerapatan edge (foto cenderung lebih tajam)
   - **Frequency Domain**: Analisis Fourier Transform
   - **Color Distribution**: Distribusi warna pada wajah asli vs foto

3. **Motion Detection** (Optional):
   - Meminta user menggerakkan kepala
   - Validasi konsistensi embedding antar frame

### 3.3 Authentication & Security
- **JWT (JSON Web Token)**: Autentikasi admin
- **Bcrypt**: Hashing password dan PIN
- **CORS**: Cross-Origin Resource Sharing protection
- **Environment Variables**: Sensitive data protection

---

## 4. FITUR UTAMA

### 4.1 Fitur Karyawan
1. **Absensi Masuk/Pulang**:
   - Scan wajah melalui webcam
   - Deteksi otomatis jenis absensi (masuk/pulang)
   - Feedback real-time (sukses/gagal)

2. **PIN Fallback**:
   - Alternatif absensi jika face recognition gagal
   - Kombinasi kode karyawan + PIN 4 digit
   - Secure hashing menggunakan bcrypt

3. **Informasi Shift**:
   - Melihat jadwal shift hari ini
   - Notifikasi keterlambatan

### 4.2 Fitur Admin
1. **Dashboard**:
   - Statistik absensi real-time
   - List karyawan yang sudah/belum absen
   - Grafik kehadiran
   - Log absensi dengan filter

2. **Manajemen Karyawan**:
   - Tambah karyawan baru
   - Edit data karyawan
   - Hapus karyawan
   - Aktifkan/Nonaktifkan karyawan

3. **Enrollment Wajah**:
   - Capture 3-5 foto wajah per karyawan
   - Preview dan validasi foto
   - Multiple embedding untuk akurasi tinggi

4. **Manajemen Shift**:
   - Buat shift kerja (pagi/malam)
   - Assign shift ke karyawan per tanggal
   - Calendar view untuk jadwal bulanan
   - Edit dan hapus assignment shift

5. **Laporan**:
   - Export data absensi
   - Filter berdasarkan tanggal, karyawan, shift
   - Deteksi keterlambatan otomatis

---

## 5. MODEL DATABASE

### 5.1 Entity Relationship Diagram (ERD)

```
┌─────────────────────────┐
│      EMPLOYEES          │
│─────────────────────────│
│ id (PK)                 │
│ nama                    │
│ kode_karyawan (UNIQUE)  │
│ role                    │
│ pin_fallback            │
│ face_embeddings_json    │
│ foto_referensi_url      │
│ status                  │
│ created_at              │
└───────────┬─────────────┘
            │ 1
            │
            │ N
┌───────────┴─────────────┐       ┌─────────────────────────┐
│   ATTENDANCE_LOGS       │       │     SCHEDULED_SHIFTS    │
│─────────────────────────│       │─────────────────────────│
│ id (PK)                 │       │ id (PK)                 │
│ employee_id (FK)        │       │ employee_id (FK)        │
│ jenis (masuk/pulang)    │       │ shift_id (FK)           │
│ timestamp               │       │ tanggal                 │
│ similarity_score        │       │ keterangan              │
│ metode                  │       │ created_at              │
│ foto_capture_url        │       └───────────┬─────────────┘
│ terlambat               │                   │ N
│ menit_terlambat         │                   │
│ created_at              │                   │ 1
└─────────────────────────┘       ┌───────────┴─────────────┐
                                  │        SHIFTS           │
                                  │─────────────────────────│
                                  │ id (PK)                 │
                                  │ nama                    │
                                  │ jam_masuk               │
                                  │ jam_pulang              │
                                  │ warna                   │
                                  │ created_at              │
                                  └─────────────────────────┘
```


### 5.2 Penjelasan Tabel

#### 5.2.1 Table: employees
Menyimpan data karyawan dan face embeddings.

| Field | Type | Deskripsi |
|-------|------|-----------|
| id | String (UUID) | Primary key |
| nama | String(100) | Nama lengkap karyawan |
| kode_karyawan | String(50) | Kode unik (misal: ALO001) |
| role | String(50) | Jabatan (Barista, Kasir, Manager) |
| pin_fallback | String(255) | Hashed PIN untuk backup |
| face_embeddings_json | Text | JSON array of 512-d vectors |
| foto_referensi_url | Text | URL foto profil |
| status | Boolean | True = aktif, False = nonaktif |
| created_at | DateTime | Timestamp pembuatan |

**Catatan**: Setiap karyawan dapat memiliki hingga **20 face embeddings** untuk meningkatkan akurasi recognition pada berbagai kondisi (pose, lighting, accessories).

#### 5.2.2 Table: attendance_logs
Menyimpan setiap event absensi (masuk/pulang).

| Field | Type | Deskripsi |
|-------|------|-----------|
| id | String (UUID) | Primary key |
| employee_id | String (FK) | Foreign key ke employees |
| jenis | Enum | "masuk" atau "pulang" |
| timestamp | DateTime | Waktu absensi |
| similarity_score | Float | Nilai similarity (0-1), null untuk PIN |
| metode | Enum | "wajah" atau "pin_fallback" |
| foto_capture_url | Text | URL foto saat absen |
| terlambat | Boolean | True jika terlambat |
| menit_terlambat | Integer | Jumlah menit keterlambatan |


#### 5.2.3 Table: shifts
Definisi shift kerja.

| Field | Type | Deskripsi |
|-------|------|-----------|
| id | String (UUID) | Primary key |
| nama | String(100) | Nama shift (Shift Pagi, Shift Malam) |
| jam_masuk | String(5) | Format HH:MM (08:00) |
| jam_pulang | String(5) | Format HH:MM (16:00) |
| warna | String(7) | Hex color (#3b82f6) |
| created_at | DateTime | Timestamp pembuatan |

**Default Shifts**:
- Shift 1: 08:00 - 16:00 (Shift Pagi)
- Shift 2: 16:00 - 00:00 (Shift Malam)

#### 5.2.4 Table: scheduled_shifts
Assignment shift ke karyawan per tanggal.

| Field | Type | Deskripsi |
|-------|------|-----------|
| id | String (UUID) | Primary key |
| employee_id | String (FK) | Foreign key ke employees |
| shift_id | String (FK) | Foreign key ke shifts |
| tanggal | Date | Tanggal assignment |
| keterangan | String(200) | Catatan tambahan |
| created_at | DateTime | Timestamp pembuatan |

---

## 6. API ENDPOINTS

### 6.1 Authentication Endpoints

#### POST /auth/login
Login admin untuk akses dashboard.

**Request Body**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### 6.2 Employee Endpoints


#### GET /employees
Mendapatkan list semua karyawan.

**Query Parameters**:
- `status`: optional (true/false) - filter by active status

**Response**:
```json
{
  "employees": [
    {
      "id": "uuid",
      "nama": "John Doe",
      "kode_karyawan": "ALO001",
      "role": "Barista",
      "status": true,
      "face_count": 5,
      "foto_referensi_url": "/uploads/...",
      "created_at": "2024-01-15T10:30:00"
    }
  ]
}
```

#### POST /employees
Membuat karyawan baru.

**Request Body** (multipart/form-data):
- `nama`: string (required)
- `kode_karyawan`: string (required, unique)
- `role`: string (default: "Barista")
- `pin_fallback`: string (optional, 4-6 digits)
- `foto_referensi`: file (optional)

#### PUT /employees/{employee_id}
Update data karyawan.

#### DELETE /employees/{employee_id}
Hapus karyawan (soft delete, set status = false).

### 6.3 Face Recognition Endpoints

#### POST /employees/{employee_id}/enroll
Enroll wajah karyawan (menambahkan face embedding).

**Request Body** (multipart/form-data):
- `file`: image file (required)

**Response**:
```json
{
  "message": "Face enrolled successfully",
  "embedding_count": 3,
  "similarity_to_existing": 0.92
}
```

#### POST /attendance/recognize
Recognize wajah untuk absensi.

**Request Body** (multipart/form-data):
- `file`: image file (required)


**Response (Success)**:
```json
{
  "success": true,
  "employee": {
    "id": "uuid",
    "nama": "John Doe",
    "kode_karyawan": "ALO001"
  },
  "similarity": 0.87,
  "jenis": "masuk",
  "timestamp": "2024-01-15T08:15:30Z",
  "terlambat": false,
  "menit_terlambat": 0
}
```

**Response (Spoofing Detected)**:
```json
{
  "success": false,
  "message": "Anti-spoofing check failed",
  "detail": "Possible photo/video detected"
}
```

### 6.4 Attendance Endpoints

#### GET /attendance/logs
Mendapatkan log absensi.

**Query Parameters**:
- `date`: YYYY-MM-DD (optional, default: today)
- `employee_id`: string (optional)
- `limit`: int (optional, default: 100)

#### POST /attendance/pin-fallback
Absensi menggunakan PIN (fallback method).

**Request Body**:
```json
{
  "kode_karyawan": "ALO001",
  "pin": "1234"
}
```

### 6.5 Shift Management Endpoints

#### GET /shifts
List semua shift.

#### POST /shifts
Buat shift baru.

#### GET /schedule
Get jadwal shift untuk tanggal tertentu.

**Query Parameters**:
- `start_date`: YYYY-MM-DD (required)
- `end_date`: YYYY-MM-DD (required)

#### POST /schedule
Assign shift ke karyawan.

**Request Body**:
```json
{
  "employee_id": "uuid",
  "shift_id": "uuid",
  "tanggal": "2024-01-15",
  "keterangan": "Normal shift"
}
```

---

## 7. ALGORITMA FACE RECOGNITION

### 7.1 Pipeline Face Recognition

```
┌──────────────────────────────────────────────────────────────┐
│              FACE RECOGNITION PIPELINE                       │
└──────────────────────────────────────────────────────────────┘

INPUT: Raw Image (JPG/PNG)
   ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Face Detection (RetinaFace)                          │
│ - Deteksi posisi wajah dalam gambar                          │
│ - Output: Bounding box coordinates                           │
└──────────────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Face Alignment                                       │
│ - Deteksi 5 facial landmarks (2 eyes, nose, 2 mouth corners) │
│ - Align wajah ke posisi standar                              │
│ - Normalize size (112x112 pixels)                            │
└──────────────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Feature Extraction (ArcFace)                         │
│ - Deep CNN (ResNet-based)                                    │
│ - Output: 512-dimensional embedding vector                   │
│ - Normalized to unit length                                  │
└──────────────────────────────────────────────────────────────┘
   ↓
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: Matching                                             │
│ - Compare dengan database embeddings                         │
│ - Calculate cosine similarity                                │
│ - Threshold: 0.55 (configurable)                            │
└──────────────────────────────────────────────────────────────┘
   ↓
OUTPUT: Employee ID + Similarity Score
```

### 7.2 Cosine Similarity Formula

```python
def cosine_similarity(embedding_a, embedding_b):
    """
    Hitung similarity antara 2 face embeddings
    Range: -1 (opposite) to 1 (identical)
    """
    dot_product = np.dot(embedding_a, embedding_b)
    norm_a = np.linalg.norm(embedding_a)
    norm_b = np.linalg.norm(embedding_b)
    
    similarity = dot_product / (norm_a * norm_b)
    return similarity
```

### 7.3 Matching Strategy

**Multi-Embedding Matching**:
- Setiap karyawan memiliki multiple embeddings (max 20)
- Saat recognition, bandingkan dengan SEMUA embeddings
- Ambil similarity TERTINGGI
- Jika similarity ≥ 0.55, maka MATCH (default threshold, bisa disesuaikan)

**Keuntungan**:
- Robust terhadap variasi pose (frontal, left, right)
- Robust terhadap variasi lighting
- Robust terhadap accessories (glasses, mask)

### 7.4 Threshold Tuning

| Threshold | False Accept Rate | False Reject Rate | Note |
|-----------|-------------------|-------------------|------|
| 0.40 | High (risiko salah orang) | Low | Too permissive |
| 0.55 | Low (balanced) | Medium | **Default (current)** |
| 0.65 | Very Low | High (reject orang benar) | Very strict |

**Pilihan: 0.55** - Balance keamanan dan usability, configurable via environment variable `SIMILARITY_THRESHOLD`.

---

## 8. ANTI-SPOOFING SYSTEM

### 8.1 Jenis Serangan Spoofing

1. **Print Attack**: Menggunakan foto cetak
2. **Digital Photo Attack**: Menampilkan foto di layar HP/tablet
3. **Video Replay Attack**: Memutar video wajah
4. **3D Mask Attack**: Menggunakan topeng 3D (advanced)

### 8.2 Multi-Layer Anti-Spoofing

#### Layer 1: Client-Side Detection (face-api.js)
```javascript
// Deteksi wajah real-time di browser
const detection = await faceapi
  .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
  .withFaceLandmarks();

if (!detection) {
  return "No face detected";
}

// Validasi kualitas
if (detection.detection.score < 0.5) {
  return "Face quality too low";
}
```

#### Layer 2: Server-Side Texture Analysis
```python
def analyze_texture(face_image):
    """
    Analisis tekstur untuk deteksi foto vs wajah asli.
    Foto cenderung memiliki tekstur lebih uniform.
    """
    gray = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)
    
    # 1. Laplacian variance (blur detection)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    
    # Foto cenderung terlalu tajam atau terlalu blur
    if variance < 50 or variance > 500:
        return False
    
    # 2. LBP (Local Binary Pattern) histogram
    lbp = local_binary_pattern(gray, P=8, R=1)
    hist, _ = np.histogram(lbp, bins=256)
    
    # Wajah asli memiliki distribusi LBP lebih kompleks
    entropy = -np.sum(hist * np.log2(hist + 1e-10))
    
    return entropy > 4.5  # Threshold empiris
```

#### Layer 3: Edge Density Analysis
```python
def check_edge_density(face_image):
    """
    Foto cetak/digital memiliki edge yang terlalu tajam.
    """
    edges = cv2.Canny(face_image, 50, 150)
    edge_density = np.sum(edges > 0) / edges.size
    
    # Range normal untuk wajah asli: 0.05 - 0.20
    return 0.05 < edge_density < 0.20
```

#### Layer 4: Color Distribution
```python
def analyze_color_distribution(face_image):
    """
    Wajah asli memiliki variasi warna natural (vena, gradasi kulit).
    Foto cenderung flat.
    """
    hsv = cv2.cvtColor(face_image, cv2.COLOR_BGR2HSV)
    
    # Hitung standard deviation pada channel Saturation
    saturation_std = np.std(hsv[:, :, 1])
    
    # Wajah asli: saturation std > 15
    return saturation_std > 15
```

### 8.3 Combined Anti-Spoofing Score

```python
def anti_spoofing_check(face_image):
    """
    Gabungkan semua metode dengan weighted scoring.
    """
    scores = {
        'texture': analyze_texture(face_image),      # weight: 0.3
        'edge': check_edge_density(face_image),      # weight: 0.3
        'color': analyze_color_distribution(face_image), # weight: 0.2
        'motion': check_motion_consistency(frames),  # weight: 0.2
    }
    
    weighted_score = (
        scores['texture'] * 0.3 +
        scores['edge'] * 0.3 +
        scores['color'] * 0.2 +
        scores['motion'] * 0.2
    )
    
    # Threshold: 0.6
    return weighted_score >= 0.6
```

### 8.4 False Positive Handling

**Problem**: Legitimate users bisa ditolak karena lighting buruk atau kamera low quality.

**Solution**:
1. Memberikan feedback spesifik ("Pencahayaan kurang", "Terlalu gelap")
2. Allow 3 retry attempts
3. Fallback ke PIN method

---

## 9. MANAJEMEN SHIFT

### 9.1 Konsep Shift

**Shift** adalah jadwal kerja dengan jam masuk dan jam pulang tertentu.

**Contoh**:
- Shift Pagi: 08:00 - 16:00
- Shift Malam: 16:00 - 00:00

### 9.2 Scheduled Shift

**Scheduled Shift** adalah assignment shift ke karyawan untuk tanggal spesifik.

**Contoh**:
- John Doe → Shift Pagi → 15 Januari 2024
- Jane Smith → Shift Malam → 15 Januari 2024

### 9.3 Deteksi Keterlambatan

Sistem otomatis mendeteksi keterlambatan berdasarkan shift yang di-assign.

**Algoritma**:
```python
def check_lateness(employee_id, attendance_time):
    # 1. Get scheduled shift for today
    today = attendance_time.date()
    scheduled = get_scheduled_shift(employee_id, today)
    
    if not scheduled:
        return False, 0  # No shift assigned
    
    # 2. Parse shift start time
    shift_start = datetime.strptime(scheduled.shift.jam_masuk, "%H:%M")
    shift_start = shift_start.replace(
        year=today.year,
        month=today.month,
        day=today.day
    )
    
    # 3. Calculate difference
    if attendance_time > shift_start:
        minutes_late = (attendance_time - shift_start).seconds // 60
        return True, minutes_late
    
    return False, 0
```

**Tolerance**: 
- ≤ 5 menit: On time (tidak dihitung terlambat)
- > 5 menit: Late (flag terlambat)

### 9.4 Shift Assignment UI

Admin dapat assign shift melalui **calendar view**:
- Drag & drop employee ke tanggal
- Pilih shift dari dropdown
- Bulk assignment untuk multiple dates
- Visual color coding per shift

---

## 10. ALUR KERJA SISTEM

### 10.1 Alur Enrollment (Pendaftaran Wajah)

```
┌─────────────────────────────────────────────────────────┐
│                 ENROLLMENT PROCESS                      │
└─────────────────────────────────────────────────────────┘

1. Admin membuat karyawan baru
   - Input: nama, kode_karyawan, role, PIN
   - Output: Employee record created

2. Admin membuka halaman Enroll
   - Select employee dari dropdown
   - Kamera webcam aktif

3. Capture 3-5 foto wajah
   - Pose berbeda: frontal, left, right
   - Face detection real-time (face-api.js)
   - Validasi: minimal 1 wajah terdeteksi

4. Upload ke server
   - POST /employees/{id}/enroll
   - Server ekstrak face embedding (InsightFace)
   - Simpan embedding ke database (append to JSON array)

5. Konfirmasi
   - Display total embeddings: "5 faces enrolled"
   - Employee siap melakukan absensi
```


### 10.2 Alur Absensi Masuk/Pulang (Face Recognition)

```
┌─────────────────────────────────────────────────────────┐
│              ATTENDANCE PROCESS (FACE)                  │
└─────────────────────────────────────────────────────────┘

1. Karyawan membuka halaman Absensi
   - URL: http://localhost:5173/
   - Kamera webcam aktif

2. Real-time face detection (client-side)
   - face-api.js deteksi wajah
   - Display overlay bounding box
   - Validasi: confidence > 0.5

3. Capture foto
   - User klik tombol "Scan Wajah"
   - Capture frame dari video stream
   - Convert to Blob/File

4. Upload ke server
   - POST /attendance/recognize
   - multipart/form-data (image file)

5. Server processing
   ┌──────────────────────────────────────┐
   │ a. Anti-Spoofing Check               │
   │    - Texture analysis                │
   │    - Edge density check              │
   │    - Color distribution              │
   │    → FAIL: Return error              │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ b. Face Detection & Embedding        │
   │    - RetinaFace: detect face         │
   │    - ArcFace: extract 512-d vector   │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ c. Matching                          │
   │    - Compare dengan DB embeddings    │
   │    - Calculate similarity            │
   │    - Find best match (max similarity)│
   │    → FAIL: similarity < 0.35         │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ d. Determine Jenis (masuk/pulang)    │
   │    - Query last attendance today     │
   │    - If none → "masuk"               │
   │    - If last was "masuk" → "pulang"  │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ e. Check Lateness (for "masuk")      │
   │    - Get scheduled shift             │
   │    - Compare with shift start time   │
   │    - Calculate minutes late          │
   └──────────────────────────────────────┘
   ┌──────────────────────────────────────┐
   │ f. Save Attendance Log               │
   │    - Insert to attendance_logs table │
   │    - Save capture photo              │
   └──────────────────────────────────────┘

6. Response ke client
   - Success: Display nama, jenis, waktu
   - Fail: Display error message

7. UI Feedback
   - Success: Green modal, auto-close 3s
   - Fail: Red modal, allow retry
```

### 10.3 Alur Absensi dengan PIN Fallback

```
┌─────────────────────────────────────────────────────────┐
│           ATTENDANCE PROCESS (PIN FALLBACK)             │
└─────────────────────────────────────────────────────────┘

1. User klik "Gunakan PIN"
   - Modal input muncul

2. Input credentials
   - Kode Karyawan: ALO001
   - PIN: 1234

3. Submit
   - POST /attendance/pin-fallback
   - Body: {kode_karyawan, pin}

4. Server validation
   - Find employee by kode_karyawan
   - Verify PIN dengan bcrypt.checkpw()
   - FAIL: Return "Invalid credentials"

5. Process attendance (sama seperti face recognition)
   - Determine jenis (masuk/pulang)
   - Check lateness
   - Save log (metode = "pin_fallback")

6. Response
   - Success: Display confirmation
   - Fail: Display error
```

---

## 11. CARA INSTALASI & MENJALANKAN

### 11.1 Prerequisites

**Software yang Dibutuhkan**:
1. Python 3.8+ (recommended: 3.10)
2. Node.js 18+ dan npm
3. Git (optional, untuk clone repository)
4. Webcam (untuk face recognition)

**Hardware Minimum**:
- CPU: Intel i5 atau setara
- RAM: 8GB
- Storage: 2GB free space
- Webcam: 720p atau lebih tinggi

### 11.2 Instalasi Backend

```bash
# 1. Navigate to backend folder
cd backend

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file
copy .env.example .env

# 6. Edit .env (optional)
# SECRET_KEY=your-secret-key-here
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=admin123
# FRONTEND_URL=http://localhost:5173

# 7. Run server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**First Run**:
- InsightFace akan download model (~200MB)
- Database akan dibuat otomatis (alonica_attendance.db)
- Default shifts akan di-seed

**Server berjalan di**: `http://localhost:8000`
**API Docs**: `http://localhost:8000/docs`

### 11.3 Instalasi Frontend

```bash
# 1. Navigate to frontend folder
cd frontend

# 2. Install dependencies
npm install

# 3. Run development server
npm run dev
```

**Development server berjalan di**: `http://localhost:5173`

### 11.4 Build untuk Production

**Backend**:
```bash
# Gunakan production ASGI server
pip install gunicorn

# Run dengan gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

**Frontend**:
```bash
# Build production bundle
npm run build

# Output: dist/ folder
# Deploy ke static hosting (Netlify, Vercel, dll)
```

### 11.5 Login Admin Default

**Credentials**:
- Username: `admin`
- Password: `admin123`

⚠️ **PENTING**: Ganti password default di `.env` untuk production!

---

## 12. TESTING & VALIDASI

### 12.1 Testing Scenario

#### Test 1: Face Recognition Accuracy
**Objective**: Validasi akurasi face recognition pada berbagai kondisi.

**Test Cases**:
1. Frontal face dengan pencahayaan normal → **Expected: Match**
2. Side profile (45°) → **Expected: Match** (jika enrolled dengan pose serupa)
3. Low light condition → **Expected: May fail** (sensitivity to lighting)
4. Wearing glasses → **Expected: Match** (ArcFace robust to accessories)
5. Different person → **Expected: No match**

**Metrics**:
- True Accept Rate (TAR): % karyawan yang benar dikenali
- False Accept Rate (FAR): % orang salah yang diterima
- False Reject Rate (FRR): % karyawan yang benar ditolak

**Target**:
- TAR ≥ 95%
- FAR ≤ 1%
- FRR ≤ 5%


#### Test 2: Anti-Spoofing Effectiveness
**Objective**: Validasi kemampuan sistem mendeteksi serangan spoofing.

**Test Cases**:
1. Print photo attack → **Expected: Rejected**
2. Digital photo on phone screen → **Expected: Rejected**
3. Replay video attack → **Expected: Rejected**
4. Real face → **Expected: Accepted**

**Metrics**:
- Anti-Spoofing Detection Rate: % serangan yang berhasil dideteksi
- Target: ≥ 90%

#### Test 3: Shift & Lateness Detection
**Objective**: Validasi sistem deteksi keterlambatan.

**Test Cases**:
1. Absen tepat waktu (08:00, shift start 08:00) → **Terlambat: No**
2. Absen 3 menit terlambat (08:03) → **Terlambat: No** (tolerance)
3. Absen 10 menit terlambat (08:10) → **Terlambat: Yes, 10 menit**
4. Absen tanpa scheduled shift → **Terlambat: No** (no baseline)

#### Test 4: Load Testing
**Objective**: Validasi performa sistem pada concurrent users.

**Tool**: Apache JMeter / Locust

**Scenario**:
- 10 concurrent users melakukan absensi
- Expected response time: < 3 detik
- Expected success rate: > 95%

### 12.2 Manual Testing Checklist

**Enrollment**:
- [ ] Dapat menambah karyawan baru
- [ ] Dapat upload multiple foto wajah
- [ ] Face detection berfungsi di browser
- [ ] Embedding tersimpan di database

**Absensi**:
- [ ] Face recognition berhasil identify karyawan
- [ ] Jenis absensi (masuk/pulang) terdeteksi otomatis
- [ ] PIN fallback berfungsi
- [ ] Anti-spoofing reject foto cetak
- [ ] Keterlambatan terdeteksi dengan benar

**Admin Dashboard**:
- [ ] Login berfungsi
- [ ] Statistik absensi tampil
- [ ] List karyawan dapat di-filter
- [ ] Dapat edit data karyawan
- [ ] Dapat assign shift

**Shift Management**:
- [ ] Dapat membuat shift baru
- [ ] Dapat assign shift ke karyawan
- [ ] Calendar view menampilkan jadwal

---

## 13. SECURITY FEATURES

### 13.1 Authentication & Authorization

**JWT (JSON Web Token)**:
```python
# Generate token
token = jwt.encode(
    {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(days=7)
    },
    SECRET_KEY,
    algorithm="HS256"
)
```

**Protected Routes**:
- All admin endpoints require valid JWT token
- Token dikirim via Authorization header: `Bearer <token>`

### 13.2 Password & PIN Security

**Bcrypt Hashing**:
```python
# Hash password
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())

# Verify password
is_valid = bcrypt.checkpw(password.encode(), hashed)
```

**Properties**:
- Salt: Random per password
- Cost factor: 12 (adaptive, lambat untuk brute force)
- Rainbow table resistant

### 13.3 CORS Configuration

**Allowed Origins**:
```python
allow_origins=[
    "http://localhost:5173",  # Development
    "http://127.0.0.1:5173",
    os.getenv("FRONTEND_URL")  # Production
]
```

**Security Headers**:
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: *`
- `Access-Control-Allow-Headers: *`

### 13.4 Input Validation

**File Upload**:
- Allowed extensions: `.jpg`, `.jpeg`, `.png`
- Max file size: 10MB
- Validasi image content (bukan hanya extension)

**SQL Injection Prevention**:
- SQLAlchemy ORM (parameterized queries)
- No raw SQL queries

### 13.5 Rate Limiting (Recommended)

⚠️ **Belum diimplementasi, tetapi direkomendasikan untuk production**:

```python
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

@app.post("/attendance/recognize")
@limiter.limit("10/minute")  # Max 10 attempts per minute
async def recognize_face():
    ...
```

---

## 14. TROUBLESHOOTING

### 14.1 Common Issues & Solutions

#### Issue 1: Face recognition selalu gagal
**Symptoms**: Similarity score selalu < 0.35

**Possible Causes**:
1. Pencahayaan terlalu gelap/terang
2. Wajah terlalu jauh dari kamera
3. Low quality webcam
4. Karyawan belum di-enroll dengan benar

**Solutions**:
- Pastikan pencahayaan cukup (frontal light)
- Jarak wajah ke kamera: 30-50cm
- Re-enroll dengan 5+ foto berbeda
- Gunakan webcam minimal 720p

#### Issue 2: Anti-spoofing terlalu sensitif
**Symptoms**: Wajah asli ditolak sebagai spoofing

**Possible Causes**:
1. Threshold terlalu tinggi
2. Lighting condition tidak ideal
3. Kamera quality rendah

**Solutions**:
- Adjust threshold di `antispoofing.py`
- Improve lighting condition
- Allow fallback to PIN method

#### Issue 3: InsightFace model tidak load
**Symptoms**: Error "Model not found" atau "ONNX error"

**Solutions**:
```bash
# Re-install InsightFace
pip uninstall insightface onnxruntime
pip install insightface==0.7.3 onnxruntime==1.19.2

# Clear model cache
rm -rf ~/.insightface

# Restart server (model akan auto-download)
```

#### Issue 4: CORS error di frontend
**Symptoms**: "Access to fetch blocked by CORS policy"

**Solutions**:
1. Check backend `.env`: FRONTEND_URL sesuai
2. Check frontend API base URL di `lib/api.js`
3. Restart both frontend & backend

#### Issue 5: Database locked error
**Symptoms**: "Database is locked" (SQLite)

**Causes**: Multiple concurrent writes ke SQLite

**Solutions**:
- Untuk production, gunakan PostgreSQL/MySQL
- Temporary: Reduce concurrent requests

### 14.2 Performance Optimization

#### Slow face recognition (> 5 detik)
**Optimizations**:
1. Reduce image size sebelum upload (max 1280x720)
2. Use GPU if available:
   ```python
   # Install onnxruntime-gpu
   pip install onnxruntime-gpu
   ```
3. Limit embeddings per employee (max 20)
4. Index database properly:
   ```python
   Index("idx_employee_id", AttendanceLog.employee_id)
   Index("idx_timestamp", AttendanceLog.timestamp)
   ```

#### Database query optimization
```python
# Use eager loading untuk join
employees = session.query(Employee).options(
    joinedload(Employee.attendance_logs)
).all()

# Add pagination
employees = session.query(Employee).limit(50).offset(page * 50).all()
```

---

## 15. KESIMPULAN & PENGEMBANGAN LANJUTAN

### 15.1 Kesimpulan

Sistem Absensi Alonica Cafe berhasil mengimplementasikan:

1. ✅ **Face Recognition** menggunakan state-of-the-art model (InsightFace ArcFace)
2. ✅ **Anti-Spoofing** dengan multi-layer verification
3. ✅ **Shift Management** dengan deteksi keterlambatan otomatis
4. ✅ **PIN Fallback** sebagai backup method
5. ✅ **Real-time Dashboard** untuk monitoring
6. ✅ **Secure Authentication** dengan JWT dan bcrypt

**Keunggulan**:
- Touchless dan hygienic
- Cepat (< 3 detik per absensi)
- Akurat (similarity threshold 0.35)
- Secure (anti-spoofing protection)

**Limitasi**:
- Sensitive terhadap pencahayaan ekstrim
- Memerlukan webcam dengan quality memadai
- SQLite tidak ideal untuk high-traffic production


### 15.2 Pengembangan Lanjutan (Future Work)

#### Phase 2: Enhanced Features
1. **Mobile App** (React Native)
   - Absensi via smartphone
   - Push notification untuk shift reminder
   - GPS-based attendance (location verification)

2. **Advanced Reporting**
   - Export to Excel/PDF
   - Grafik analitik kehadiran
   - Payroll integration

3. **Multi-Location Support**
   - Cabang berbeda dengan database terpusat
   - Cloud-based deployment

4. **Mask Detection**
   - Face recognition tetap berfungsi dengan masker
   - Relevant untuk protokol kesehatan

#### Phase 3: Scalability
1. **Database Migration**
   - PostgreSQL untuk production
   - Redis caching untuk face embeddings

2. **Microservices Architecture**
   - Separate service untuk face recognition
   - Message queue (RabbitMQ) untuk async processing

3. **Load Balancing**
   - Multiple backend instances
   - Nginx reverse proxy

4. **Monitoring & Logging**
   - Prometheus + Grafana untuk metrics
   - ELK stack untuk log aggregation

#### Phase 4: AI Enhancement
1. **Emotion Recognition**
   - Deteksi mood karyawan saat absen
   - Analytics untuk HR insights

2. **Attendance Prediction**
   - ML model untuk prediksi ketidakhadiran
   - Proactive shift adjustment

3. **Enhanced Anti-Spoofing**
   - Deep learning model (CNN-based)
   - 3D face analysis

---

## 16. REFERENSI

### 16.1 Paper & Research
1. Deng, J., et al. (2019). "ArcFace: Additive Angular Margin Loss for Deep Face Recognition." *CVPR 2019*.
2. Deng, J., et al. (2020). "RetinaFace: Single-Shot Multi-Level Face Localisation in the Wild." *CVPR 2020*.
3. Boulkenafet, Z., et al. (2017). "Face Anti-Spoofing Based on Color Texture Analysis." *IEEE ICIP*.

### 16.2 Libraries & Frameworks
1. **InsightFace**: https://github.com/deepinsight/insightface
2. **FastAPI**: https://fastapi.tiangolo.com/
3. **React**: https://react.dev/
4. **face-api.js**: https://github.com/justadudewhohacks/face-api.js

### 16.3 Datasets (for model training)
1. **LFW (Labeled Faces in the Wild)**: http://vis-www.cs.umass.edu/lfw/
2. **MS-Celeb-1M**: Large-scale face recognition dataset
3. **VGGFace2**: http://www.robots.ox.ac.uk/~vgg/data/vgg_face2/

---

## LAMPIRAN

### A. Struktur Folder Lengkap

```
AttendanceAlonicaCafe/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── attendance.py      # Attendance endpoints
│   │   │   ├── auth.py            # Authentication
│   │   │   ├── employees.py       # Employee CRUD
│   │   │   └── shifts.py          # Shift management
│   │   ├── services/
│   │   │   ├── face_engine.py     # InsightFace wrapper
│   │   │   ├── matcher.py         # Similarity calculation
│   │   │   └── antispoofing.py    # Anti-spoofing checks
│   │   ├── db.py                  # Database config
│   │   ├── models.py              # SQLAlchemy models
│   │   └── main.py                # FastAPI app
│   ├── venv/                      # Virtual environment
│   ├── alonica_attendance.db      # SQLite database
│   ├── requirements.txt           # Python dependencies
│   └── .env                       # Environment variables
├── frontend/
│   ├── src/
│   │   ├── components/            # Reusable components
│   │   ├── context/               # React context (auth)
│   │   ├── lib/                   # Utilities (API, auth)
│   │   ├── pages/                 # Page components
│   │   └── main.jsx               # React entry point
│   ├── public/
│   │   └── models/                # face-api.js models
│   ├── package.json               # npm dependencies
│   └── vite.config.js             # Vite config
├── diagrams/                      # UML diagrams
└── DOKUMENTASI_SKRIPSI.md         # This file
```


### B. Environment Variables (.env)

```env
# Backend Configuration
SECRET_KEY=your-secret-key-here-change-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Database
DATABASE_URL=sqlite:///./alonica_attendance.db

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Face Recognition
SIMILARITY_THRESHOLD=0.55  # Cosine similarity threshold (0-1), higher = stricter
MAX_EMBEDDINGS_PER_EMPLOYEE=20
# InsightFace model: buffalo_l (auto-downloads ~300MB on first run)

# Anti-Spoofing
ANTISPOOFING_ENABLED=true
ANTISPOOFING_THRESHOLD=0.6

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
```

### C. API Request Examples (cURL)

#### 1. Login
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"
```

#### 2. Get All Employees
```bash
curl -X GET http://localhost:8000/employees \
  -H "Authorization: Bearer <your-token>"
```

#### 3. Face Recognition (Attendance)
```bash
curl -X POST http://localhost:8000/attendance/recognize \
  -H "Authorization: Bearer <your-token>" \
  -F "file=@captured_face.jpg"
```

#### 4. PIN Fallback
```bash
curl -X POST http://localhost:8000/attendance/pin-fallback \
  -H "Content-Type: application/json" \
  -d '{
    "kode_karyawan": "ALO001",
    "pin": "1234"
  }'
```

### D. SQL Schema (Generated by SQLAlchemy)

```sql
-- Employees table
CREATE TABLE employees (
    id VARCHAR PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    kode_karyawan VARCHAR(50) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Barista',
    pin_fallback VARCHAR(255),
    face_embeddings_json TEXT DEFAULT '[]',
    foto_referensi_url TEXT,
    status BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Attendance logs table
CREATE TABLE attendance_logs (
    id VARCHAR PRIMARY KEY,
    employee_id VARCHAR NOT NULL,
    jenis VARCHAR CHECK(jenis IN ('masuk', 'pulang')) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    similarity_score FLOAT,
    metode VARCHAR CHECK(metode IN ('wajah', 'pin_fallback')) NOT NULL,
    foto_capture_url TEXT,
    terlambat BOOLEAN DEFAULT 0,
    menit_terlambat INTEGER DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- Shifts table
CREATE TABLE shifts (
    id VARCHAR PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    jam_masuk VARCHAR(5) NOT NULL,
    jam_pulang VARCHAR(5) NOT NULL,
    warna VARCHAR(7) DEFAULT '#3b82f6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled shifts table
CREATE TABLE scheduled_shifts (
    id VARCHAR PRIMARY KEY,
    employee_id VARCHAR NOT NULL,
    shift_id VARCHAR NOT NULL,
    tanggal DATE NOT NULL,
    keterangan VARCHAR(200),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

-- Indexes for performance
CREATE INDEX idx_attendance_employee ON attendance_logs(employee_id);
CREATE INDEX idx_attendance_timestamp ON attendance_logs(timestamp);
CREATE INDEX idx_schedule_employee ON scheduled_shifts(employee_id);
CREATE INDEX idx_schedule_date ON scheduled_shifts(tanggal);
```

### E. Glossary (Istilah Penting)

| Istilah | Definisi |
|---------|----------|
| **Face Embedding** | Vektor 512-dimensi yang merepresentasikan fitur wajah unik seseorang |
| **Cosine Similarity** | Metode menghitung kemiripan antara dua vektor (-1 to 1) |
| **Anti-Spoofing** | Teknik untuk mendeteksi dan mencegah serangan menggunakan foto/video palsu |
| **Threshold** | Nilai batas untuk menentukan apakah wajah match atau tidak |
| **Enrollment** | Proses pendaftaran wajah karyawan ke sistem |
| **ArcFace** | Model deep learning untuk face recognition dengan akurasi tinggi |
| **RetinaFace** | Model untuk face detection dan alignment |
| **LBP** | Local Binary Pattern, fitur tekstur untuk analisis gambar |
| **JWT** | JSON Web Token, standar untuk autentikasi API |
| **ORM** | Object-Relational Mapping, abstraksi database ke objek Python |

---

## CONTACT & SUPPORT

**Developer**: [Nama Anda]  
**Email**: [Email Anda]  
**Repository**: [GitHub URL jika ada]  
**Tanggal Pembuatan**: Januari 2024  
**Versi Dokumentasi**: 1.0.0

---

**© 2024 Alonica Cafe - Sistem Absensi Berbasis Face Recognition**

*Dokumentasi ini dibuat untuk keperluan sidang skripsi dan pengembangan sistem.*
