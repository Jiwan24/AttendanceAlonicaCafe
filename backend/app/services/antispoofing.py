"""
Anti-Spoofing / Liveness Detection Service

Menggunakan model MiniFASNetV2-SE (facenox/face-antispoof-onnx) berbasis
deep learning untuk membedakan wajah asli (3D/live) dari serangan spoofing 2D:
  - Foto yang dicetak (printed photo)
  - Foto/video di layar HP, tablet, atau monitor (screen attack)

Model: MiniFASNetV2-SE quantized ONNX (~600KB)
  - Akurasi: 98.2% pada dataset CelebA-Spoof (70k+ sampel)
  - Input : (N, 3, 128, 128) — letterbox resize, normalize [0, 1]
  - Output: (N, 2) — [real_logit, spoof_logit]
  - Keputusan: is_real = (real_logit - spoof_logit) >= threshold

Referensi: https://github.com/facenox/face-antispoof-onnx
"""

import io
import os
import logging
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Path model ONNX
_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "facenox_antispoof.onnx"
)
_MODEL_PATH = os.path.normpath(_MODEL_PATH)

# Global ONNX session (lazy loaded)
_session = None
_input_name = None

# Threshold logit_diff (real_logit - spoof_logit)
# 0.0  = netral (p=0.50), terlalu longgar
# 1.0  = cukup ketat (p=0.73)
# 1.5  = ketat (p=0.82) — default sekarang
# 2.0  = sangat ketat (p=0.88), risiko false reject lebih tinggi
# Bisa di-override via .env: LIVENESS_LOGIT_THRESHOLD=1.5
LOGIT_THRESHOLD = float(os.getenv("LIVENESS_LOGIT_THRESHOLD", "1.5"))

# Input size model
MODEL_IMG_SIZE = 128

# Expansion factor untuk crop wajah (1.5x seperti repo asli)
BBOX_EXPANSION = 1.5


def _load_model() -> bool:
    """Load model ONNX sekali saat pertama dibutuhkan (lazy load)."""
    global _session, _input_name

    if _session is not None:
        return True

    if not os.path.exists(_MODEL_PATH):
        logger.warning(
            f"[Antispoofing] Model tidak ditemukan: {_MODEL_PATH}. "
            "Anti-spoofing dinonaktifkan."
        )
        return False

    try:
        import onnxruntime as ort
        _session = ort.InferenceSession(
            _MODEL_PATH,
            providers=["CPUExecutionProvider"],
        )
        _input_name = _session.get_inputs()[0].name
        logger.info(
            f"[Antispoofing] MiniFASNetV2-SE loaded: {_MODEL_PATH} "
            f"(input={_input_name}, threshold={LOGIT_THRESHOLD})"
        )
        return True
    except Exception as e:
        logger.error(f"[Antispoofing] Gagal load model: {e}")
        return False


def _crop_face(img_rgb: np.ndarray, bbox: list, expansion: float) -> np.ndarray:
    """
    Crop region wajah secara square dengan expansion factor.
    Menggunakan BORDER_REFLECT untuk padding jika wajah di tepi frame.

    Args:
        img_rgb   : full image RGB (H, W, 3)
        bbox      : [x1, y1, x2, y2] dari InsightFace
        expansion : faktor perbesaran (1.5 = ambil area 1.5x ukuran wajah)

    Returns:
        numpy array RGB hasil crop
    """
    import cv2

    orig_h, orig_w = img_rgb.shape[:2]
    x1, y1, x2, y2 = [float(v) for v in bbox]

    w = x2 - x1
    h = y2 - y1
    if w <= 0 or h <= 0:
        return img_rgb  # fallback: kembalikan full image

    max_dim = max(w, h)
    cx = x1 + w / 2
    cy = y1 + h / 2

    # Hitung area crop square dengan expansion
    half = max_dim * expansion / 2
    nx1 = int(cx - half)
    ny1 = int(cy - half)
    crop_size = int(max_dim * expansion)

    # Hitung area valid dalam gambar
    cx1 = max(0, nx1)
    cy1 = max(0, ny1)
    cx2 = min(orig_w, nx1 + crop_size)
    cy2 = min(orig_h, ny1 + crop_size)

    # Padding jika crop melewati batas
    top_pad    = max(0, -ny1)
    left_pad   = max(0, -nx1)
    bottom_pad = max(0, (ny1 + crop_size) - orig_h)
    right_pad  = max(0, (nx1 + crop_size) - orig_w)

    if cx2 > cx1 and cy2 > cy1:
        cropped = img_rgb[cy1:cy2, cx1:cx2]
    else:
        cropped = np.zeros((crop_size, crop_size, 3), dtype=np.uint8)

    if top_pad + bottom_pad + left_pad + right_pad > 0:
        cropped = cv2.copyMakeBorder(
            cropped,
            top_pad, bottom_pad, left_pad, right_pad,
            cv2.BORDER_REFLECT_101,
        )

    return cropped


