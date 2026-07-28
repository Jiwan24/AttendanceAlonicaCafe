/**
 * Face detection wrapper using face-api.js
 * Handles model loading, face detection from video stream,
 * stability checking, and frame capture.
 */

// face-api.js will be loaded from CDN in index.html
let modelsLoaded = false;

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
