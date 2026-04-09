/**
 * On-device respiratory rate analyzer using MediaPipe.
 *
 * Uses @mediapipe/tasks-vision PoseLandmarker to detect body landmarks
 * frame-by-frame in a video of a resting dog. Tracks the vertical position
 * of torso landmarks over time to detect periodic breathing motion.
 *
 * When MediaPipe landmarks are not reliably detected (common with some dog
 * positions/breeds), falls back to pixel-intensity analysis in the
 * user-selected ROI. Both paths feed into the same signal processing
 * pipeline (bandpass filter + peak detection).
 *
 * Works entirely offline once the model is cached by the service worker.
 *
 * Algorithm:
 * 1. Initialize MediaPipe PoseLandmarker (lite model)
 * 2. Extract frames from the video at ~10 fps
 * 3. Run PoseLandmarker.detectForVideo() on each frame
 * 4. If landmarks detected: track torso Y-coordinate oscillation
 * 5. If not: compute average pixel intensity in user-selected ROI
 * 6. Apply bandpass filter for dog resting respiratory range (10-60 rpm)
 * 7. Detect peaks in the filtered signal
 * 8. Count peaks -> compute RPM
 */

import {
  PoseLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

export interface ROI {
  /** Normalized coordinates (0-1) relative to video dimensions */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OnDeviceAnalysisResult {
  breathCount: number;
  durationSeconds: number;
  breathsPerMinute: number;
  confidence: "alta" | "media" | "baja";
  notes: string;
  signalQuality: number; // 0-1, how clear the breathing signal is
  /** Which signal source was used: 'landmarks' (MediaPipe) or 'pixel-intensity' (fallback) */
  signalSource: "landmarks" | "pixel-intensity";
}

export interface AnalysisProgress {
  phase: "loading" | "extracting" | "analyzing" | "counting" | "done";
  percent: number;
  message: string;
}

type ProgressCallback = (progress: AnalysisProgress) => void;

const TARGET_FPS = 10;

/**
 * MediaPipe model URLs. The WASM runtime and model are loaded from CDN
 * on first use. The PWA service worker caches them for offline access.
 */
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/**
 * Pose landmark indices for the torso region (shoulders and hips).
 * These landmarks move vertically with each breathing cycle.
 * See: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker#pose_landmarker_model
 */
const TORSO_LANDMARK_INDICES = [11, 12, 23, 24]; // left_shoulder, right_shoulder, left_hip, right_hip

/** Minimum ratio of frames with detected landmarks to use landmark-based signal */
const MIN_LANDMARK_DETECTION_RATIO = 0.3;

// Singleton PoseLandmarker instance (reused across analyses)
let cachedLandmarker: PoseLandmarker | null = null;

/**
 * Initialize or return the cached MediaPipe PoseLandmarker.
 */
async function getOrCreateLandmarker(): Promise<PoseLandmarker> {
  if (cachedLandmarker) return cachedLandmarker;

  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  cachedLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  return cachedLandmarker;
}

/**
 * Analyze a recorded video blob on-device to count respiratory rate.
 * Uses MediaPipe PoseLandmarker for frame-by-frame body landmark detection,
 * with pixel-intensity fallback when landmarks aren't reliably detected.
 */
export async function analyzeVideoOnDevice(
  videoBlob: Blob,
  roi: ROI,
  onProgress?: ProgressCallback
): Promise<OnDeviceAnalysisResult> {
  // Step 1: Load MediaPipe model
  onProgress?.({
    phase: "loading",
    percent: 0,
    message: "Cargando modelo MediaPipe...",
  });

  let poseLandmarker: PoseLandmarker;
  try {
    poseLandmarker = await getOrCreateLandmarker();
  } catch {
    // If MediaPipe fails to load (e.g. no WebGL), fall back to pixel-only analysis
    return analyzeWithPixelIntensityOnly(videoBlob, roi, onProgress);
  }

  onProgress?.({
    phase: "extracting",
    percent: 10,
    message: "Preparando video para análisis...",
  });

  // Step 2: Extract frames and run MediaPipe on each
  const {
    landmarkSignal,
    pixelSignal,
    landmarkDetections,
    totalFrames,
    fps,
    durationSeconds,
  } = await extractFramesAndAnalyze(videoBlob, roi, poseLandmarker, onProgress);

  if (totalFrames < 10) {
    return {
      breathCount: 0,
      durationSeconds: Math.round(durationSeconds),
      breathsPerMinute: 0,
      confidence: "baja",
      notes: "Video demasiado corto o no se pudieron extraer suficientes cuadros.",
      signalQuality: 0,
      signalSource: "pixel-intensity",
    };
  }

  onProgress?.({
    phase: "analyzing",
    percent: 60,
    message: "Analizando movimiento del tórax con MediaPipe...",
  });

  // Step 3: Choose signal source based on landmark detection success rate
  const landmarkRatio = landmarkDetections / totalFrames;
  const useLandmarks = landmarkRatio >= MIN_LANDMARK_DETECTION_RATIO;

  let signal: number[];
  let signalSource: "landmarks" | "pixel-intensity";

  if (useLandmarks) {
    // Use landmark Y-positions (interpolate gaps where detection failed)
    signal = interpolateSignal(landmarkSignal);
    signalSource = "landmarks";
  } else {
    // Fall back to pixel intensity in ROI
    signal = pixelSignal;
    signalSource = "pixel-intensity";
  }

  // Step 4: Bandpass filter (dog resting RR: 10-60 rpm -> 0.17-1.0 Hz)
  const filtered = bandpassFilter(signal, fps, 0.15, 1.1);

  onProgress?.({
    phase: "counting",
    percent: 80,
    message: "Contando ciclos respiratorios...",
  });

  // Step 5: Detect peaks
  const peaks = detectPeaks(filtered, fps);

  // Step 6: Compute signal quality metrics
  const signalQuality = computeSignalQuality(filtered, peaks, fps);

  // Step 7: Calculate results
  const breathCount = peaks.length;
  const duration = Math.round(durationSeconds);
  const breathsPerMinute =
    duration > 0 ? Math.round((breathCount / duration) * 60) : 0;

  // Determine confidence based on signal quality and signal source
  let confidence: "alta" | "media" | "baja";
  let notes: string;

  if (signalQuality > 0.7 && breathCount > 0) {
    confidence = "alta";
    notes = useLandmarks
      ? "MediaPipe detectó landmarks corporales. Movimiento torácico detectado claramente."
      : "Movimiento torácico detectado claramente en la región seleccionada.";
  } else if (signalQuality > 0.4 && breathCount > 0) {
    confidence = "media";
    notes = useLandmarks
      ? "MediaPipe detectó landmarks parcialmente. Señal de calidad moderada."
      : "Movimiento torácico detectado con calidad moderada. La señal presenta algo de ruido.";
  } else {
    confidence = "baja";
    notes =
      breathCount === 0
        ? "No se detectó movimiento respiratorio claro en la región seleccionada."
        : "Señal débil o ruidosa. El resultado puede no ser preciso.";
  }

  // Add signal source info
  if (useLandmarks) {
    notes += ` (${Math.round(landmarkRatio * 100)}% de cuadros con landmarks detectados)`;
  }

  // Sanity checks
  if (breathsPerMinute < 4 || breathsPerMinute > 80) {
    confidence = "baja";
    notes +=
      " El resultado está fuera del rango fisiológico esperado para un perro.";
  }

  onProgress?.({
    phase: "done",
    percent: 100,
    message: "Análisis completado",
  });

  return {
    breathCount,
    durationSeconds: duration,
    breathsPerMinute,
    confidence,
    notes,
    signalQuality,
    signalSource,
  };
}

// --- Fallback: pixel-intensity only (when MediaPipe fails to load) ---

async function analyzeWithPixelIntensityOnly(
  videoBlob: Blob,
  roi: ROI,
  onProgress?: ProgressCallback
): Promise<OnDeviceAnalysisResult> {
  onProgress?.({
    phase: "extracting",
    percent: 10,
    message: "MediaPipe no disponible. Usando análisis por intensidad de píxeles...",
  });

  const { frames, fps, durationSeconds, videoWidth, videoHeight } =
    await extractFramesOnly(videoBlob, roi, onProgress);

  if (frames.length < 10) {
    return {
      breathCount: 0,
      durationSeconds: Math.round(durationSeconds),
      breathsPerMinute: 0,
      confidence: "baja",
      notes: "Video demasiado corto o no se pudieron extraer suficientes cuadros.",
      signalQuality: 0,
      signalSource: "pixel-intensity",
    };
  }

  onProgress?.({
    phase: "analyzing",
    percent: 50,
    message: "Analizando movimiento del tórax...",
  });

  const signal = computeROIIntensity(frames, roi, videoWidth, videoHeight);
  const filtered = bandpassFilter(signal, fps, 0.15, 1.1);

  onProgress?.({
    phase: "counting",
    percent: 75,
    message: "Contando ciclos respiratorios...",
  });

  const peaks = detectPeaks(filtered, fps);
  const signalQuality = computeSignalQuality(filtered, peaks, fps);

  const breathCount = peaks.length;
  const duration = Math.round(durationSeconds);
  const breathsPerMinute =
    duration > 0 ? Math.round((breathCount / duration) * 60) : 0;

  let confidence: "alta" | "media" | "baja";
  let notes: string;

  if (signalQuality > 0.7 && breathCount > 0) {
    confidence = "alta";
    notes = "Movimiento torácico detectado claramente. Señal de buena calidad.";
  } else if (signalQuality > 0.4 && breathCount > 0) {
    confidence = "media";
    notes =
      "Movimiento torácico detectado con calidad moderada. La señal presenta algo de ruido.";
  } else {
    confidence = "baja";
    notes =
      breathCount === 0
        ? "No se detectó movimiento respiratorio claro en la región seleccionada."
        : "Señal débil o ruidosa. El resultado puede no ser preciso.";
  }

  if (breathsPerMinute < 4 || breathsPerMinute > 80) {
    confidence = "baja";
    notes +=
      " El resultado está fuera del rango fisiológico esperado para un perro.";
  }

  onProgress?.({
    phase: "done",
    percent: 100,
    message: "Análisis completado",
  });

  return {
    breathCount,
    durationSeconds: duration,
    breathsPerMinute,
    confidence,
    notes,
    signalQuality,
    signalSource: "pixel-intensity",
  };
}

// --- Frame Extraction + MediaPipe Analysis ---

interface FrameAnalysisResult {
  landmarkSignal: (number | null)[];
  pixelSignal: number[];
  landmarkDetections: number;
  totalFrames: number;
  fps: number;
  durationSeconds: number;
}

async function extractFramesAndAnalyze(
  videoBlob: Blob,
  roi: ROI,
  poseLandmarker: PoseLandmarker,
  onProgress?: ProgressCallback
): Promise<FrameAnalysisResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoBlob);
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const duration = video.duration;

      if (!isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo determinar la duración del video."));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo crear el contexto de canvas."));
        return;
      }

      const frameInterval = 1 / TARGET_FPS;
      const totalFrames = Math.floor(duration * TARGET_FPS);
      const landmarkSignal: (number | null)[] = [];
      const pixelSignal: number[] = [];
      let landmarkDetections = 0;

      for (let i = 0; i < totalFrames; i++) {
        const time = i * frameInterval;
        try {
          await seekToTime(video, time);
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

          // Run MediaPipe PoseLandmarker on this frame
          const timestampMs = Math.round(time * 1000);
          const poseResult = poseLandmarker.detectForVideo(canvas, timestampMs);

          if (
            poseResult.landmarks.length > 0 &&
            poseResult.landmarks[0].length > Math.max(...TORSO_LANDMARK_INDICES)
          ) {
            // Extract average Y-position of torso landmarks
            const landmarks = poseResult.landmarks[0];
            const torsoYValues = TORSO_LANDMARK_INDICES.map(
              (idx) => landmarks[idx].y
            );
            const avgTorsoY =
              torsoYValues.reduce((sum, y) => sum + y, 0) /
              torsoYValues.length;

            landmarkSignal.push(avgTorsoY);
            landmarkDetections++;
          } else {
            landmarkSignal.push(null);
          }

          // Also compute pixel intensity in ROI (as fallback signal)
          const roiX = Math.round(roi.x * videoWidth);
          const roiY = Math.round(roi.y * videoHeight);
          const roiW = Math.round(roi.width * videoWidth);
          const roiH = Math.round(roi.height * videoHeight);

          const imageData = ctx.getImageData(
            Math.max(0, roiX),
            Math.max(0, roiY),
            Math.min(roiW, videoWidth - roiX),
            Math.min(roiH, videoHeight - roiY)
          );
          pixelSignal.push(computeFrameIntensity(imageData));

          if (onProgress && i % 5 === 0) {
            onProgress({
              phase: "extracting",
              percent: 10 + Math.round((i / totalFrames) * 45),
              message: `Procesando cuadros con MediaPipe: ${i}/${totalFrames}`,
            });
          }
        } catch {
          // Skip frames that fail to seek
          landmarkSignal.push(null);
          pixelSignal.push(pixelSignal.length > 0 ? pixelSignal[pixelSignal.length - 1] : 0);
          continue;
        }
      }

      URL.revokeObjectURL(url);
      resolve({
        landmarkSignal,
        pixelSignal,
        landmarkDetections,
        totalFrames: pixelSignal.length,
        fps: TARGET_FPS,
        durationSeconds: duration,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo cargar el video para análisis."));
    };
  });
}

