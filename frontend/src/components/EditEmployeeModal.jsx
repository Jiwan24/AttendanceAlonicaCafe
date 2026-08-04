import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Save,
  Camera,
  Upload,
  ScanFace,
  Check,
  RefreshCw,
  Trash2,
  User,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveDown,
} from 'lucide-react';
import { updateEmployee, enrollFace, clearFaceEmbeddings } from '../lib/api';
import { loadFaceModels, detectFaces, checkFaceStability, captureFrame, drawFaceOverlay } from '../lib/faceDetection';
import './EditEmployeeModal.css';

const ROLES = ['Barista', 'Kasir', 'Waiter', 'Manager', 'Kitchen', 'Cleaning'];
const MAX_PHOTOS = 20;

const POSE_GUIDES = [
  { label: 'Depan',  instruction: 'Hadap lurus ke kamera',       icon: User      },
  { label: 'Kiri',   instruction: 'Sedikit menoleh ke kiri',      icon: MoveLeft  },
  { label: 'Kanan',  instruction: 'Sedikit menoleh ke kanan',     icon: MoveRight },
  { label: 'Atas',   instruction: 'Sedikit dongak ke atas',       icon: MoveUp    },
  { label: 'Bawah',  instruction: 'Sedikit menunduk ke bawah',    icon: MoveDown  },
];

/**
 * EditEmployeeModal
 *
 * Props:
 *   employee  — object dari API (id, nama, kode_karyawan, role, face_count, status)
 *   onClose   — dipanggil ketika modal ditutup
 *   onSaved   — dipanggil setelah simpan berhasil (agar parent reload daftar)
 */
