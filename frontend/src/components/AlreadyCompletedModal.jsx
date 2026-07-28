import { useEffect, useState } from 'react';
import { CalendarCheck, X, LogIn, LogOut, CheckCircle2 } from 'lucide-react';
import './AlreadyCompletedModal.css';

/**
 * AlreadyCompletedModal — Modal Pop-Up saat karyawan yang sudah absen masuk & pulang
 * mencoba untuk absen kembali pada hari yang sama.
 */
export default function AlreadyCompletedModal({ data, onClose }) {
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onClose]);

  if (!data) return null;

  const { employee, today_logs = [] } = data;

  const formatLogTime = (ts) => {
    if (!ts) return '-';
    const date = new Date(ts);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content already-completed-modal animate-bounce-in">
        <button className="already-completed-modal__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <div className="already-completed-modal__header">
          <div className="already-completed-modal__icon-badge">
            <CalendarCheck size={36} />
          </div>
          <span className="badge badge--success inline-flex items-center gap-1">
            <CheckCircle2 size={13} />
            <span>Sudah Absen Hari Ini</span>
          </span>
          <h2>{employee?.nama}</h2>
          <p className="text-secondary text-sm">{employee?.role} • {employee?.kode_karyawan}</p>
        </div>

        <div className="already-completed-modal__body">
          <p className="already-completed-modal__msg">
            Anda telah menyelesaikan seluruh sesi absensi (Masuk & Pulang) untuk hari ini.
          </p>

          <div className="already-completed-modal__logs">
            <div className="already-completed-log-item already-completed-log-item--masuk">
              <div className="already-completed-log-item__icon">
                <LogIn size={16} />
              </div>
              <div className="already-completed-log-item__info">
                <span className="already-completed-log-item__label">Absen Masuk</span>
                <span className="already-completed-log-item__time">
                  {formatLogTime(today_logs.find((l) => l.jenis === 'masuk')?.timestamp)}
                </span>
              </div>
            </div>

            <div className="already-completed-log-item already-completed-log-item--pulang">
              <div className="already-completed-log-item__icon">
                <LogOut size={16} />
              </div>
              <div className="already-completed-log-item__info">
                <span className="already-completed-log-item__label">Absen Pulang</span>
                <span className="already-completed-log-item__time">
                  {formatLogTime(today_logs.find((l) => l.jenis === 'pulang')?.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="already-completed-modal__footer">
          <button className="btn btn--primary btn--lg w-full" onClick={onClose}>
            Mengerti ({countdown}s)
          </button>
        </div>
      </div>
    </div>
  );
}
