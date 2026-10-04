# Dokumentasi Eksperimen Anti-Spoofing
## Sistem Absensi Wajah Alonica Cafe

---

## 1. Pendahuluan

Pengujian anti-spoofing dilakukan untuk mengevaluasi kemampuan sistem dalam membedakan
wajah asli (*live face*) dari berbagai jenis serangan spoofing. Sistem menggunakan
pendekatan *hand-crafted features* berbasis analisis tekstur, ketajaman, frekuensi,
variasi warna, dan kecerahan tanpa model *deep learning* tambahan.

Tujuan eksperimen ini adalah:
1. Mengetahui nilai metrik tiap komponen pada kondisi wajah asli dan serangan spoofing
2. Mengevaluasi efektivitas threshold yang digunakan
3. Mengidentifikasi kelemahan sistem terhadap jenis serangan tertentu

---

## 2. Komponen Anti-Spoofing

Sistem menggunakan lima komponen yang digabungkan menjadi satu skor komposit.

| No | Komponen | Fungsi | Pembagi Normalisasi | Bobot |
|----|----------|--------|---------------------|-------|
| 1 | LBP Texture Variance | Analisis tekstur kulit | 12.0 | 0.15 |
| 2 | Laplacian Variance | Ketajaman gambar | 400.0 | 0.55 |
| 3 | Frequency Ratio (FFT) | Pola frekuensi gambar | target=0.45, slope=2.5 | 0.15 |
| 4 | Color Channel Variance | Variasi warna antar kanal RGB | 800.0 | 0.10 |
| 5 | Brightness CoV | Keseragaman kecerahan | 0.18 | 0.05 |

**Threshold keputusan:** Skor komposit ≥ 0.50 → LIVE, < 0.50 → SPOOF

**Hard check:** Jika `lap_score ≤ 0.35` maka composite dipaksa = `lap_score × 0.5`
(tidak masuk ke perhitungan bobot normal)

### Rumus Skor Komposit

```
composite = (lbp_score × 0.15) + (lap_score × 0.55) +
            (freq_score × 0.15) + (color_score × 0.10) +
            (bright_score × 0.05)
```

### Rumus Tiap Komponen

```
lbp_score   = min(1.0, lbp_var / 12.0)
lap_score   = min(1.0, laplacian_var / 400.0)
freq_score  = 1.0 - |freq_ratio - 0.45| × 2.5   (diklem 0–1)
color_score = min(1.0, color_var / 800.0)
bright_score= min(1.0, brightness_cov / 0.18)
```

---

## 3. Metode Pengambilan Data

Data nilai mentah (*raw values*) diperoleh dari log backend sistem yang dicetak
setiap kali proses verifikasi wajah dijalankan. Format log:

```
[INFO] app.services.antispoofing: [Antispoofing RAW]
lbp_var=X.XX lap_var=X.XX freq=X.XXX color_var=X.X bright_cov=X.XXX

[INFO] app.services.antispoofing: [Antispoofing]
composite=X.XXX is_live=True/False
scores=[lbp=X.XX lap=X.XX freq=X.XX color=X.XX bright=X.XX]
```

### Langkah Pengambilan Data

1. Jalankan backend: `uvicorn app.main:app --reload`
2. Buka halaman absensi di browser
3. Pilih mode **ABSEN MASUK**
4. Arahkan kondisi yang akan diuji ke kamera
5. Catat nilai dari log terminal backend
6. Ulangi untuk setiap kondisi eksperimen

---

## 4. Skenario Eksperimen

### Eksperimen 1 — Wajah Asli, Pencahayaan Normal (Baseline)

**Deskripsi:** Wajah asli subjek langsung di depan kamera laptop, jarak ±40cm,
pencahayaan ruangan normal (lampu neon/LED).

**Hipotesis:** Semua komponen menghasilkan skor tinggi karena tekstur kulit,
ketajaman, dan variasi warna bersifat alami.

