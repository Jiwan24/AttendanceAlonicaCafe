# Dokumentasi Anti-Spoofing — `app/services/antispoofing.py`

## Tujuan

Modul ini bertugas mendeteksi apakah wajah yang ditangkap kamera adalah **wajah asli (live)** atau **serangan spoofing 2D** berupa:
- Foto yang dicetak di kertas
- Foto atau video yang ditampilkan di layar HP, tablet, atau monitor

Jika terdeteksi spoofing → absensi **ditolak** dengan pesan kesalahan.

---

## Pendekatan

Sistem menggunakan **analisis heuristik berbasis citra** (tanpa model machine learning tambahan). Lima karakteristik gambar diukur, dinormalisasi ke skor 0–1, lalu digabungkan dengan pembobotan tertimbang menghasilkan satu **composite score**. Jika composite score < 0.50 → spoof.

---

## Struktur File

```
antispoofing.py
├── Import & setup logger
├── _pil_to_gray_array()       — helper konversi grayscale
├── _crop_face_region()        — helper crop area wajah
├── _compute_lbp_variance()    — indikator 1: analisis tekstur LBP
├── _compute_laplacian_variance() — indikator 2: ketajaman gambar
├── _compute_frequency_ratio() — indikator 3: analisis frekuensi FFT
├── _compute_color_uniformity() — indikator 4: keragaman warna
├── _compute_brightness_uniformity() — indikator 5: keseragaman kecerahan
└── check_liveness()           — fungsi utama yang dipanggil dari attendance.py
```

---

## Import & Setup

```python
import logging
import io
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)
```

| Library | Fungsi |
|---|---|
| `logging` | Mencatat log setiap proses anti-spoofing ke console server |
| `io` | Membaca data gambar dari bytes mentah (kiriman kamera) |
| `numpy` | Komputasi array/matriks untuk analisis piksel secara efisien |
| `PIL.Image` | Decode gambar JPEG/PNG dan konversi format warna |

---

## Fungsi Helper

### `_pil_to_gray_array(img)`

```python
def _pil_to_gray_array(img: Image.Image) -> np.ndarray:
    if img.mode != "L":
        img = img.convert("L")
    return np.array(img, dtype=np.float32)
```

Mengubah gambar PIL ke array numpy **grayscale**. Mode `"L"` adalah format grayscale (1 channel, nilai 0–255). Hasilnya array 2D `float32` yang digunakan oleh semua fungsi analisis tekstur.

---

### `_crop_face_region(img_array, bbox)`

```python
def _crop_face_region(img_array, bbox):
    h, w = img_array.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]

    pad_x = int((x2 - x1) * 0.1)   # padding 10% lebar wajah
    pad_y = int((y2 - y1) * 0.1)   # padding 10% tinggi wajah
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)

    return img_array[y1:y2, x1:x2]
```

Memotong area wajah dari gambar penuh berdasarkan `bbox = [x1, y1, x2, y2]` yang diberikan oleh InsightFace.

**Mengapa ada padding?**
Menambahkan 10% ekstra ke setiap sisi memastikan area sekitar wajah (tepi rambut, leher, alis) ikut terbaca. Ini penting agar analisis tekstur mendapatkan cukup variasi — wajah yang terlalu terpotong ketat bisa menghasilkan skor yang tidak akurat.

`max(0, ...)` dan `min(w, ...)` mencegah koordinat keluar batas dimensi gambar.

---

## 5 Fungsi Indikator

---

### Indikator 1 — `_compute_lbp_variance()` — Analisis Tekstur LBP

```python
def _compute_lbp_variance(gray: np.ndarray) -> float:
    img = PILImage.fromarray(gray.astype(np.uint8)).resize((64, 64))
    g = np.array(img, dtype=np.float32)

    lbp = np.zeros((62, 62), dtype=np.uint8)
    for dy, dx in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
        shifted = np.roll(np.roll(g, dy, axis=0), dx, axis=1)
        lbp += (g[1:-1, 1:-1] >= shifted[1:-1, 1:-1]).astype(np.uint8)

    return float(np.var(lbp))
```

**Apa itu LBP (Local Binary Pattern)?**

