import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertTriangle, LogIn, LogOut, Scan, AlarmClock, Settings } from 'lucide-react';
import { loadFaceModels, detectFaces, checkFaceStability, captureFrame, drawFaceOverlay } from '../lib/faceDetection';
import { verifyFace } from '../lib/api';
import PinFallback from '../components/PinFallback';
import AlreadyCompletedModal from '../components/AlreadyCompletedModal';
import './AbsenPage.css';

/**
 * AbsenPage — Halaman utama absensi karyawan.
 * Full-screen, optimized untuk tablet yang dipasang di area staff.
 * 
 * Flow:
 * 1. Kamera aktif otomatis
 * 2. face-api.js deteksi wajah real-time
 * 3. Saat wajah stabil, auto-capture dan kirim ke backend
 * 4. Tampilkan hasil (sukses / gagal)
 * 5. Fallback ke PIN setelah 3x gagal
 */
export default function AbsenPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const stableCountRef = useRef(0);
  const failCountRef = useRef(0);
  const isProcessingRef = useRef(false);
  const scanModeRef = useRef(null);

  const [status, setStatus] = useState('loading'); // loading, ready, detecting, processing, success, failed, error
  const [statusMessage, setStatusMessage] = useState('Memuat model deteksi wajah...');
  const [matchResult, setMatchResult] = useState(null);
  const [alreadyCompletedData, setAlreadyCompletedData] = useState(null);
  const [showPin, setShowPin] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cameraReady, setCameraReady] = useState(false);
  const [scanMode, setScanMode] = useState(null); // null | 'masuk' | 'pulang'

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize camera
  useEffect(() => {
    let stream = null;

    async function init() {
      // Load face detection models
      const modelsOk = await loadFaceModels();
      if (!modelsOk) {
        setStatus('error');
        setStatusMessage('Gagal memuat model deteksi wajah');
        return;
      }

      // Start camera
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCameraReady(true);
            setStatus('ready');
            setStatusMessage('Pilih tombol ABSEN MASUK atau ABSEN PULANG di bawah untuk mulai scan');
          };
        }
      } catch (err) {
        console.error('Camera error:', err);
        setStatus('error');
        setStatusMessage('Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.');
      }
    }

    init();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  // Start face detection loop ONLY when scanMode is active
  useEffect(() => {
    if (!cameraReady || !scanMode) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    detectionIntervalRef.current = setInterval(async () => {
      if (isProcessingRef.current) return;
      if (!videoRef.current || videoRef.current.paused) return;

      const detections = await detectFaces(videoRef.current);
      const video = videoRef.current;

      // Update canvas overlay
      if (canvasRef.current && video) {
        canvasRef.current.width = video.videoWidth;
        canvasRef.current.height = video.videoHeight;

        const stability = checkFaceStability(detections, video.videoWidth, video.videoHeight);
        drawFaceOverlay(canvasRef.current, detections, stability.stable);

        if (stability.stable) {
          stableCountRef.current++;
          setStatus('detecting');
          setStatusMessage(`Wajah terdeteksi (${scanModeRef.current === 'masuk' ? 'Absen Masuk' : 'Absen Pulang'}), tetap diam...`);

          // After 5 consecutive stable frames (~1.5s), capture
          if (stableCountRef.current >= 5) {
            stableCountRef.current = 0;
            handleCapture();
          }
        } else {
          stableCountRef.current = 0;
          if (!isProcessingRef.current) {
            setStatus('ready');
            setStatusMessage(
              stability.message ||
                `Arahkan wajah Anda ke kamera untuk Absen ${scanModeRef.current === 'masuk' ? 'Masuk' : 'Pulang'}`
            );
          }
        }
      }
    }, 300);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [cameraReady, scanMode]);

  function handleSelectMode(mode) {
    if (isProcessingRef.current) return;

    if (scanMode === mode) {
      // Toggle off if clicked again
      setScanMode(null);
      scanModeRef.current = null;
      setStatus('ready');
      setStatusMessage('Pilih tombol ABSEN MASUK atau ABSEN PULANG di bawah untuk mulai scan');
      return;
    }

    setScanMode(mode);
    scanModeRef.current = mode;
    setMatchResult(null);
    setStatus('ready');
    setStatusMessage(`Deteksi Wajah Aktif: Arahkan wajah Anda ke kamera untuk Absen ${mode === 'masuk' ? 'Masuk' : 'Pulang'}`);
  }

  const handleCapture = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const currentMode = scanModeRef.current;

    setStatus('processing');
    setStatusMessage(`Memproses Absen ${currentMode === 'masuk' ? 'Masuk' : 'Pulang'}...`);

    try {
      const blob = await captureFrame(videoRef.current);
      const result = await verifyFace(blob, currentMode);

      if (result.matched) {
        if (result.already_completed) {
          setAlreadyCompletedData(result);
          resetState();
          return;
        }

        setMatchResult(result);
        setStatus('success');
        setStatusMessage(`Selamat datang, ${result.employee.nama}! Absen ${(result.jenis ?? '').toUpperCase()} berhasil.`);
        failCountRef.current = 0;

        // Reset state after 8 seconds
        setTimeout(() => {
          resetState();
        }, 8000);
      } else if (result.error) {
        // Has error message from backend validation (e.g. belum absen masuk)
        setStatus('failed');
        setStatusMessage(result.error);

        setTimeout(() => {
          isProcessingRef.current = false;
          setStatus('ready');
          setStatusMessage(`Pilih tombol ABSEN MASUK atau ABSEN PULANG di bawah untuk mulai scan`);
        }, 4000);
      } else {
        failCountRef.current++;
        if (failCountRef.current >= 3) {
          setStatus('failed');
          setStatusMessage('Wajah tidak dikenali. Gunakan PIN untuk absen.');
          setShowPin(true);
        } else {
          setStatus('failed');
          setStatusMessage(`Wajah tidak dikenali (${failCountRef.current}/3). Mencoba lagi...`);

          // Auto-retry after 2 seconds
          setTimeout(() => {
            isProcessingRef.current = false;
            setStatus('ready');
            setStatusMessage(`Arahkan wajah Anda ke kamera untuk Absen ${currentMode === 'masuk' ? 'Masuk' : 'Pulang'}`);
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Verification error:', error);
      setStatus('error');
      setStatusMessage(error.message || 'Terjadi kesalahan. Silakan coba lagi.');

      setTimeout(() => {
        resetState();
      }, 3000);
    }
  }, []);

  function resetState() {
    isProcessingRef.current = false;
    stableCountRef.current = 0;
    failCountRef.current = 0;
    setMatchResult(null);
    setScanMode(null);
    scanModeRef.current = null;
    setStatus('ready');
    setStatusMessage('Pilih tombol ABSEN MASUK atau ABSEN PULANG di bawah untuk mulai scan');
    setShowPin(false);
  }

  function handlePinSuccess(result) {
    if (result.already_completed) {
      setAlreadyCompletedData(result);
      setShowPin(false);
      resetState();
      return;
    }

    setMatchResult({
      employee: result.employee,
      jenis: result.jenis,
      similarity_score: null,
      terlambat: result.terlambat ?? false,
      menit_terlambat: result.menit_terlambat ?? 0,
    });
    setStatus('success');
    setStatusMessage(`Selamat datang, ${result.employee?.nama ?? 'Karyawan'}! Absen ${(result.jenis ?? '').toUpperCase()} berhasil.`);
    setShowPin(false);

    setTimeout(() => {
      resetState();
    }, 8000);
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusClass = () => {
    switch (status) {
      case 'success': return 'absen-status--success';
      case 'failed': return 'absen-status--failed';
      case 'error': return 'absen-status--error';
      case 'processing': return 'absen-status--processing';
      case 'detecting': return 'absen-status--detecting';
      default: return '';
    }
  };

  return (
    <div className="absen-page">
      {/* Background ambient glow */}
      <div className={`absen-page__ambient ${status === 'success' ? 'absen-page__ambient--success' : ''}`} />

      {/* Header with clock */}
      <header className="absen-header">
        <div className="absen-header__brand">
          <div className="absen-header__logo">
            <img src="/allo.png" alt="Alonica" className="absen-header__logo-img" />
          </div>
        </div>
        <div className="absen-header__clock">
          <div className="absen-header__time">{formatTime(currentTime)}</div>
          <div className="absen-header__date">{formatDate(currentTime)}</div>
        </div>
        <button
          className="absen-header__admin-btn"
          onClick={() => navigate('/login')}
          title="Login Admin"
        >
          <Settings size={16} />
          <span>Admin</span>
        </button>
      </header>

      {/* Main content */}
      <main className="absen-main">
        {/* Mode Selector Buttons */}
        <div className="absen-mode-selector animate-slide-up">
          <button
            type="button"
            className={`absen-mode-btn absen-mode-btn--masuk ${scanMode === 'masuk' ? 'absen-mode-btn--active' : ''}`}
            onClick={() => handleSelectMode('masuk')}
            disabled={status === 'processing'}
          >
            <div className="absen-mode-btn__icon">
              <LogIn size={24} />
            </div>
            <div className="absen-mode-btn__text">
              <span className="absen-mode-btn__title">ABSEN MASUK</span>
              <span className="absen-mode-btn__sub">
                {scanMode === 'masuk' ? '✓ Deteksi Wajah Aktif' : 'Klik untuk mulai scan masuk'}
              </span>
            </div>
          </button>

          <button
            type="button"
            className={`absen-mode-btn absen-mode-btn--pulang ${scanMode === 'pulang' ? 'absen-mode-btn--active' : ''}`}
            onClick={() => handleSelectMode('pulang')}
            disabled={status === 'processing'}
          >
            <div className="absen-mode-btn__icon">
              <LogOut size={24} />
            </div>
            <div className="absen-mode-btn__text">
              <span className="absen-mode-btn__title">ABSEN PULANG</span>
              <span className="absen-mode-btn__sub">
                {scanMode === 'pulang' ? '✓ Deteksi Wajah Aktif' : 'Klik untuk mulai scan pulang'}
              </span>
            </div>
          </button>
        </div>

        {/* Camera section */}
        <div className={`absen-camera-container ${getStatusClass()}`}>
          <div className="absen-camera-frame">
            <video
              ref={videoRef}
              className="absen-camera-video"
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absen-camera-canvas"
            />

            {/* Inactive overlay when scanMode is null */}
            {!scanMode && status !== 'success' && status !== 'processing' && (
              <div className="absen-camera-idle-overlay">
                <Scan size={36} className="text-accent animate-pulse" />
                <p>Silakan tekan <strong>ABSEN MASUK</strong> atau <strong>ABSEN PULANG</strong> di atas untuk memulai</p>
              </div>
            )}

            {/* Scanning animation */}
            {scanMode && (status === 'detecting' || status === 'processing') && (
              <div className="absen-scan-line" />
            )}

            {/* Corner guides */}
            <div className="absen-camera-guides">
              <span className="guide guide--tl" />
              <span className="guide guide--tr" />
              <span className="guide guide--bl" />
              <span className="guide guide--br" />
            </div>
          </div>

          {/* Status indicator */}
          <div className={`absen-status ${getStatusClass()}`}>
            {status === 'processing' && <div className="spinner" />}
            {status === 'success' && <CheckCircle2 size={20} className="text-emerald-400" />}
            {status === 'failed' && <XCircle size={20} className="text-rose-400" />}
            {status === 'error' && <AlertTriangle size={20} className="text-amber-400" />}
            {!scanMode && status === 'ready' && <Scan size={20} className="text-accent" />}
            <p className="absen-status__text">{statusMessage}</p>
          </div>
        </div>

        {/* Success result card */}
        {status === 'success' && matchResult && (
          <div className="absen-result animate-bounce-in">
            <div className="absen-result__avatar">
              {(matchResult.employee?.nama ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="absen-result__info">
              <h2 className="absen-result__name">{matchResult.employee?.nama ?? '-'}</h2>
              <p className="absen-result__role">{matchResult.employee?.role ?? ''}</p>
            </div>
            <div className="absen-result__badge">
              <span className={`badge ${matchResult.jenis === 'masuk' ? 'badge--success' : 'badge--warning'} flex items-center gap-1.5`}>
                {matchResult.jenis === 'masuk' ? (
                  <><LogIn size={14} /> <span>MASUK BERHASIL</span></>
                ) : (
                  <><LogOut size={14} /> <span>PULANG BERHASIL</span></>
                )}
              </span>
              {matchResult.jenis === 'masuk' && matchResult.terlambat && (
                <span className="badge badge--danger flex items-center gap-1.5" style={{ marginTop: '6px' }}>
                  <AlarmClock size={14} />
                  <span>TERLAMBAT {matchResult.menit_terlambat} MENIT</span>
                </span>
              )}
            </div>
            {matchResult.similarity_score && (
              <p className="absen-result__score text-xs text-muted">
                Kecocokan: {(matchResult.similarity_score * 100).toFixed(1)}%
              </p>
            )}
          </div>
        )}
      </main>

      {/* PIN Fallback Modal */}
      {showPin && (
        <PinFallback
          scanMode={scanMode}
          onSuccess={handlePinSuccess}
          onClose={() => {
            setShowPin(false);
            resetState();
          }}
        />
      )}

      {/* Pop-up Modal untuk Karyawan yang Sudah Absen Hari Ini */}
      {alreadyCompletedData && (
        <AlreadyCompletedModal
          data={alreadyCompletedData}
          onClose={() => {
            setAlreadyCompletedData(null);
            resetState();
          }}
        />
      )}

      {/* Footer */}
      <footer className="absen-footer">
        <p>Pilih mode absensi lalu hadapkan wajah ke kamera</p>
      </footer>
    </div>
  );
}