// --- Pixel-only frame extraction (fallback) ---

interface ExtractedFrames {
  frames: ImageData[];
  fps: number;
  durationSeconds: number;
  videoWidth: number;
  videoHeight: number;
}

async function extractFramesOnly(
  videoBlob: Blob,
  roi: ROI,
  onProgress?: ProgressCallback
): Promise<ExtractedFrames> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoBlob);
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const duration = video.duration;

      if (!isFinite(duration) || duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo determinar la duración del video."));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo crear el contexto de canvas."));
        return;
      }

      const frameInterval = 1 / TARGET_FPS;
      const totalFrames = Math.floor(duration * TARGET_FPS);
      const frames: ImageData[] = [];

      for (let i = 0; i < totalFrames; i++) {
        const time = i * frameInterval;
        try {
          await seekToTime(video, time);
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

          const roiX = Math.round(roi.x * videoWidth);
          const roiY = Math.round(roi.y * videoHeight);
          const roiW = Math.round(roi.width * videoWidth);
          const roiH = Math.round(roi.height * videoHeight);

          const imageData = ctx.getImageData(
            Math.max(0, roiX),
            Math.max(0, roiY),
            Math.min(roiW, videoWidth - roiX),
            Math.min(roiH, videoHeight - roiY)
          );
          frames.push(imageData);

          if (onProgress && i % 5 === 0) {
            onProgress({
              phase: "extracting",
              percent: 10 + Math.round((i / totalFrames) * 45),
              message: `Extrayendo cuadros: ${i}/${totalFrames}`,
            });
          }
        } catch {
          continue;
        }
      }

      URL.revokeObjectURL(url);
      resolve({
        frames,
        fps: TARGET_FPS,
        durationSeconds: duration,
        videoWidth,
        videoHeight,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo cargar el video para análisis."));
    };
  });
}

function seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Seek timeout")), 3000);

    const onSeeked = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

// --- Signal Extraction ---

/**
 * Compute average grayscale intensity for a single frame's ImageData.
 */
function computeFrameIntensity(imageData: ImageData): number {
  const data = imageData.data;
  const pixelCount = data.length / 4;
  let totalIntensity = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Luminance: 0.299*R + 0.587*G + 0.114*B
    totalIntensity +=
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  return totalIntensity / pixelCount;
}

/**
 * Compute average grayscale intensity in the ROI for each frame.
 * Used in the pixel-intensity-only fallback path.
 */
function computeROIIntensity(
  frames: ImageData[],
  _roi: ROI,
  _videoWidth: number,
  _videoHeight: number
): number[] {
  return frames.map((imageData) => computeFrameIntensity(imageData));
}

/**
 * Interpolate gaps (null values) in the landmark signal using linear interpolation.
 * This handles frames where MediaPipe didn't detect landmarks.
 */
export function interpolateSignal(signal: (number | null)[]): number[] {
  const result: number[] = new Array(signal.length).fill(0);

  // Find first and last non-null values
  let firstValid = -1;
  let lastValid = -1;
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] !== null) {
      if (firstValid === -1) firstValid = i;
      lastValid = i;
    }
  }

  if (firstValid === -1) {
    // No valid values at all — return zeros
    return result;
  }

  // Fill before first valid value
  for (let i = 0; i < firstValid; i++) {
    result[i] = signal[firstValid]!;
  }

  // Fill after last valid value
  for (let i = lastValid + 1; i < signal.length; i++) {
    result[i] = signal[lastValid]!;
  }

  // Interpolate between valid values
  let prevValid = firstValid;
  result[firstValid] = signal[firstValid]!;

  for (let i = firstValid + 1; i <= lastValid; i++) {
    if (signal[i] !== null) {
      result[i] = signal[i]!;

      // Linearly interpolate any gaps between prevValid and i
      if (i - prevValid > 1) {
        const startVal = signal[prevValid]!;
        const endVal = signal[i]!;
        const gap = i - prevValid;
        for (let j = prevValid + 1; j < i; j++) {
          const t = (j - prevValid) / gap;
          result[j] = startVal + t * (endVal - startVal);
        }
      }

      prevValid = i;
    }
  }

  return result;
}

