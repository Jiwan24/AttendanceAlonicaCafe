import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  Camera, 
  Upload, 
  CheckCircle2, 
  UserPlus, 
  User, 
  MoveLeft, 
  MoveRight, 
  MoveUp, 
  MoveDown 
} from 'lucide-react';
import { loadFaceModels, detectFaces, checkFaceStability, captureFrame, drawFaceOverlay } from '../lib/faceDetection';
import { addEmployee, enrollFace } from '../lib/api';
import Navbar from '../components/Navbar';
import './EnrollPage.css';

/**
 * EnrollPage — Registrasi karyawan baru + enrollment wajah.
 * 
 * Flow:
 * Step 1: Input data karyawan (nama, kode, role, PIN)
 * Step 2: Capture 3-5 foto wajah dari sudut berbeda
 * Step 3: Konfirmasi berhasil
 */

const ROLES = ['Barista', 'Kasir', 'Waiter', 'Manager', 'Kitchen', 'Cleaning'];
const MAX_PHOTOS = 20;
const MIN_PHOTOS = 3;

const POSE_GUIDES = [
  { label: 'Depan', instruction: 'Hadap lurus ke kamera', icon: User },
  { label: 'Kiri', instruction: 'Sedikit menoleh ke kiri', icon: MoveLeft },
  { label: 'Kanan', instruction: 'Sedikit menoleh ke kanan', icon: MoveRight },
  { label: 'Atas', instruction: 'Sedikit dongak ke atas', icon: MoveUp },
  { label: 'Bawah', instruction: 'Sedikit menunduk ke bawah', icon: MoveDown },
];

