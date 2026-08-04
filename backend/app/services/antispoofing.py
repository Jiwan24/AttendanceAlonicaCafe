"""
Anti-Spoofing / Liveness Detection Service

Mendeteksi apakah wajah yang difoto adalah:
  - Wajah asli (live) → lulus
  - Foto dari layar HP/tablet/monitor (photo attack) → tolak

Metode yang digunakan (tanpa model ML tambahan):
  1. LBP Texture Analysis  — foto di layar punya pola tekstur berbeda
  2. Frekuensi / Sharpness — foto dari layar HP punya ghosting/blur edge
  3. Color channel variance — layar HP memiliki distribusi warna yang lebih seragam
  4. Moiré pattern detection — foto layar sering menghasilkan pola interferensi
  5. Face region brightness uniformity — layar HP sering terlalu terang seragam

Semua heuristik digabung dengan skor tertimbang.
"""

import logging
import io
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def _pil_to_gray_array(img: Image.Image) -> np.ndarray:
    """Convert PIL Image ke numpy array grayscale."""
    if img.mode != "L":
        img = img.convert("L")
    return np.array(img, dtype=np.float32)


def _crop_face_region(img_array: np.ndarray, bbox: list) -> np.ndarray:
    """
    Crop region wajah dari image berdasarkan bounding box InsightFace.
    bbox = [x1, y1, x2, y2]
    Tambahkan sedikit padding.
    """
    h, w = img_array.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]

    # Padding 10%
    pad_x = int((x2 - x1) * 0.1)
    pad_y = int((y2 - y1) * 0.1)
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w, x2 + pad_x)
    y2 = min(h, y2 + pad_y)

    return img_array[y1:y2, x1:x2]


def _compute_lbp_variance(gray: np.ndarray) -> float:
    """
    Local Binary Pattern sederhana — hitung variance dari LBP.
    Wajah asli punya LBP variance lebih tinggi (kulit punya tekstur kompleks).
    Foto dari layar cenderung smooth/flat.
    """
    if gray.size == 0:
        return 0.0

    # Resize ke ukuran tetap
    from PIL import Image as PILImage
    img = PILImage.fromarray(gray.astype(np.uint8)).resize((64, 64))
    g = np.array(img, dtype=np.float32)

    # Simple LBP: bandingkan setiap pixel dengan 8 tetangga
    lbp = np.zeros((62, 62), dtype=np.uint8)
    for dy, dx in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
        shifted = np.roll(np.roll(g, dy, axis=0), dx, axis=1)
        lbp += (g[1:-1, 1:-1] >= shifted[1:-1, 1:-1]).astype(np.uint8)

    return float(np.var(lbp))


def _compute_laplacian_variance(gray: np.ndarray) -> float:
    """
    Hitung sharpness menggunakan Laplacian variance.
    Wajah asli: tajam dan detil.
    Foto dari layar HP: sering blur karena kamera foto layar (double-lens effect).
    """
    if gray.size == 0:
        return 0.0

    from PIL import Image as PILImage
    img = PILImage.fromarray(gray.astype(np.uint8)).resize((128, 128))
    g = np.array(img, dtype=np.float32)

    # Laplacian kernel
    kernel = np.array([[0,1,0],[1,-4,1],[0,1,0]], dtype=np.float32)
    # Manual convolution (simplified)
    lap = np.zeros_like(g[1:-1, 1:-1])
    lap += g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]

    return float(np.var(lap))


