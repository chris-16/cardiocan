import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isValidTimezone } from "@/lib/timezone";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Fetch timezone from DB
    const db = getDb();
    const userRow = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        timezone: userRow[0]?.timezone ?? "America/Santiago",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

interface PatchBody {
  timezone?: string;
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = (await request.json()) as PatchBody;

    if (body.timezone !== undefined) {
      if (!isValidTimezone(body.timezone)) {
        return NextResponse.json(
          { error: "Zona horaria inválida" },
          { status: 400 }
        );
      }

      const db = getDb();
      await db
        .update(users)
        .set({ timezone: body.timezone, updatedAt: new Date() })
        .where(eq(users.id, session.userId));
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