LBP adalah metode analisis tekstur yang mengukur pola lokal setiap piksel terhadap tetangganya. Cara kerjanya:

1. Gambar diubah ke ukuran tetap **64×64 piksel** agar hasil tidak dipengaruhi ukuran wajah
2. Untuk setiap piksel, dibandingkan dengan **8 tetangga** (atas, bawah, kiri, kanan, dan 4 diagonal)
3. Jika nilai piksel pusat ≥ nilai tetangga → hasilnya **1**, sebaliknya **0**
4. Semua 8 perbandingan dijumlahkan, menghasilkan nilai 0–8 per piksel
5. Dihitung **variance** dari seluruh nilai LBP

**Visualisasi perbandingan 8 tetangga:**
```
[-1,-1] [-1, 0] [-1,+1]
[ 0,-1] [pusat] [ 0,+1]
[+1,-1] [+1, 0] [+1,+1]
```

**`np.roll(g, dy, axis=0)`** — menggeser array ke arah `dy` pada sumbu vertikal, sehingga piksel tetangga berada di posisi yang sama dengan piksel pusat untuk perbandingan elemen per elemen.

**Interpretasi nilai:**

| Kondisi | LBP Variance | Keterangan |
|---|---|---|
| Wajah asli | ~8 – 25 | Kulit punya tekstur kompleks, pori, bulu halus |
| Foto di layar | ~1 – 6 | Permukaan flat, piksel lebih seragam |

---

### Indikator 2 — `_compute_laplacian_variance()` — Ketajaman Gambar

```python
def _compute_laplacian_variance(gray: np.ndarray) -> float:
    img = PILImage.fromarray(gray.astype(np.uint8)).resize((128, 128))
    g = np.array(img, dtype=np.float32)

    lap = np.zeros_like(g[1:-1, 1:-1])
    lap += g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]

    return float(np.var(lap))
```

Mengukur **ketajaman gambar** menggunakan operator Laplacian — teknik standar dalam image processing untuk mendeteksi tepi (edge).

**Rumus Laplacian (konvolusi manual):**
```
Lap(x,y) = atas + bawah + kiri + kanan - 4 × pusat
```

Ini ekuivalen dengan kernel:
```
[ 0,  1,  0]
[ 1, -4,  1]
[ 0,  1,  0]
```

Hasilnya menunjukkan seberapa "tajam" perubahan intensitas antar piksel. **Variance** dari hasil Laplacian mengukur seberapa banyak tepi tajam ada di gambar — semakin banyak detail, semakin tinggi variance.

**Mengapa ini indikator terkuat?**

Foto di layar mengalami **double-lens effect** — kamera memotret layar yang sudah menampilkan foto. Proses ini menghasilkan blur tambahan (motion, depth of field, kompresi layar), sehingga hasil gambar jauh lebih blur dibanding wajah asli langsung di depan kamera.

**Interpretasi nilai:**

| Kondisi | Laplacian Variance | Skor (÷200) |
|---|---|---|
| Wajah asli | ~150 – 400+ | ~0.75 – 1.0 |
| Foto di layar HP | ~15 – 50 | ~0.08 – 0.25 |

Ini adalah **indikator paling reliabel** → mendapat bobot **55%** dalam composite score.

---

### Indikator 3 — `_compute_frequency_ratio()` — Analisis Frekuensi FFT

```python
def _compute_frequency_ratio(gray: np.ndarray) -> float:
    fft = np.fft.fft2(g)
    fft_shifted = np.fft.fftshift(fft)
    magnitude = np.abs(fft_shifted)

    # Buat mask lingkaran untuk area low-frequency (tengah)
    r = min(cy, cx) // 3
    mask_low = (y_idx - cy)**2 + (x_idx - cx)**2 <= r**2

    high_energy = total_energy - low_energy
    return float(high_energy / total_energy)
```

Menggunakan **Fast Fourier Transform (FFT)** untuk menganalisis distribusi energi frekuensi gambar.

**Cara kerja FFT pada gambar:**

FFT mengubah gambar dari domain spasial (nilai piksel) ke **domain frekuensi**. Setelah `fftshift`:
- **Tengah spektrum** = frekuensi rendah (perubahan warna lambat/gradual, seperti latar belakang)
- **Pinggir spektrum** = frekuensi tinggi (detail tajam, tepi, tekstur halus)

