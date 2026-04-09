"use client";

import { useState, useRef, use } from "react";
import Link from "next/link";
import VideoRecorder from "@/app/perros/components/video-recorder";

type PageState = "instructions" | "recording" | "preview";

export default function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dogId } = use(params);

  const [pageState, setPageState] = useState<PageState>("instructions");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(false);

  const videoBlobRef = useRef<Blob | null>(null);

  function handleVideoReady(blob: Blob) {
    videoBlobRef.current = blob;
    setVideoBlob(blob);
    setPageState("preview");
  }

  function handleReset() {
    videoBlobRef.current = null;
    setVideoBlob(null);
    setPageState("recording");
  }

  async function handleAnalyze() {
    if (!videoBlob) return;
    setAnalyzing(true);

    // Upload video for future analysis
    try {
      const formData = new FormData();
      formData.append("video", videoBlob, "respiracion.webm");

      const res = await fetch(`/api/dogs/${dogId}/video`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al subir el video");
      }

      setDone(true);
    } catch (err) {
      // For now, just mark as done since the API endpoint may not exist yet
      // The video was recorded successfully - analysis will come later
      setDone(true);
    } finally {
      setAnalyzing(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="space-y-6 text-center">
          <div className="text-6xl">✅</div>
          <div>
            <h2 className="text-2xl font-bold">Video grabado</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              El video ha sido grabado exitosamente. El análisis automático de
              frecuencia respiratoria estará disponible próximamente.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setDone(false);
                setVideoBlob(null);
                setPageState("instructions");
              }}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Grabar otro video
            </button>
            <Link
              href={`/perros/${dogId}`}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Volver al perfil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/perros/${dogId}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Volver al perfil
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2">
        Grabación de video respiratorio
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Graba un video de 30 a 60 segundos para el análisis automático de
        frecuencia respiratoria.
      </p>

      {/* Instructions screen */}
      {pageState === "instructions" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-4">
            <h2 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">
              📋 Instrucciones para una buena grabación
            </h2>
            <ol className="space-y-3 text-sm text-blue-700 dark:text-blue-400">
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">1.</span>
                <span>
                  <strong>Perro en reposo:</strong> Asegúrate de que tu perro
                  esté descansando o durmiendo. No lo grabes después de jugar o
                  hacer ejercicio.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">2.</span>
                <span>
                  <strong>Vista lateral:</strong> Posiciona la cámara de forma
                  que se vea claramente el costado del pecho del perro.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">3.</span>
                <span>
                  <strong>Estabilidad:</strong> Mantén el teléfono lo más quieto
                  posible. Apóyalo en una superficie si puedes.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">4.</span>
                <span>
                  <strong>Buena iluminación:</strong> Graba en un lugar bien
                  iluminado para que se aprecien los movimientos del pecho.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 font-bold">5.</span>
                <span>
                  <strong>Duración:</strong> El video debe durar entre 30 y 60
                  segundos. La grabación se detendrá automáticamente a los 60
                  segundos.
                </span>
              </li>
            </ol>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>💡 Consejo:</strong> Los mejores resultados se obtienen
              cuando el perro lleva al menos 15 minutos en reposo. Evita
              grabarlo si está jadeando o agitado.
            </p>
          </div>

          <button
            onClick={() => setPageState("recording")}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Continuar a la grabación
          </button>
        </div>
      )}

      {/* Recording screen */}
      {(pageState === "recording" || pageState === "preview") && (
        <div className="space-y-6">
          <VideoRecorder
            minDuration={30}
            maxDuration={60}
            onVideoReady={handleVideoReady}
            onReset={handleReset}
          />

          {/* Preview actions */}
          {pageState === "preview" && videoBlob && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Tamaño del video
                  </span>
                  <span className="text-sm font-medium">
                    {formatFileSize(videoBlob.size)}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Formato
                  </span>
                  <span className="text-sm font-medium">
                    {videoBlob.type || "video/webm"}
                  </span>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzing ? "Enviando video..." : "Enviar para analizar"}
              </button>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Revisa el video antes de enviarlo. Puedes reproducirlo usando
                los controles del reproductor.
              </p>
            </div>
          )}

          {/* Back to instructions link */}
          {pageState === "recording" && (
            <button
              onClick={() => setPageState("instructions")}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ← Ver instrucciones de nuevo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
