"""
Alonica Cafe — Sistem Absensi Wajah
FastAPI main application entrypoint.

Run with:
    cd backend
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.db import init_db, seed_shifts
from app.routers import employees, attendance
from app.routers.shifts import shift_router, schedule_router

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # --- STARTUP ---
    logger.info("=" * 60)
    logger.info("Alonica Attendance System — Starting up...")
    logger.info("=" * 60)

    # Initialize database (create tables)
    init_db()
    logger.info("Database initialized.")

    # Seed fixed shifts
    seed_shifts()
    logger.info("Shift data seeded (Shift 1: 08:00–16:00, Shift 2: 16:00–00:00).")

    # Load face recognition model
    logger.info("Loading InsightFace model (this may take a moment on first run)...")
    from app.services.face_engine import load_model
    load_model()
    logger.info("Face recognition engine ready.")

    logger.info("=" * 60)
    logger.info("Server is ready! Endpoints available at /docs")
    logger.info("=" * 60)

    yield

    # --- SHUTDOWN ---
    logger.info("Alonica Attendance System — Shutting down.")


# Create FastAPI app
app = FastAPI(
    title="Alonica Cafe — Sistem Absensi Wajah",
    description=(
        "API untuk sistem absensi karyawan Alonica Cafe menggunakan "
        "face recognition (InsightFace: RetinaFace + ArcFace)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware — allow frontend to call backend
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(shift_router)
app.include_router(schedule_router)


@app.get("/")
def root():
    """Health check endpoint."""
    from app.services.face_engine import is_model_loaded
    return {
        "status": "ok",
        "app": "Alonica Cafe — Sistem Absensi Wajah",
        "version": "1.0.0",
        "face_model_loaded": is_model_loaded(),
    }
