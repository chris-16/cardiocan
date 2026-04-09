"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ROI } from "@/lib/on-device-analyzer";

interface ROISelectorProps {
  videoBlob: Blob;
  onROISelected: (roi: ROI) => void;
  onCancel: () => void;
}

/**
 * Component that displays a video frame and lets the user draw a rectangle
 * over the dog's chest area. The selected region is used for on-device
 * respiratory analysis.
 */
export default function ROISelector({
  videoBlob,
  onROISelected,
  onCancel,
}: ROISelectorProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<ROI | null>(null);
  const [confirmedROI, setConfirmedROI] = useState<ROI | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Extract a frame from the middle of the video for ROI selection
  useEffect(() => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoBlob);
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Seek to 25% of the video (dog should be visible and in position)
      video.currentTime = video.duration * 0.25;
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setFrameUrl(dataUrl);
      }
      URL.revokeObjectURL(url);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
    };

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [videoBlob]);

  const getRelativeCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const coords = getRelativeCoords(e.clientX, e.clientY);
      setStartPoint(coords);
      setDrawing(true);
      setCurrentRect(null);
      setConfirmedROI(null);
    },
    [getRelativeCoords]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing || !startPoint) return;
      e.preventDefault();
      const coords = getRelativeCoords(e.clientX, e.clientY);

      const x = Math.min(startPoint.x, coords.x);
      const y = Math.min(startPoint.y, coords.y);
      const width = Math.abs(coords.x - startPoint.x);
      const height = Math.abs(coords.y - startPoint.y);

      setCurrentRect({ x, y, width, height });
    },
    [drawing, startPoint, getRelativeCoords]
  );

  const handlePointerUp = useCallback(() => {
    setDrawing(false);
    if (currentRect && currentRect.width > 0.03 && currentRect.height > 0.03) {
      setConfirmedROI(currentRect);
    } else {
      setCurrentRect(null);
    }
  }, [currentRect]);

  const displayRect = currentRect || confirmedROI;

  if (!frameUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Preparando imagen del video...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-3">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Selecciona el tórax del perro:</strong> Dibuja un rectángulo
          sobre el área del pecho/costillas del perro donde se observe el
          movimiento respiratorio.
        </p>
      </div>

      {/* Image with ROI overlay */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg bg-black cursor-crosshair select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={frameUrl}
          alt="Cuadro del video para seleccionar región"
          className="w-full aspect-video object-cover pointer-events-none"
          draggable={false}
        />

        {/* Semi-transparent overlay outside the selection */}
        {displayRect && (
          <>
            {/* Dark overlay covering entire image */}
            <div className="absolute inset-0 bg-black/40 pointer-events-none" />
            {/* Clear cutout for the selected region */}
            <div
              className="absolute border-2 border-green-400 bg-transparent pointer-events-none"
              style={{
                left: `${displayRect.x * 100}%`,
                top: `${displayRect.y * 100}%`,
                width: `${displayRect.width * 100}%`,
                height: `${displayRect.height * 100}%`,
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
              }}
            >
              {/* Corner markers */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-green-400" />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-green-400" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-green-400" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-green-400" />
            </div>
          </>
        )}

        {/* Guide text when no selection */}
        {!displayRect && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-lg bg-black/60 px-4 py-2">
              <p className="text-sm text-white text-center">
                Arrastra para seleccionar el tórax
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => confirmedROI && onROISelected(confirmedROI)}
          disabled={!confirmedROI}
          className="flex-1 rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Analizar esta región
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancelar
        </button>
      </div>

      {confirmedROI && (
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          Puedes volver a dibujar la selección si no quedó bien posicionada.
        </p>
      )}
    </div>
  );
}
