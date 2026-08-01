"""
Attendance API endpoints.

Endpoints:
  POST /api/attendance/verify-face    -> kirim frame wajah, dapat hasil match
  POST /api/attendance/pin-fallback   -> absen via PIN
  GET  /api/attendance/logs           -> rekap absensi (filter tanggal, karyawan)
  GET  /api/attendance/export         -> export CSV
"""

import io
import csv
import logging
from datetime import datetime, timedelta, timezone, date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import bcrypt

from app.db import get_db
from app.models import Employee, AttendanceLog, ScheduledShift, Shift
from app.services.face_engine import get_single_face_embedding, is_model_loaded
from app.services.matcher import find_best_match

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _get_today_attendance_status(employee_id: str, db: Session) -> dict:
    """
    Cek status absensi karyawan hari ini.
    Returns dictionary:
      - has_masuk: bool
      - has_pulang: bool
      - already_completed: bool
      - next_jenis: 'masuk' | 'pulang'
      - today_logs: list of AttendanceLog dicts
    """
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    logs = (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.employee_id == employee_id,
            AttendanceLog.timestamp >= today_start,
        )
        .order_by(AttendanceLog.timestamp.asc())
        .all()
    )

    has_masuk = any(l.jenis == "masuk" for l in logs)
    has_pulang = any(l.jenis == "pulang" for l in logs)

    return {
        "has_masuk": has_masuk,
        "has_pulang": has_pulang,
        "already_completed": has_masuk and has_pulang,
        "next_jenis": "pulang" if has_masuk else "masuk",
        "today_logs": [l.to_dict() for l in logs],
    }


def _check_shift_schedule(employee_id: str, db: Session) -> dict:
    """
    Cek apakah karyawan punya jadwal shift hari ini, dan apakah waktu sekarang
    berada dalam toleransi jam shift.

    Toleransi:
      - Absen masuk: mulai 30 menit sebelum jam_masuk s/d 2 jam setelah jam_masuk
      - Absen pulang: mulai 30 menit sebelum jam_pulang s/d 2 jam setelah jam_pulang

    Returns dict:
      - has_shift: bool
      - allowed: bool
      - reason: str (pesan jika tidak diizinkan)
      - shift_info: dict | None
    """
    today = datetime.now(timezone.utc).astimezone().date()  # tanggal lokal server

    scheduled = (
        db.query(ScheduledShift)
        .filter(
            ScheduledShift.employee_id == employee_id,
            ScheduledShift.tanggal == today,
        )
        .join(Shift)
        .first()
    )

    if not scheduled:
        return {
            "has_shift": False,
            "allowed": False,
            "reason": "Anda tidak memiliki jadwal shift hari ini.",
            "shift_info": None,
        }

    shift = scheduled.shift
    now_local = datetime.now(timezone.utc).astimezone()
    now_time = now_local.time()

    def parse_hm(hm_str):
        """Parse 'HH:MM' string ke objek time."""
        h, m = map(int, hm_str.split(":"))
        return h * 60 + m  # kembalikan total menit untuk aritmetika mudah

    masuk_minutes = parse_hm(shift.jam_masuk)
    pulang_minutes = parse_hm(shift.jam_pulang)
    now_minutes = now_time.hour * 60 + now_time.minute

    # Toleransi: 30 menit sebelum masuk s/d 2 jam setelah pulang
    window_start = masuk_minutes - 30
    window_end = pulang_minutes + 120

    # Handle overnight shift (jam pulang < jam masuk, e.g. 22:00 - 06:00)
    if pulang_minutes < masuk_minutes:
        window_end = pulang_minutes + 120 + 1440  # tambah 24 jam
        if now_minutes < masuk_minutes:
            now_minutes += 1440

    allowed = window_start <= now_minutes <= window_end

    if not allowed:
        reason = (
            f"Di luar jadwal shift. Shift Anda hari ini adalah '{shift.nama}' "
            f"({shift.jam_masuk} - {shift.jam_pulang}). "
            f"Absen hanya diizinkan 30 menit sebelum masuk hingga 2 jam setelah pulang."
        )
    else:
        reason = ""

    return {
        "has_shift": True,
        "allowed": allowed,
        "reason": reason,
        "shift_info": {
            "nama": shift.nama,
            "jam_masuk": shift.jam_masuk,
            "jam_pulang": shift.jam_pulang,
        },
    }


