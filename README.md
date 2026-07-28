# Alonica Cafe — Sistem Absensi Wajah

Sistem absensi otomatis untuk karyawan Alonica Cafe menggunakan pengenalan wajah (face recognition).
Proyek ini terdiri dari backend Python (FastAPI) dan frontend React (Vite).

## Fitur Utama
1. **Absensi Wajah Otomatis**: Karyawan cukup berdiri di depan kamera (tablet/laptop), sistem otomatis mendeteksi wajah dan mencatat absen (masuk/pulang).
2. **Fallback PIN**: Jika wajah gagal dikenali (karena cahaya atau perubahan ekstrim), karyawan bisa absen menggunakan Kode Karyawan + PIN.
3. **Liveness Detection Sederhana**: Frontend memastikan wajah stabil (tidak blur) dan posisinya di tengah frame sebelum mengirimkan ke server.
4. **Dashboard Admin**: Mengelola data karyawan, registrasi foto wajah, melihat rekap harian, dan export laporan ke CSV.
5. **Modern UI**: Antarmuka dengan tema dark-mode glassmorphism, cocok untuk pencahayaan di area kasir/staff.

---

## Arsitektur Teknologi

### Backend (Python FastAPI)
- **Framework**: FastAPI (cepat, async, auto-docs).
- **Face Recognition**: InsightFace (`buffalo_l` model) yang mencakup RetinaFace untuk deteksi dan ArcFace untuk embedding (512-dimensi).
- **Database**: SQLite dengan ORM SQLAlchemy (simpel untuk skala 1 cafe, data wajah disimpan sebagai JSON array).
- **Pencocokan**: Cosine Similarity (threshold 0.55).

### Frontend (React + Vite)
- **Framework**: React 18, Vite.
- **Routing**: React Router DOM.
- **Deteksi Klien**: `face-api.js` (TensorFlow.js) — model `tinyFaceDetector` berjalan di browser untuk menemukan posisi wajah sebelum dikirim ke backend.
- **Styling**: Vanilla CSS (CSS Variables, Flexbox/Grid, Animations).

---

## Cara Install & Menjalankan (Development)

### 1. Setup Backend
Masuk ke folder `backend` dan buat virtual environment:
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

Install dependensi:
```bash
pip install -r requirements.txt
```

> **Catatan Penting**: Saat pertama kali backend dijalankan, library `insightface` akan otomatis mengunduh model face recognition (sekitar 300MB). Pastikan koneksi internet stabil.

Jalankan server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Server akan berjalan di `http://localhost:8000`. Dokumentasi API dapat dilihat di `http://localhost:8000/docs`.

### 2. Setup Frontend
Buka terminal baru, masuk ke folder `frontend`:
```bash
cd frontend
npm install
```

Jalankan server Vite:
```bash
npm run dev
```
Buka aplikasi di browser pada alamat `http://localhost:5173`.

---

## Panduan Penggunaan

### Registrasi Karyawan (Admin)
1. Buka halaman dashboard admin di `/admin`.
2. Klik tombol **+ Tambah Karyawan**.
3. Isi form data karyawan (Nama, Kode, Role, PIN Fallback opsional).
4. Kamera akan aktif. Mintalah karyawan menghadap kamera.
5. Ambil 3-5 foto wajah dari sudut yang berbeda (lurus, serong kiri, serong kanan, sedikit atas, sedikit bawah).
6. Simpan data.

### Proses Absensi (Karyawan)
1. Buka halaman utama (`/`). Ini adalah halaman yang selalu terbuka di tablet/device absensi.
2. Karyawan berdiri di depan kamera.
3. Tunggu hingga muncul kotak hijau (menandakan wajah stabil).
4. Sistem otomatis mencapture foto dan mengirim ke server.
5. Jika wajah dikenali, akan muncul pesan sukses (Otomatis mendeteksi Masuk atau Pulang berdasarkan log terakhir).
6. Jika gagal 3x berturut-turut, akan muncul popup untuk memasukkan Kode Karyawan + PIN.

### Export Laporan
1. Di Dashboard Admin, masuk ke tab **Rekap Absensi**.
2. Atur filter tanggal (opsional).
3. Klik tombol **Export CSV** untuk mengunduh laporan ke file excel/csv.

---

## Struktur Database
Sistem menggunakan 2 tabel utama:
1. `employees`: Menyimpan data karyawan termasuk PIN (hashed dengan bcrypt) dan array `face_embeddings` (vector wajah).
2. `attendance_logs`: Mencatat setiap transaksi absensi (masuk/pulang, timestamp, similarity score, metode).