def _preprocess(face_crop: np.ndarray, size: int) -> np.ndarray:
    """
    Preprocess face crop ke format input model:
      - Letterbox resize ke (size, size)
      - Normalize pixel ke [0, 1]
      - Transpose HWC → CHW, tambah batch dim → (1, 3, size, size)

    Args:
        face_crop : numpy array RGB (H, W, 3)
        size      : target image size (128)

    Returns:
        numpy array float32 shape (1, 3, size, size)
    """
    import cv2

    old_h, old_w = face_crop.shape[:2]
    ratio = float(size) / max(old_h, old_w)
    new_h = int(old_h * ratio)
    new_w = int(old_w * ratio)

    interp = cv2.INTER_LANCZOS4 if ratio > 1.0 else cv2.INTER_AREA
    resized = cv2.resize(face_crop, (new_w, new_h), interpolation=interp)

    # Padding ke ukuran size x size
    delta_w = size - new_w
    delta_h = size - new_h
    top    = delta_h // 2
    bottom = delta_h - top
    left   = delta_w // 2
    right  = delta_w - left

    padded = cv2.copyMakeBorder(
        resized, top, bottom, left, right, cv2.BORDER_REFLECT_101
    )

    # Normalize [0, 1] dan transpose ke (1, 3, H, W)
    arr = padded.astype(np.float32) / 255.0
    arr = arr.transpose(2, 0, 1)[np.newaxis, :]  # (1, 3, 128, 128)

    return arr


def check_liveness(
    image_bytes: bytes,
    bbox: list,
    det_score: float,
) -> dict:
    """
    Cek apakah wajah yang terdeteksi adalah wajah asli (live) atau spoofing 2D.

    Menggunakan model MiniFASNetV2-SE (deep learning, 98.2% akurasi).

    Args:
        image_bytes : Raw JPEG/PNG bytes dari kamera
        bbox        : Bounding box wajah [x1, y1, x2, y2] dari InsightFace
        det_score   : Detection confidence dari InsightFace (tidak dipakai)

    Returns:
        dict:
          - is_live    : bool  — True jika wajah terdeteksi asli
          - confidence : float — selisih logit real vs spoof (makin tinggi makin yakin live)
          - reason     : str   — penjelasan jika ditolak
          - scores     : dict  — detail skor
    """
    # Lazy load model
    if not _load_model():
        logger.warning("[Antispoofing] Model tidak tersedia, bypass liveness check.")
        return {
            "is_live": True,
            "confidence": 0.5,
            "reason": "Model anti-spoofing tidak tersedia.",
            "scores": {},
        }

    try:
        # Decode image
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        img_array = np.array(img)  # (H, W, 3) RGB

        # Crop wajah
        face_crop = _crop_face(img_array, bbox, BBOX_EXPANSION)

        # Preprocess → (1, 3, 128, 128)
        input_tensor = _preprocess(face_crop, MODEL_IMG_SIZE)

        # Inferensi
        raw_outputs = _session.run([], {_input_name: input_tensor})[0]
        logits = raw_outputs[0]  # [real_logit, spoof_logit]

        # Output model: index 0 = spoof, index 1 = real
        # (diverifikasi dari pengujian: flat image → logits[0] tinggi, noise → logits[1] tinggi)
        spoof_logit = float(logits[0])
        real_logit  = float(logits[1])
        logit_diff  = real_logit - spoof_logit  # positif = real, negatif = spoof

        is_live = logit_diff >= LOGIT_THRESHOLD

        # Hitung confidence sebagai probabilitas via softmax untuk kemudahan baca
        # Swap agar prob[0]=spoof, prob[1]=real sesuai urutan logits
        e = np.exp(logits - np.max(logits))
        probs = e / e.sum()
        prob_spoof = float(probs[0])
        prob_real  = float(probs[1])

        reason = ""
        if not is_live:
            reason = (
                f"Terdeteksi serangan spoofing (foto/layar). "
                f"Skor real: {prob_real:.2f}, skor spoof: {prob_spoof:.2f}. "
                "Hadir langsung di depan kamera, jangan gunakan foto atau video."
            )

        logger.info(
            f"[Antispoofing] is_live={is_live} | "
            f"logit_diff={logit_diff:.3f} (threshold={LOGIT_THRESHOLD}) | "
            f"prob_real={prob_real:.3f} prob_spoof={prob_spoof:.3f}"
        )

        return {
            "is_live": is_live,
            "confidence": round(prob_real, 3),
            "reason": reason,
            "scores": {
                "real":        round(prob_real, 3),
                "spoof":       round(prob_spoof, 3),
                "logit_diff":  round(logit_diff, 3),
            },
        }

    except Exception as e:
        logger.error(f"[Antispoofing] Error saat inferensi: {e}", exc_info=True)
        # Error → bypass agar tidak block user karena bug teknis
        return {
            "is_live": True,
            "confidence": 0.5,
            "reason": f"Error anti-spoofing: {e}",
            "scores": {},
        }