Fungsi ini menghitung **rasio energi frekuensi tinggi terhadap total energi** menggunakan mask lingkaran untuk memisahkan area low-freq di tengah:

```
mask lingkaran: (y - cy)² + (x - cx)² ≤ r²
```

**Interpretasi nilai:**

| Kondisi | Freq Ratio | Keterangan |
|---|---|---|
| Wajah asli | ~0.35 – 0.55 | Distribusi frekuensi seimbang |
| Foto layar (blur) | < 0.30 | Dominasi low-freq akibat blur |
| Foto layar (moiré) | > 0.60 | Dominasi high-freq dari pola piksel layar |

Nilai ideal ada di tengah (~0.45), sehingga rumus normalisasinya:
```python
freq_score = 1.0 - abs(freq_ratio - 0.45) * 2.5
```
Semakin jauh dari 0.45, semakin mencurigakan.

---

### Indikator 4 — `_compute_color_uniformity()` — Keragaman Warna

```python
def _compute_color_uniformity(img_rgb: np.ndarray) -> float:
    var_r = float(np.var(arr[:, :, 0]))
    var_g = float(np.var(arr[:, :, 1]))
    var_b = float(np.var(arr[:, :, 2]))
    return (var_r + var_g + var_b) / 3.0
```

Menghitung **variance rata-rata dari 3 channel warna** (Red, Green, Blue). Semakin tinggi variance, semakin beragam warna dalam gambar.

Gambar diubah ke ukuran 64×64 sebelum dihitung agar hasil konsisten. Variance dihitung terpisah untuk tiap channel R, G, B, lalu dirata-rata.

**Interpretasi nilai:**

| Kondisi | Color Variance | Keterangan |
|---|---|---|
| Wajah asli | Lebih tinggi | Gradasi warna alami kulit, bayangan, pencahayaan |
| Layar HP | Lebih rendah | Warna terkompresi dan seragam dari display digital |

> **Catatan:** Indikator ini mendapat bobot **10%** karena hasilnya kurang konsisten — pada kondisi tertentu foto di layar bisa memiliki color variance yang mirip dengan wajah asli.

---

### Indikator 5 — `_compute_brightness_uniformity()` — Keseragaman Kecerahan

```python
def _compute_brightness_uniformity(gray: np.ndarray) -> float:
    mean = float(np.mean(gray)) + 1e-8
    std = float(np.std(gray))
    return std / mean  # Coefficient of Variation (CoV)
```

Menghitung **Coefficient of Variation (CoV)** kecerahan — rasio standar deviasi terhadap rata-rata intensitas piksel.

```
CoV = std / mean
```

`+ 1e-8` (epsilon kecil) ditambahkan ke mean untuk menghindari pembagian dengan nol saat gambar benar-benar gelap.

**Interpretasi nilai:**

| CoV | Kondisi | Keterangan |
|---|---|---|
| Tinggi | Wajah asli | Banyak variasi kecerahan — bayangan alami, kontur wajah |
| Rendah | Layar HP | Layar memancarkan cahaya sendiri secara merata → terlalu seragam |

> **Catatan:** Indikator ini mendapat bobot hanya **5%** karena sangat dipengaruhi kondisi pencahayaan ruangan — di ruangan terang, wajah asli pun bisa punya CoV rendah.

---

## Fungsi Utama — `check_liveness()`

Ini adalah satu-satunya fungsi yang dipanggil dari luar modul, yaitu dari `attendance.py`.

### Signature

```python
def check_liveness(image_bytes: bytes, bbox: list, det_score: float) -> dict:
```

**Parameter:**
| Parameter | Tipe | Keterangan |
|---|---|---|
| `image_bytes` | `bytes` | Gambar mentah JPEG/PNG dari kamera |
| `bbox` | `list` | Koordinat wajah `[x1, y1, x2, y2]` dari InsightFace |
| `det_score` | `float` | Skor kepercayaan deteksi InsightFace (tidak digunakan aktif) |

---

### Alur Eksekusi

#### Tahap 1 — Decode & Crop Gambar

