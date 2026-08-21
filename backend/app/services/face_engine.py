"""
Face detection & recognition engine using InsightFace.

Uses:
  - RetinaFace for face detection (built into InsightFace)
  - ArcFace for face embedding/recognition (built into InsightFace)

Lazy loading: model tidak di-load saat startup, melainkan saat pertama kali
ada request yang membutuhkan face recognition. Ini memungkinkan server bisa
start cepat (tidak timeout) meski model butuh waktu download ~300MB.
"""

import io
import logging
import threading
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Global model instance — None sampai pertama kali dipakai
_face_app = None
_model_loading = False
_model_lock = threading.Lock()


def _do_load_model():
    """Internal: benar-benar load model InsightFace. Dipanggil dari get_model()."""
    global _face_app, _model_loading

    try:
        logger.info("Loading InsightFace model (buffalo_l) — this may take a moment on first run...")
        from insightface.app import FaceAnalysis

        app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        app.prepare(ctx_id=-1, det_size=(640, 640))
        _face_app = app
        logger.info("InsightFace model loaded successfully (buffalo_l, CPU)")
    except Exception as e:
        logger.error(f"Failed to load InsightFace model: {e}")
        _face_app = None
    finally:
        _model_loading = False


def get_model():
    """
    Lazy-load face model. Thread-safe: hanya satu thread yang akan load.
    Mengembalikan model instance atau None jika gagal load.
    """
    global _face_app, _model_loading

    if _face_app is not None:
        return _face_app

    with _model_lock:
        # Double-check setelah acquire lock (mungkin thread lain sudah load)
        if _face_app is not None:
            return _face_app

        if not _model_loading:
            _model_loading = True
            _do_load_model()

    return _face_app


def load_model():
    """
    Eksplisit trigger load model.
    Aman dipanggil di startup (tidak akan block server karena lazy pattern),
    tapi sekarang ini adalah no-op — load terjadi saat get_model() pertama kali dipanggil.
    Dipertahankan untuk backward compatibility.
    """
    logger.info("Face recognition engine uses lazy loading — model will load on first request.")


def is_model_loaded() -> bool:
    """Check if the face model is loaded and ready."""
    return _face_app is not None


def detect_and_embed(image_bytes: bytes) -> dict:
    """
    Detect face(s) in an image and return embedding(s).

    Args:
        image_bytes: Raw image bytes (JPEG/PNG)

    Returns:
        dict with keys:
          - success: bool
          - faces: list of dicts with 'embedding' (list[float]), 'bbox' (list[float]), 'det_score' (float)
          - error: str (if success is False)
    """
    app = get_model()

    if app is None:
        return {
            "success": False,
            "faces": [],
            "error": "Model wajah sedang dimuat atau gagal dimuat. Coba beberapa saat lagi.",
        }

    try:
        # Decode image
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        img_array = np.array(image)
        # RGB to BGR (InsightFace expects BGR)
        img_array = img_array[:, :, ::-1]

        faces = app.get(img_array)

        if not faces:
            return {"success": False, "faces": [], "error": "Tidak ada wajah terdeteksi"}

        results = []
        for face in faces:
            results.append({
                "embedding": face.embedding.tolist(),
                "bbox": face.bbox.tolist(),
                "det_score": float(face.det_score),
            })

        return {"success": True, "faces": results, "error": None}

    except Exception as e:
        logger.error(f"Face detection/embedding error: {e}")
        return {"success": False, "faces": [], "error": str(e)}


def get_single_face_embedding(image_bytes: bytes) -> dict:
    """
    Convenience function: detect exactly one face and return its embedding.
    Used for enrollment and verification.

    Returns:
        dict with keys:
          - success: bool
          - embedding: list[float] (512-d) or None
          - det_score: float or None
          - bbox: list[float] or None
          - error: str or None
    """
    result = detect_and_embed(image_bytes)

    if not result["success"]:
        return {
            "success": False,
            "embedding": None,
            "det_score": None,
            "bbox": None,
            "error": result["error"],
        }

    if len(result["faces"]) > 1:
        return {
            "success": False,
            "embedding": None,
            "det_score": None,
            "bbox": None,
            "error": "Terdeteksi lebih dari 1 wajah. Pastikan hanya 1 orang di depan kamera.",
        }

    face = result["faces"][0]
    return {
        "success": True,
        "embedding": face["embedding"],
        "det_score": face["det_score"],
        "bbox": face["bbox"],
        "error": None,
    }
