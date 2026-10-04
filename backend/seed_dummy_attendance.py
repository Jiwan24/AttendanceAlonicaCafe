"""
Script untuk seed data kehadiran dummy bulan September 2026.
Jalankan: python seed_dummy_attendance.py
"""

import random
from datetime import datetime, date, timedelta
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import Employee, AttendanceLog, ScheduledShift, Shift

def seed_dummy_data():
    db = SessionLocal()
    
    try:
        # Ambil semua karyawan aktif
        employees = db.query(Employee).filter(Employee.status == True).all()
        
        if not employees:
            print("Tidak ada karyawan. Tambahkan karyawan dulu di sistem.")
            return
        
        # Ambil shift yang ada
        shifts = db.query(Shift).all()
        if not shifts:
            print("Tidak ada shift. Jalankan sistem sekali untuk seed shift default.")
            return
        
        shift_pagi = shifts[0]  # Shift 1: 08:00-16:00
        
        # Periode: 1-28 September 2026 (28 hari kerja, skip weekend)
        start_date = date(2026, 9, 1)
        end_date = date(2026, 9, 28)
        
        print(f"Generating dummy attendance for {len(employees)} employees...")
        print(f"Period: {start_date} to {end_date}")
        
        for emp in employees:
            # Tentukan profil kehadiran acak untuk tiap karyawan
            attendance_rate = random.choice([0.95, 0.90, 0.85, 0.75, 0.60])  # Persentase hadir
            late_rate = random.choice([0.05, 0.10, 0.15, 0.20])  # Persentase telat
            
            print(f"\n{emp.nama} - Target: {attendance_rate*100}% hadir, {late_rate*100}% telat")
            
            current_date = start_date
            days_processed = 0
            
            while current_date <= end_date:
                # Skip weekend (Sabtu=5, Minggu=6)
                if current_date.weekday() >= 5:
                    current_date += timedelta(days=1)
                    continue
                
                days_processed += 1
                
                # Buat jadwal shift
                existing_schedule = db.query(ScheduledShift).filter(
                    ScheduledShift.employee_id == emp.id,
                    ScheduledShift.tanggal == current_date,
                ).first()
                
                if not existing_schedule:
                    schedule = ScheduledShift(
                        employee_id=emp.id,
                        shift_id=shift_pagi.id,
                        tanggal=current_date,
                    )
                    db.add(schedule)
                
                # Tentukan apakah hadir atau tidak
                will_attend = random.random() < attendance_rate
                
                if will_attend:
                    # Tentukan apakah telat atau tidak
                    is_late = random.random() < late_rate
                    
                    # Generate waktu masuk (08:00 + random offset)
                    base_time = datetime.combine(current_date, datetime.min.time().replace(hour=8, minute=0))
                    
                    if is_late:
                        # Telat 5-60 menit
                        late_minutes = random.randint(5, 60)
                        timestamp = base_time + timedelta(minutes=late_minutes)
                        menit_terlambat = late_minutes
                    else:
                        # Tepat waktu atau lebih awal (-10 sampai +4 menit)
                        offset_minutes = random.randint(-10, 4)
                        timestamp = base_time + timedelta(minutes=offset_minutes)
                        menit_terlambat = 0
                    
                    # Cek apakah sudah ada log
                    existing_log = db.query(AttendanceLog).filter(
                        AttendanceLog.employee_id == emp.id,
                        AttendanceLog.jenis == "masuk",
                        AttendanceLog.timestamp >= datetime.combine(current_date, datetime.min.time()),
                        AttendanceLog.timestamp < datetime.combine(current_date + timedelta(days=1), datetime.min.time()),
                    ).first()
                    
                    if not existing_log:
                        log = AttendanceLog(
                            employee_id=emp.id,
                            jenis="masuk",
                            timestamp=timestamp,
                            similarity_score=random.uniform(0.55, 0.95),
                            metode="wajah",
                            terlambat=is_late,
                            menit_terlambat=menit_terlambat,
                        )
                        db.add(log)
                
                current_date += timedelta(days=1)
            
            print(f"  → {days_processed} hari kerja diproses")
        
        db.commit()
        print("\n✅ Selesai! Data kehadiran dummy berhasil di-generate.")
        print("Refresh halaman Reports untuk melihat hasilnya.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_dummy_data()