```python
img = Image.open(io.BytesIO(image_bytes))
if img.mode != "RGB":
    img = img.convert("RGB")
img_array = np.array(img)

face_rgb = _crop_face_region(img_array, bbox)
face_gray = np.array(Image.fromarray(face_rgb).convert("L"), dtype=np.float32)
```

Gambar bytes dari kamera di-decode ke PIL Image, dikonversi ke RGB (menangani RGBA, grayscale, dll.), lalu diubah ke array numpy. Area wajah dipotong berdasarkan `bbox`, lalu dibuat versi grayscale-nya.

---

#### Tahap 2 — Hitung 5 Metrik

```python
lbp_var        = _compute_lbp_variance(face_gray)
laplacian_var  = _compute_laplacian_variance(face_gray)
freq_ratio     = _compute_frequency_ratio(face_gray)
color_var      = _compute_color_uniformity(face_rgb)
brightness_cov = _compute_brightness_uniformity(face_gray)
```

Kelima fungsi dipanggil sekaligus. LBP, Laplacian, FFT, dan Brightness menggunakan versi **grayscale**. Color uniformity menggunakan versi **RGB** asli karena membutuhkan informasi 3 channel warna.

---

#### Tahap 3 — Normalisasi ke Skor 0–1

```python
lbp_score   = min(1.0, lbp_var / 12.0)
lap_score   = min(1.0, laplacian_var / 200.0)
freq_score  = max(0.0, min(1.0, 1.0 - abs(freq_ratio - 0.45) * 2.5))
color_score = min(1.0, color_var / 800.0)
bright_score = min(1.0, brightness_cov / 0.18)
```

Setiap metrik dinormalisasi ke rentang `[0.0, 1.0]` menggunakan pembagi yang dikalibrasi dari data pengujian nyata. Skor **tinggi = lebih mungkin wajah asli**. `min(1.0, ...)` memastikan skor tidak melebihi 1.

| Skor | Pembagi | Dasar Kalibrasi |
|---|---|---|
| `lbp_score` | 12.0 | LBP variance rata-rata wajah asli ~12 |
| `lap_score` | 200.0 | Laplacian variance wajah asli ~150–400 |
| `freq_score` | formula | Nilai ideal freq_ratio ~0.45 |
| `color_score` | 800.0 | Color variance wajah asli ~600–1000 |
| `bright_score` | 0.18 | CoV brightness wajah asli ~0.15–0.25 |

---

#### Tahap 4 — Hard Check + Composite Score

```python
if lap_score < 0.35:
    composite = lap_score * 0.5   # paksa nilai rendah → pasti ditolak
else:
    composite = (
        lbp_score    * 0.15 +
        lap_score    * 0.55 +
        freq_score   * 0.15 +
        color_score  * 0.10 +
        bright_score * 0.05
    )
```

Ada **dua jalur keputusan**:

**Hard check:** Jika `lap_score < 0.35` (gambar sangat blur), composite langsung dipaksa rendah (`lap_score × 0.5`). Ini mencegah foto layar yang sangat blur lolos karena kebetulan mendapat skor tinggi di indikator lain.

**Weighted average:** Jika lolos hard check, kelima skor digabung dengan bobot:

| Indikator | Bobot | Alasan |
|---|---|---|
| Laplacian (sharpness) | **55%** | Paling reliabel, paling konsisten membedakan asli vs foto |
| LBP (texture) | 15% | Cukup reliabel tapi kadang dipengaruhi makeup/pencahayaan |
| Frequency (FFT) | 15% | Reliabel untuk foto layar dengan moiré pattern |
| Color variance | 10% | Kurang konsisten, dipengaruhi warna pakaian/latar |
| Brightness CoV | 5% | Sangat dipengaruhi kondisi pencahayaan ruangan |

---

#### Tahap 5 — Keputusan Akhir

```python
THRESHOLD = 0.50
is_live = composite >= THRESHOLD
```

Ambang batas **0.50**:
- Dari data pengujian: foto HP menghasilkan composite ~0.08–0.17
- Wajah asli menghasilkan composite ~0.65–0.90
- 0.50 memberikan margin aman yang cukup di antara keduanya

---