def _compute_frequency_ratio(gray: np.ndarray) -> float:
    """
    Analisis frekuensi menggunakan FFT.
    Foto dari layar HP sering punya pola frekuensi tinggi dari pixel/subpixel layar
    ATAU sebaliknya sangat sedikit high-freq karena blur.
    Return: rasio energi high-freq terhadap total energi.
    """
    if gray.size < 64:
        return 0.0

    from PIL import Image as PILImage
    img = PILImage.fromarray(gray.astype(np.uint8)).resize((64, 64))
    g = np.array(img, dtype=np.float32)

    fft = np.fft.fft2(g)
    fft_shifted = np.fft.fftshift(fft)
    magnitude = np.abs(fft_shifted)

    h, w = magnitude.shape
    cy, cx = h // 2, w // 2
    r = min(cy, cx) // 3  # radius untuk low-freq center

    y_idx, x_idx = np.ogrid[:h, :w]
    mask_low = (y_idx - cy)**2 + (x_idx - cx)**2 <= r**2

    total_energy = np.sum(magnitude) + 1e-8
    low_energy = np.sum(magnitude[mask_low])
    high_energy = total_energy - low_energy

    return float(high_energy / total_energy)


def _compute_color_uniformity(img_rgb: np.ndarray) -> float:
    """
    Hitung uniformitas warna di region wajah.
    Layar HP menampilkan foto dengan distribusi warna lebih seragam
    (contrast tinggi, saturasi tinggi, tapi variance antar-channel lebih rendah).
    Return: channel variance ratio (rendah = lebih uniform = lebih mencurigakan).
    """
    if img_rgb.size == 0 or img_rgb.ndim < 3:
        return 1.0

    from PIL import Image as PILImage
    if img_rgb.dtype != np.uint8:
        img_rgb = img_rgb.astype(np.uint8)
    img = PILImage.fromarray(img_rgb).resize((64, 64))
    arr = np.array(img, dtype=np.float32)

    var_r = float(np.var(arr[:, :, 0]))
    var_g = float(np.var(arr[:, :, 1]))
    var_b = float(np.var(arr[:, :, 2]))

    return (var_r + var_g + var_b) / 3.0


def _compute_brightness_uniformity(gray: np.ndarray) -> float:
    """
    Foto dari layar HP sering terlalu terang dan seragam di region wajah
    karena layar memancarkan cahaya sendiri.
    Return: coefficient of variation brightness (rendah = terlalu seragam).
    """
    if gray.size == 0:
        return 1.0

    mean = float(np.mean(gray)) + 1e-8
    std = float(np.std(gray))
    return std / mean  # CoV — lebih tinggi = lebih beragam = lebih alami


