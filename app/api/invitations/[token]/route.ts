import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs, dogShares, shareInvitations, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

// GET: Get invitation details (for preview before accepting)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const db = getDb();

    const [invitation] = await db
      .select({
        id: shareInvitations.id,
        status: shareInvitations.status,
        expiresAt: shareInvitations.expiresAt,
        dogName: dogs.name,
        dogPhotoUrl: dogs.photoUrl,
        invitedByName: users.name,
      })
      .from(shareInvitations)
      .innerJoin(dogs, eq(shareInvitations.dogId, dogs.id))
      .innerJoin(users, eq(shareInvitations.invitedBy, users.id))
      .where(eq(shareInvitations.token, token))
      .limit(1);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitación no encontrada" },
        { status: 404 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Esta invitación ya no es válida", status: invitation.status },
        { status: 400 }
      );
    }

    const expiresAt =
      invitation.expiresAt instanceof Date
        ? invitation.expiresAt
        : new Date(
            typeof invitation.expiresAt === "number"
              ? invitation.expiresAt * 1000
              : invitation.expiresAt
          );

    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Esta invitación ha expirado" },
        { status: 400 }
      );
    }

    return NextResponse.json({ invitation });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST: Accept invitation
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { token } = await params;
    const db = getDb();

    const [invitation] = await db
      .select()
      .from(shareInvitations)
      .where(eq(shareInvitations.token, token))
      .limit(1);

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitación no encontrada" },
        { status: 404 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Esta invitación ya no es válida" },
        { status: 400 }
      );
    }

    const expiresAt =
      invitation.expiresAt instanceof Date
        ? invitation.expiresAt
        : new Date(
            typeof invitation.expiresAt === "number"
              ? invitation.expiresAt * 1000
              : invitation.expiresAt
          );

    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Esta invitación ha expirado" },
        { status: 400 }
      );
    }

    // Don't allow owner to accept their own invitation
    if (invitation.invitedBy === session.userId) {
      return NextResponse.json(
        { error: "No puedes aceptar tu propia invitación" },
        { status: 400 }
      );
    }

    // Check if already has access
    const [existingShare] = await db
      .select()
      .from(dogShares)
      .where(
        and(
          eq(dogShares.dogId, invitation.dogId),
          eq(dogShares.userId, session.userId)
        )
      )
      .limit(1);

    if (existingShare) {
      // Mark invitation as accepted anyway
      await db
        .update(shareInvitations)
        .set({ status: "accepted" })
        .where(eq(shareInvitations.id, invitation.id));

      return NextResponse.json(
        { error: "Ya tienes acceso a este perro" },
        { status: 400 }
      );
    }

    // Check if user is the owner
    const [dog] = await db
      .select()
      .from(dogs)
      .where(eq(dogs.id, invitation.dogId))
      .limit(1);

    if (dog && dog.userId === session.userId) {
      return NextResponse.json(
        { error: "Ya eres el dueño de este perro" },
        { status: 400 }
      );
    }

    // Create the share
    const shareId = crypto.randomUUID();
    await db.insert(dogShares).values({
      id: shareId,
      dogId: invitation.dogId,
      userId: session.userId,
      role: "caretaker",
    });

    // Mark invitation as accepted
    await db
      .update(shareInvitations)
      .set({ status: "accepted" })
      .where(eq(shareInvitations.id, invitation.id));

    return NextResponse.json({
      success: true,
      dogId: invitation.dogId,
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
