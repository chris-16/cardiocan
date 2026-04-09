import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs, dogShares, shareInvitations } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

// DELETE: Revoke a share or cancel an invitation (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: dogId, shareId } = await params;
    const db = getDb();

    // Verify ownership
    const [dog] = await db
      .select()
      .from(dogs)
      .where(and(eq(dogs.id, dogId), eq(dogs.userId, session.userId)))
      .limit(1);

    if (!dog) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    // Try to delete from dog_shares first
    const [existingShare] = await db
      .select()
      .from(dogShares)
      .where(and(eq(dogShares.id, shareId), eq(dogShares.dogId, dogId)))
      .limit(1);

    if (existingShare) {
      await db
        .delete(dogShares)
        .where(and(eq(dogShares.id, shareId), eq(dogShares.dogId, dogId)));
      return NextResponse.json({ success: true });
    }

    // Try to revoke invitation
    const [existingInvitation] = await db
      .select()
      .from(shareInvitations)
      .where(
        and(
          eq(shareInvitations.id, shareId),
          eq(shareInvitations.dogId, dogId)
        )
      )
      .limit(1);

    if (existingInvitation) {
      await db
        .update(shareInvitations)
        .set({ status: "revoked" })
        .where(eq(shareInvitations.id, shareId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Compartido no encontrado" },
      { status: 404 }
    );
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