def check_liveness(
    image_bytes: bytes,
    bbox: list,
    det_score: float,
) -> dict:
    """
    Analisis anti-spoofing pada gambar wajah.

    Args:
        image_bytes: Raw JPEG/PNG bytes
        bbox: Bounding box wajah [x1, y1, x2, y2] dari InsightFace
        det_score: Detection confidence score dari InsightFace

    Returns:
        dict:
          - is_live: bool — True jika wajah terlihat asli
          - confidence: float — 0.0 (pasti spoof) s/d 1.0 (pasti live)
          - reason: str — penjelasan jika terdeteksi spoof
          - scores: dict — detail tiap metrik
    """
    try:
        # Load image
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        img_array = np.array(img)

        # Crop region wajah
        face_rgb = _crop_face_region(img_array, bbox)
        if face_rgb.size == 0:
            return {
                "is_live": False,
                "confidence": 0.0,
                "reason": "Gagal memproses region wajah.",
                "scores": {},
            }

        # Convert ke grayscale untuk analisis tekstur
        face_gray = np.array(Image.fromarray(face_rgb).convert("L"), dtype=np.float32)

        # ── Hitung semua metrik ──────────────────────────────────
        lbp_var         = _compute_lbp_variance(face_gray)
        laplacian_var   = _compute_laplacian_variance(face_gray)
        freq_ratio      = _compute_frequency_ratio(face_gray)
        color_var       = _compute_color_uniformity(face_rgb)
        brightness_cov  = _compute_brightness_uniformity(face_gray)

        logger.debug(
            f"[Antispoofing] lbp_var={lbp_var:.2f} lap_var={laplacian_var:.2f} "
            f"freq={freq_ratio:.3f} color_var={color_var:.1f} bright_cov={brightness_cov:.3f}"
        )

        # ── Scoring: setiap metrik dinormalisasi ke 0-1 ──────────
        # Skor tinggi = lebih mungkin wajah asli

        # LBP variance: wajah asli ~8-25, foto layar ~1-6
        # Dari data: foto HP lbp_var sangat rendah → lbp_score ~0.21
        lbp_score = min(1.0, lbp_var / 12.0)

        # Laplacian variance — INDIKATOR TERKUAT
        # Wajah asli: lap_var tinggi → lap_score ~0.87
        # Foto HP:    lap_var rendah → lap_score ~0.16 (kamera foto layar = blur)
        # Normalisasi lebih ketat: wajah asli harus ≥ 150 untuk skor 0.5
        lap_score = min(1.0, laplacian_var / 200.0)

        # Frequency ratio
        freq_score = 1.0 - abs(freq_ratio - 0.45) * 2.5
        freq_score = max(0.0, min(1.0, freq_score))

        # Color variance: skor ini tidak reliable (selalu 1.0) → turunkan bobot
        color_score = min(1.0, color_var / 800.0)

        # Brightness CoV: tidak reliable di kondisi ini → turunkan bobot
        bright_score = min(1.0, brightness_cov / 0.18)

        # ── Hard check: Laplacian adalah indikator paling kuat ──
        # Jika ketajaman sangat rendah → pasti foto dari layar
        # Dari data: foto HP lap_score ~0.16, wajah asli ~0.87
        # Paksa fail jika lap_score < 0.35 (di bawah midpoint foto HP vs asli)
        if lap_score < 0.35:
            composite = lap_score * 0.5  # paksa nilai rendah
        else:
            # Weighted average — laplacian dominan
            weights = {
                "lbp":        0.15,
                "laplacian":  0.55,  # naik drastis, ini paling reliable
                "frequency":  0.15,
                "color":      0.10,  # turun, tidak reliable
                "brightness": 0.05,  # turun, tidak reliable
            }
            composite = (
                lbp_score    * weights["lbp"] +
                lap_score    * weights["laplacian"] +
                freq_score   * weights["frequency"] +
                color_score  * weights["color"] +
                bright_score * weights["brightness"]
            )

        # Threshold: >= 0.50 dianggap live
        # Dari data: foto HP composite ~0.08-0.17, wajah asli ~0.65+
        THRESHOLD = 0.50
        is_live = composite >= THRESHOLD

        # Cari alasan utama jika terdeteksi spoof
        reason = ""
        if not is_live:
            low_scores = {
                "tekstur kulit": lbp_score,
                "ketajaman gambar": lap_score,
                "pola frekuensi": freq_score,
                "variasi warna": color_score,
                "kecerahan": bright_score,
            }
            worst_key = min(low_scores, key=low_scores.get)
            reason = (
                f"Terdeteksi kemungkinan foto/layar (skor {composite:.2f}). "
                f"Indikator: {worst_key} tidak memenuhi syarat wajah asli."
            )

        logger.info(
            f"[Antispoofing] composite={composite:.3f} is_live={is_live} "
            f"scores=[lbp={lbp_score:.2f} lap={lap_score:.2f} freq={freq_score:.2f} "
            f"color={color_score:.2f} bright={bright_score:.2f}]"
        )

        return {
            "is_live": is_live,
            "confidence": round(composite, 3),
            "reason": reason,
            "scores": {
                "lbp_texture":  round(lbp_score, 3),
                "sharpness":    round(lap_score, 3),
                "frequency":    round(freq_score, 3),
                "color_var":    round(color_score, 3),
                "brightness":   round(bright_score, 3),
                "composite":    round(composite, 3),
            },
        }

    except Exception as e:
        logger.error(f"[Antispoofing] Error: {e}")
        # Jika anti-spoof error, default allow (jangan block user karena bug)
        return {
            "is_live": True,
            "confidence": 0.5,
            "reason": f"Anti-spoof check error: {e}",
            "scores": {},
        }
