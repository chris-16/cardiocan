import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dogs } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import crypto from "crypto";

interface CreateDogBody {
  name: string;
  breed?: string;
  weight?: number;
  birthDate?: string;
  cardiacCondition?: string;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const db = getDb();
    const userDogs = await db
      .select()
      .from(dogs)
      .where(eq(dogs.userId, session.userId));

    return NextResponse.json({ dogs: userDogs });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await request.json()) as CreateDogBody;
    const { name, breed, weight, birthDate, cardiacCondition } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const db = getDb();
    const id = crypto.randomUUID();

    await db.insert(dogs).values({
      id,
      userId: session.userId,
      name: name.trim(),
      breed: breed?.trim() || null,
      weight: weight || null,
      birthDate: birthDate || null,
      cardiacCondition: cardiacCondition?.trim() || null,
    });

    const [dog] = await db.select().from(dogs).where(eq(dogs.id, id)).limit(1);

    return NextResponse.json({ dog }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
