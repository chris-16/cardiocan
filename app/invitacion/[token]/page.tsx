"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface InvitationDetails {
  id: string;
  status: string;
  expiresAt: string;
  dogName: string;
  dogPhotoUrl: string | null;
  invitedByName: string;
}

export default function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dogId, setDogId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invitación no válida");
          return;
        }
        setInvitation(data.invitation);
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchInvitation();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError("");

    try {
      const res = await fetch(`/api/invitations/${token}`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in — redirect to login then come back
          router.push(`/login?from=/invitacion/${token}`);
          return;
        }
        setError(data.error || "Error al aceptar la invitación");
        return;
      }

      setSuccess(true);
      setDogId(data.dogId);
    } catch {
      setError("Error de conexión");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-gray-500">Cargando invitación...</p>
      </div>
    );
  }

  if (success && dogId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 dark:border-green-800 dark:bg-green-900/20">
          <h1 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">
            Invitación aceptada
          </h1>
          <p className="text-sm text-green-600 dark:text-green-400 mb-6">
            Ahora puedes acceder al perfil de {invitation?.dogName}.
          </p>
          <Link
            href={`/perros/${dogId}`}
            className="inline-block rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ver perfil
          </Link>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-900/20">
          <h1 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">
            Invitación no válida
          </h1>
          <p className="text-sm text-red-600 dark:text-red-400 mb-6">
            {error}
          </p>
          <Link
            href="/perros"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            Ir a mis perros
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        {/* Dog initial/photo */}
        <div className="mx-auto mb-4 h-20 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          {invitation?.dogPhotoUrl ? (
            <img
              src={invitation.dogPhotoUrl}
              alt={invitation.dogName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl font-bold text-gray-400">
              {invitation?.dogName?.[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold mb-1">{invitation?.dogName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span className="font-medium">{invitation?.invitedByName}</span> te
          invita a ser cuidador de {invitation?.dogName}.
        </p>

        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {accepting ? "Aceptando..." : "Aceptar invitación"}
        </button>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          Necesitas una cuenta para aceptar. Si no tienes una,{" "}
          <Link
            href={`/registro?from=/invitacion/${token}`}
            className="text-blue-600 hover:text-blue-500"
          >
            regístrate aquí
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
