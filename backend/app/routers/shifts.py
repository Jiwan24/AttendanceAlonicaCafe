"""
Shift management API endpoints.

Endpoints:
  POST   /api/shifts                   -> buat definisi shift baru
  GET    /api/shifts                   -> daftar semua shift
  PUT    /api/shifts/{id}              -> update shift
  DELETE /api/shifts/{id}             -> hapus shift

  POST   /api/schedules               -> assign shift ke karyawan (bisa multi-hari)
  GET    /api/schedules               -> ambil jadwal (filter by date range, employee)
  DELETE /api/schedules/{id}          -> hapus jadwal tertentu
"""

import logging
from datetime import date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Shift, ScheduledShift, Employee

logger = logging.getLogger(__name__)

router = APIRouter(tags=["shifts"])


# ==========================================
# PYDANTIC SCHEMAS
# ==========================================

class ShiftCreate(BaseModel):
    nama: str
    jam_masuk: str   # "HH:MM"
    jam_pulang: str  # "HH:MM"
    warna: str = "#3b82f6"


class ShiftUpdate(BaseModel):
    nama: Optional[str] = None
    jam_masuk: Optional[str] = None
    jam_pulang: Optional[str] = None
    warna: Optional[str] = None


class ScheduleCreate(BaseModel):
    employee_id: str
    shift_id: str
    tanggal_mulai: str   # "YYYY-MM-DD"
    tanggal_selesai: str  # "YYYY-MM-DD" (bisa sama dengan mulai untuk 1 hari)
    keterangan: Optional[str] = None


# ==========================================
# SHIFT ENDPOINTS
# ==========================================

shift_router = APIRouter(prefix="/api/shifts", tags=["shifts"])


@shift_router.post("")
def create_shift(data: ShiftCreate, db: Session = Depends(get_db)):
    """Buat definisi shift baru."""
    # Validasi format jam HH:MM
    for jam_field, jam_val in [("jam_masuk", data.jam_masuk), ("jam_pulang", data.jam_pulang)]:
        parts = jam_val.split(":")
        if len(parts) != 2 or not all(p.isdigit() for p in parts):
            raise HTTPException(status_code=400, detail=f"Format {jam_field} tidak valid. Gunakan HH:MM")

    shift = Shift(
        nama=data.nama,
        jam_masuk=data.jam_masuk,
        jam_pulang=data.jam_pulang,
        warna=data.warna,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)

    logger.info(f"Created shift: {shift.nama} ({shift.jam_masuk}–{shift.jam_pulang})")
    return {"success": True, "shift": shift.to_dict()}


@shift_router.get("")
def list_shifts(db: Session = Depends(get_db)):
    """Daftar semua definisi shift."""
    shifts = db.query(Shift).order_by(Shift.jam_masuk).all()
    return {"shifts": [s.to_dict() for s in shifts]}


