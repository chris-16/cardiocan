/**
 * On-device respiratory rate analyzer.
 *
 * Uses canvas-based frame differencing and signal processing to detect
 * thoracic movement in a video of a resting dog. Works entirely offline
 * without any cloud API calls.
 *
 * Algorithm:
 * 1. Extract frames from the video at ~10 fps
 * 2. Compute average pixel intensity in the user-selected ROI (chest area)
 * 3. Apply bandpass filter for dog resting respiratory range (10-60 rpm → 0.17-1.0 Hz)
 * 4. Detect peaks in the filtered signal
 * 5. Count peaks → compute RPM
 */

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
}

export interface AnalysisProgress {
  phase: "extracting" | "analyzing" | "counting" | "done";
  percent: number;
  message: string;
}

type ProgressCallback = (progress: AnalysisProgress) => void;

const TARGET_FPS = 10;

/**
 * Analyze a recorded video blob on-device to count respiratory rate.
 * Requires a user-selected ROI covering the dog's chest area.
 */
export async function analyzeVideoOnDevice(
  videoBlob: Blob,
  roi: ROI,
  onProgress?: ProgressCallback
): Promise<OnDeviceAnalysisResult> {
  onProgress?.({
    phase: "extracting",
    percent: 0,
    message: "Preparando video para análisis...",
  });

  // Step 1: Extract frames from the video
  const { frames, fps, durationSeconds, videoWidth, videoHeight } =
    await extractFrames(videoBlob, roi, onProgress);

  if (frames.length < 10) {
    return {
      breathCount: 0,
      durationSeconds: Math.round(durationSeconds),
      breathsPerMinute: 0,
      confidence: "baja",
      notes: "Video demasiado corto o no se pudieron extraer suficientes cuadros.",
      signalQuality: 0,
    };
  }

  onProgress?.({
    phase: "analyzing",
    percent: 50,
    message: "Analizando movimiento del tórax...",
  });

  // Step 2: Compute intensity signal from ROI
  const signal = computeROIIntensity(frames, roi, videoWidth, videoHeight);

  // Step 3: Bandpass filter (dog resting RR: 10-60 rpm → 0.17-1.0 Hz)
  const filtered = bandpassFilter(signal, fps, 0.15, 1.1);

  onProgress?.({
    phase: "counting",
    percent: 75,
    message: "Contando ciclos respiratorios...",
  });

  // Step 4: Detect peaks
  const peaks = detectPeaks(filtered, fps);

  // Step 5: Compute signal quality metrics
  const signalQuality = computeSignalQuality(filtered, peaks, fps);

  // Step 6: Calculate results
  const breathCount = peaks.length;
  const duration = Math.round(durationSeconds);
  const breathsPerMinute =
    duration > 0 ? Math.round((breathCount / duration) * 60) : 0;

  // Determine confidence based on signal quality
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
  };
}

// --- Frame Extraction ---

interface ExtractedFrames {
  frames: ImageData[];
  fps: number;
  durationSeconds: number;
  videoWidth: number;
  videoHeight: number;
}

async function extractFrames(
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

      // Extract frames by seeking through the video
      for (let i = 0; i < totalFrames; i++) {
        const time = i * frameInterval;
        try {
          await seekToTime(video, time);
          ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

          // Extract ROI pixels
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
              percent: Math.round((i / totalFrames) * 45),
              message: `Extrayendo cuadros: ${i}/${totalFrames}`,
            });
          }
        } catch {
          // Skip frames that fail to seek
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

// --- Signal Processing ---

/**
 * Compute average grayscale intensity in the ROI for each frame.
 * This creates a 1D time-series signal where breathing appears as periodic oscillation.
 */
function computeROIIntensity(
  frames: ImageData[],
  _roi: ROI,
  _videoWidth: number,
  _videoHeight: number
): number[] {
  return frames.map((imageData) => {
    const data = imageData.data;
    const pixelCount = data.length / 4;
    let totalIntensity = 0;

    for (let i = 0; i < data.length; i += 4) {
      // Luminance: 0.299*R + 0.587*G + 0.114*B
      totalIntensity += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    return totalIntensity / pixelCount;
  });
}

/**
 * Simple bandpass filter using cascaded first-order IIR filters.
 * Removes DC offset (detrend) + low-pass + high-pass.
 */
function bandpassFilter(
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
function detectPeaks(signal: number[], sampleRate: number): number[] {
  if (signal.length < 5) return [];

  // Minimum distance between peaks: based on max expected RR (60 rpm → 1 sec per breath)
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
function computeSignalQuality(
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