// --- Signal Processing ---

/**
 * Simple bandpass filter using cascaded first-order IIR filters.
 * Removes DC offset (detrend) + low-pass + high-pass.
 */
export function bandpassFilter(
  signal: number[],
  sampleRate: number,
  lowCutHz: number,
  highCutHz: number
): number[] {
  if (signal.length === 0) return [];

  // Step 1: Remove DC offset (detrend)
  const mean = signal.reduce((sum, v) => sum + v, 0) / signal.length;
  let detrended = signal.map((v) => v - mean);

  // Step 2: Apply moving average smoothing to reduce noise
  const smoothWindow = Math.max(1, Math.round(sampleRate / (highCutHz * 2)));
  detrended = movingAverage(detrended, smoothWindow);

  // Step 3: High-pass filter (remove very slow drift)
  const alphaHP = computeAlpha(lowCutHz, sampleRate);
  const highPassed = highPassFilter(detrended, alphaHP);

  // Step 4: Low-pass filter (remove high-frequency noise)
  const alphaLP = computeAlpha(highCutHz, sampleRate);
  const lowPassed = lowPassFilter(highPassed, alphaLP);

  return lowPassed;
}

function computeAlpha(cutoffHz: number, sampleRate: number): number {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  return rc / (rc + dt);
}