#### Tahap 6 — Cari Alasan Penolakan

```python
if not is_live:
    low_scores = {
        "tekstur kulit": lbp_score,
        "ketajaman gambar": lap_score,
        "pola frekuensi": freq_score,
        "variasi warna": color_score,
        "kecerahan": bright_score,
    }
    worst_key = min(low_scores, key=low_scores.get)
    reason = f"Terdeteksi kemungkinan foto/layar (skor {composite:.2f}). Indikator: {worst_key} tidak memenuhi syarat wajah asli."
```

Mencari indikator dengan skor terendah (`min(...)`) sebagai penyebab utama penolakan. Pesan ini ditampilkan di log server dan dikembalikan ke frontend.

---

### Return Value

```python
return {
    "is_live":    bool,   # True = wajah asli, False = spoof
    "confidence": float,  # Composite score (0.0 – 1.0)
    "reason":     str,    # Penjelasan jika ditolak (kosong jika live)
    "scores": {
        "lbp_texture": float,
        "sharpness":   float,
        "frequency":   float,
        "color_var":   float,
        "brightness":  float,
        "composite":   float,
    }
}
```

---

### Error Handling

```python
except Exception as e:
    logger.error(f"[Antispoofing] Error: {e}")
    return {
        "is_live": True,   # default ALLOW jika terjadi error
        "confidence": 0.5,
        ...
    }
```

Jika terjadi error tak terduga (gambar rusak, memori habis, dll.), sistem **default mengizinkan** (`is_live = True`). Ini dilakukan agar bug di modul anti-spoofing tidak memblokir seluruh operasional absensi.

---

## Diagram Alur Lengkap

```
Input: image_bytes (JPEG/PNG dari kamera)
         │
         ▼
 Decode gambar → RGB numpy array
         │
         ▼
 Crop area wajah berdasarkan bbox + padding 10%
         │
         ├──────────────────────────────────────┐
         ▼                                      ▼
   face_gray (grayscale)                 face_rgb (warna)
         │                                      │
    ┌────┴────┐                                 │
    │         │                                 │
    ▼         ▼                                 ▼
  LBP      Laplacian   FFT    Color Var   Brightness CoV
  Var      Var         Ratio  (dari RGB)  (dari gray)
    │         │           │       │            │
    ▼         ▼           ▼       ▼            ▼
 ÷12.0     ÷200.0    formula  ÷800.0        ÷0.18
    │         │           │       │            │
    ▼         ▼           ▼       ▼            ▼
 lbp_score lap_score freq_score color_score bright_score
         │
         ▼
  Hard check: lap_score < 0.35 ?
    YES → composite = lap_score × 0.5  (paksa rendah)
    NO  → composite = weighted average (55%+15%+15%+10%+5%)
         │
         ▼
  composite ≥ 0.50 ?
    YES → is_live = True  ✓ (lanjut ke face recognition)
    NO  → is_live = False ✗ (absensi ditolak)
```

---

## Contoh Output Log

**Wajah asli:**
```
[Antispoofing] composite=0.732 is_live=True
scores=[lbp=0.19 lap=0.75 freq=0.96 color=1.00 bright=1.00]
```

**Foto di layar HP:**
```
[Antispoofing] composite=0.099 is_live=False
scores=[lbp=0.21 lap=0.16 freq=0.81 color=1.00 bright=1.00]
reason: Indikator: ketajaman gambar tidak memenuhi syarat wajah asli.
```

---

## Keterbatasan

| Keterbatasan | Penjelasan |
|---|---|
| Foto resolusi sangat tinggi | Foto 4K di layar OLED premium bisa lolos karena detail tetap tajam |
| Video attack | Video wajah bergerak lebih sulit dideteksi dengan analisis frame tunggal |
| Pencahayaan buruk | Wajah asli di ruangan gelap bisa menghasilkan Laplacian rendah |
| 3D mask attack | Sepenuhnya di luar kemampuan metode heuristik ini |

Untuk mengatasi keterbatasan ini, sistem dilengkapi **smile challenge** di frontend (liveness berbasis gerakan) dan infrastruktur untuk model deep learning MiniFASNetV2 sebagai upgrade ke depan.
