import { useState } from 'react';
import { KeyRound, X, LogIn } from 'lucide-react';
import { verifyPin } from '../lib/api';
import './PinFallback.css';

/**
 * PinFallback — Modal untuk input PIN saat wajah gagal dikenali.
 */
export default function PinFallback({ scanMode, onSuccess, onClose }) {
  const [kodeKaryawan, setKodeKaryawan] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!kodeKaryawan || !pin) {
      setError('Kode Karyawan dan PIN harus diisi.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyPin(kodeKaryawan, pin, scanMode);
      if (result.success) {
        onSuccess(result);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message || 'Gagal verifikasi PIN. Pastikan Kode dan PIN benar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content pin-modal animate-bounce-in">
        <button className="pin-modal__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        
        <div className="pin-modal__header">
          <div className="pin-modal__icon-badge">
            <KeyRound size={24} />
          </div>
          <h2>Absen via PIN</h2>
          <p className="text-secondary text-sm">Gunakan metode ini jika wajah gagal dikenali 3x.</p>
        </div>

        <form onSubmit={handleSubmit} className="pin-modal__form">
          <div className="form-group">
            <label className="form-label" htmlFor="kode">Kode Karyawan</label>
            <input
              id="kode"
              className="form-input"
              type="text"
              placeholder="Contoh: ALN-001"
              value={kodeKaryawan}
              onChange={(e) => setKodeKaryawan(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pin">PIN</label>
            <input
              id="pin"
              className="form-input"
              type="password"
              placeholder="Masukkan PIN"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>

          {error && <p className="pin-modal__error animate-fade-in">{error}</p>}

          <button 
            type="submit" 
            className="btn btn--primary btn--lg w-full"
            disabled={loading}
          >
            {loading ? <><div className="spinner" /> Memverifikasi...</> : 'Absen Sekarang'}
          </button>
        </form>
      </div>
    </div>
  );
}
