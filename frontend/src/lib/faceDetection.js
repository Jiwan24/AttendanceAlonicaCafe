/**
 * Face detection wrapper using face-api.js
 * Handles model loading, face detection from video stream,
 * stability checking, frame capture, and liveness motion checks.
 */

// face-api.js will be loaded from CDN in index.html
let modelsLoaded = false;

// ── Motion / Liveness state ────────────────────────────────────────────────

/**
 * Menyimpan posisi landmark wajah dari frame sebelumnya
 * untuk menghitung pergerakan antar frame.
 */
let _prevLandmarks = null;

/**
 * Riwayat mouth-open ratio untuk deteksi senyum/bicara.
 * Buffer 10 frame terakhir.
 */
const _mouthHistory = [];
const MOUTH_HISTORY_MAX = 12;

/**
 * Reset semua state motion detection.
 * Dipanggil saat scan mode berubah atau setelah capture.
 */
export function resetMotionState() {
  _prevLandmarks = null;
  _mouthHistory.length = 0;
}

/**
 * Load face-api.js models from public/models directory.
 * Must be called once before any detection.
 */
export async function loadFaceModels() {
  if (modelsLoaded) return true;

  try {
    const faceapi = window.faceapi;
    if (!faceapi) {
      console.error('face-api.js not loaded. Include it in index.html.');
      return false;
    }

    const MODEL_URL = '/models';

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;
    console.log('Face detection models loaded successfully.');
    return true;
  } catch (error) {
    console.error('Failed to load face detection models:', error);
    return false;
  }
}

/**
 * Detect faces in a video element.
 * @param {HTMLVideoElement} video
 * @returns {Array|null} Detection results or null
 */
export async function detectFaces(video) {
  if (!modelsLoaded || !window.faceapi) return null;

  const faceapi = window.faceapi;
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
  });

  try {
    const detections = await faceapi
      .detectAllFaces(video, options)
      .withFaceLandmarks(true);
    return detections;
  } catch (error) {
    console.error('Face detection error:', error);
    return null;
  }
}

/**
 * Check if a single face is detected, centered, and large enough.
 * @param {Array} detections - face-api.js detection results
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @returns {{ stable: boolean, message: string, face: object|null }}
 */
export function checkFaceStability(detections, videoWidth, videoHeight) {
  if (!detections || detections.length === 0) {
    return { stable: false, message: 'Tidak ada wajah terdeteksi', face: null };
  }

  if (detections.length > 1) {
    return { stable: false, message: 'Terdeteksi lebih dari 1 wajah', face: null };
  }

  const detection = detections[0];
  const box = detection.detection.box;

  // Check face size (at least 15% of frame)
  const faceArea = box.width * box.height;
  const frameArea = videoWidth * videoHeight;
  const faceRatio = faceArea / frameArea;

  if (faceRatio < 0.04) {
    return { stable: false, message: 'Terlalu jauh. Dekatkan wajah ke kamera', face: detection };
  }

  // Check if face is roughly centered (within 30% of center)
  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;
  const frameCenterX = videoWidth / 2;
  const frameCenterY = videoHeight / 2;

  const offsetX = Math.abs(faceCenterX - frameCenterX) / videoWidth;
  const offsetY = Math.abs(faceCenterY - frameCenterY) / videoHeight;

  if (offsetX > 0.3 || offsetY > 0.35) {
    return { stable: false, message: 'Posisikan wajah di tengah frame', face: detection };
  }

  // Check detection confidence
  if (detection.detection.score < 0.6) {
    return { stable: false, message: 'Wajah kurang jelas. Perbaiki pencahayaan', face: detection };
  }

  return { stable: true, message: 'Wajah terdeteksi ✓', face: detection };
}

/**
 * Capture a frame from video element as a Blob.
 * @param {HTMLVideoElement} video
 * @param {string} format - 'image/jpeg' or 'image/png'
 * @param {number} quality - JPEG quality (0-1)
 * @returns {Promise<Blob>}
 */
export function captureFrame(video, format = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => resolve(blob),
      format,
      quality
    );
  });
}

/**
 * Draw face detection overlay on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} detections
 * @param {boolean} isStable
 */
