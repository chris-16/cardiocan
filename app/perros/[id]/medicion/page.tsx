"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import Link from "next/link";
import RpmAlert, { getRpmAlertLevel } from "@/app/perros/components/rpm-alert";

type MeasurementState = "setup" | "measuring" | "review" | "saving" | "done";

interface MeasurementResult {
  breathCount: number;
  durationSeconds: number;
  breathsPerMinute: number;
}

export default function MedicionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dogId } = use(params);

  const [duration, setDuration] = useState<30 | 60>(30);
  const [state, setState] = useState<MeasurementState>("setup");
  const [breathCount, setBreathCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [result, setResult] = useState<MeasurementResult | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const breathCountRef = useRef(0);

  // Keep ref in sync with state for timer callback
  useEffect(() => {
    breathCountRef.current = breathCount;
  }, [breathCount]);

  const finishMeasurement = useCallback(
    async (count: number, durationSec: number, measurementNotes?: string) => {
      setState("saving");
      const breathsPerMinute = Math.round((count / durationSec) * 60);

      try {
        const res = await fetch(`/api/dogs/${dogId}/measurements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            breathCount: count,
            durationSeconds: durationSec,
            notes: measurementNotes || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Error al guardar la medición");
          setState("setup");
          return;
        }

        setResult({ breathCount: count, durationSeconds: durationSec, breathsPerMinute });
        setState("done");
      } catch {
        setError("Error de conexión");
        setState("setup");
      }
    },
    [dogId]
  );

  const startMeasurement = useCallback(() => {
    setError("");
    setBreathCount(0);
    breathCountRef.current = 0;
    setTimeRemaining(duration);
    setState("measuring");
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = duration - elapsed;

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setTimeRemaining(0);
        // Go to review screen so user can add notes before saving
        setResult({
          breathCount: breathCountRef.current,
          durationSeconds: duration,
          breathsPerMinute: Math.round((breathCountRef.current / duration) * 60),
        });
        setState("review");
      } else {
        setTimeRemaining(remaining);
      }
    }, 250);
  }, [duration]);

  const handleTap = useCallback(() => {
    if (state !== "measuring") return;
    setBreathCount((prev) => prev + 1);
  }, [state]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const progressPercent =
    state === "measuring"
      ? ((duration - timeRemaining) / duration) * 100
      : state === "done"
        ? 100
        : 0;

  // Shared result display for review and done states
  if ((state === "review" || state === "done") && result) {
    const alertLevel = getRpmAlertLevel(result.breathsPerMinute);
    const resultIcon =
      alertLevel === "urgent" ? "🚨" : alertLevel === "elevated" ? "⚠️" : "✅";
    const rpmColorClass =
      alertLevel === "urgent"
        ? "text-red-600 dark:text-red-400"
        : alertLevel === "elevated"
          ? "text-orange-600 dark:text-orange-400"
          : "text-green-600 dark:text-green-400";

    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="space-y-6 text-center">
          <div className="text-6xl">{resultIcon}</div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Frecuencia respiratoria
            </p>
            <p className={`text-5xl font-bold mt-1 ${rpmColorClass}`}>
              {result.breathsPerMinute}
            </p>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              respiraciones/min
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Respiraciones contadas
              </span>
              <span className="text-sm font-medium">{result.breathCount}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Duración
              </span>
              <span className="text-sm font-medium">
                {result.durationSeconds} segundos
              </span>
            </div>
          </div>

          <RpmAlert rpm={result.breathsPerMinute} />

          {/* Notes input - shown during review before saving */}
          {state === "review" && (
            <div className="text-left">
              <label
                htmlFor="measurement-notes"
                className="block text-sm font-medium mb-1"
              >
                Notas (opcional)
              </label>
              <textarea
                id="measurement-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Estado del perro, síntomas observados..."
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          )}

          {/* Saved notes display - shown in done state */}
          {state === "done" && notes.trim() && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-left">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Nota
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {notes.trim()}
              </p>
            </div>
          )}

          {state === "review" && (
            <button
              onClick={() =>
                finishMeasurement(
                  result.breathCount,
                  result.durationSeconds,
                  notes.trim() || undefined
                )
              }
              className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              Guardar medición
            </button>
          )}

          {state === "done" && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setState("setup");
                  setResult(null);
                  setBreathCount(0);
                  setNotes("");
                }}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Nueva medición
              </button>
              <Link
                href={`/perros/${dogId}`}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Volver al perfil
              </Link>
            </div>
          )}
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

      <h1 className="text-2xl font-bold mb-6">Medir frecuencia respiratoria</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {state === "setup" && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Observa el pecho de tu perro mientras descansa. Toca el botón cada
            vez que veas una respiración (subida y bajada del pecho = 1
            respiración).
          </p>

          {/* Duration selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Duración de la medición
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setDuration(30)}
                className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  duration === 30
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-500"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                30 segundos
              </button>
              <button
                onClick={() => setDuration(60)}
                className={`flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  duration === 60
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-500"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                60 segundos
              </button>
            </div>
          </div>

          <button
            onClick={startMeasurement}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            Iniciar medición
          </button>
        </div>
      )}

      {state === "measuring" && (
        <div className="space-y-6">
          {/* Progress bar */}
          <div className="w-full rounded-full bg-gray-200 dark:bg-gray-700 h-2">
            <div
              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Time remaining */}
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tiempo restante
            </p>
            <p className="text-4xl font-bold tabular-nums">{timeRemaining}s</p>
          </div>

          {/* Tap area */}
          <button
            onClick={handleTap}
            className="w-full aspect-square max-h-64 rounded-2xl bg-blue-600 text-white flex flex-col items-center justify-center gap-2 active:bg-blue-800 active:scale-95 transition-all select-none touch-manipulation"
          >
            <span className="text-6xl font-bold tabular-nums">
              {breathCount}
            </span>
            <span className="text-lg opacity-80">Toca por cada respiración</span>
          </button>

          {/* Live rate */}
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tasa estimada
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {duration - timeRemaining > 0
                ? Math.round(
                    (breathCount / (duration - timeRemaining)) * 60
                  )
                : 0}{" "}
              <span className="text-sm font-normal text-gray-500">resp/min</span>
            </p>
          </div>
        </div>
      )}

      {state === "saving" && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-gray-500">Guardando medición...</p>
        </div>
      )}
    </div>
  );
}
