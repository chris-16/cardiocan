"use client";

import { useState, useEffect } from "react";
import {
  isPushSupported,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermission,
  registerServiceWorker,
} from "@/lib/push/client";

export default function PushNotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      const isSupported = isPushSupported();
      setSupported(isSupported);

      if (isSupported) {
        setPermission(getNotificationPermission());
        await registerServiceWorker();
        const isSubscribed = await isPushSubscribed();
        setSubscribed(isSubscribed);
      }
      setLoading(false);
    }
    checkStatus();
  }, []);

  async function handleToggle() {
    setToggling(true);
    try {
      if (subscribed) {
        const success = await unsubscribeFromPush();
        if (success) setSubscribed(false);
      } else {
        const result = await Notification.requestPermission();
        setPermission(result);

        if (result === "granted") {
          const success = await subscribeToPush();
          if (success) setSubscribed(true);
        }
      }
    } catch (error) {
      console.error("Toggle push failed:", error);
    } finally {
      setToggling(false);
    }
  }

  if (loading) return null;

  if (!supported) {
    return (
      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        Las notificaciones push no son compatibles con este navegador.
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
        <p className="font-medium">Notificaciones bloqueadas</p>
        <p className="mt-1 text-xs opacity-80">
          Has bloqueado las notificaciones. Para activarlas, cambia los permisos
          en la configuración de tu navegador.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
      <div>
        <p className="text-sm font-medium">
          {subscribed ? "🔔 Notificaciones activas" : "🔕 Notificaciones desactivadas"}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {subscribed
            ? "Recibirás recordatorios de medicación"
            : "Activa para recibir recordatorios"}
        </p>
      </div>
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          subscribed
            ? "bg-blue-600"
            : "bg-gray-200 dark:bg-gray-600"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            subscribed ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