function highPassFilter(signal: number[], alpha: number): number[] {
  const result = new Array(signal.length);
  result[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    result[i] = alpha * (result[i - 1] + signal[i] - signal[i - 1]);
  }
  return result;
}

function lowPassFilter(signal: number[], alpha: number): number[] {
  const result = new Array(signal.length);
  result[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    result[i] = alpha * result[i - 1] + (1 - alpha) * signal[i];
  }
  return result;
}

function movingAverage(signal: number[], windowSize: number): number[] {
  if (windowSize <= 1) return [...signal];
  const result = new Array(signal.length);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length - 1, i + halfWindow);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += signal[j];
    }
    result[i] = sum / (end - start + 1);
  }

  return result;
}

/**
 * Detect peaks in the filtered signal using adaptive thresholding.
 * Returns indices of detected breathing peaks.
 */
export function detectPeaks(signal: number[], sampleRate: number): number[] {
  if (signal.length < 5) return [];

  // Minimum distance between peaks: based on max expected RR (60 rpm -> 1 sec per breath)
  const minPeakDistance = Math.round(sampleRate * 0.8); // 0.8 sec minimum

  // Compute adaptive threshold: mean + 0.3 * stddev of absolute values
  const absSignal = signal.map(Math.abs);
  const absMean = absSignal.reduce((s, v) => s + v, 0) / absSignal.length;
  const variance =
    absSignal.reduce((s, v) => s + (v - absMean) ** 2, 0) / absSignal.length;
  const stddev = Math.sqrt(variance);
  const threshold = absMean * 0.2 + stddev * 0.3;

  const peaks: number[] = [];

  for (let i = 1; i < signal.length - 1; i++) {
    // Local maximum
    if (
      signal[i] > signal[i - 1] &&
      signal[i] > signal[i + 1] &&
      signal[i] > threshold
    ) {
      // Check minimum distance from last peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minPeakDistance) {
        peaks.push(i);
      } else if (
        peaks.length > 0 &&
        signal[i] > signal[peaks[peaks.length - 1]]
      ) {
        // Replace last peak if this one is higher and within min distance
        peaks[peaks.length - 1] = i;
      }
    }
  }

  return peaks;
}

/**
 * Compute signal quality metric (0-1) based on:
 * - Regularity of peak intervals (consistent breathing rate)
 * - Signal-to-noise ratio
 * - Sufficient number of detected cycles
 */
export function computeSignalQuality(
  signal: number[],
  peaks: number[],
  sampleRate: number
): number {
  if (peaks.length < 2) return 0;

  // 1. Interval regularity (coefficient of variation of peak intervals)
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push((peaks[i] - peaks[i - 1]) / sampleRate);
  }

  const meanInterval =
    intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const intervalVariance =
    intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) /
    intervals.length;
  const cv = Math.sqrt(intervalVariance) / meanInterval;

  // Lower CV = more regular breathing = higher quality
  const regularityScore = Math.max(0, 1 - cv);

  // 2. Signal-to-noise ratio (peak amplitude vs noise floor)
  const peakAmplitudes = peaks.map((i) => Math.abs(signal[i]));
  const meanPeakAmp =
    peakAmplitudes.reduce((s, v) => s + v, 0) / peakAmplitudes.length;
  const rms = Math.sqrt(
    signal.reduce((s, v) => s + v * v, 0) / signal.length
  );
  const snr = rms > 0 ? meanPeakAmp / rms : 0;
  const snrScore = Math.min(1, snr / 3);

  // 3. Minimum breath count (need at least ~3 breaths for reliable estimate)
  const countScore = Math.min(1, peaks.length / 5);

  // Weighted combination
  return regularityScore * 0.4 + snrScore * 0.3 + countScore * 0.3;
}
