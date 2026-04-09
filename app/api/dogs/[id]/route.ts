import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";

interface UpdateDogBody {
  name?: string;
  breed?: string;
  weight?: number | null;
  birthDate?: string | null;
  cardiacCondition?: string | null;
  rpmThreshold?: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const [dog] = await db
      .select()
      .from(dogs)
      .where(and(eq(dogs.id, id), eq(dogs.userId, session.userId)))
      .limit(1);

    if (!dog) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ dog });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as UpdateDogBody;

    const db = getDb();

    // Verify ownership
    const [existing] = await db
      .select({ id: dogs.id })
      .from(dogs)
      .where(and(eq(dogs.id, id), eq(dogs.userId, session.userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json(
          { error: "El nombre no puede estar vacío" },
          { status: 400 }
        );
      }
      updates.name = body.name.trim();
    }
    if (body.breed !== undefined) updates.breed = body.breed?.trim() || null;
    if (body.weight !== undefined) updates.weight = body.weight;
    if (body.birthDate !== undefined) updates.birthDate = body.birthDate;
    if (body.cardiacCondition !== undefined)
      updates.cardiacCondition = body.cardiacCondition?.trim() || null;
    if (body.rpmThreshold !== undefined) {
      const threshold = Number(body.rpmThreshold);
      if (isNaN(threshold) || threshold < 10 || threshold > 80) {
        return NextResponse.json(
          { error: "El umbral debe estar entre 10 y 80 rpm" },
          { status: 400 }
        );
      }
      updates.rpmThreshold = threshold;
    }

    await db
      .update(dogs)
      .set(updates)
      .where(and(eq(dogs.id, id), eq(dogs.userId, session.userId)));

    const [dog] = await db.select().from(dogs).where(eq(dogs.id, id)).limit(1);

    return NextResponse.json({ dog });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();

    const [existing] = await db
      .select({ id: dogs.id })
      .from(dogs)
      .where(and(eq(dogs.id, id), eq(dogs.userId, session.userId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    await db
      .delete(dogs)
      .where(and(eq(dogs.id, id), eq(dogs.userId, session.userId)));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
