"""
Database connection and session management for Alonica Attendance System.
Uses SQLite for simplicity (MVP, <50 employees).
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./alonica_attendance.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite-specific
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency: yields a database session, auto-closes after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables on startup."""
    from app.models import Employee, AttendanceLog  # noqa: F401
    Base.metadata.create_all(bind=engine)


def seed_shifts():
    """
    Seed 2 shift tetap Alonica Cafe jika belum ada.
    Idempotent — aman dipanggil berulang kali.
    """
    from app.models import Shift

    FIXED_SHIFTS = [
        {
            "nama": "Shift 1",
            "jam_masuk": "08:00",
            "jam_pulang": "16:00",
            "warna": "#6366f1",
        },
        {
            "nama": "Shift 2",
            "jam_masuk": "16:00",
            "jam_pulang": "00:00",
            "warna": "#f59e0b",
        },
    ]

    db = SessionLocal()
    try:
        for data in FIXED_SHIFTS:
            exists = db.query(Shift).filter(Shift.nama == data["nama"]).first()
            if not exists:
                shift = Shift(**data)
                db.add(shift)
        db.commit()
    finally:
        db.close()