@shift_router.put("/{shift_id}")
def update_shift(shift_id: str, data: ShiftUpdate, db: Session = Depends(get_db)):
    """Update definisi shift."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift tidak ditemukan.")

    if data.nama is not None:
        shift.nama = data.nama
    if data.jam_masuk is not None:
        shift.jam_masuk = data.jam_masuk
    if data.jam_pulang is not None:
        shift.jam_pulang = data.jam_pulang
    if data.warna is not None:
        shift.warna = data.warna

    db.commit()
    db.refresh(shift)

    logger.info(f"Updated shift: {shift.nama}")
    return {"success": True, "shift": shift.to_dict()}


@shift_router.delete("/{shift_id}")
def delete_shift(shift_id: str, db: Session = Depends(get_db)):
    """Hapus definisi shift (dan semua jadwal yang menggunakan shift ini)."""
    shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift tidak ditemukan.")

    # Hapus semua scheduled_shifts terkait terlebih dahulu
    db.query(ScheduledShift).filter(ScheduledShift.shift_id == shift_id).delete()

    db.delete(shift)
    db.commit()

    logger.info(f"Deleted shift: {shift.nama}")
    return {"success": True, "message": f"Shift '{shift.nama}' telah dihapus."}


# ==========================================
# SCHEDULE ENDPOINTS
# ==========================================

schedule_router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@schedule_router.post("")
def create_schedule(data: ScheduleCreate, db: Session = Depends(get_db)):
    """
    Assign shift ke karyawan untuk range tanggal.
    Akan membuat satu ScheduledShift per hari dalam range tersebut.
    Skip hari yang sudah ada jadwal dengan shift yang sama.
    """
    # Validasi employee
    employee = db.query(Employee).filter(Employee.id == data.employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan.")

    # Validasi shift
    shift = db.query(Shift).filter(Shift.id == data.shift_id).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift tidak ditemukan.")

    # Parse tanggal
    try:
        tgl_mulai = date.fromisoformat(data.tanggal_mulai)
        tgl_selesai = date.fromisoformat(data.tanggal_selesai)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal tidak valid. Gunakan YYYY-MM-DD")

    if tgl_selesai < tgl_mulai:
        raise HTTPException(status_code=400, detail="Tanggal selesai tidak boleh sebelum tanggal mulai.")

    max_days = 365
    delta = (tgl_selesai - tgl_mulai).days + 1
    if delta > max_days:
        raise HTTPException(status_code=400, detail=f"Range tanggal terlalu besar. Maksimal {max_days} hari.")

    # Buat jadwal untuk setiap hari
    created = []
    skipped = 0
    current = tgl_mulai
    while current <= tgl_selesai:
        # Cek duplikat (employee + shift + tanggal yang sama)
        existing = db.query(ScheduledShift).filter(
            ScheduledShift.employee_id == data.employee_id,
            ScheduledShift.shift_id == data.shift_id,
            ScheduledShift.tanggal == current,
        ).first()

        if not existing:
            sched = ScheduledShift(
                employee_id=data.employee_id,
                shift_id=data.shift_id,
                tanggal=current,
                keterangan=data.keterangan,
            )
            db.add(sched)
            created.append(current.isoformat())
        else:
            skipped += 1

        current += timedelta(days=1)

    db.commit()

    logger.info(
        f"Scheduled shift '{shift.nama}' for {employee.nama}: "
        f"{len(created)} hari dibuat, {skipped} dilewati (duplikat)"
    )
    return {
        "success": True,
        "message": f"{len(created)} jadwal dibuat untuk {employee.nama}.",
        "created_count": len(created),
        "skipped_count": skipped,
    }


@schedule_router.get("")
def list_schedules(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    employee_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Ambil jadwal shift dengan filter tanggal dan/atau karyawan."""
    query = db.query(ScheduledShift)

    if date_from:
        try:
            query = query.filter(ScheduledShift.tanggal >= date.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date_from tidak valid.")

    if date_to:
        try:
            query = query.filter(ScheduledShift.tanggal <= date.fromisoformat(date_to))
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date_to tidak valid.")

    if employee_id:
        query = query.filter(ScheduledShift.employee_id == employee_id)

    schedules = query.order_by(ScheduledShift.tanggal, ScheduledShift.employee_id).all()
    return {"schedules": [s.to_dict() for s in schedules]}


@schedule_router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str, db: Session = Depends(get_db)):
    """Hapus satu jadwal shift tertentu."""
    sched = db.query(ScheduledShift).filter(ScheduledShift.id == schedule_id).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan.")

    emp_nama = sched.employee.nama if sched.employee else "?"
    shift_nama = sched.shift.nama if sched.shift else "?"
    tanggal = sched.tanggal

    db.delete(sched)
    db.commit()

    logger.info(f"Deleted schedule: {emp_nama} - {shift_nama} on {tanggal}")
    return {"success": True, "message": "Jadwal berhasil dihapus."}