export function drawFaceOverlay(canvas, detections, isStable = false) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!detections || detections.length === 0) return;

  detections.forEach((detection) => {
    const box = detection.detection.box;
    const color = isStable ? '#10b981' : '#3b82f6';

    // Draw face bounding box with rounded corners
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    // Corner markers instead of full box
    const cornerLen = Math.min(box.width, box.height) * 0.2;

    ctx.beginPath();
    // Top-left
    ctx.moveTo(box.x, box.y + cornerLen);
    ctx.lineTo(box.x, box.y);
    ctx.lineTo(box.x + cornerLen, box.y);
    // Top-right
    ctx.moveTo(box.x + box.width - cornerLen, box.y);
    ctx.lineTo(box.x + box.width, box.y);
    ctx.lineTo(box.x + box.width, box.y + cornerLen);
    // Bottom-right
    ctx.moveTo(box.x + box.width, box.y + box.height - cornerLen);
    ctx.lineTo(box.x + box.width, box.y + box.height);
    ctx.lineTo(box.x + box.width - cornerLen, box.y + box.height);
    // Bottom-left
    ctx.moveTo(box.x + cornerLen, box.y + box.height);
    ctx.lineTo(box.x, box.y + box.height);
    ctx.lineTo(box.x, box.y + box.height - cornerLen);
    ctx.stroke();

    ctx.shadowBlur = 0;
  });
}

export function isModelsLoaded() {
  return modelsLoaded;
}

// ── Motion & Liveness Detection ───────────────────────────────────────────

/**
 * Ambil posisi rata-rata dari sekumpulan landmark points.
 * @param {Array} points - array of {x, y}
 * @returns {{ x: number, y: number }}
 */
function _meanPoint(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Hitung jarak Euclidean antara dua titik.
 */
function _dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Hitung pergerakan wajah antar frame berdasarkan pergeseran landmark.
 * Mengembalikan nilai pergerakan yang dinormalisasi terhadap ukuran wajah.
 *
 * @param {object} landmarks - face-api.js FaceLandmarks68 object
 * @param {object} box - bounding box { width, height }
 * @returns {number} motion score (0 = tidak bergerak, >1 = bergerak banyak)
 */
export function computeMotion(landmarks, box) {
  if (!landmarks) return 0;

  // Ambil semua 68 landmark points
  const pts = landmarks.positions; // array of Point {x, y}
  if (!pts || pts.length < 68) return 0;

  const current = _meanPoint(pts);

  if (!_prevLandmarks) {
    _prevLandmarks = { mean: current, pts };
    return 0;
  }

  // Hitung pergeseran rata-rata semua landmark
  let totalShift = 0;
  for (let i = 0; i < pts.length; i++) {
    totalShift += _dist(pts[i], _prevLandmarks.pts[i]);
  }
  const avgShift = totalShift / pts.length;

  // Normalisasi terhadap lebar wajah
  const faceSize = box.width || 100;
  const normalizedMotion = avgShift / faceSize;

  _prevLandmarks = { mean: current, pts };

  return normalizedMotion;
}

/**
 * Hitung Mouth Aspect Ratio (MAR) — rasio keterbukaan mulut.
 * Menggunakan landmark 48–67 (mouth region, 68-point model).
 *
 * MAR tinggi → mulut terbuka (senyum lebar / bicara)
 * MAR rendah → mulut tertutup / diam
 *
 * @param {object} landmarks - face-api.js FaceLandmarks68
 * @param {object} box - bounding box
 * @returns {number} MAR value (0–1 normalized)
 */
export function computeMouthAspectRatio(landmarks, box) {
  if (!landmarks) return 0;
  const pts = landmarks.positions;
  if (!pts || pts.length < 68) return 0;

  // Landmark mulut luar: 48–59
  // Titik vertikal: atas=51(center top), bawah=57(center bottom)
  // Titik horizontal: kiri=48, kanan=54
  const top    = pts[51];
  const bottom = pts[57];
  const left   = pts[48];
  const right  = pts[54];

  const vertical   = _dist(top, bottom);
  const horizontal = _dist(left, right);

  if (horizontal < 1) return 0;

  // Normalisasi terhadap lebar wajah agar tidak tergantung jarak kamera
  const faceW = box.width || horizontal;
  return vertical / faceW;
}

/**
 * Update riwayat MAR dan cek apakah ada variasi senyum yang cukup.
 * Senyum terdeteksi jika ada fluktuasi MAR yang signifikan dalam buffer.
 *
 * @param {number} mar - current mouth aspect ratio
 * @returns {{ smileDetected: boolean, variation: number, progress: number }}
 */
export function updateAndCheckSmile(mar) {
  _mouthHistory.push(mar);
  if (_mouthHistory.length > MOUTH_HISTORY_MAX) {
    _mouthHistory.shift();
  }

  if (_mouthHistory.length < 6) {
    return { smileDetected: false, variation: 0, progress: _mouthHistory.length / 6 };
  }

  const maxMAR = Math.max(..._mouthHistory);
  const minMAR = Math.min(..._mouthHistory);
  const variation = maxMAR - minMAR;

  // Threshold: mulut harus membuka setidaknya ~15% dari lebar wajah
  // Ini cukup untuk senyum sedang, tidak perlu tawa lebar
  const VARIATION_THRESHOLD = 0.08;
  const smileDetected = variation >= VARIATION_THRESHOLD;

  const progress = Math.min(1, variation / VARIATION_THRESHOLD);

  return { smileDetected, variation, progress };
}

