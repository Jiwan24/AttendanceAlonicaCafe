"""
Face matching service using cosine similarity.

Compares a face embedding against all stored employee embeddings
and returns the best match (if above threshold).
"""

import os
import logging
import numpy as np
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Default similarity threshold — calibrate based on real-world testing
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.55"))


def cosine_similarity(embedding_a: list, embedding_b: list) -> float:
    """
    Compute cosine similarity between two embeddings.
    Returns a value between -1 and 1 (higher = more similar).
    ArcFace embeddings are already normalized, so this is equivalent to dot product.
    """
    a = np.array(embedding_a, dtype=np.float32)
    b = np.array(embedding_b, dtype=np.float32)

    # Normalize (safety, should already be normalized by ArcFace)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(np.dot(a, b) / (norm_a * norm_b))


def find_best_match(query_embedding: list, employees: list, threshold: float = None) -> dict:
    """
    Find the best matching employee for a given face embedding.

    For each employee, compares against ALL their stored embeddings
    and takes the highest similarity score.

    Args:
        query_embedding: 512-d face embedding from the captured image
        employees: list of Employee objects (must have .face_embeddings property)
        threshold: minimum similarity score to consider a match (default from env)

    Returns:
        dict with keys:
          - matched: bool
          - employee: Employee object or None
          - score: float (best similarity score)
          - all_scores: list of (employee_id, score) for debugging
    """
    if threshold is None:
        threshold = SIMILARITY_THRESHOLD

    best_employee = None
    best_score = -1.0
    all_scores = []

    for emp in employees:
        embeddings = emp.face_embeddings
        if not embeddings:
            continue

        # Compare against all stored embeddings, take the max
        max_score = -1.0
        for stored_embedding in embeddings:
            score = cosine_similarity(query_embedding, stored_embedding)
            if score > max_score:
                max_score = score

        all_scores.append({"employee_id": emp.id, "nama": emp.nama, "score": max_score})

        if max_score > best_score:
            best_score = max_score
            best_employee = emp

    # Sort all_scores for debugging (highest first)
    all_scores.sort(key=lambda x: x["score"], reverse=True)

    if best_score >= threshold and best_employee is not None:
        logger.info(
            f"Face matched: {best_employee.nama} (score={best_score:.4f}, threshold={threshold})"
        )
        return {
            "matched": True,
            "employee": best_employee,
            "score": best_score,
            "all_scores": all_scores[:5],  # Top 5 for debugging
        }
    else:
        logger.info(
            f"No match found (best_score={best_score:.4f}, threshold={threshold})"
        )
        return {
            "matched": False,
            "employee": None,
            "score": best_score,
            "all_scores": all_scores[:5],
        }
