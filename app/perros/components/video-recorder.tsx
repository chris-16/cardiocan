"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type RecorderState = "idle" | "requesting" | "ready" | "recording" | "recorded" | "error";

interface VideoRecorderProps {
  minDuration?: number;
  maxDuration?: number;
  onVideoReady: (blob: Blob) => void;
  onReset: () => void;
}

export default function VideoRecorder({
  minDuration = 30,
  maxDuration = 60,
  onVideoReady,
  onReset,
}: VideoRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  const requestCamera = useCallback(async () => {
    setState("requesting");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setState("ready");
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Habilita el acceso a la cámara en la configuración de tu navegador."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No se encontró una cámara en este dispositivo."
            : "No se pudo acceder a la cámara. Verifica los permisos del navegador.";
      setError(message);
      setState("error");
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    setElapsed(0);

    // Find a supported MIME type
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";

    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: mimeType || undefined,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || "video/webm",
      });
      const url = URL.createObjectURL(blob);

      // Revoke old preview URL if exists
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);

      stopStream();
      onVideoReady(blob);
      setState("recorded");
    };

    mediaRecorderRef.current = recorder;
    recorder.start(1000); // Collect data every second
    startTimeRef.current = Date.now();
    setState("recording");

    // Timer for elapsed display
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);

      // Auto-stop at max duration
      if (secs >= maxDuration) {
        stopRecording();
      }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDuration, onVideoReady, previewUrl]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setElapsed(0);
    setState("idle");
    onReset();
  }, [previewUrl, onReset]);

  const canStop = elapsed >= minDuration;
  const progressPercent = Math.min((elapsed / maxDuration) * 100, 100);

  return (
    <div className="space-y-4">
      {/* Error display */}
      {state === "error" && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button
            onClick={requestCamera}
            className="mt-2 block text-sm font-medium underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Camera activation */}
      {state === "idle" && (
        <button
          onClick={requestCamera}
          className="w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
        >
          <span className="block text-4xl mb-2">📹</span>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Activar cámara
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
            Se solicitará permiso de acceso
          </span>
        </button>
      )}

      {/* Requesting permission */}
      {state === "requesting" && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Solicitando acceso a la cámara...
          </p>
        </div>
      )}

      {/* Live camera preview (ready + recording) */}
      {(state === "ready" || state === "recording") && (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-video object-cover"
          />

          {/* Recording indicator */}
          {state === "recording" && (
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1">
              <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-white tabular-nums">
                {formatTime(elapsed)}
              </span>
            </div>
          )}

          {/* Duration hint while recording */}
          {state === "recording" && !canStop && (
            <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1">
              <span className="text-xs text-white">
                Mínimo {minDuration - elapsed}s más
              </span>
            </div>
          )}
        </div>
      )}

      {/* Progress bar while recording */}
      {state === "recording" && (
        <div className="w-full rounded-full bg-gray-200 dark:bg-gray-700 h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              canStop ? "bg-green-500" : "bg-blue-600"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Recorded video preview */}
      {state === "recorded" && previewUrl && (
        <div className="overflow-hidden rounded-lg bg-black">
          <video
            ref={previewVideoRef}
            src={previewUrl}
            controls
            playsInline
            className="w-full aspect-video object-cover"
          />
        </div>
      )}

      {/* Action buttons */}
      {state === "ready" && (
        <div className="flex gap-3">
          <button
            onClick={startRecording}
            className="flex-1 rounded-md bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            ⏺ Iniciar grabación
          </button>
          <button
            onClick={() => {
              stopStream();
              setState("idle");
            }}
            className="rounded-md border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
        </div>
      )}

      {state === "recording" && (
        <button
          onClick={stopRecording}
          disabled={!canStop}
          className={`w-full rounded-md px-4 py-3 text-sm font-medium text-white transition-colors ${
            canStop
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
          }`}
        >
          {canStop
            ? "⏹ Detener grabación"
            : `Grabando... (${minDuration - elapsed}s restantes)`}
        </button>
      )}

      {state === "recorded" && (
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 rounded-md border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Grabar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