def _hitung_keterlambatan(shift: "Shift") -> dict:
    """
    Hitung apakah absen masuk terlambat berdasarkan jam sekarang vs jam_masuk shift.

    Returns dict:
      - terlambat: bool
      - menit_terlambat: int (0 jika tepat waktu atau lebih awal)
    """
    now_local = datetime.now(timezone.utc).astimezone()
    now_minutes = now_local.hour * 60 + now_local.minute

    h, m = map(int, shift.jam_masuk.split(":"))
    masuk_minutes = h * 60 + m

    selisih = now_minutes - masuk_minutes

    # Handle overnight: jika shift mulai dekat tengah malam
    if selisih < -720:   # lebih dari 12 jam lebih awal -> shift overnight
        selisih += 1440
    elif selisih > 720:  # lebih dari 12 jam terlambat -> anggap hari sebelumnya
        selisih -= 1440

    if selisih > 0:
        return {"terlambat": True, "menit_terlambat": selisih}
    return {"terlambat": False, "menit_terlambat": 0}


@router.post("/verify-face")
async def verify_face(
    file: UploadFile = File(...),
    jenis: str = Form(None),  # 'masuk' or 'pulang' (optional)
    db: Session = Depends(get_db),
):
    """
    Verifikasi wajah untuk absensi.
    Terima gambar wajah -> detect -> embed -> match -> catat log.
    """
    if not is_model_loaded():
        raise HTTPException(
            status_code=503,
            detail="Model face recognition belum siap. Coba lagi dalam beberapa saat.",
        )

    # Read image
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="File kosong.")

    # Detect face and get embedding
    result = get_single_face_embedding(image_bytes)
    if not result["success"]:
        return {
            "success": False,
            "matched": False,
            "already_completed": False,
            "error": result["error"],
            "employee": None,
            "jenis": None,
            "similarity_score": None,
        }

    # Get all active employees with face embeddings
    employees = db.query(Employee).filter(Employee.status == True).all()  # noqa: E712
    employees_with_faces = [e for e in employees if e.face_embeddings]

    if not employees_with_faces:
        return {
            "success": False,
            "matched": False,
            "already_completed": False,
            "error": "Belum ada karyawan yang terdaftar wajahnya.",
            "employee": None,
            "jenis": None,
            "similarity_score": None,
        }

    # Find best match
    match_result = find_best_match(result["embedding"], employees_with_faces)

    if not match_result["matched"]:
        return {
            "success": True,
            "matched": False,
            "already_completed": False,
            "error": "Wajah tidak dikenali.",
            "employee": None,
            "jenis": None,
            "similarity_score": match_result["score"],
        }

    # Match found! Cek status absensi hari ini
    employee = match_result["employee"]

    # Validasi jadwal shift — tolak jika karyawan tidak punya shift hari ini
    # atau waktu sekarang di luar toleransi jam shift
    shift_check = _check_shift_schedule(employee.id, db)
    if not shift_check["allowed"]:
        return {
            "success": False,
            "matched": True,
            "already_completed": False,
            "error": shift_check["reason"],
            "employee": employee.to_dict(),
            "jenis": None,
            "similarity_score": match_result["score"],
            "shift_info": shift_check["shift_info"],
        }

    status_info = _get_today_attendance_status(employee.id, db)

    # If requested mode ('masuk' / 'pulang') is provided, validate against employee history today
    if jenis in ["masuk", "pulang"]:
        if jenis == "masuk" and status_info["has_masuk"]:
            return {
                "success": True,
                "matched": True,
                "already_completed": True,
                "message": f"{employee.nama} sudah melakukan Absen Masuk hari ini.",
                "employee": employee.to_dict(),
                "jenis": "masuk",
                "similarity_score": match_result["score"],
                "today_logs": status_info["today_logs"],
            }

        if jenis == "pulang" and not status_info["has_masuk"]:
            return {
                "success": False,
                "matched": True,
                "already_completed": False,
                "error": f"{employee.nama} belum melakukan Absen Masuk hari ini. Silakan Absen Masuk terlebih dahulu.",
                "employee": employee.to_dict(),
                "jenis": None,
                "similarity_score": match_result["score"],
            }

        if jenis == "pulang" and status_info["has_pulang"]:
            return {
                "success": True,
                "matched": True,
                "already_completed": True,
                "message": f"{employee.nama} sudah melakukan Absen Pulang hari ini.",
                "employee": employee.to_dict(),
                "jenis": "pulang",
                "similarity_score": match_result["score"],
                "today_logs": status_info["today_logs"],
            }

        target_jenis = jenis
    else:
        if status_info["already_completed"]:
            return {
                "success": True,
                "matched": True,
                "already_completed": True,
                "message": f"{employee.nama} sudah menyelesaikan Absen Masuk & Pulang hari ini.",
                "employee": employee.to_dict(),
                "jenis": None,
                "similarity_score": match_result["score"],
                "today_logs": status_info["today_logs"],
            }
        target_jenis = status_info["next_jenis"]

    # Hitung keterlambatan jika absen masuk
    keterlambatan = {"terlambat": False, "menit_terlambat": 0}
    if target_jenis == "masuk" and shift_check["has_shift"]:
        scheduled = (
            db.query(ScheduledShift)
            .filter(
                ScheduledShift.employee_id == employee.id,
                ScheduledShift.tanggal == datetime.now(timezone.utc).astimezone().date(),
            )
            .join(Shift)
            .first()
        )
        if scheduled:
            keterlambatan = _hitung_keterlambatan(scheduled.shift)

    log = AttendanceLog(
        employee_id=employee.id,
        jenis=target_jenis,
        similarity_score=match_result["score"],
        metode="wajah",
        terlambat=keterlambatan["terlambat"],
        menit_terlambat=keterlambatan["menit_terlambat"],
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    terlambat_info = ""
    if target_jenis == "masuk" and keterlambatan["terlambat"]:
        terlambat_info = f", TERLAMBAT {keterlambatan['menit_terlambat']} menit"

    logger.info(
        f"Attendance logged: {employee.nama} - {target_jenis} "
        f"(score={match_result['score']:.4f}, metode=wajah{terlambat_info})"
    )

    return {
        "success": True,
        "matched": True,
        "already_completed": False,
        "error": None,
        "employee": employee.to_dict(),
        "jenis": target_jenis,
        "similarity_score": match_result["score"],
        "log_id": log.id,
        "terlambat": keterlambatan["terlambat"],
        "menit_terlambat": keterlambatan["menit_terlambat"],
        "today_logs": status_info["today_logs"] + [log.to_dict()],
    }


@router.post("/pin-fallback")
def pin_fallback(
    kode_karyawan: str = Form(...),
    pin: str = Form(...),
    jenis: str = Form(None),  # 'masuk' or 'pulang' (optional)
    db: Session = Depends(get_db),
):
    """Absen via kode karyawan + PIN (fallback jika wajah gagal dikenali)."""
    employee = (
        db.query(Employee)
        .filter(Employee.kode_karyawan == kode_karyawan, Employee.status == True)  # noqa: E712
        .first()
    )

    if not employee:
        raise HTTPException(status_code=404, detail="Kode karyawan tidak ditemukan atau non-aktif.")

    if not employee.pin_fallback:
        raise HTTPException(status_code=400, detail="Karyawan ini belum memiliki PIN fallback.")

    # Verify PIN
    if not bcrypt.checkpw(pin.encode("utf-8"), employee.pin_fallback.encode("utf-8")):
        raise HTTPException(status_code=401, detail="PIN salah.")

    # Validasi jadwal shift — tolak jika tidak punya shift hari ini atau di luar jam shift
    shift_check = _check_shift_schedule(employee.id, db)
    if not shift_check["allowed"]:
        raise HTTPException(status_code=403, detail=shift_check["reason"])

    # Cek status absensi hari ini
    status_info = _get_today_attendance_status(employee.id, db)

    if jenis in ["masuk", "pulang"]:
        if jenis == "masuk" and status_info["has_masuk"]:
            return {
                "success": True,
                "matched": True,
                "already_completed": True,
                "message": f"{employee.nama} sudah melakukan Absen Masuk hari ini.",
                "employee": employee.to_dict(),
                "jenis": "masuk",
                "metode": "pin_fallback",
                "today_logs": status_info["today_logs"],
            }

        if jenis == "pulang" and not status_info["has_masuk"]:
            raise HTTPException(
                status_code=400,
                detail=f"{employee.nama} belum melakukan Absen Masuk hari ini. Silakan Absen Masuk terlebih dahulu.",
            )

        if jenis == "pulang" and status_info["has_pulang"]:
            return {
                "success": True,
                "matched": True,
                "already_completed": True,
                "message": f"{employee.nama} sudah melakukan Absen Pulang hari ini.",
                "employee": employee.to_dict(),
                "jenis": "pulang",
                "metode": "pin_fallback",
                "today_logs": status_info["today_logs"],
            }

        target_jenis = jenis
    else:
        if status_info["already_completed"]:
            return {
                "success": True,
                "matched": True,
                "already_completed": True,
                "message": f"{employee.nama} sudah menyelesaikan Absen Masuk & Pulang hari ini.",
                "employee": employee.to_dict(),
                "jenis": None,
                "metode": "pin_fallback",
                "today_logs": status_info["today_logs"],
            }
        target_jenis = status_info["next_jenis"]

    # Hitung keterlambatan jika absen masuk
    keterlambatan = {"terlambat": False, "menit_terlambat": 0}
    if target_jenis == "masuk":
        scheduled = (
            db.query(ScheduledShift)
            .filter(
                ScheduledShift.employee_id == employee.id,
                ScheduledShift.tanggal == datetime.now(timezone.utc).astimezone().date(),
            )
            .join(Shift)
            .first()
        )
        if scheduled:
            keterlambatan = _hitung_keterlambatan(scheduled.shift)

    log = AttendanceLog(
        employee_id=employee.id,
        jenis=target_jenis,
        similarity_score=None,
        metode="pin_fallback",
        terlambat=keterlambatan["terlambat"],
        menit_terlambat=keterlambatan["menit_terlambat"],
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    terlambat_info = ""
    if target_jenis == "masuk" and keterlambatan["terlambat"]:
        terlambat_info = f", TERLAMBAT {keterlambatan['menit_terlambat']} menit"

    logger.info(f"Attendance logged: {employee.nama} - {target_jenis} (metode=pin_fallback{terlambat_info})")

    return {
        "success": True,
        "matched": True,
        "already_completed": False,
        "employee": employee.to_dict(),
        "jenis": target_jenis,
        "metode": "pin_fallback",
        "log_id": log.id,
        "terlambat": keterlambatan["terlambat"],
        "menit_terlambat": keterlambatan["menit_terlambat"],
        "today_logs": status_info["today_logs"] + [log.to_dict()],
    }


@router.get("/logs")
def get_attendance_logs(
    date_from: str = Query(None, description="Format: YYYY-MM-DD"),
    date_to: str = Query(None, description="Format: YYYY-MM-DD"),
    employee_id: str = Query(None),
    jenis: str = Query(None, description="masuk / pulang"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Rekap absensi dengan filter opsional."""
    query = db.query(AttendanceLog)

    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.filter(AttendanceLog.timestamp >= dt_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date_from salah. Gunakan YYYY-MM-DD.")

    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            query = query.filter(AttendanceLog.timestamp < dt_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date_to salah. Gunakan YYYY-MM-DD.")

    if employee_id:
        query = query.filter(AttendanceLog.employee_id == employee_id)

    if jenis:
        query = query.filter(AttendanceLog.jenis == jenis)

    total = query.count()
    logs = query.order_by(AttendanceLog.timestamp.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "logs": [log.to_dict() for log in logs],
    }


@router.get("/export")
def export_attendance_csv(
    date_from: str = Query(None, description="Format: YYYY-MM-DD"),
    date_to: str = Query(None, description="Format: YYYY-MM-DD"),
    employee_id: str = Query(None),
    db: Session = Depends(get_db),
):
    """Export rekap absensi ke CSV."""
    query = db.query(AttendanceLog)

    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.filter(AttendanceLog.timestamp >= dt_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date_from salah.")

    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            query = query.filter(AttendanceLog.timestamp < dt_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date_to salah.")

    if employee_id:
        query = query.filter(AttendanceLog.employee_id == employee_id)

    logs = query.order_by(AttendanceLog.timestamp.desc()).all()

    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["No", "Nama", "Kode Karyawan", "Jenis", "Waktu", "Metode", "Skor Kecocokan"])

    for i, log in enumerate(logs, 1):
        writer.writerow([
            i,
            log.employee.nama if log.employee else "-",
            log.employee.kode_karyawan if log.employee else "-",
            log.jenis,
            log.timestamp.strftime("%Y-%m-%d %H:%M:%S") if log.timestamp else "-",
            log.metode,
            f"{log.similarity_score:.4f}" if log.similarity_score else "-",
        ])

    output.seek(0)

    # Generate filename with date range
    filename = "absensi"
    if date_from:
        filename += f"_{date_from}"
    if date_to:
        filename += f"_to_{date_to}"
    filename += ".csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/summary")
def get_attendance_summary(
    date: str = Query(None, description="Format: YYYY-MM-DD (default: hari ini)"),
    db: Session = Depends(get_db),
):
    """
    Ringkasan absensi harian:
    - Total karyawan aktif
    - Sudah hadir (masuk)
    - Belum hadir
    - Sudah pulang
    """
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Format date salah. Gunakan YYYY-MM-DD.")
    else:
        target_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    next_day = target_date + timedelta(days=1)

    # Total active employees
    total_employees = db.query(Employee).filter(Employee.status == True).count()  # noqa: E712

    # Today's logs
    today_logs = (
        db.query(AttendanceLog)
        .filter(
            AttendanceLog.timestamp >= target_date,
            AttendanceLog.timestamp < next_day,
        )
        .all()
    )

    # Unique employees who checked in today
    employees_masuk = set()
    employees_pulang = set()
    for log in today_logs:
        if log.jenis == "masuk":
            employees_masuk.add(log.employee_id)
        elif log.jenis == "pulang":
            employees_pulang.add(log.employee_id)

    hadir = len(employees_masuk)
    belum_hadir = total_employees - hadir
    sudah_pulang = len(employees_pulang)

    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "total_karyawan": total_employees,
        "hadir": hadir,
        "belum_hadir": belum_hadir,
        "sudah_pulang": sudah_pulang,
    }
