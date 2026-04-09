"use client";

export type AnalysisMethod = "cloud" | "on-device";

interface AnalysisMethodSelectorProps {
  selected: AnalysisMethod;
  onChange: (method: AnalysisMethod) => void;
  disabled?: boolean;
}

/**
 * Toggle between cloud (Gemini API) and on-device (MediaPipe) analysis.
 */
export default function AnalysisMethodSelector({
  selected,
  onChange,
  disabled = false,
}: AnalysisMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Método de análisis
      </label>

      <div className="grid grid-cols-2 gap-3">
        {/* Cloud option */}
        <button
          type="button"
          onClick={() => onChange("cloud")}
          disabled={disabled}
          className={`relative flex flex-col items-center rounded-lg border-2 p-4 transition-colors ${
            selected === "cloud"
              ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
              : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className="text-2xl mb-2">☁️</span>
          <span
            className={`text-sm font-medium ${
              selected === "cloud"
                ? "text-blue-700 dark:text-blue-300"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            Cloud (Gemini)
          </span>
          <span className="mt-1 text-xs text-gray-500 dark:text-gray-400 text-center">
            Requiere internet
          </span>
          {selected === "cloud" && (
            <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white text-xs">
              ✓
            </span>
          )}
        </button>

        {/* On-device option */}
        <button
          type="button"
          onClick={() => onChange("on-device")}
          disabled={disabled}
          className={`relative flex flex-col items-center rounded-lg border-2 p-4 transition-colors ${
            selected === "on-device"
              ? "border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-900/20"
              : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className="text-2xl mb-2">📱</span>
          <span
            className={`text-sm font-medium ${
              selected === "on-device"
                ? "text-green-700 dark:text-green-300"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            En dispositivo
          </span>
          <span className="mt-1 text-xs text-gray-500 dark:text-gray-400 text-center">
            Sin conexión
          </span>
          {selected === "on-device" && (
            <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs">
              ✓
            </span>
          )}
        </button>
      </div>

      {/* Description */}
      <div
        className={`rounded-lg border p-3 text-xs ${
          selected === "cloud"
            ? "border-blue-100 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-900/10"
            : "border-green-100 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10"
        }`}
      >
        {selected === "cloud" ? (
          <p className="text-gray-600 dark:text-gray-400">
            El video se envía a los servidores de Google (Gemini) para análisis
            con IA avanzada. Requiere conexión a internet. Mayor precisión en
            videos de calidad variable.
          </p>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">
            El análisis se realiza directamente en tu dispositivo usando{" "}
            <strong>MediaPipe Pose Landmarker</strong> para detectar el
            movimiento del tórax. <strong>No requiere internet</strong> (una vez
            cacheado el modelo). Necesitas seleccionar la zona del tórax del
            perro manualmente.
          </p>
        )}
      </div>
    </div>
  );
}
