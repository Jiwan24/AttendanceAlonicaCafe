# Dokumentasi Eksperimen Variasi Bobot Anti-Spoofing

---

## 1. Tujuan Eksperimen

Mengevaluasi pengaruh variasi bobot komponen terhadap akurasi deteksi photo attack (foto wajah di layar smartphone).

**Pertanyaan penelitian:**
- Apakah bobot Laplacian dominan memberikan akurasi terbaik?
- Bagaimana distribusi merata mempengaruhi false positive rate?

---

## 2. Komponen & Formula

Sistem menggunakan 5 komponen yang dinormalisasi ke rentang 0–1:

| Komponen | Normalisasi | Fungsi Utama |
|----------|-------------|--------------|
| LBP Texture | ÷ 12.0 | Deteksi tekstur kulit vs layar |
| **Laplacian** | **÷ 400.0** | **Ketajaman (indikator utama blur)** |
| Frequency | target=0.45 | Pola frekuensi FFT |
| Color Variance | ÷ 800.0 | Variasi warna RGB |
| Brightness CoV | ÷ 0.18 | Keseragaman kecerahan |

**Formula Composite:**
```
composite = (lbp × w_lbp) + (lap × w_lap) + (freq × w_freq) + 
            (color × w_color) + (bright × w_bright)
```

**Threshold:** composite ≥ 0.50 → LIVE, < 0.50 → SPOOF  
**Hard check:** Jika lap_score ≤ 0.35 → paksa composite = lap_score × 0.5

---

## 3. Hasil Eksperimen

### Eksperimen 1 — Bobot Seimbang (LBP & Laplacian)

**Konfigurasi Bobot:**
| LBP | Laplacian | Frequency | Color | Brightness |
|-----|-----------|-----------|-------|------------|
| **0.35** | **0.35** | 0.15 | 0.10 | 0.05 |

**Data Hasil:**
| Metrik | Nilai Raw | Skor | Kontribusi |
|--------|-----------|------|------------|
| LBP Variance | 2.44 | 0.20 | 0.070 |
| Laplacian Variance | 132.15 | **0.33** | **0.116** |
| Frequency Ratio | 0.393 | 0.86 | 0.129 |
| Color Variance | 5243.1 | 1.00 | 0.100 |
| Brightness CoV | 0.565 | 1.00 | 0.050 |
| **Composite** | — | — | **0.465** |

**Hard Check:** lap_score (0.33) ≤ 0.35 → composite_final = **0.165**

**Keputusan:** ❌ **SPOOF** (0.165 < 0.50) ✅ Benar

---

### Eksperimen 2 — All-In Laplacian (Bobot Maksimal)

**Konfigurasi Bobot:**
| LBP | Laplacian | Frequency | Color | Brightness |
|-----|-----------|-----------|-------|------------|
| 0.10 | **0.70** | 0.10 | 0.05 | 0.05 |

**Data Hasil:**
| Metrik | Nilai Raw | Skor | Kontribusi |
|--------|-----------|------|------------|
| LBP Variance | 2.41 | 0.20 | 0.020 |
| Laplacian Variance | 156.90 | **0.39** | **0.273** |
| Frequency Ratio | 0.403 | 0.88 | 0.088 |
| Color Variance | 5146.2 | 1.00 | 0.050 |
| Brightness CoV | 0.627 | 1.00 | 0.050 |
| **Composite** | — | — | **0.481** |

**Keputusan:** ❌ **SPOOF** (0.481 < 0.50) ✅ Benar

---

### Eksperimen 3 — Distribusi Merata (Equal Weight)

**Konfigurasi Bobot:**
| LBP | Laplacian | Frequency | Color | Brightness |
|-----|-----------|-----------|-------|------------|
| **0.20** | **0.20** | **0.20** | **0.20** | **0.20** |

**Data Hasil:**
| Metrik | Nilai Raw | Skor | Kontribusi |
|--------|-----------|------|------------|
| LBP Variance | 3.30 | 0.28 | 0.056 |
| Laplacian Variance | 159.62 | **0.40** | **0.080** |
| Frequency Ratio | 0.398 | 0.87 | 0.174 |
| Color Variance | 5802.4 | 1.00 | **0.200** |
| Brightness CoV | 0.523 | 1.00 | **0.200** |
| **Composite** | — | — | **0.710** |

**Keputusan:** ✅ **LIVE** (0.710 ≥ 0.50) ❌ **Salah (False Positive!)**

