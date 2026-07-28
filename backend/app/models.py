"""
SQLAlchemy models for the Alonica Attendance System.

Tables:
  - employees: karyawan data + face embeddings
  - attendance_logs: log absensi masuk/pulang
  - shifts: definisi shift kerja
  - scheduled_shifts: assignment shift ke karyawan per tanggal
"""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Boolean, Float, Text, DateTime, Date, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from app.db import Base


def generate_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class Employee(Base):
    """Tabel karyawan — menyimpan data identitas dan face embeddings."""

    __tablename__ = "employees"

    id = Column(String, primary_key=True, default=generate_uuid)
    nama = Column(String(100), nullable=False)
    kode_karyawan = Column(String(50), unique=True, nullable=False)
    role = Column(String(50), nullable=False, default="Barista")
    pin_fallback = Column(String(255), nullable=True)  # bcrypt-hashed PIN
    face_embeddings_json = Column(Text, nullable=True, default="[]")  # JSON array of 512-d vectors
    foto_referensi_url = Column(Text, nullable=True)
    status = Column(Boolean, default=True)  # True = aktif
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    attendance_logs = relationship("AttendanceLog", back_populates="employee")
    scheduled_shifts = relationship("ScheduledShift", back_populates="employee")

    @property
    def face_embeddings(self):
        """Deserialize face embeddings from JSON."""
        if self.face_embeddings_json:
            return json.loads(self.face_embeddings_json)
        return []

    @face_embeddings.setter
    def face_embeddings(self, value):
        """Serialize face embeddings to JSON."""
        self.face_embeddings_json = json.dumps(value)

    def add_embedding(self, embedding: list):
        """Add a new face embedding (max 20 per employee)."""
        embeddings = self.face_embeddings
        embeddings.append(embedding)
        # Keep only the last 20 embeddings
        if len(embeddings) > 20:
            embeddings = embeddings[-20:]
        self.face_embeddings = embeddings

    def to_dict(self):
        return {
            "id": self.id,
            "nama": self.nama,
            "kode_karyawan": self.kode_karyawan,
            "role": self.role,
            "status": self.status,
            "face_count": len(self.face_embeddings),
            "foto_referensi_url": self.foto_referensi_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AttendanceLog(Base):
    """Tabel log absensi — mencatat setiap event masuk/pulang."""

    __tablename__ = "attendance_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    jenis = Column(SAEnum("masuk", "pulang", name="jenis_absensi"), nullable=False)
    timestamp = Column(DateTime, default=utcnow)
    similarity_score = Column(Float, nullable=True)  # None for PIN fallback
    metode = Column(
        SAEnum("wajah", "pin_fallback", name="metode_absensi"),
        nullable=False,
        default="wajah",
    )
    foto_capture_url = Column(Text, nullable=True)

    # Relationship
    employee = relationship("Employee", back_populates="attendance_logs")

    def to_dict(self):
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "employee_nama": self.employee.nama if self.employee else None,
            "employee_kode": self.employee.kode_karyawan if self.employee else None,
            "jenis": self.jenis,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "similarity_score": self.similarity_score,
            "metode": self.metode,
        }


class Shift(Base):
    """Tabel definisi shift kerja."""

    __tablename__ = "shifts"

    id = Column(String, primary_key=True, default=generate_uuid)
    nama = Column(String(100), nullable=False)          # e.g. "Shift Pagi"
    jam_masuk = Column(String(5), nullable=False)       # e.g. "07:00"
    jam_pulang = Column(String(5), nullable=False)      # e.g. "15:00"
    warna = Column(String(7), nullable=False, default="#3b82f6")  # hex color
    created_at = Column(DateTime, default=utcnow)

    # Relationship
    scheduled_shifts = relationship("ScheduledShift", back_populates="shift")

    def to_dict(self):
        return {
            "id": self.id,
            "nama": self.nama,
            "jam_masuk": self.jam_masuk,
            "jam_pulang": self.jam_pulang,
            "warna": self.warna,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ScheduledShift(Base):
    """Tabel assignment shift ke karyawan untuk tanggal tertentu."""

    __tablename__ = "scheduled_shifts"

    id = Column(String, primary_key=True, default=generate_uuid)
    employee_id = Column(String, ForeignKey("employees.id"), nullable=False)
    shift_id = Column(String, ForeignKey("shifts.id"), nullable=False)
    tanggal = Column(Date, nullable=False)
    keterangan = Column(String(200), nullable=True)  # e.g. "pengganti", "libur"
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    employee = relationship("Employee", back_populates="scheduled_shifts")
    shift = relationship("Shift", back_populates="scheduled_shifts")

    def to_dict(self):
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "employee_nama": self.employee.nama if self.employee else None,
            "employee_kode": self.employee.kode_karyawan if self.employee else None,
            "shift_id": self.shift_id,
            "shift_nama": self.shift.nama if self.shift else None,
            "shift_jam_masuk": self.shift.jam_masuk if self.shift else None,
            "shift_jam_pulang": self.shift.jam_pulang if self.shift else None,
            "shift_warna": self.shift.warna if self.shift else None,
            "tanggal": self.tanggal.isoformat() if self.tanggal else None,
            "keterangan": self.keterangan,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
