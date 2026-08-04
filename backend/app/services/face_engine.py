"""
Face detection & recognition engine using InsightFace.

Uses:
  - RetinaFace for face detection (built into InsightFace)
  - ArcFace for face embedding/recognition (built into InsightFace)

The InsightFace `FaceAnalysis` class bundles both models together.
First run will auto-download the 'buffalo_l' model pack (~300MB).
"""

import io
import logging
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Global model instance (loaded once on startup)
_face_app = None


def load_model():
    """
    Load the InsightFace model. Called once during server startup.
    Uses 'buffalo_l' which includes RetinaFace + ArcFace.
    """
    global _face_app

    try:
        from insightface.app import FaceAnalysis

        _face_app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],  # CPU only, no GPU needed for <50 employees
        )
        # det_size: detection input size. 640x640 is standard, good balance of speed & accuracy
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
        logger.info("InsightFace model loaded successfully (buffalo_l, CPU)")
    except Exception as e:
        logger.error(f"Failed to load InsightFace model: {e}")
        logger.warning(
            "Face recognition will not be available. "
            "Make sure insightface and onnxruntime are installed."
        )
        _face_app = None


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
    if _face_app is None:
        return {"success": False, "faces": [], "error": "Model not loaded"}

    try:
        # Decode image
        image = Image.open(io.BytesIO(image_bytes))
        # Convert to RGB if needed (handles RGBA, grayscale, etc.)
        if image.mode != "RGB":
            image = image.convert("RGB")
        # Convert to numpy array (InsightFace expects BGR via OpenCV convention)
        img_array = np.array(image)
        # RGB to BGR
        img_array = img_array[:, :, ::-1]

        # Detect faces
        faces = _face_app.get(img_array)

        if not faces:
            return {"success": False, "faces": [], "error": "Tidak ada wajah terdeteksi"}

        results = []
        for face in faces:
            embedding = face.embedding.tolist()  # 512-d vector
            bbox = face.bbox.tolist()  # [x1, y1, x2, y2]
            det_score = float(face.det_score)

            results.append({
                "embedding": embedding,
                "bbox": bbox,
                "det_score": det_score,
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
          - error: str or None
    """
    result = detect_and_embed(image_bytes)

    if not result["success"]:
        return {"success": False, "embedding": None, "det_score": None, "error": result["error"]}

    if len(result["faces"]) > 1:
        return {
            "success": False,
            "embedding": None,
            "det_score": None,
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