export default function EditEmployeeModal({ employee, onClose, onSaved }) {
  // ── Tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('detail'); // detail | face

  // ── Detail form ────────────────────────────────────────────
  const [form, setForm] = useState({
    nama:          employee.nama,
    kode_karyawan: employee.kode_karyawan,
    role:          employee.role,
    pin_fallback:  '',
    pin_confirm:   '',
  });
  const [detailError,   setDetailError]   = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaved,   setDetailSaved]   = useState(false);

  // ── Face enroll ────────────────────────────────────────────
  const videoRef          = useRef(null);
  const canvasRef         = useRef(null);
  const detectionLoopRef  = useRef(null);
  const fileInputRef      = useRef(null);

  const [cameraActive,  setCameraActive]  = useState(false);
  const [cameraReady,   setCameraReady]   = useState(false);
  const [faceDetected,  setFaceDetected]  = useState(false);
  const [enrolling,     setEnrolling]     = useState(false);
  const [faceError,     setFaceError]     = useState('');
  const [newPhotos,     setNewPhotos]     = useState([]);   // photos added this session
  const [faceCount,     setFaceCount]     = useState(employee.face_count);
  const [currentPose,   setCurrentPose]   = useState(0);
  const [clearing,      setClearing]      = useState(false);
  const [faceToast,     setFaceToast]     = useState(null);

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // ── Keyboard close ─────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleClose() {
    stopCamera();
    onClose();
  }

  // ── Camera helpers ─────────────────────────────────────────
  function stopCamera() {
    if (detectionLoopRef.current) {
      clearInterval(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraReady(false);
    setFaceDetected(false);
  }

  async function startCamera() {
    setFaceError('');
    try {
      await loadFaceModels();
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
      setCameraActive(true);
    } catch {
      setFaceError('Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.');
    }
  }

  function startDetectionLoop() {
    detectionLoopRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused) return;
      const detections = await detectFaces(videoRef.current);
      const video = videoRef.current;
      if (canvasRef.current && video) {
        canvasRef.current.width  = video.videoWidth;
        canvasRef.current.height = video.videoHeight;
        const stability = checkFaceStability(detections, video.videoWidth, video.videoHeight);
        drawFaceOverlay(canvasRef.current, detections, stability.stable);
        setFaceDetected(stability.stable);
      }
    }, 300);
  }

  // ── Show face toast ────────────────────────────────────────
  const showFaceToast = useCallback((type, message) => {
    setFaceToast({ type, message });
    setTimeout(() => setFaceToast(null), 2500);
  }, []);

  // ── Capture photo ──────────────────────────────────────────
  async function handleCapture() {
    if (!faceDetected || enrolling) return;
    setEnrolling(true);
    try {
      const blob   = await captureFrame(videoRef.current);
      const result = await enrollFace(employee.id, blob);

      const photo  = { url: URL.createObjectURL(blob), detScore: result.det_score };
      setNewPhotos((prev) => [...prev, photo]);
      setFaceCount(result.face_count);
      setCurrentPose((p) => p + 1);
      showFaceToast('success', `Foto ${result.face_count}/${MAX_PHOTOS} berhasil!`);

      if (result.face_count >= MAX_PHOTOS) stopCamera();
    } catch (err) {
      showFaceToast('error', err.message);
    } finally {
      setEnrolling(false);
    }
  }

  // ── Upload photo ───────────────────────────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || enrolling) return;
    setEnrolling(true);
    try {
      const result = await enrollFace(employee.id, file);
      const photo  = { url: URL.createObjectURL(file), detScore: result.det_score };
      setNewPhotos((prev) => [...prev, photo]);
      setFaceCount(result.face_count);
      setCurrentPose((p) => p + 1);
      showFaceToast('success', `Foto ${result.face_count}/${MAX_PHOTOS} berhasil diupload!`);
    } catch (err) {
      showFaceToast('error', err.message);
    } finally {
      setEnrolling(false);
      e.target.value = null;
    }
  }

  // ── Clear embeddings ───────────────────────────────────────
  async function handleClearFace() {
    if (!confirm('Hapus semua data wajah karyawan ini? Karyawan harus registrasi ulang.')) return;
    setClearing(true);
    try {
      await clearFaceEmbeddings(employee.id);
      setFaceCount(0);
      setNewPhotos([]);
      setCurrentPose(0);
      stopCamera();
      showFaceToast('success', 'Data wajah berhasil dihapus.');
    } catch (err) {
      showFaceToast('error', err.message);
    } finally {
      setClearing(false);
    }
  }

  // ── Save detail form ───────────────────────────────────────
  async function handleSaveDetail(e) {
    e.preventDefault();
    setDetailError('');

    if (!form.nama.trim() || !form.kode_karyawan.trim()) {
      setDetailError('Nama dan kode karyawan wajib diisi.');
      return;
    }
    if (form.pin_fallback && form.pin_fallback !== form.pin_confirm) {
      setDetailError('PIN dan konfirmasi PIN tidak sama.');
      return;
    }

    setDetailLoading(true);
    try {
      const payload = {
        nama:          form.nama.trim(),
        kode_karyawan: form.kode_karyawan.trim(),
        role:          form.role,
      };
      // Only send pin_fallback if the user typed something
      if (form.pin_fallback) payload.pin_fallback = form.pin_fallback;

      await updateEmployee(employee.id, payload);
      setDetailSaved(true);
      setTimeout(() => setDetailSaved(false), 2500);
      onSaved();
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  // ── Computed ───────────────────────────────────────────────
  const poseGuide  = POSE_GUIDES[currentPose % POSE_GUIDES.length];
  const PoseIcon   = poseGuide.icon;
  const canCapture = faceDetected && !enrolling && faceCount < MAX_PHOTOS;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="edit-modal">
        {/* Header */}
        <div className="edit-modal__header">
          <div>
            <h2 className="edit-modal__title">Edit Karyawan</h2>
            <p className="edit-modal__sub">{employee.nama} · {employee.kode_karyawan}</p>
          </div>
          <button className="btn btn--ghost btn--icon" onClick={handleClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="edit-modal__tabs">
          <button
            className={`edit-modal__tab ${activeTab === 'detail' ? 'edit-modal__tab--active' : ''}`}
            onClick={() => { setActiveTab('detail'); }}
          >
            Data Karyawan
          </button>
          <button
            className={`edit-modal__tab ${activeTab === 'face' ? 'edit-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('face')}
          >
            <ScanFace size={14} />
            Data Wajah
            {faceCount === 0 && (
              <span className="edit-modal__tab-badge">Belum ada</span>
            )}
            {faceCount > 0 && (
              <span className="edit-modal__tab-count">{faceCount}</span>
            )}
          </button>
        </div>

        {/* ── Tab: Detail ──────────────────────────────────── */}
        {activeTab === 'detail' && (
          <form className="edit-modal__body" onSubmit={handleSaveDetail}>
            <div className="form-group">
              <label className="form-label" htmlFor="em-nama">Nama Lengkap *</label>
              <input
                id="em-nama"
                className="form-input"
                type="text"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
                required
              />
            </div>

            <div className="edit-modal__row">
              <div className="form-group">
                <label className="form-label" htmlFor="em-kode">Kode Karyawan *</label>
                <input
                  id="em-kode"
                  className="form-input"
                  type="text"
                  value={form.kode_karyawan}
                  onChange={(e) => setForm({ ...form, kode_karyawan: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="em-role">Role</label>
                <select
                  id="em-role"
                  className="form-select"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="edit-modal__divider">
              <span>Ganti PIN (opsional)</span>
            </div>

            <div className="edit-modal__row">
              <div className="form-group">
                <label className="form-label" htmlFor="em-pin">PIN Baru</label>
                <input
                  id="em-pin"
                  className="form-input"
                  type="password"
                  inputMode="numeric"
                  placeholder="Kosongkan jika tidak diganti"
                  value={form.pin_fallback}
                  onChange={(e) => setForm({ ...form, pin_fallback: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="em-pin2">Konfirmasi PIN</label>
                <input
                  id="em-pin2"
                  className="form-input"
                  type="password"
                  inputMode="numeric"
                  placeholder="Ulangi PIN baru"
                  value={form.pin_confirm}
                  onChange={(e) => setForm({ ...form, pin_confirm: e.target.value })}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {detailError && (
              <p className="edit-modal__error">{detailError}</p>
            )}

            <div className="edit-modal__footer">
              <button type="button" className="btn btn--outline" onClick={handleClose}>
                Batal
              </button>
              <button
                type="submit"
                className="btn btn--primary flex items-center gap-2"
                disabled={detailLoading}
              >
                {detailLoading ? (
                  <><span className="spinner" /> Menyimpan…</>
                ) : detailSaved ? (
                  <><Check size={15} /> Tersimpan!</>
                ) : (
                  <><Save size={15} /> Simpan Perubahan</>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── Tab: Face ────────────────────────────────────── */}
        {activeTab === 'face' && (
          <div className="edit-modal__body">
            {/* Status bar */}
            <div className="edit-face__status">
              <div className="edit-face__status-info">
                <ScanFace size={16} />
                <span>
                  {faceCount === 0
                    ? 'Belum ada data wajah terdaftar'
                    : `${faceCount} foto wajah terdaftar`}
                </span>
              </div>
              {faceCount > 0 && (
                <button
                  className="btn btn--sm btn--danger flex items-center gap-1"
                  onClick={handleClearFace}
                  disabled={clearing}
                >
                  {clearing ? <span className="spinner" /> : <Trash2 size={13} />}
                  <span>Hapus Semua</span>
                </button>
              )}
            </div>

            {/* Progress */}
            <div className="edit-face__progress-wrap">
              <div className="enroll-capture__progress">
                <div
                  className="enroll-capture__progress-fill"
                  style={{ width: `${(faceCount / MAX_PHOTOS) * 100}%` }}
                />
              </div>
              <span className="edit-face__progress-label">{faceCount}/{MAX_PHOTOS}</span>
            </div>

            {faceCount < MAX_PHOTOS && (
              <>
                {/* Camera section */}
                {!cameraActive ? (
                  <div className="edit-face__start">
                    <p className="text-secondary text-sm">
                      {faceCount === 0
                        ? 'Tambahkan minimal 3 foto dari sudut berbeda agar pengenalan wajah akurat.'
                        : 'Tambahkan lebih banyak foto untuk meningkatkan akurasi.'}
                    </p>
                    <div className="edit-face__actions">
                      <button
                        className="btn btn--primary flex items-center gap-2"
                        onClick={startCamera}
                      >
                        <Camera size={15} />
                        Buka Kamera
                      </button>
                      <span className="text-muted text-sm">atau</span>
                      <button
                        className="btn btn--outline flex items-center gap-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={enrolling}
                      >
                        <Upload size={15} />
                        Upload Foto
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="edit-face__camera-wrap">
                    {/* Pose guide */}
                    <div className="enroll-capture__guide">
                      <div className="enroll-capture__guide-icon">
                        <PoseIcon size={18} />
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                          {poseGuide.label}
                        </p>
                        <p className="text-muted text-sm">{poseGuide.instruction}</p>
                      </div>
                    </div>

                    {/* Video frame */}
                    <div className="enroll-capture__frame">
                      <video
                        ref={videoRef}
                        className="enroll-capture__video"
                        muted
                        playsInline
                      />
                      <canvas ref={canvasRef} className="enroll-capture__canvas" />
                      {!cameraReady && (
                        <div className="edit-face__cam-loading">
                          <span className="spinner spinner--lg" />
                        </div>
                      )}
                    </div>

                    {/* Capture controls */}
                    <div className="edit-face__cam-controls">
                      <button
                        className="btn btn--outline btn--sm flex items-center gap-1"
                        onClick={stopCamera}
                      >
                        <X size={13} /> Tutup Kamera
                      </button>
                      <button
                        className={`btn btn--sm flex items-center gap-2 ${canCapture ? 'btn--primary' : 'btn--outline'}`}
                        onClick={handleCapture}
                        disabled={!canCapture}
                      >
                        {enrolling ? (
                          <span className="spinner" />
                        ) : (
                          <Camera size={14} />
                        )}
                        {faceDetected ? 'Ambil Foto' : 'Arahkan Wajah…'}
                      </button>
                      <button
                        className="btn btn--outline btn--sm flex items-center gap-1"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={enrolling}
                      >
                        <Upload size={13} /> Upload
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {faceCount >= MAX_PHOTOS && (
              <p className="edit-face__max-note">
                Sudah mencapai batas maksimum {MAX_PHOTOS} foto wajah.
              </p>
            )}

            {/* Thumbnails of new photos added this session */}
            {newPhotos.length > 0 && (
              <div className="edit-face__thumbs-section">
                <p className="text-sm font-semibold" style={{ marginBottom: 'var(--space-2)' }}>
                  Foto baru ditambahkan sesi ini ({newPhotos.length})
                </p>
                <div className="enroll-capture__thumbs">
                  {newPhotos.map((p, i) => (
                    <div key={i} className="enroll-capture__thumb enroll-capture__thumb--done">
                      <img src={p.url} alt={`Wajah ${i + 1}`} />
                      <span className="enroll-capture__thumb-check">
                        <Check size={9} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {faceError && <p className="edit-modal__error">{faceError}</p>}

            {/* Face toast */}
            {faceToast && (
              <div className={`edit-face__toast edit-face__toast--${faceToast.type}`}>
                {faceToast.message}
              </div>
            )}

            <div className="edit-modal__footer" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn--outline" onClick={handleClose}>
                Tutup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