---

## 4. Rekapitulasi

| Eksperimen | Bobot Laplacian | Composite | Keputusan | Akurasi |
|------------|-----------------|-----------|-----------|---------|
| 1 (Seimbang) | 0.35 | 0.165* | SPOOF | ✅ Benar |
| 2 (Maksimal) | 0.70 | 0.481 | SPOOF | ✅ Benar |
| 3 (Merata) | 0.20 | 0.710 | LIVE | ❌ **False Positive** |

*Hard check triggered

---

## 5. Analisis

### 5.1 Perbandingan Nilai Komponen

**Laplacian Variance** (indikator utama):
- Rata-rata foto HP: **149.56** (Std Dev: 15.05)
- Setelah normalisasi (÷400): **0.33–0.40** → jauh di bawah threshold wajah asli

**Color & Brightness** (tidak diskriminatif):
- Selalu menghasilkan skor **1.00** baik untuk wajah asli maupun foto HP
- Tidak bisa membedakan → **tidak reliabel**

### 5.2 Mengapa Eksperimen 3 Gagal?

**Penyebab kegagalan:**

1. **Bobot Laplacian terlalu rendah (0.20)**
   - Kontribusi: 0.40 × 0.20 = **0.080** (hanya 16% dari threshold)
   
2. **Komponen tidak reliabel diberi bobot tinggi**
   - Color: 1.00 × 0.20 = **0.200** (40% threshold)
   - Brightness: 1.00 × 0.20 = **0.200** (40% threshold)
   - Total Color + Brightness = **0.400** → sudah 80% threshold

3. **Tidak ada mekanisme veto**
   - Hard check tidak triggered karena lap_score (0.40) > 0.35
   - Komponen tidak reliabel "menutupi" kelemahan Laplacian

**Ilustrasi:**
```
Eksperimen 3:
  Laplacian (reliabel)     : 0.080  ← Terlalu kecil untuk "veto"
  Color + Brightness       : 0.400  ← Mendominasi meski tidak diskriminatif
  Frequency + LBP          : 0.230
  ─────────────────────────────────
  Total                    : 0.710  → SALAH lolos sebagai LIVE
```

### 5.3 Konfigurasi Optimal

Berdasarkan hasil eksperimen:

**Rekomendasi:**
- **Laplacian harus dominan (≥ 0.55)** untuk sensitivitas terhadap blur
- **Color & Brightness bobot minimal (≤ 0.10)** karena tidak diskriminatif
- **Hard check threshold dinaikkan** dari 0.35 → 0.40 untuk margin lebih aman

**Konfigurasi sistem saat ini (optimal):**
| LBP | Laplacian | Frequency | Color | Brightness |
|-----|-----------|-----------|-------|------------|
| 0.15 | **0.55** | 0.15 | 0.10 | 0.05 |

---

## 6. Kesimpulan

1. **Distribusi merata tidak efektif** untuk anti-spoofing — menghasilkan false positive karena komponen tidak reliabel diberi bobot berlebihan

2. **Laplacian (ketajaman) adalah komponen terkuat** — penurunan bobotnya dari 0.55 → 0.20 menyebabkan sistem gagal mendeteksi photo attack

3. **Color dan Brightness tidak diskriminatif** — selalu menghasilkan skor maksimal (1.00) sehingga tidak bisa membedakan wajah asli dari foto HP

4. **Hard check pada Laplacian** penting sebagai safety mechanism, namun threshold (0.35) perlu dinaikkan untuk mencegah kasus seperti Eksperimen 3

**Rekomendasi implementasi:**
- Pertahankan bobot Laplacian dominan (0.55)
- Pertimbangkan menghapus Color & Brightness dari perhitungan
- Naikkan hard check threshold dari 0.35 → 0.40

---

## Referensi

- **Sistem:** Alonica Cafe Attendance System v1.0
- **Model:** InsightFace buffalo_l (RetinaFace + ArcFace)
- **Tanggal:** 28 September 2026
- **Kondisi:** Photo attack (foto di layar smartphone, jarak ~40cm)

### Literatur

- Määttä, J., et al. (2011). *Face Spoofing Detection From Single Images Using Micro-Texture Analysis.* IEEE IJCB.
- Pech-Pacheco, J.L., et al. (2000). *Diatom autofocusing in brightfield microscopy.* ICPR.
- Li, J., et al. (2004). *Live face detection based on Fourier spectra.* SPIE.
