import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs, dogShares, shareInvitations, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CreateShareBody {
  email?: string; // optional — omit for link-only invitation
}

// GET: List current shares and pending invitations for a dog (owner only)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId } = await params;

    // Verify access and role
    const access = await getDogAccess(dogId, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    if (!hasPermission(access.role, "shares:manage")) {
      return NextResponse.json(
        { error: "No tienes permiso para gestionar cuidadores" },
        { status: 403 }
      );
    }

    const db = getDb();

    // Get active shares with user info
    const shares = await db
      .select({
        id: dogShares.id,
        userId: dogShares.userId,
        role: dogShares.role,
        createdAt: dogShares.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(dogShares)
      .innerJoin(users, eq(dogShares.userId, users.id))
      .where(eq(dogShares.dogId, dogId));

    // Get pending invitations
    const invitations = await db
      .select()
      .from(shareInvitations)
      .where(
        and(
          eq(shareInvitations.dogId, dogId),
          eq(shareInvitations.status, "pending")
        )
      );

    return NextResponse.json({ shares, invitations });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST: Create a new share invitation (owner only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId } = await params;

    // Verify access and role
    const access = await getDogAccess(dogId, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    if (!hasPermission(access.role, "shares:manage")) {
      return NextResponse.json(
        { error: "No tienes permiso para gestionar cuidadores" },
        { status: 403 }
      );
    }

    const db = getDb();
    const body = (await request.json()) as CreateShareBody;
    const email = body.email?.trim().toLowerCase() || null;

    // Don't allow sharing with yourself
    if (email && email === session.email.toLowerCase()) {
      return NextResponse.json(
        { error: "No puedes compartir contigo mismo" },
        { status: 400 }
      );
    }

    // Check if already shared with this email
    if (email) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        const [existingShare] = await db
          .select()
          .from(dogShares)
          .where(
            and(
              eq(dogShares.dogId, dogId),
              eq(dogShares.userId, existingUser.id)
            )
          )
          .limit(1);

        if (existingShare) {
          return NextResponse.json(
            { error: "Este usuario ya tiene acceso" },
            { status: 400 }
          );
        }
      }
    }

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);

    await db.insert(shareInvitations).values({
      id,
      dogId,
      invitedBy: session.userId,
      email,
      token,
      status: "pending",
      expiresAt,
    });

    const [invitation] = await db
      .select()
      .from(shareInvitations)
      .where(eq(shareInvitations.id, id))
      .limit(1);

    return NextResponse.json({ invitation }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
