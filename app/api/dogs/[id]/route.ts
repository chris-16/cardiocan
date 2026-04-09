import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getDogAccess } from "@/lib/db/dog-access";
import { hasPermission } from "@/lib/db/permissions";
import { eq } from "drizzle-orm";

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
    const access = await getDogAccess(id, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ dog: access.dog, role: access.role });
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

    // Verify access and role
    const access = await getDogAccess(id, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    if (!hasPermission(access.role, "dog:edit")) {
      return NextResponse.json(
        { error: "No tienes permiso para editar este perfil" },
        { status: 403 }
      );
    }

    const db = getDb();

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
      .where(eq(dogs.id, id));

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

    // Verify access and role
    const access = await getDogAccess(id, session.userId);

    if (!access) {
      return NextResponse.json(
        { error: "Perro no encontrado" },
        { status: 404 }
      );
    }

    if (!hasPermission(access.role, "dog:delete")) {
      return NextResponse.json(
        { error: "No tienes permiso para eliminar este perfil" },
        { status: 403 }
      );
    }

    const db = getDb();
    await db.delete(dogs).where(eq(dogs.id, id));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