export default function EnrollPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1); // 1=form, 2=capture, 3=done
  const [formData, setFormData] = useState({
    nama: '',
    kode_karyawan: '',
    role: 'Barista',
    pin_fallback: '',
    pin_confirm: '',
  });
  const [employeeId, setEmployeeId] = useState(null);
  const [photos, setPhotos] = useState([]); // { blob, detScore }
  const [currentPose, setCurrentPose] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (detectionLoopRef.current) {
      clearInterval(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    await loadFaceModels();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraReady(true);
          startDetectionLoop();
        };
      }
    } catch (err) {
      setError('Tidak dapat mengakses kamera.');
    }
  }

  function startDetectionLoop() {
    detectionLoopRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused) return;

      const detections = await detectFaces(videoRef.current);
      const video = videoRef.current;

      if (canvasRef.current && video) {
        canvasRef.current.width = video.videoWidth;
        canvasRef.current.height = video.videoHeight;
        const stability = checkFaceStability(detections, video.videoWidth, video.videoHeight);
        drawFaceOverlay(canvasRef.current, detections, stability.stable);
        setFaceDetected(stability.stable);
      }
    }, 300);
  }

  // Step 1: Handle form submit
  async function handleFormSubmit(e) {
    e.preventDefault();
    setError('');

    if (!formData.nama.trim() || !formData.kode_karyawan.trim()) {
      setError('Nama dan kode karyawan wajib diisi.');
      return;
    }

    if (formData.pin_fallback && formData.pin_fallback !== formData.pin_confirm) {
      setError('PIN dan konfirmasi PIN tidak sama.');
      return;
    }

    setLoading(true);
    try {
      const result = await addEmployee({
        nama: formData.nama,
        kode_karyawan: formData.kode_karyawan,
        role: formData.role,
        pin_fallback: formData.pin_fallback || null,
      });

      setEmployeeId(result.employee.id);
      setStep(2);
      // Start camera for face enrollment
      setTimeout(() => startCamera(), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Capture photo
  async function handleCapture() {
    if (!faceDetected || enrolling) return;

    setEnrolling(true);
    try {
      const blob = await captureFrame(videoRef.current);

      // Send to backend for enrollment
      const result = await enrollFace(employeeId, blob);

      const newPhotos = [...photos, {
        blob,
        url: URL.createObjectURL(blob),
        detScore: result.det_score,
      }];
      setPhotos(newPhotos);

      setToast({
        type: 'success',
        message: `Foto ${newPhotos.length}/${MAX_PHOTOS} berhasil! ${result.message}`,
      });

      if (newPhotos.length < MAX_PHOTOS) {
        setCurrentPose(newPhotos.length);
      }

      // Clear toast after 2s
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setEnrolling(false);
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || enrolling) return;

    setEnrolling(true);
    try {
      const result = await enrollFace(employeeId, file);

      const newPhotos = [...photos, {
        blob: file,
        url: URL.createObjectURL(file),
        detScore: result.det_score,
      }];
      setPhotos(newPhotos);

      setToast({
        type: 'success',
        message: `Foto ${newPhotos.length}/${MAX_PHOTOS} berhasil diupload! ${result.message}`,
      });

      if (newPhotos.length < MAX_PHOTOS) {
        setCurrentPose(newPhotos.length);
      }

      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setEnrolling(false);
      e.target.value = null; // reset file input
    }
  }

  function handleFinishEnrollment() {
    stopCamera();
    setStep(3);
  }

  return (
    <>
      <Navbar />
      <div className="enroll-page page">
        <div className="container">
          {/* Page header */}
          <div className="enroll-page__header animate-fade-in">
            <h1>Registrasi Karyawan Baru</h1>
            <p className="text-secondary">
              {step === 1 && 'Langkah 1: Isi data karyawan'}
              {step === 2 && 'Langkah 2: Ambil foto wajah dari beberapa sudut'}
              {step === 3 && 'Selesai! Karyawan berhasil didaftarkan'}
            </p>
          </div>

          {/* Step indicator */}
          <div className="enroll-steps">
            <div className={`enroll-step ${step >= 1 ? 'enroll-step--active' : ''} ${step > 1 ? 'enroll-step--done' : ''}`}>
              <span className="enroll-step__num">{step > 1 ? <Check size={14} /> : '1'}</span>
              <span className="enroll-step__label">Data Karyawan</span>
            </div>
            <div className="enroll-step__line" />
            <div className={`enroll-step ${step >= 2 ? 'enroll-step--active' : ''} ${step > 2 ? 'enroll-step--done' : ''}`}>
              <span className="enroll-step__num">{step > 2 ? <Check size={14} /> : '2'}</span>
              <span className="enroll-step__label">Foto Wajah</span>
            </div>
            <div className="enroll-step__line" />
            <div className={`enroll-step ${step >= 3 ? 'enroll-step--active' : ''}`}>
              <span className="enroll-step__num">{step >= 3 ? <Check size={14} /> : '3'}</span>
              <span className="enroll-step__label">Selesai</span>
            </div>
          </div>

          {/* Step 1: Employee form */}
          {step === 1 && (
            <form className="enroll-form glass-card animate-slide-up" onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="nama">Nama Lengkap *</label>
                <input
                  id="nama"
                  className="form-input"
                  type="text"
                  placeholder="Contoh: Budi Santoso"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="kode">Kode Karyawan *</label>
                <input
                  id="kode"
                  className="form-input"
                  type="text"
                  placeholder="Contoh: ALN-001"
                  value={formData.kode_karyawan}
                  onChange={(e) => setFormData({ ...formData, kode_karyawan: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="role">Role / Posisi</label>
                <select
                  id="role"
                  className="form-select"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="enroll-form__row">
                <div className="form-group">
                  <label className="form-label" htmlFor="pin">PIN Fallback</label>
                  <input
                    id="pin"
                    className="form-input"
                    type="password"
                    placeholder="4-6 digit"
                    maxLength={6}
                    value={formData.pin_fallback}
                    onChange={(e) => setFormData({ ...formData, pin_fallback: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pin-confirm">Konfirmasi PIN</label>
                  <input
                    id="pin-confirm"
                    className="form-input"
                    type="password"
                    placeholder="Ulangi PIN"
                    maxLength={6}
                    value={formData.pin_confirm}
                    onChange={(e) => setFormData({ ...formData, pin_confirm: e.target.value })}
                  />
                </div>
              </div>

              {error && <p className="enroll-form__error">{error}</p>}

              <button type="submit" className="btn btn--primary btn--lg w-full flex items-center justify-center gap-2" disabled={loading}>
                {loading ? (
                  <><div className="spinner" /> Menyimpan...</>
                ) : (
                  <>
                    <span>Lanjut ke Foto Wajah</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2: Face capture */}
          {step === 2 && (
            <div className="enroll-capture animate-slide-up">
              <div className="enroll-capture__layout">
                {/* Camera */}
                <div className="enroll-capture__camera glass-card">
                  <div className="enroll-capture__frame">
                    <video ref={videoRef} autoPlay playsInline muted className="enroll-capture__video" />
                    <canvas ref={canvasRef} className="enroll-capture__canvas" />
                  </div>

                  {/* Pose guide */}
                  <div className="enroll-capture__guide">
                    <div className="enroll-capture__guide-icon">
                      {POSE_GUIDES[currentPose % POSE_GUIDES.length] && (() => {
                        const PoseIcon = POSE_GUIDES[currentPose % POSE_GUIDES.length].icon;
                        return <PoseIcon size={22} />;
                      })()}
                    </div>
                    <div>
                      <p className="font-semibold">{POSE_GUIDES[currentPose % POSE_GUIDES.length]?.label}</p>
                      <p className="text-sm text-muted">{POSE_GUIDES[currentPose % POSE_GUIDES.length]?.instruction}</p>
                    </div>
                  </div>

                  <button
                    className={`btn btn--lg w-full flex items-center justify-center gap-2 ${faceDetected ? 'btn--primary' : 'btn--outline'}`}
                    disabled={!faceDetected || enrolling || photos.length >= MAX_PHOTOS}
                    onClick={handleCapture}
                  >
                    {enrolling ? (
                      <><div className="spinner" /> Memproses...</>
                    ) : photos.length >= MAX_PHOTOS ? (
                      <><Check size={18} /> <span>Semua foto sudah diambil</span></>
                    ) : faceDetected ? (
                      <>
                        <Camera size={18} />
                        <span>Ambil Foto ({photos.length + 1}/{MAX_PHOTOS})</span>
                      </>
                    ) : (
                      'Menunggu wajah terdeteksi...'
                    )}
                  </button>

                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button
                    className="btn btn--outline btn--lg w-full flex items-center justify-center gap-2"
                    style={{ marginTop: '0.75rem' }}
                    disabled={enrolling || photos.length >= MAX_PHOTOS}
                    onClick={() => fileInputRef.current.click()}
                  >
                    <Upload size={18} />
                    <span>Upload dari Galeri / File</span>
                  </button>
                </div>

                {/* Photo thumbnails */}
                <div className="enroll-capture__sidebar">
                  <h3>Foto Terdaftar ({photos.length}/{MAX_PHOTOS})</h3>
                  <div className="enroll-capture__thumbs">
                    {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
                      const PoseIcon = POSE_GUIDES[i % POSE_GUIDES.length]?.icon || User;
                      return (
                        <div
                          key={i}
                          className={`enroll-capture__thumb ${photos[i] ? 'enroll-capture__thumb--done' : ''} ${i === photos.length ? 'enroll-capture__thumb--current' : ''}`}
                        >
                          {photos[i] ? (
                            <>
                              <img src={photos[i].url} alt={`Pose ${i + 1}`} />
                              <span className="enroll-capture__thumb-check">
                                <Check size={12} />
                              </span>
                            </>
                          ) : (
                            <span className="enroll-capture__thumb-icon">
                              <PoseIcon size={16} />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Progress bar */}
                  <div className="enroll-capture__progress">
                    <div
                      className="enroll-capture__progress-fill"
                      style={{ width: `${(photos.length / MAX_PHOTOS) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted text-center">
                    Minimum {MIN_PHOTOS} foto, rekomendasi {MAX_PHOTOS} foto
                  </p>

                  {photos.length >= MIN_PHOTOS && (
                    <button
                      className="btn btn--success btn--lg w-full flex items-center justify-center gap-2"
                      onClick={handleFinishEnrollment}
                    >
                      <Check size={18} />
                      <span>Selesai & Simpan</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="enroll-success glass-card animate-bounce-in text-center">
              <div className="enroll-success__icon">
                <CheckCircle2 size={56} className="text-emerald-400" />
              </div>
              <h2>Registrasi Berhasil!</h2>
              <p className="text-secondary">
                <strong>{formData.nama}</strong> ({formData.kode_karyawan}) telah terdaftar
                dengan {photos.length} foto wajah.
              </p>
              <div className="flex gap-4 justify-center" style={{ marginTop: 'var(--space-6)' }}>
                <button className="btn btn--primary btn--lg flex items-center gap-2" onClick={() => navigate('/admin')}>
                  <ArrowLeft size={16} />
                  <span>Kembali ke Dashboard</span>
                </button>
                <button className="btn btn--outline btn--lg flex items-center gap-2" onClick={() => {
                  setStep(1);
                  setFormData({ nama: '', kode_karyawan: '', role: 'Barista', pin_fallback: '', pin_confirm: '' });
                  setPhotos([]);
                  setCurrentPose(0);
                  setEmployeeId(null);
                }}>
                  <UserPlus size={16} />
                  <span>Daftarkan Lagi</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`toast toast--${toast.type}`}>
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