| Komponen | Nilai Raw | Skor |
|----------|-----------|------|
| LBP Variance | `[ISI]` | `[ISI]` |
| Laplacian Variance | `[ISI]` | `[ISI]` |
| Frequency Ratio | `[ISI]` | `[ISI]` |
| Color Variance | `[ISI]` | `[ISI]` |
| Brightness CoV | `[ISI]` | `[ISI]` |
| **Skor Komposit** | — | `[ISI]` |
| **Keputusan Sistem** | — | `[ISI]` |
| **Keputusan Seharusnya** | — | ✅ LIVE |
| **Keterangan** | `[ISI]` | |

---

### Eksperimen 2 — Foto di Layar Smartphone (Photo Attack)

**Deskripsi:** Foto wajah subjek ditampilkan di layar smartphone (resolusi standar),
kemudian smartphone dipegang di depan kamera laptop.

**Hipotesis:** Laplacian variance rendah karena kamera menangkap layar yang
memancarkan cahaya sendiri (*double-lens blur effect*). LBP variance juga rendah
karena tekstur layar lebih halus dari kulit asli.

| Komponen | Nilai Raw | Skor |
|----------|-----------|------|
| LBP Variance | `[ISI]` | `[ISI]` |
| Laplacian Variance | `[ISI]` | `[ISI]` |
| Frequency Ratio | `[ISI]` | `[ISI]` |
| Color Variance | `[ISI]` | `[ISI]` |
| Brightness CoV | `[ISI]` | `[ISI]` |
| **Skor Komposit** | — | `[ISI]` |
| **Keputusan Sistem** | — | `[ISI]` |
| **Keputusan Seharusnya** | — | ❌ SPOOF |
| **Keterangan** | `[ISI]` | |

---

### Eksperimen 3 — Foto Dicetak di Kertas (Print Attack)

**Deskripsi:** Foto wajah subjek dicetak menggunakan printer berwarna pada
kertas putih biasa, kemudian kertas ditunjukkan ke kamera.

**Hipotesis:** Laplacian variance lebih tinggi dari foto layar karena kertas
memantulkan cahaya alami. Namun LBP variance tetap rendah karena tidak ada
tekstur kulit nyata.

| Komponen | Nilai Raw | Skor |
|----------|-----------|------|
| LBP Variance | `[ISI]` | `[ISI]` |
| Laplacian Variance | `[ISI]` | `[ISI]` |
| Frequency Ratio | `[ISI]` | `[ISI]` |
| Color Variance | `[ISI]` | `[ISI]` |
| Brightness CoV | `[ISI]` | `[ISI]` |
| **Skor Komposit** | — | `[ISI]` |
| **Keputusan Sistem** | — | `[ISI]` |
| **Keputusan Seharusnya** | — | ❌ SPOOF |
| **Keterangan** | `[ISI]` | |

---

### Eksperimen 4 — Video Wajah di Layar Laptop (Video Replay Attack)

**Deskripsi:** Video wajah subjek diputar di layar laptop 14 inci,
kemudian kamera laptop lain menangkapnya dari jarak ±40cm.

**Hipotesis:** Laplacian variance sangat rendah karena *frame rate* video
menghasilkan *motion blur* pada tepi wajah. Frequency ratio cenderung
tinggi karena pola piksel layar terdeteksi oleh FFT.

| Komponen | Nilai Raw | Skor |
|----------|-----------|------|
| LBP Variance | `[ISI]` | `[ISI]` |
| Laplacian Variance | `[ISI]` | `[ISI]` |
| Frequency Ratio | `[ISI]` | `[ISI]` |
| Color Variance | `[ISI]` | `[ISI]` |
| Brightness CoV | `[ISI]` | `[ISI]` |
| **Skor Komposit** | — | `[ISI]` |
| **Keputusan Sistem** | — | `[ISI]` |
| **Keputusan Seharusnya** | — | ❌ SPOOF |
| **Keterangan** | `[ISI]` | |

