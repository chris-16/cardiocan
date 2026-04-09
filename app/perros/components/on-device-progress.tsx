"use client";

import type { AnalysisProgress } from "@/lib/on-device-analyzer";

interface OnDeviceProgressProps {
  progress: AnalysisProgress;
}

/**
 * Progress indicator for on-device video analysis.
 * Shows the current phase and percentage.
 */
export default function OnDeviceProgress({ progress }: OnDeviceProgressProps) {
  const phaseLabels: Record<AnalysisProgress["phase"], string> = {
    extracting: "Extrayendo cuadros",
    analyzing: "Analizando movimiento",
    counting: "Contando respiraciones",
    done: "Completado",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-6">
        {progress.phase !== "done" && (
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-green-600 border-t-transparent mb-4" />
        )}
        {progress.phase === "done" && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <span className="text-green-600 dark:text-green-400 text-xl">
              ✓
            </span>
          </div>
        )}

        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {phaseLabels[progress.phase]}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {progress.message}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progreso</span>
          <span>{progress.percent}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* Phase indicator dots */}
      <div className="flex justify-center gap-3">
        {(
          ["extracting", "analyzing", "counting", "done"] as const
        ).map((phase) => {
          const phaseOrder = [
            "extracting",
            "analyzing",
            "counting",
            "done",
          ] as const;
          const currentIndex = phaseOrder.indexOf(progress.phase);
          const phaseIndex = phaseOrder.indexOf(phase);
          const isActive = phaseIndex === currentIndex;
          const isComplete = phaseIndex < currentIndex;

          return (
            <div key={phase} className="flex items-center gap-1">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  isActive
                    ? "bg-green-500 animate-pulse"
                    : isComplete
                      ? "bg-green-500"
                      : "bg-gray-300 dark:bg-gray-600"
                }`}
              />
              <span
                className={`text-xs ${
                  isActive || isComplete
                    ? "text-gray-600 dark:text-gray-400"
                    : "text-gray-400 dark:text-gray-600"
                }`}
              >
                {phaseLabels[phase]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        El análisis se realiza en tu dispositivo. No se envían datos a la nube.
      </p>
    </div>
  );
}
