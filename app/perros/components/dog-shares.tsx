"use client";

import { useState, useEffect } from "react";

interface Share {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  userName: string;
  userEmail: string;
}

interface Invitation {
  id: string;
  email: string | null;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface DogSharesProps {
  dogId: string;
}

export default function DogShares({ dogId }: DogSharesProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function fetchShares() {
    try {
      const res = await fetch(`/api/dogs/${dogId}/shares`);
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares);
        setInvitations(data.invitations);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchShares();
  }, [dogId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const body: { email?: string } = {};
      if (email.trim()) {
        body.email = email.trim();
      }

      const res = await fetch(`/api/dogs/${dogId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear invitación");
        return;
      }

      const inviteUrl = `${window.location.origin}/invitacion/${data.invitation.token}`;

      if (email.trim()) {
        setSuccess(`Invitación creada para ${email}. Comparte este link:`);
      } else {
        setSuccess("Link de invitación creado:");
      }

      setEmail("");
      await fetchShares();
    } catch {
      setError("Error de conexión");
    } finally {
      setCreating(false);
    }
  }

  async function handleGenerateLink() {
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/dogs/${dogId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al crear link");
        return;
      }

      setSuccess("Link de invitación creado.");
      await fetchShares();
    } catch {
      setError("Error de conexión");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(shareId: string) {
    if (!confirm("¿Revocar este acceso?")) return;

    try {
      const res = await fetch(`/api/dogs/${dogId}/shares/${shareId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchShares();
      }
    } catch {
      setError("Error de conexión");
    }
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invitacion/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // Fallback
      prompt("Copia este link:", url);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Compartir acceso</h2>

      {/* Active shares */}
      {shares.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 mb-4">
          {shares.map((share) => (
            <div
              key={share.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{share.userName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {share.userEmail}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(share.id)}
                className="text-xs text-red-600 hover:text-red-500 dark:text-red-400"
              >
                Revocar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Invitaciones pendientes
          </p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                    {inv.email || "Link de invitación"}
                  </p>
                  <p className="text-xs text-gray-400">
                    Expira:{" "}
                    {new Date(
                      typeof inv.expiresAt === "number"
                        ? (inv.expiresAt as number) * 1000
                        : inv.expiresAt
                    ).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={() => copyInviteLink(inv.token)}
                    className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400"
                  >
                    {copiedToken === inv.token ? "Copiado" : "Copiar link"}
                  </button>
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    className="text-xs text-red-600 hover:text-red-500 dark:text-red-400"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form */}
      <form onSubmit={handleInvite} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="Email del cuidador (opcional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {creating ? "..." : "Invitar"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleGenerateLink}
          disabled={creating}
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Generar link de invitación
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {success}
        </div>
      )}
    </div>
  );
}
