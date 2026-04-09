export type RpmAlertLevel = "normal" | "elevated" | "urgent";

export const DEFAULT_RPM_THRESHOLD = 30;

export function getRpmAlertLevel(rpm: number, threshold: number = DEFAULT_RPM_THRESHOLD): RpmAlertLevel {
  if (rpm > threshold + 10) return "urgent";
  if (rpm > threshold) return "elevated";
  return "normal";
}

interface RpmAlertProps {
  rpm: number;
  threshold?: number;
}

/**
 * Visual alert banner based on respiratory rate thresholds:
 * - Normal (≤threshold rpm): no alert shown
 * - Elevated (>threshold rpm): yellow/orange warning
 * - Urgent (>threshold+10 rpm): red urgent alert
 */
export default function RpmAlert({ rpm, threshold = DEFAULT_RPM_THRESHOLD }: RpmAlertProps) {
  const level = getRpmAlertLevel(rpm, threshold);

  if (level === "normal") return null;

  if (level === "urgent") {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
      >
        <div className="flex items-start gap-3">
          <span className="text-xl" aria-hidden="true">🚨</span>
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              ¡Alerta urgente!
            </p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">
              La frecuencia respiratoria ({rpm} rpm) es muy elevada (umbral: {threshold} rpm).
              Contacta a tu veterinario lo antes posible.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // elevated
  return (
    <div
      role="alert"
      className="rounded-md border border-orange-300 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
            Frecuencia elevada
          </p>
          <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">
            La frecuencia respiratoria ({rpm} rpm) está por encima del umbral configurado ({threshold} rpm).
            Considera consultar con tu veterinario si persiste.
          </p>
        </div>
      </div>
    </div>
  );
}
