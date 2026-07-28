"""
Employee management API endpoints.

Endpoints:
  POST   /api/employees                  -> tambah karyawan baru
  GET    /api/employees                  -> daftar karyawan
  GET    /api/employees/{id}             -> detail karyawan
  POST   /api/employees/{id}/enroll-face -> upload foto wajah untuk registrasi
  DELETE /api/employees/{id}             -> nonaktifkan karyawan (soft delete)
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
import bcrypt

from app.db import get_db
from app.models import Employee
from app.services.face_engine import get_single_face_embedding, is_model_loaded

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.post("")
def create_employee(
    nama: str = Form(...),
    kode_karyawan: str = Form(...),
    role: str = Form("Barista"),
    pin_fallback: str = Form(None),
    db: Session = Depends(get_db),
):
    """Tambah karyawan baru."""
    # Check for duplicate kode_karyawan
    existing = db.query(Employee).filter(Employee.kode_karyawan == kode_karyawan).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Kode karyawan '{kode_karyawan}' sudah digunakan.")

    # Hash PIN if provided
    hashed_pin = None
    if pin_fallback:
        hashed_pin = bcrypt.hashpw(pin_fallback.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    employee = Employee(
        nama=nama,
        kode_karyawan=kode_karyawan,
        role=role,
        pin_fallback=hashed_pin,
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)

    logger.info(f"Created employee: {employee.nama} ({employee.kode_karyawan})")
    return {"success": True, "employee": employee.to_dict()}


@router.get("")
def list_employees(
    status: bool = None,
    db: Session = Depends(get_db),
):
    """Daftar semua karyawan. Filter by status (aktif/non-aktif) optional."""
    query = db.query(Employee)
    if status is not None:
        query = query.filter(Employee.status == status)
    employees = query.order_by(Employee.nama).all()
    return {"employees": [e.to_dict() for e in employees]}


@router.get("/{employee_id}")
def get_employee(employee_id: str, db: Session = Depends(get_db)):
    """Detail karyawan by ID."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan.")
    return {"employee": employee.to_dict()}


@router.post("/{employee_id}/enroll-face")
async def enroll_face(
    employee_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload foto wajah untuk registrasi.
    Deteksi wajah -> generate embedding -> simpan ke database.
    Dapat dipanggil beberapa kali untuk menambah embedding dari sudut berbeda (max 20).
    """
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan.")

    if not employee.status:
        raise HTTPException(status_code=400, detail="Karyawan sudah non-aktif.")

    if not is_model_loaded():
        raise HTTPException(
            status_code=503,
            detail="Model face recognition belum siap. Coba lagi dalam beberapa saat.",
        )

    # Read image bytes
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="File kosong.")

    # Detect face and get embedding
    result = get_single_face_embedding(image_bytes)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Add embedding to employee
    current_count = len(employee.face_embeddings)
    employee.add_embedding(result["embedding"])
    db.commit()

    new_count = len(employee.face_embeddings)
    logger.info(
        f"Enrolled face for {employee.nama}: {current_count} -> {new_count} embeddings "
        f"(det_score={result['det_score']:.4f})"
    )

    return {
        "success": True,
        "message": f"Wajah berhasil didaftarkan ({new_count}/20)",
        "face_count": new_count,
        "det_score": result["det_score"],
    }


@router.delete("/{employee_id}")
def deactivate_employee(employee_id: str, db: Session = Depends(get_db)):
    """Nonaktifkan karyawan (soft delete)."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan.")

    employee.status = False
    db.commit()

    logger.info(f"Deactivated employee: {employee.nama} ({employee.kode_karyawan})")
    return {"success": True, "message": f"Karyawan {employee.nama} dinonaktifkan."}


@router.put("/{employee_id}/reactivate")
def reactivate_employee(employee_id: str, db: Session = Depends(get_db)):
    """Aktifkan kembali karyawan yang sudah non-aktif."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan.")

    employee.status = True
    db.commit()

    logger.info(f"Reactivated employee: {employee.nama} ({employee.kode_karyawan})")
    return {"success": True, "message": f"Karyawan {employee.nama} diaktifkan kembali."}


@router.delete("/{employee_id}/face-embeddings")
def clear_face_embeddings(employee_id: str, db: Session = Depends(get_db)):
    """Hapus semua face embeddings karyawan (untuk re-registrasi)."""
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Karyawan tidak ditemukan.")

    employee.face_embeddings = []
    db.commit()

    logger.info(f"Cleared face embeddings for {employee.nama}")
    return {"success": True, "message": f"Data wajah {employee.nama} telah dihapus. Silakan registrasi ulang."}