---

### Eksperimen 5 — Wajah Asli, Kondisi Cahaya Rendah

**Deskripsi:** Wajah asli subjek di depan kamera dalam kondisi pencahayaan
minim (ruangan gelap, hanya cahaya monitor sebagai sumber utama).

**Hipotesis:** Laplacian variance turun karena gambar menjadi lebih gelap
dan noise lebih dominan. Brightness CoV rendah karena pencahayaan tidak
merata. Sistem diharapkan tetap mengenali sebagai LIVE meskipun skor
lebih rendah dari kondisi normal.

| Komponen | Nilai Raw | Skor |
|----------|-----------|------|
| LBP Variance | `[ISI]` | `[ISI]` |
| Laplacian Variance | `[ISI]` | `[ISI]` |
| Frequency Ratio | `[ISI]` | `[ISI]` |
| Color Variance | `[ISI]` | `[ISI]` |
| Brightness CoV | `[ISI]` | `[ISI]` |
| **Skor Komposit** | — | `[ISI]` |
| **Keputusan Sistem** | — | `[ISI]` |
| **Keputusan Seharusnya** | — | ✅ LIVE |
| **Keterangan** | `[ISI]` | |

---

## 5. Rekapitulasi Hasil

| No | Skenario | Komposit | Keputusan Sistem | Seharusnya | Benar? |
|----|----------|----------|------------------|------------|--------|
| 1 | Wajah asli, cahaya normal | `[ISI]` | `[ISI]` | LIVE | `[ISI]` |
| 2 | Foto di layar smartphone | `[ISI]` | `[ISI]` | SPOOF | `[ISI]` |
| 3 | Foto cetak kertas | `[ISI]` | `[ISI]` | SPOOF | `[ISI]` |
| 4 | Video replay di laptop | `[ISI]` | `[ISI]` | SPOOF | `[ISI]` |
| 5 | Wajah asli, cahaya rendah | `[ISI]` | `[ISI]` | LIVE | `[ISI]` |

**Akurasi:** `[ISI]` / 5 = `[ISI]`%

---

## 6. Analisis dan Pembahasan

### 6.1 Perbandingan Nilai Komponen

*(Isi setelah data terkumpul — bandingkan nilai tiap komponen antara wajah asli vs serangan)*

| Komponen | Wajah Asli (Eks.1) | Foto HP (Eks.2) | Foto Cetak (Eks.3) | Video (Eks.4) | Cahaya Rendah (Eks.5) |
|----------|-------------------|-----------------|-------------------|---------------|----------------------|
| LBP Score | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` |
| Laplacian Score | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` |
| Frequency Score | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` |
| Color Score | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` |
| Brightness Score | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` | `[ISI]` |

### 6.2 Komponen Paling Berpengaruh

*(Isi setelah data terkumpul)*

### 6.3 Kelemahan yang Ditemukan

*(Isi setelah data terkumpul)*

---

## 7. Kesimpulan

*(Isi setelah data terkumpul)*

---

## 8. Referensi Metode

- **LBP (Local Binary Pattern):** Maatta, J., Hadid, A., & Pietikäinen, M. (2011).
  *Face Spoofing Detection From Single Images Using Micro-Texture Analysis.*
  IEEE International Joint Conference on Biometrics (IJCB).

- **Laplacian Variance untuk deteksi blur:** Pech-Pacheco, J.L., et al. (2000).
  *Diatom autofocusing in brightfield microscopy: a comparative study.*
  Proceedings 15th International Conference on Pattern Recognition.

- **FFT untuk analisis frekuensi gambar:** Li, J., Wang, Y., Tan, T., & Jain, A.K. (2004).
  *Live face detection based on the analysis of Fourier spectra.*
  Biometric Technology for Human Identification, SPIE.
